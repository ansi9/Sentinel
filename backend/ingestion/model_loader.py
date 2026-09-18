import os
import hashlib
from typing import Any, Dict, List, Optional
from ..schemas import ModelAccessLevel, ModelFingerprint


class ModelInspectionResult:
    def __init__(
        self,
        model_id: str,
        model_name: str,
        model_format: str,
        access_level: ModelAccessLevel,
        sha256_digest: str,
        architecture: str,
        total_parameters: Optional[int],
        input_shape: List[int],
        output_classes: List[str],
        metadata: Dict[str, Any],
        raw_model_handle: Any = None,
    ):
        self.model_id = model_id
        self.model_name = model_name
        self.model_format = model_format
        self.access_level = access_level
        self.sha256_digest = sha256_digest
        self.architecture = architecture
        self.total_parameters = total_parameters
        self.input_shape = input_shape
        self.output_classes = output_classes
        self.metadata = metadata
        self.raw_model_handle = raw_model_handle

    def to_fingerprint(self, verification_status: str = "VERIFIED") -> ModelFingerprint:
        return ModelFingerprint(
            model_id=self.model_id,
            model_name=self.model_name,
            model_format=self.model_format,
            access_level=self.access_level,
            sha256_digest=self.sha256_digest,
            architecture=self.architecture,
            total_parameters=self.total_parameters,
            input_shape=self.input_shape,
            output_classes=self.output_classes,
            metadata=self.metadata,
            verification_status=verification_status,
        )


class ModelLoader:
    @staticmethod
    def calculate_file_sha256(filepath: str) -> str:
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    @staticmethod
    def _onnx_dim_value(dim) -> int:
        return dim.dim_value if dim.dim_value > 0 else 1

    @staticmethod
    def inspect_model(
        model_path: str,
        known_classes: Optional[List[str]] = None,
        enforce_access_level: Optional[ModelAccessLevel] = None,
    ) -> ModelInspectionResult:
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found at: {model_path}")

        file_size = os.path.getsize(model_path)
        sha256_digest = ModelLoader.calculate_file_sha256(model_path)
        filename = os.path.basename(model_path)
        ext = os.path.splitext(filename)[1].lower()

        classes = known_classes or ["military_vehicle", "infantry", "radar_station", "aircraft", "naval_vessel"]

        if ext == ".onnx":
            model_format = "ONNX"
            access_level = enforce_access_level or ModelAccessLevel.WHITE_BOX
            try:
                import onnx
                onnx_model = onnx.load(model_path)
                onnx.checker.check_model(onnx_model)
                graph = onnx_model.graph
                num_nodes = len(graph.node)

                total_params = 0
                for init in graph.initializer:
                    numel = 1
                    for d in init.dims:
                        numel *= max(1, d)
                    total_params += numel

                input_shape: List[int] = [1, 3, 640, 640]
                if graph.input:
                    dims = graph.input[0].type.tensor_type.shape.dim
                    if dims:
                        input_shape = [ModelLoader._onnx_dim_value(d) for d in dims]

                opset_version = onnx_model.opset_import[0].version if onnx_model.opset_import else None
                arch_desc = f"ONNX Graph ({num_nodes} operators, opset={opset_version if opset_version else 'N/A'})"

                return ModelInspectionResult(
                    model_id=f"model_{sha256_digest[:12]}",
                    model_name=filename,
                    model_format=model_format,
                    access_level=access_level,
                    sha256_digest=sha256_digest,
                    architecture=arch_desc,
                    total_parameters=total_params if total_params > 0 else None,
                    input_shape=input_shape,
                    output_classes=classes,
                    metadata={
                        "graph_name": graph.name,
                        "producer_name": onnx_model.producer_name,
                        "producer_version": onnx_model.producer_version,
                        "num_initializers": len(graph.initializer),
                        "num_nodes": num_nodes,
                        "op_types": sorted(set(n.op_type for n in graph.node)),
                        "file_size_bytes": file_size,
                    },
                    raw_model_handle=onnx_model,
                )
            except Exception as e:
                return ModelInspectionResult(
                    model_id=f"model_{sha256_digest[:12]}",
                    model_name=filename,
                    model_format=model_format,
                    access_level=ModelAccessLevel.BLACK_BOX,
                    sha256_digest=sha256_digest,
                    architecture="ONNX (parse failed - black-box binary inspection only)",
                    total_parameters=None,
                    input_shape=[],
                    output_classes=classes,
                    metadata={"file_size_bytes": file_size, "parse_error": str(e)},
                )

        elif ext in [".pt", ".pth", ".torchscript"]:
            model_format = "TorchScript" if "script" in filename.lower() or ext == ".torchscript" else "PyTorch"
            try:
                import torch
                if model_format == "TorchScript":
                    loaded = torch.jit.load(model_path, map_location="cpu")
                else:
                    # weights_only=True is the only deserialization path this system will
                    # ever attempt for a contributor-supplied checkpoint. It restricts
                    # unpickling to a safe allowlist of tensor/primitive types, so a
                    # checkpoint cannot smuggle a __reduce__ payload that executes
                    # arbitrary code on this server merely by being uploaded. A file that
                    # fails to load under this restriction is never retried with
                    # weights_only=False -- it is reported as an honest load failure
                    # (falls through to the black-box "load failed" branch below) rather
                    # than trading server-side code execution for a broader format match.
                    loaded = torch.load(model_path, map_location="cpu", weights_only=True)

                access_level = enforce_access_level or ModelAccessLevel.WHITE_BOX
                if hasattr(loaded, "parameters"):
                    total_params = sum(p.numel() for p in loaded.parameters())
                    layer_count = sum(1 for _ in loaded.named_modules())
                    arch_desc = f"{type(loaded).__name__} ({layer_count} modules)"
                elif isinstance(loaded, dict):
                    tensor_values = [v for v in loaded.values() if hasattr(v, "numel")]
                    total_params = sum(v.numel() for v in tensor_values) if tensor_values else None
                    arch_desc = f"{model_format} raw state_dict ({len(loaded)} entries)"
                else:
                    total_params = None
                    arch_desc = f"{model_format} state (non-module artifact: {type(loaded).__name__})"

                return ModelInspectionResult(
                    model_id=f"model_{sha256_digest[:12]}",
                    model_name=filename,
                    model_format=model_format,
                    access_level=access_level,
                    sha256_digest=sha256_digest,
                    architecture=arch_desc,
                    total_parameters=total_params,
                    input_shape=[1, 3, 640, 640],
                    output_classes=classes,
                    metadata={
                        "file_size_bytes": file_size,
                        "framework": "PyTorch",
                    },
                    raw_model_handle=loaded,
                )
            except Exception as e:
                return ModelInspectionResult(
                    model_id=f"model_{sha256_digest[:12]}",
                    model_name=filename,
                    model_format=model_format,
                    access_level=ModelAccessLevel.BLACK_BOX,
                    sha256_digest=sha256_digest,
                    architecture=f"{model_format} (load failed - black-box binary inspection only)",
                    total_parameters=None,
                    input_shape=[],
                    output_classes=classes,
                    metadata={"file_size_bytes": file_size, "load_error": str(e)},
                )

        else:
            return ModelInspectionResult(
                model_id=f"model_{sha256_digest[:12]}",
                model_name=filename,
                model_format="Generic/Custom",
                access_level=ModelAccessLevel.BLACK_BOX,
                sha256_digest=sha256_digest,
                architecture="Unknown Vision Architecture (unsupported extension)",
                total_parameters=None,
                input_shape=[],
                output_classes=classes,
                metadata={"file_size_bytes": file_size},
            )
