from typing import Any, Dict, List
from PIL import Image
from ..inference.inference_engine import InferenceEngine
from ..ingestion.dataset_loader import SampleItem
from ..schemas import InferenceConfig
from .asset_generator import AssetGenerator

PROBE_CONFIG = InferenceConfig(confidence_threshold=0.25, max_detections=5)


def build_reference_battery(
    inf_eng: InferenceEngine,
    reference_model_path: str,
    candidate_model_path: str,
    samples: List[SampleItem],
    config: InferenceConfig,
) -> List[Dict[str, Any]]:
    """Runs the SAME images through the trusted reference model and the
    candidate (possibly compromised) model, and reports what each actually
    predicted. This is a real behavioural comparison: for an unmodified
    model (reference_model_path == candidate_model_path) every probe
    trivially matches; for a substituted or backdoored model, divergence
    reflects real differences in the executed weights, not a scripted
    outcome."""
    battery: List[Dict[str, Any]] = []
    for i, sample in enumerate(samples):
        ref_preds = inf_eng.run_inference(sample.image_path, reference_model_path, config=config)
        cand_preds = inf_eng.run_inference(sample.image_path, candidate_model_path, config=config)

        ref_top = ref_preds[0] if ref_preds else None
        cand_top = cand_preds[0] if cand_preds else None

        battery.append({
            "probe_id": f"probe_{i+1:02d}",
            "expected_class": ref_top.class_name if ref_top else "no_detection",
            "observed_class": cand_top.class_name if cand_top else "no_detection",
            "expected_confidence": ref_top.confidence if ref_top else 0.0,
            "observed_confidence": cand_top.confidence if cand_top else 0.0,
        })
    return battery


def build_visual_predictions(
    inf_eng: InferenceEngine,
    reference_model_path: str,
    samples: List[SampleItem],
    config: InferenceConfig,
) -> Dict[str, tuple]:
    """Runs the real trusted reference model over every sample's actual
    image and returns {sample_id: (predicted_class, confidence)}. This is
    what makes label-flip/mislabelling detection possible on a real dataset
    that has no independent ground-truth annotation -- the model's own
    prediction stands in for the missing oracle."""
    predictions: Dict[str, tuple] = {}
    for sample in samples:
        preds = inf_eng.run_inference(sample.image_path, reference_model_path, config=config)
        top = preds[0] if preds else None
        predictions[sample.sample_id] = (top.class_name if top else "no_detection", top.confidence if top else 0.0)
    return predictions


def build_trigger_probes(
    inf_eng: InferenceEngine,
    candidate_model_path: str,
    samples: List[SampleItem],
    config: InferenceConfig,
) -> tuple:
    """Builds real clean-vs-triggered probe pairs: for each sample, run the
    candidate model once on the untouched image and once on the same image
    with the checkerboard trigger patch stamped on, then report what the
    model actually predicted in each case. Detects real behaviour flips,
    not a scripted attack-success-rate."""
    clean_probes: List[Dict[str, Any]] = []
    triggered_probes: List[Dict[str, Any]] = []

    for sample in samples:
        with Image.open(sample.image_path) as img:
            clean_preds = inf_eng.run_inference_on_image(img, candidate_model_path, config=config)
            triggered_img = AssetGenerator.draw_trigger_patch(img)
            triggered_preds = inf_eng.run_inference_on_image(triggered_img, candidate_model_path, config=config)

        clean_top = clean_preds[0] if clean_preds else None
        trig_top = triggered_preds[0] if triggered_preds else None

        clean_probes.append({"observed_class": clean_top.class_name if clean_top else "no_detection"})
        triggered_probes.append({
            "observed_class": trig_top.class_name if trig_top else "no_detection",
            "target_backdoor_class": "military_vehicle",
            "confidence": trig_top.confidence if trig_top else 0.0,
            "trigger_type": "checkerboard_patch_32x32",
        })

    return clean_probes, triggered_probes
