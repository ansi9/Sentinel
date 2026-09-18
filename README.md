# Sentinel: Vision AI Data & Pre-Training Integrity Firewall

**Category:** Software | **Theme:** Trust, Safety & Digital Security
**Operating Mode:** 100% Offline, Air-Gapped, Zero-Cloud Execution

---

## 1. System Overview

**Sentinel** is a model-agnostic, local, air-gapped data quality and integrity firewall engineered to evaluate and cryptographically verify computer vision pipelines before expensive cloud GPU training:

1. **Training Datasets (COCO / YOLO)**: Detects near-duplicate frame flooding using perceptual differential hashing ($d\text{Hash}$), spatial backdoor patch triggers via localized Laplacian kurtosis, multivariate color-moment out-of-distribution (OOD) insertion, and systematic annotation errors.
2. **Computer Vision Models (ONNX / PyTorch / TorchScript)**: Performs SHA-256 weight fingerprinting, White-Box vs Black-Box access-aware inspection, standardized behavioral test battery execution, and backdoor trojan activation analysis.
3. **Inference Provenance & Cryptography**: Establishes cryptographic binding across `Image Hash + Model Digest + Preprocessing + Config + Output Hash + Nonce + Timestamp` with Ed25519 digital signatures, real-time post-hoc tamper detection, and replay prevention.
4. **Distribution Shift Radar**: Evaluates terrain, sensor, illumination, and seasonal drift against declared reference envelopes.
5. **Tamper-Evident Audit Ledger**: Maintains an immutable, cryptographically chained block event ledger (`SHA-256(prev_hash + entry)`).
6. **Assurance Governance**: Generates enterprise-compliant JSON/HTML/PDF Assurance Reports with explicit risk dispositions: `ACCEPT`, `REVIEW`, or `QUARANTINE`.

---

## 2. Architecture & Directory Structure

The codebase is organized strictly into modular, single-responsibility components with zero redundant coupling and clean separation of concerns.

---

## 2. Senior Developer Architecture & Directory Structure

The codebase is organized strictly into modular, single-responsibility components with zero redundant coupling and no single file exceeding 300 lines of code.

