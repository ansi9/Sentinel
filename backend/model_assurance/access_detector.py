from typing import Dict, List, Tuple
from ..schemas import ModelAccessLevel


class ModelAccessDetector:
    """Declares which assessment techniques are actually compatible with
    each access level. HASH_ONLY (file bytes available, but the model is
    never executed or introspected) is the weakest tier per the PRD's
    access table; BLACK_BOX additionally permits real input/output
    execution; WHITE_BOX additionally permits parameter/activation
    introspection. Any technique not listed as available for a level is
    reported UNAVAILABLE with an explicit reason rather than silently
    skipped or approximated."""

    AVAILABLE_TECHNIQUES: Dict[ModelAccessLevel, List[str]] = {
        ModelAccessLevel.HASH_ONLY: [
            "file_sha256_digest",
            "canonical_identity_verification",
        ],
        ModelAccessLevel.BLACK_BOX: [
            "file_sha256_digest",
            "canonical_identity_verification",
            "input_output_inference_profiling",
            "reference_test_battery_comparison",
            "behavioural_fingerprinting",
            "blackbox_trigger_perturbation_probe",
        ],
        ModelAccessLevel.WHITE_BOX: [
            "file_sha256_digest",
            "canonical_identity_verification",
            "input_output_inference_profiling",
            "reference_test_battery_comparison",
            "behavioural_fingerprinting",
            "blackbox_trigger_perturbation_probe",
            "layer_parameter_distribution_analysis",
            "activation_anomaly_inspection",
            "reference_battery_comparison",
            "universal_trigger_reconstruction",
        ],
    }

    UNAVAILABLE_REASONS: Dict[str, str] = {
        "input_output_inference_profiling": "Model execution was not authorized; only file-level digest access was granted (HASH_ONLY).",
        "reference_test_battery_comparison": "Running the declared reference battery requires executing the model; only file-level digest access was granted (HASH_ONLY).",
        "behavioural_fingerprinting": "Behavioural fingerprinting requires executing the model; only file-level digest access was granted (HASH_ONLY).",
        "blackbox_trigger_perturbation_probe": "Trigger perturbation probing requires executing the model; only file-level digest access was granted (HASH_ONLY).",
        "layer_parameter_distribution_analysis": "White-box parameter tensor access not available for this model endpoint.",
        "activation_anomaly_inspection": "Intermediate activation hooks require white-box model execution graphs.",
        "universal_trigger_reconstruction": "Gradient-based trigger inversion requires white-box gradient computation.",
    }

    @staticmethod
    def get_supported_methods(access_level: ModelAccessLevel) -> List[str]:
        return ModelAccessDetector.AVAILABLE_TECHNIQUES.get(access_level, [])

    @staticmethod
    def get_unavailable_methods(access_level: ModelAccessLevel) -> List[Tuple[str, str]]:
        all_methods = set(ModelAccessDetector.AVAILABLE_TECHNIQUES[ModelAccessLevel.WHITE_BOX])
        available_here = set(ModelAccessDetector.get_supported_methods(access_level))
        unavailable = []
        for method in sorted(all_methods - available_here):
            reason = ModelAccessDetector.UNAVAILABLE_REASONS.get(
                method, f"'{method}' is not supported at access level {access_level.value}."
            )
            unavailable.append((method, reason))
        return unavailable
