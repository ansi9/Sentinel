import time
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple
from ..schemas import BoundingBox, InferenceConfig, InferenceRecord, PreprocessingConfig
from .hashing import ProvenanceHasher
from .signing import ProvenanceSigner


class ProvenanceVerifier:
    def __init__(self, signer: Optional[ProvenanceSigner] = None):
        self.hasher = ProvenanceHasher()
        self.signer = signer or ProvenanceSigner()
        self.seen_nonces: Set[str] = set()
        self.last_sequence_number: int = 0
        self.last_verified_sequence: int = 0

    def create_record(
        self,
        image_path: str,
        model_id: str,
        model_digest: str,
        predictions: List[BoundingBox],
        preproc: Optional[PreprocessingConfig] = None,
        config: Optional[InferenceConfig] = None,
        image_metadata: Optional[Dict[str, Any]] = None,
    ) -> InferenceRecord:
        preproc = preproc or PreprocessingConfig()
        config = config or InferenceConfig()

        self.last_sequence_number += 1
        seq_num = self.last_sequence_number
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        nonce = str(uuid.uuid4().hex)

        img_hash = self.hasher.hash_image_file(image_path)
        preproc_hash = self.hasher.hash_preprocessing_config(preproc)
        cfg_hash = self.hasher.hash_inference_config(config)
        out_hash = self.hasher.hash_predictions(predictions)
        resolved_metadata = image_metadata or {"path": image_path}
        metadata_hash = self.hasher.hash_metadata(resolved_metadata)

        prov_hash = self.hasher.compute_provenance_hash(
            image_hash=img_hash,
            model_digest=model_digest,
            preprocessing_hash=preproc_hash,
            config_hash=cfg_hash,
            output_hash=out_hash,
            timestamp=timestamp,
            nonce=nonce,
            sequence_number=seq_num,
            model_id=model_id,
            metadata_hash=metadata_hash,
        )

        signature = self.signer.sign_provenance_hash(prov_hash)
        # Deliberately NOT added to seen_nonces here: replay detection is
        # scoped to verify_record(check_replay=True), which marks a nonce
        # "seen" the first time it is actually checked. Registering it at
        # creation would make the very first legitimate verification of a
        # freshly created record always report a false replay.

        return InferenceRecord(
            record_id=f"rec_{nonce[:12]}",
            timestamp=timestamp,
            nonce=nonce,
            sequence_number=seq_num,
            image_hash=img_hash,
            model_digest=model_digest,
            preprocessing_hash=preproc_hash,
            config_hash=cfg_hash,
            output_hash=out_hash,
            provenance_hash=prov_hash,
            signature=signature,
            predictions=predictions,
            image_metadata=resolved_metadata,
            model_id=model_id,
            is_valid=True,
            tampering_detected=False,
            replay_detected=False,
            verification_errors=[],
        )

    def verify_record(
        self,
        record: InferenceRecord,
        check_replay: bool = False,
    ) -> Tuple[bool, List[str]]:
        errors: List[str] = []

        recalculated_out_hash = self.hasher.hash_predictions(record.predictions)
        if recalculated_out_hash != record.output_hash:
            errors.append(
                f"Output Hash mismatch: record claims {record.output_hash[:12]}..., but recalculated from predictions is {recalculated_out_hash[:12]}... (TAMPERING DETECTED)"
            )

        recalculated_prov_hash = self.hasher.compute_provenance_hash(
            image_hash=record.image_hash,
            model_digest=record.model_digest,
            preprocessing_hash=record.preprocessing_hash,
            config_hash=record.config_hash,
            output_hash=record.output_hash,
            timestamp=record.timestamp,
            nonce=record.nonce,
            sequence_number=record.sequence_number,
            model_id=record.model_id,
            metadata_hash=self.hasher.hash_metadata(record.image_metadata),
        )

        if recalculated_prov_hash != record.provenance_hash:
            errors.append(
                f"Provenance Hash mismatch: claimed {record.provenance_hash[:12]}... vs recalculated {recalculated_prov_hash[:12]}... (ALTERATION DETECTED)"
            )

        sig_valid = self.signer.verify_signature(
            record.provenance_hash, record.signature, record_timestamp=record.timestamp
        )
        if not sig_valid:
            errors.append("Digital signature verification failed for this provenance record.")

        if check_replay:
            if record.nonce in self.seen_nonces:
                errors.append(
                    f"Replay detected: nonce '{record.nonce}' has already been processed in sequence context."
                )
            else:
                self.seen_nonces.add(record.nonce)

            if record.sequence_number <= self.last_verified_sequence:
                errors.append(
                    f"Reordering/replay detected: sequence number {record.sequence_number} is not greater "
                    f"than the last verified sequence number {self.last_verified_sequence} for this stream "
                    "(record is out-of-order or was replayed)."
                )
            else:
                self.last_verified_sequence = record.sequence_number

        return len(errors) == 0, errors
