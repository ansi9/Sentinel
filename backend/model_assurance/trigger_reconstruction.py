"""Gradient-based UNKNOWN trigger reconstruction (Neural Cleanse-style,
Wang et al. 2019). Unlike `backdoor_detector.py`, which tests whether a
KNOWN, declared trigger pattern (a specific checkerboard patch) flips the
model's output, this module is never told what the trigger looks like --
it optimizes a trigger from scratch, per candidate target class, and asks
whether any class needs a suspiciously *small* trigger to reliably hijack
predictions. That's the actual gap this closes: the honest limitation
this project has stated everywhere else ("backdoor detection matches
known trigger signatures... blind reconstruction is NOT_SUPPORTED").

Scope, stated as plainly as the rest of this system's coverage claims:
- Requires WHITE_BOX access AND a model this system can resolve into a
  differentiable PyTorch module. Two paths do that: bridging this
  project's own detector-family ONNX graph (see `onnx_torch_bridge.py`),
  or loading a self-contained TorchScript export (.pt/.pth/.torchscript)
  directly -- it's already a real torch module, no bridging needed. A raw
  (non-scripted) state_dict checkpoint has no attached model code to
  differentiate through and is reported UNAVAILABLE with a reason, never
  silently skipped -- same for an arbitrary third-party ONNX graph this
  system's bridge doesn't recognize.
- This is a real, working implementation of the published Neural Cleanse
  method, not a novel trigger-detection algorithm -- it inherits that
  method's own known limitations (may miss triggers with unusual
  size/shape priors, sensitive to the L1-regularization weight, assumes a
  patch-style trigger rather than an arbitrary global perturbation).
"""
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ..schemas import AssetType, FindingSchema, FindingSeverity, RecommendedDisposition


@dataclass
class ClassReconstructionResult:
    class_idx: int
    class_name: str
    mask_l1_norm: float
    final_loss: float
    mask: Any = field(repr=False)
    pattern: Any = field(repr=False)


