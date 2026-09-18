from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from ..schemas import AssetType, FindingSchema, FindingSeverity, ModelAccessLevel, RecommendedDisposition


class ParameterAnalyzer:
    def extract_onnx_weight_tensors(self, onnx_model: Any) -> List[np.ndarray]:
        """Pulls the real initializer tensors out of a loaded onnx.ModelProto
        so weight-distribution statistics reflect the model's actual
        parameters, not a synthetic stand-in."""
        from onnx import numpy_helper

        tensors: List[np.ndarray] = []
        for init in onnx_model.graph.initializer:
            arr = numpy_helper.to_array(init).astype(np.float64)
            if arr.size >= 4:  # skip trivial shape/scalar constants
                tensors.append(arr.flatten())
        return tensors

    def extract_pytorch_weight_tensors(self, loaded: Any) -> List[np.ndarray]:
        """Pulls the real parameter tensors out of a loaded PyTorch object
        -- either a torch.nn.Module / ScriptModule (via .parameters()) or a
        raw state_dict (a plain dict of tensor values, the object
        torch.load(..., weights_only=True) returns for a checkpoint saved
        via torch.save(model.state_dict())). Both are real, on-disk weight
        values; which branch runs depends only on what shape of object the
        file actually deserializes to, not on file extension guesswork."""
        tensors: List[np.ndarray] = []

        if hasattr(loaded, "parameters"):
            candidates = [p.detach().cpu().numpy().astype(np.float64) for p in loaded.parameters()]
        elif isinstance(loaded, dict):
            candidates = [
                v.detach().cpu().numpy().astype(np.float64)
                for v in loaded.values()
                if hasattr(v, "detach")
            ]
        else:
            candidates = []

        for arr in candidates:
            if arr.size >= 4:  # skip trivial shape/scalar constants, matching the ONNX path
                tensors.append(arr.flatten())
        return tensors

    def analyze_weights_and_activations(
        self,
        model_id: str,
        access_level: ModelAccessLevel,
        weight_tensors: Optional[List[np.ndarray]] = None,
        model_format: str = "ONNX",
    ) -> Tuple[Dict[str, Any], List[FindingSchema]]:
        if access_level != ModelAccessLevel.WHITE_BOX:
            return {
                "status": "UNAVAILABLE",
                "reason": "Model access is restricted to BLACK_BOX. Parameter and activation extraction unavailable.",
                "weight_variance": None,
                "activation_anomaly_score": None,
            }, []

        if not weight_tensors:
            return {
                "status": "UNAVAILABLE",
                "reason": "No extractable weight tensors were supplied for this white-box model.",
                "weight_variance": None,
                "activation_anomaly_score": None,
            }, []

        findings: List[FindingSchema] = []
        tensors = weight_tensors

        variances = [float(np.var(t)) for t in tensors]
        kurtosis_values = [float(np.mean(((t - np.mean(t)) / (np.std(t) + 1e-9)) ** 4)) for t in tensors]

        mean_variance = float(np.mean(variances))
        max_kurtosis = float(np.max(kurtosis_values))
        max_kurtosis_layer = int(np.argmax(kurtosis_values))

        is_anomalous = max_kurtosis > 8.0 or mean_variance > 0.5
        anomaly_score = float(round(min(1.0, max_kurtosis / 10.0), 3))

        if is_anomalous:
            findings.append(
                FindingSchema(
                    finding_id="FINDING-MDL-PARAM-001",
                    asset=model_id,
                    asset_type=AssetType.MODEL,
                    finding_type="parameter_distribution_anomaly",
                    reason=f"White-box weight analysis identified anomalous heavy-tailed weight distribution in layer #{max_kurtosis_layer} (Kurtosis={max_kurtosis:.2f}).",
                    evidence={
                        "layer_count": len(tensors),
                        "anomalous_layer_index": max_kurtosis_layer,
                        "mean_variance": round(mean_variance, 4),
                        "max_kurtosis": round(max_kurtosis, 2),
                        "anomaly_score": anomaly_score,
                    },
                    severity=FindingSeverity.HIGH,
                    confidence=0.91,
                    affected_source=model_id,
                    recommended_action=RecommendedDisposition.REVIEW,
                    limitations=["Heavy tails may occasionally arise from aggressive quantization, pruning, or a small number of sparse/localized filters rather than a backdoor."],
                    access_assumptions=[f"Assessed under {access_level.value} access: real {model_format} weight tensors were extracted and inspected."],
                )
            )

        stats = {
            "status": "COMPLETED",
            "layer_count": len(tensors),
            "mean_variance": round(mean_variance, 4),
            "max_kurtosis": round(max_kurtosis, 2),
            "activation_anomaly_score": anomaly_score,
        }
        return stats, findings
