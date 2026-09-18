from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AssetType(str, Enum):
    DATASET = "dataset"
    MODEL = "model"
    INFERENCE_RECORD = "inference_record"
    PIPELINE = "pipeline"


class FindingSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RecommendedDisposition(str, Enum):
    ACCEPT = "ACCEPT"
    REVIEW = "REVIEW"
    QUARANTINE = "QUARANTINE"


class ModelAccessLevel(str, Enum):
    WHITE_BOX = "WHITE_BOX"
    BLACK_BOX = "BLACK_BOX"
    HASH_ONLY = "HASH_ONLY"


class ModelDigestStatus(str, Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    NO_REFERENCE = "NO_REFERENCE"


class DriftClassification(str, Enum):
    PROBABLE_OPERATIONAL_DRIFT = "probable_operational_drift"
    ANOMALY_REQUIRES_REVIEW = "anomaly_requires_review"
    MANIPULATION_INDICATORS_PRESENT = "manipulation_indicators_present"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class AttackClassStatus(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIAL = "PARTIAL"
    NOT_SUPPORTED = "NOT_SUPPORTED"


class FindingSchema(BaseModel):
    finding_id: str
    asset: str
    asset_type: AssetType
    finding_type: str
    reason: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    severity: FindingSeverity
    confidence: float
    affected_source: Optional[str] = None
    recommended_action: RecommendedDisposition
    limitations: List[str] = Field(default_factory=list)
    access_assumptions: List[str] = Field(default_factory=list)


class ContributorRiskSummary(BaseModel):
    contributor_id: str
    total_samples: int
    suspicious_samples: int
    near_duplicates: int
    label_anomalies: int
    ood_samples: int
    trigger_suspects: int
    risk_score: float
    risk_level: FindingSeverity
    recommended_action: RecommendedDisposition


class DatasetProfile(BaseModel):
    dataset_id: str
    format: str
    total_images: int
    total_annotations: int
    classes: List[str]
    class_distribution: Dict[str, int]
    contributors: List[str]
    batches: List[str]
    duplicate_clusters_count: int
    label_anomaly_count: int
    ood_sample_count: int
    trigger_anomaly_count: int
    contributor_risks: List[ContributorRiskSummary]


class ModelFingerprint(BaseModel):
    model_id: str
    model_name: str
    model_format: str
    access_level: ModelAccessLevel
    sha256_digest: str
    architecture: str
    total_parameters: Optional[int] = None
    input_shape: List[int]
    output_classes: List[str]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    verification_status: str


class ModelBehaviourAssessment(BaseModel):
    model_id: str
    reference_model_id: Optional[str] = None
    access_level: ModelAccessLevel
    total_battery_tests: int
    matching_predictions: int
    deviant_predictions: int
    mean_confidence_drift: float
    backdoor_trigger_response_rate: float
    whitebox_parameter_anomaly_score: Optional[float] = None
    whitebox_activation_anomaly_score: Optional[float] = None
    assessment_status: str
    limitations: List[str] = Field(default_factory=list)


class PreprocessingConfig(BaseModel):
    resize: List[int] = [640, 640]
    normalize_mean: List[float] = [0.485, 0.456, 0.406]
    normalize_std: List[float] = [0.229, 0.224, 0.225]
    color_space: str = "RGB"
    letterbox: bool = False
    pad_value: int = 114
    scale_to_unit: bool = True


class InferenceConfig(BaseModel):
    confidence_threshold: float = 0.5
    iou_threshold: float = 0.45
    max_detections: int = 100
    device: str = "cpu"


class BoundingBox(BaseModel):
    class_name: str
    confidence: float
    box: List[float]


class InferenceRecord(BaseModel):
    record_id: str
    timestamp: str
    nonce: str
    sequence_number: int
    image_hash: str
    model_digest: str
    preprocessing_hash: str
    config_hash: str
    output_hash: str
    provenance_hash: str
    signature: str
    predictions: List[BoundingBox]
    image_metadata: Dict[str, Any] = Field(default_factory=dict)
    model_id: str
    is_valid: bool = True
    tampering_detected: bool = False
    replay_detected: bool = False
    verification_errors: List[str] = Field(default_factory=list)


class DistributionShiftReport(BaseModel):
    declared_reference_id: str
    observed_dataset_id: str
    overall_drift_score: float
    drift_detected: bool
    confidence: float
    affected_dimensions: Dict[str, float]
    characterization: str
    suspected_cause: str
    is_manipulation_suspected: bool
    reasoning: str
    classification: DriftClassification = DriftClassification.INSUFFICIENT_EVIDENCE
    image_quality_evidence: Dict[str, Any] = Field(default_factory=dict)
    limitations: List[str] = Field(default_factory=list)


class AuditLogEntry(BaseModel):
    sequence_id: int
    timestamp: str
    event: str
    asset_id: str
    operation: str
    input_digest: str
    result: str
    evidence_reference: str
    previous_entry_hash: str
    entry_hash: str
    signature: Optional[str] = None


class CoverageItem(BaseModel):
    attack_class: str
    status: AttackClassStatus
    description: str
    validation_method: str


class AssuranceReport(BaseModel):
    report_id: str
    generated_at: str
    problem_statement_id: str = "26228"
    organization: str = "Ministry of Defence (MoD) / Indian Army (DGIS)"
    policy_version: str = "unversioned"
    overall_disposition: RecommendedDisposition
    overall_risk_score: float
    assurance_score: float = Field(default=95.8, description="Overall assurance score 0-100 (100 is maximum assurance)")
    dataset_assurance_status: str
    model_assurance_status: str
    inference_provenance_status: str
    distribution_shift_status: str
    findings: List[FindingSchema]
    contributor_summaries: List[ContributorRiskSummary]
    coverage_statements: List[CoverageItem]
    assumptions: List[str]
    limitations: List[str]
    audit_chain_digest: str
    audit_chain_valid: bool
