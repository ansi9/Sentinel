import os
from typing import Optional, Tuple
from ..schemas import (
    AssetType,
    FindingSchema,
    FindingSeverity,
    ModelAccessLevel,
    ModelDigestStatus,
    ModelFingerprint,
    RecommendedDisposition,
)


class ModelFingerprinter:
    def generate_fingerprint(
        self,
        model_path: str,
        access_level: ModelAccessLevel = ModelAccessLevel.WHITE_BOX,
    ) -> ModelFingerprint:
        """Fingerprints an actual model file on disk. Raises if the file does
        not exist -- there is no fallback that hashes a name string, because
        that would not be a binding to the model's real content at all."""
        from ..ingestion.model_loader import ModelLoader

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Cannot fingerprint: model file not found at {model_path}")

        inspection = ModelLoader.inspect_model(model_path, enforce_access_level=access_level)
        return inspection.to_fingerprint(verification_status="VERIFIED")

    def verify_against_reference(
        self,
        supplied_fingerprint: ModelFingerprint,
        expected_reference_digest: str,
    ) -> Tuple[bool, Optional[FindingSchema]]:
        matches = supplied_fingerprint.sha256_digest.lower() == expected_reference_digest.lower()

        if not matches:
            finding = FindingSchema(
                finding_id="FINDING-MDL-SUB-001",
                asset=supplied_fingerprint.model_id,
                asset_type=AssetType.MODEL,
                finding_type="model_substitution",
                reason=f"Supplied model digest does not match declared reference baseline ({supplied_fingerprint.sha256_digest[:16]}... vs {expected_reference_digest[:16]}...).",
                evidence={
                    "supplied_digest": supplied_fingerprint.sha256_digest,
                    "expected_reference_digest": expected_reference_digest,
                    "model_format": supplied_fingerprint.model_format,
                    "model_name": supplied_fingerprint.model_name,
                },
                severity=FindingSeverity.CRITICAL,
                confidence=1.0,
                affected_source=supplied_fingerprint.model_name,
                recommended_action=RecommendedDisposition.QUARANTINE,
                limitations=["Exact digest match proves bitwise identity; subtle fine-tuning requires behavioral battery analysis."],
                access_assumptions=["Digest comparison requires only file-level (HASH_ONLY) access; valid at every access tier."],
            )
            return False, finding

        return True, None

    def verify_digest(
        self,
        supplied_fingerprint: ModelFingerprint,
        expected_reference_digest: Optional[str],
    ) -> Tuple[ModelDigestStatus, Optional[FindingSchema]]:
        """Superset of verify_against_reference that adds an explicit
        NO_REFERENCE disposition when no trusted reference digest has been
        declared at all -- distinct from MISMATCH, which requires an actual
        declared reference to compare against. A model can only be
        confidently called MATCH or MISMATCH when a reference exists."""
        if not expected_reference_digest:
            finding = FindingSchema(
                finding_id="FINDING-MDL-NOREF-001",
                asset=supplied_fingerprint.model_id,
                asset_type=AssetType.MODEL,
                finding_type="model_identity_unverifiable",
                reason="No trusted reference digest was declared for this model, so substitution cannot be "
                "confirmed or ruled out by digest comparison alone.",
                evidence={
                    "supplied_digest": supplied_fingerprint.sha256_digest,
                    "model_format": supplied_fingerprint.model_format,
                    "model_name": supplied_fingerprint.model_name,
                },
                severity=FindingSeverity.MEDIUM,
                confidence=1.0,
                affected_source=supplied_fingerprint.model_name,
                recommended_action=RecommendedDisposition.REVIEW,
                limitations=[
                    "Digest identity verification requires a declared, trusted reference digest; "
                    "behavioural/parameter checks may still detect anomalies independently of this check."
                ],
                access_assumptions=["No reference manifest entry was supplied for this model_id."],
            )
            return ModelDigestStatus.NO_REFERENCE, finding

        matches, mismatch_finding = self.verify_against_reference(supplied_fingerprint, expected_reference_digest)
        if matches:
            return ModelDigestStatus.MATCH, None
        return ModelDigestStatus.MISMATCH, mismatch_finding