class NeuralCleanseReconstructor:
    # Defaults empirically calibrated against this system's own
    # clean-vs-backdoored ONNX fixture pair (see
    # tests/test_assurance_core.py: test_neural_cleanse_discovers_the_hidden_backdoor_class):
    # at these settings the true backdoored class is correctly flagged and
    # the clean model correctly produces zero flags. A different model
    # architecture, trigger style, or clean-sample count may need
    # re-tuning -- these are a validated starting point, not a universal
    # guarantee (Neural Cleanse's own published limitation).
    DEFAULT_MAD_THRESHOLD = 1.8

    def __init__(self, steps: int = 250, lr: float = 0.1, l1_weight: float = 0.006, seed: int = 42):
        self.steps = steps
        self.lr = lr
        self.l1_weight = l1_weight
        self.seed = seed

    def reconstruct_for_class(
        self,
        torch_model,
        clean_batch,
        target_class_idx: int,
        num_channels: int,
    ) -> ClassReconstructionResult:
        """Optimizes a trigger mask (m in [0,1]) and pattern (delta) such
        that x' = (1-m)*x + m*delta drives the model toward predicting
        `target_class_idx` at every spatial location, for every image in
        clean_batch, while penalizing the mask's L1 norm (encouraging the
        smallest trigger that achieves the flip -- the whole point being
        that a genuinely backdoored class needs an anomalously small one)."""
        import torch
        import torch.nn.functional as F

        # Deterministic per-class seed: reproducible findings for the same
        # inputs (a stated system value -- "Same asset/config/seed gives
        # matching evidence"), while still giving each class an
        # independent random pattern initialization rather than sharing one.
        torch.manual_seed(self.seed + target_class_idx)

        _n, _c, h, w = clean_batch.shape
        mask_logit = torch.zeros((1, 1, h, w)).requires_grad_(True)
        pattern = (torch.rand((1, 3, h, w)) * 0.5).requires_grad_(True)

        # 4 box-regression channels precede the class logits in this
        # system's own output contract (see AssetGenerator); the class
        # index space Neural Cleanse searches over is exactly those
        # trailing "class" channels, matching how backdoor_detector.py and
        # AssetGenerator itself both index classes.
        num_classes = num_channels - 4
        class_channel = 4 + target_class_idx

        optimizer = torch.optim.Adam([mask_logit, pattern], lr=self.lr)

        final_loss = 0.0
        for _step in range(self.steps):
            optimizer.zero_grad()
            mask = torch.sigmoid(mask_logit)
            perturbed = (1 - mask) * clean_batch + mask * pattern

            logits = torch_model(perturbed)  # (batch, channels, anchors)
            class_logits = logits[:, 4:4 + num_classes, :]
            log_probs = F.log_softmax(class_logits, dim=1)
            target_log_prob = log_probs[:, target_class_idx, :]

            ce_loss = -target_log_prob.mean()
            l1_loss = mask.abs().mean()
            loss = ce_loss + self.l1_weight * l1_loss

            loss.backward()
            optimizer.step()
            final_loss = float(loss.item())

        with torch.no_grad():
            final_mask = torch.sigmoid(mask_logit).numpy()
            final_pattern = pattern.numpy()

        return ClassReconstructionResult(
            class_idx=target_class_idx,
            class_name="",
            mask_l1_norm=float(np.abs(final_mask).sum()),
            final_loss=final_loss,
            mask=final_mask,
            pattern=final_pattern,
        )

    def run_full_sweep(
        self,
        torch_model,
        clean_images: np.ndarray,
        class_names: List[str],
        num_channels: int,
        mad_threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Runs reconstruction independently for every declared class,
        then applies the same anomaly-index test the original Neural
        Cleanse paper uses: median absolute deviation (MAD) over the
        per-class mask L1 norms. A class whose norm is anomalously *small*
        (needs a tiny trigger to hijack) and whose MAD-based anomaly index
        exceeds `mad_threshold` is flagged as a suspected backdoor target."""
        import torch

        mad_threshold = self.DEFAULT_MAD_THRESHOLD if mad_threshold is None else mad_threshold
        clean_batch = torch.from_numpy(clean_images.astype(np.float32))

        results: List[ClassReconstructionResult] = []
        for idx, name in enumerate(class_names):
            r = self.reconstruct_for_class(torch_model, clean_batch, idx, num_channels)
            r.class_name = name
            results.append(r)

        norms = np.array([r.mask_l1_norm for r in results])
        median = float(np.median(norms))
        mad = float(np.median(np.abs(norms - median))) or 1e-6
        # Consistency constant so MAD approximates a normal std-dev, as in
        # the original Neural Cleanse anomaly-index formulation.
        anomaly_indices = np.abs(norms - median) / (1.4826 * mad)

        flagged = []
        for i, r in enumerate(results):
            # Only flag classes *below* the median (a smaller-than-normal
            # trigger is the backdoor signature; an anomalously *large*
            # mask just means that class is hard to reach, not suspicious).
            if r.mask_l1_norm < median and anomaly_indices[i] >= mad_threshold:
                flagged.append({
                    "class_idx": r.class_idx,
                    "class_name": r.class_name,
                    "mask_l1_norm": round(r.mask_l1_norm, 2),
                    "anomaly_index": round(float(anomaly_indices[i]), 2),
                })

        return {
            "per_class_results": [
                {
                    "class_idx": r.class_idx,
                    "class_name": r.class_name,
                    "mask_l1_norm": round(r.mask_l1_norm, 2),
                    "final_loss": round(r.final_loss, 4),
                    "anomaly_index": round(float(anomaly_indices[i]), 2),
                }
                for i, r in enumerate(results)
            ],
            "median_mask_l1_norm": round(median, 2),
            "mad": round(mad, 4),
            "flagged_classes": flagged,
            "backdoor_suspected": len(flagged) > 0,
        }


TORCHSCRIPT_EXTENSIONS = (".pt", ".pth", ".torchscript")


def _load_torchscript_for_reconstruction(model_path: str):
    """Loads a TorchScript module directly for gradient-based reconstruction
    -- no bridging needed, unlike the ONNX path, because a TorchScript
    export is already a real, differentiable PyTorch module. Gradients are
    disabled on every parameter (Neural Cleanse optimizes the INPUT
    trigger, never the model itself), matching onnx_torch_bridge.py's own
    stated invariant. Raises if the file isn't a genuine ScriptModule (e.g.
    a raw state_dict checkpoint has no attached model code to run) -- the
    caller turns that into an explicit UNAVAILABLE status, never a silent
    skip or a fabricated result."""
    import torch

    module = torch.jit.load(model_path, map_location="cpu")
    module.eval()
    for p in module.parameters():
        p.requires_grad_(False)
    return module


def _infer_num_channels(torch_model, resolution: int) -> int:
    """Determines the model's output channel count (4 box-regression
    channels + N class logits) by actually running one dummy forward pass
    -- there is no ONNX graph metadata to read it from for a native
    TorchScript module, so this is the equivalent real measurement rather
    than an assumption."""
    import torch

    with torch.no_grad():
        dummy = torch.zeros((1, 3, resolution, resolution))
        output = torch_model(dummy)
    if output.ndim == 3:
        return int(output.shape[1])
    raise ValueError(f"Unsupported output tensor rank {output.ndim}; expected (batch, channels, anchors).")


def run_trigger_reconstruction(
    model_id: str,
    model_path: str,
    clean_image_paths: List[str],
    class_names: List[str],
    resolution: int = 128,
    max_images: int = 10,
) -> Tuple[Dict[str, Any], List[FindingSchema]]:
    """End-to-end orchestration: resolves the model into a differentiable
    PyTorch module (either by bridging an ONNX graph, or loading a native
    TorchScript export directly -- no bridging needed there, since it's
    already a real torch module), loads a small clean-image batch, runs
    the full per-class Neural Cleanse sweep, and turns any flagged class
    into a FindingSchema. Returns ({"status": "UNAVAILABLE", "reason":
    ...}, []) rather than raising when the model can't be resolved this
    way -- this capability degrades to an explicit unavailable status,
    exactly like every other white-box-only check in this system, never a
    silent skip or a fabricated result."""
    from PIL import Image

    ext = os.path.splitext(model_path)[1].lower()

    if ext == ".onnx":
        from .onnx_torch_bridge import can_bridge_to_torch, load_intelx_detector_as_torch

        if not can_bridge_to_torch(model_path):
            return (
                {
                    "status": "UNAVAILABLE",
                    "reason": "This model's ONNX graph does not match a structure this system can bridge "
                    "into a differentiable framework for gradient-based reconstruction. Currently only this "
                    "system's own detector-family graph (three backbone convs + a 1x1 head + an additive "
                    "trigger branch) is supported; arbitrary third-party ONNX graphs are not.",
                },
                [],
            )
        torch_model, _input_size, num_channels = load_intelx_detector_as_torch(model_path)
    elif ext in TORCHSCRIPT_EXTENSIONS:
        try:
            torch_model = _load_torchscript_for_reconstruction(model_path)
        except Exception as e:
            return (
                {
                    "status": "UNAVAILABLE",
                    "reason": f"'{model_path}' could not be loaded as an executable TorchScript module: {e}. "
                    "Gradient-based reconstruction requires a self-contained TorchScript export "
                    "(torch.jit.script/trace) -- a raw state_dict checkpoint has no attached model code "
                    "to differentiate through.",
                },
                [],
            )
        try:
            num_channels = _infer_num_channels(torch_model, resolution)
        except Exception as e:
            return (
                {"status": "UNAVAILABLE", "reason": f"Could not determine this model's output layout: {e}"},
                [],
            )
    else:
        return (
            {
                "status": "UNAVAILABLE",
                "reason": f"Unsupported model file extension '{ext}' for gradient-based trigger reconstruction. "
                "Supported: .onnx (this system's own detector-family graph only), and self-contained "
                "TorchScript exports (.pt/.pth/.torchscript).",
            },
            [],
        )

    usable_paths = [p for p in clean_image_paths if os.path.exists(p)][:max_images]
    if len(usable_paths) < 3:
        return (
            {"status": "UNAVAILABLE", "reason": "Fewer than 3 real clean images were available for reconstruction."},
            [],
        )

    imgs = []
    for p in usable_paths:
        with Image.open(p) as im:
            arr = np.asarray(im.convert("RGB").resize((resolution, resolution)), dtype=np.float32) / 255.0
            imgs.append(arr.transpose(2, 0, 1))
    clean_batch = np.stack(imgs)

    reconstructor = NeuralCleanseReconstructor()
    result = reconstructor.run_full_sweep(torch_model, clean_batch, class_names, num_channels)
    result["status"] = "COMPLETED"
    result["clean_images_used"] = len(usable_paths)
    result["resolution"] = resolution

    findings: List[FindingSchema] = []
    for flagged in result["flagged_classes"]:
        findings.append(
            FindingSchema(
                finding_id=f"FINDING-MDL-TRIGGER-RECON-{flagged['class_idx']:02d}",
                asset=model_id,
                asset_type=AssetType.MODEL,
                finding_type="unknown_trigger_reconstruction",
                reason=(
                    f"Blind gradient-based trigger reconstruction (Neural Cleanse) found that class "
                    f"'{flagged['class_name']}' can be hijacked with an anomalously small input "
                    f"perturbation (mask L1={flagged['mask_l1_norm']}, anomaly index="
                    f"{flagged['anomaly_index']} against a MAD threshold of "
                    f"{NeuralCleanseReconstructor.DEFAULT_MAD_THRESHOLD}), consistent with an "
                    "undeclared backdoor targeting this class -- discovered without being told any "
                    "trigger pattern in advance."
                ),
                evidence={
                    "flagged_class": flagged,
                    "median_mask_l1_norm": result["median_mask_l1_norm"],
                    "mad": result["mad"],
                    "per_class_results": result["per_class_results"],
                },
                severity=FindingSeverity.HIGH,
                confidence=0.75,
                affected_source=model_id,
                recommended_action=RecommendedDisposition.REVIEW,
                access_assumptions=[
                    "Requires WHITE_BOX access and a model this system can resolve into a differentiable "
                    "PyTorch module (this system's own bridgeable ONNX graph, or a self-contained "
                    "TorchScript export); unavailable for black-box access, unrecognized ONNX architectures, "
                    "or raw (non-scripted) PyTorch state_dict checkpoints."
                ],
                limitations=[
                    "Neural Cleanse's own published limitation: may miss triggers with unusual size/shape "
                    "priors, is sensitive to the L1-regularization weight, and assumes a patch-style "
                    "trigger rather than an arbitrary global perturbation.",
                    "Anomaly-index threshold was empirically calibrated against this system's own "
                    "synthetic fixtures, not validated at scale against diverse real-world backdoors.",
                ],
            )
        )

    return result, findings