```
Sentinel/
├── backend/
│   ├── api/
│   │   ├── routes_audit.py        # Tamper-evident ledger verification routes
│   │   ├── routes_dataset.py      # Dataset profiling and anomaly routes
│   │   ├── routes_drift.py        # Environmental distribution shift routes
│   │   ├── routes_inference.py    # Execution, provenance binding, and tamper routes
│   │   ├── routes_model.py        # Model fingerprinting and test battery routes
│   │   ├── routes_report.py       # Assurance report generation routes
│   │   └── routes_scenarios.py    # 1-Click reproducible test scenarios
│   ├── assurance/
│   │   ├── report_generator.py    # MoD JSON schema report compiler
│   │   └── risk_engine.py         # Multi-factor severity scoring & disposition
│   ├── audit/
│   │   └── audit_log.py           # Cryptographically chained block audit ledger
│   ├── data_assurance/
│   │   ├── contributor_risk.py    # Source-level risk aggregation
│   │   ├── duplicate_detector.py  # Perceptual differential hashing (dHash)
│   │   ├── label_analyzer.py      # Label flipping & systematic error discovery
│   │   ├── ood_detector.py        # Multivariate distribution distance scoring
│   │   └── poisoning_detector.py  # Spatial watermark & trigger patch search
│   ├── drift/
│   │   └── distribution_shift.py  # Terrain, sensor, and illumination drift
│   ├── inference/
│   │   └── inference_engine.py    # Vision inference execution
│   ├── ingestion/
│   │   ├── dataset_loader.py      # COCO & YOLO format ingestion
│   │   └── model_loader.py        # ONNX, PyTorch, TorchScript inspection
│   ├── model_assurance/
│   │   ├── access_detector.py     # White-box vs Black-box access isolation
│   │   ├── backdoor_detector.py   # Trojan trigger activation analyzer
│   │   ├── behaviour_analyzer.py  # Reference test battery comparison
│   │   ├── fingerprint.py         # Canonical SHA-256 weight fingerprinting
│   │   └── parameter_analyzer.py  # Weight kurtosis & activation statistics
│   ├── provenance/
│   │   ├── hashing.py             # Canonical DAG root hashing
│   │   ├── signing.py             # Ed25519 & HMAC-SHA256 digital signatures
│   │   └── verification.py        # Post-hoc tamper & replay verification
│   ├── scenarios/
│   │   └── scenario_manager.py    # Scenarios A, B, C, D reproducible suite
│   ├── schemas.py                 # Pydantic data schemas
│   └── main.py                    # FastAPI server
│
├── src/
│   ├── client/
│   │   ├── components/
│   │   │   ├── audit/AuditLedgerView.tsx
│   │   │   ├── dataset/DatasetAssuranceView.tsx
│   │   │   ├── drift/DistributionShiftView.tsx
│   │   │   ├── layout/Header.tsx
│   │   │   ├── model/ModelAssuranceView.tsx
│   │   │   ├── provenance/ProvenanceStudioView.tsx
│   │   │   ├── report/AssuranceReportView.tsx
│   │   │   ├── scenarios/ScenarioSelector.tsx
│   │   │   └── ui/StatusBadge.tsx, RiskMeter.tsx, StatCard.tsx
│   │   └── lib/
│   │       └── api-client.ts      # Typed REST API bridge
│   └── shared/
│       └── types/
│           └── assurance.ts       # Shared TypeScript definitions
│
├── tests/
│   └── test_assurance_core.py     # Pytest unit & cryptographic attack suite
└── app/
    ├── layout.tsx
    └── page.tsx                   # Master command dashboard
```

---

## 3. Cryptographic Provenance DAG

Every inference execution is bound into an immutable Directed Acyclic Graph (DAG):

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Input Image   │       │   Model File    │       │ Preprocessing   │       │ Predictions     │
│   (Bitstream)   │       │ (Weight Digest) │       │ & Model Config  │       │ (Boxes/Classes) │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │                         │
         ▼                         ▼                         ▼                         ▼
   Image SHA-256             Model SHA-256             Config SHA-256            Output SHA-256
         │                         │                         │                         │
         └─────────────────────────┼─────────────────────────┴─────────────────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │     Canonical Provenance      │
                   │      Hash (DAG Root)          │
                   │ + Nonce + Timestamp + SeqNum  │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Ed25519 Digital Signature  │
                   │ (Air-Gapped Private Key Sign) │
                   └───────────────────────────────┘
```

Any modification to predictions, bounding boxes, or model digests results in an immediate hash divergence during recalculation, causing automatic integrity failure.

---

## 4. Reproducible Evaluation Scenarios (PRD Section 19)

| Scenario Vector                     | Ingested Dataset                                         | Computer Vision Model                           | Inference Execution                  | Resulting Risk Score           | Recommended Disposition |
| :---------------------------------- | :------------------------------------------------------- | :---------------------------------------------- | :----------------------------------- | :----------------------------- | :---------------------- |
| **Scenario A: Clean Pipeline**      | Clean COCO/YOLO (Trusted Contributors)                   | Authentic Reference Model                       | Verified Cryptographic Record        | `4.2 / 100` (Low)              | **`ACCEPT`**            |
| **Scenario B: Compromised Dataset** | Contributor Bravo Flooding Duplicates + Triggers + Flips | Authentic Reference Model                       | Verified Cryptographic Record        | `78.5 / 100` (Critical)        | **`QUARANTINE`**        |
| **Scenario C: Substituted Model**   | Clean COCO/YOLO                                          | Substituted Digest + Trojan Backdoor Activation | Untrusted Model Warning              | `84.0 / 100` (Critical)        | **`QUARANTINE`**        |
| **Scenario D: Tampered Inference**  | Clean COCO/YOLO                                          | Authentic Reference Model                       | Altered Output Box / Replayed Record | Integrity Verification Failure | **`QUARANTINE`**        |

---

## 5. Quick Start

### Option A — Docker Compose (recommended for a demo/judge environment)

```bash
docker compose up --build
```

Backend on [http://localhost:8000](http://localhost:8000), frontend on
[http://localhost:3000](http://localhost:3000). See `docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`, and `docker-compose.yml`. Evidence (SQLite DB, audit ledger, signing
keys) persists in the `intelx-evidence` named volume across `docker compose down`/`up`. Set
`IntelX_API_KEY` in `docker-compose.yml` before exposing the backend beyond localhost — see
`docs/threat_model.md` § "API access control."

### Option B — Native (Air-Gapped Local Setup)

**Prerequisites:** Python 3.12 (3.10+ should work; PyTorch's TorchScript path is verified on 3.12 —
see the note in `backend/requirements.lock.txt`), Bun (or Node.js 20+).

```bash
# Create and activate virtual environment
uv venv backend/.venv
source backend/.venv/bin/activate

# Install dependencies -- backend/requirements.txt pins exact top-level versions;
# for a full air-gapped wheel pre-provisioning step, use requirements.lock.txt instead
# (see the header comment in that file for the pip download / --no-index workflow).
uv pip install -r backend/requirements.txt

# Run automated assurance test suite
backend/.venv/bin/python -m pytest tests/ -v

# Start FastAPI air-gapped backend server
backend/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Install frontend packages
bun install

# Start Next.js development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your air-gapped browser.

### Offline verification CLI

Verify the audit ledger and/or signed inference records without starting the service at all:

```bash
backend/.venv/bin/python -m backend.tools.verify_offline audit
backend/.venv/bin/python -m backend.tools.verify_offline all
```

---

## 6. Functional Compliance Verification

- [x] **FR-01 / FR-02**: Dataset Ingestion & Integrity Analysis (COCO & YOLO, duplicates, label flips, triggers, OOD).
- [x] **FR-03**: Contributor-Level Risk Aggregation.
- [x] **FR-04 / FR-05**: Model Ingestion & SHA-256 Weight Fingerprinting.
- [x] **FR-06 / FR-07**: Behaviour Assessment & three-tier Access Detection (`WHITE_BOX` / `BLACK_BOX` / `HASH_ONLY`).
- [x] **FR-08 / FR-09 / FR-10**: Cryptographic Provenance Binding, Tamper Detection, Replay & Reordering Detection (independent checks — see `provenance/verification.py`).
- [x] **FR-11 / FR-12**: Distribution-Shift & Environmental Drift Radar, classified into `probable_operational_drift` / `anomaly_requires_review` / `manipulation_indicators_present` / `insufficient_evidence`.
- [x] **FR-13 / FR-14**: Standardized Finding Schema (incl. `access_assumptions`) & Assurance Report Generation — JSON, HTML, and PDF export (`/api/report/{id}/export.{html,pdf}`).
- [x] **FR-15**: Tamper-Evident, Individually-Signed, Hash-Chained Audit Ledger, plus a standalone offline verification CLI (`backend/tools/verify_offline.py`).
- [x] **FR-16 / Section 19**: Reproducible Attack Testing Matrix — Scenarios A–F (dataset poisoning, model substitution/backdoor, inference tampering, replay & reordering, audit-log tampering).
- [x] **NFR-01 / NFR-02**: 100% Offline & Air-Gapped execution guarantee.
- [x] **Deliverables**: [`SBOM.md`](SBOM.md) (license inventory), [`docs/architecture.svg`](docs/architecture.svg) + [`docs/threat_model.md`](docs/threat_model.md), [`COVERAGE.md`](COVERAGE.md), `docker-compose.yml`, `.github/workflows/ci.yml`.
