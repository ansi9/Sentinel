import json
import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

DB_PATH = os.environ.get("IntelX_DB_PATH", "intelx.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS model_records (
    model_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    model_format TEXT NOT NULL,
    access_level TEXT NOT NULL,
    sha256_digest TEXT NOT NULL,
    architecture TEXT,
    total_parameters INTEGER,
    saved_path TEXT,
    verification_status TEXT,
    created_at TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_model_records_digest ON model_records(sha256_digest);

CREATE TABLE IF NOT EXISTS dataset_analyses (
    analysis_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    format TEXT NOT NULL,
    total_images INTEGER NOT NULL,
    finding_count INTEGER NOT NULL,
    label_verification_method TEXT,
    created_at TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    findings_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dataset_analyses_dataset_id ON dataset_analyses(dataset_id);

CREATE TABLE IF NOT EXISTS inference_records (
    record_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    provenance_hash TEXT NOT NULL,
    is_valid INTEGER NOT NULL,
    tampering_detected INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inference_records_model_id ON inference_records(model_id);

CREATE TABLE IF NOT EXISTS assurance_reports (
    report_id TEXT PRIMARY KEY,
    overall_disposition TEXT NOT NULL,
    overall_risk_score REAL NOT NULL,
    assurance_score REAL NOT NULL DEFAULT 0.0,
    generated_at TEXT NOT NULL,
    report_json TEXT NOT NULL
);
"""


@contextmanager
def get_connection(db_path: str = DB_PATH):
    dir_name = os.path.dirname(db_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA)
        cursor = conn.execute("PRAGMA table_info(assurance_reports)")
        columns = [row[1] for row in cursor.fetchall()]
        if "assurance_score" not in columns:
            conn.execute("ALTER TABLE assurance_reports ADD COLUMN assurance_score REAL NOT NULL DEFAULT 0.0")
            conn.execute("UPDATE assurance_reports SET assurance_score = ROUND(MAX(0.0, 100.0 - overall_risk_score), 1)")


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# -- Model records ----------------------------------------------------------

def insert_model_record(fingerprint: Dict[str, Any], saved_path: Optional[str] = None, db_path: str = DB_PATH) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO model_records
               (model_id, model_name, model_format, access_level, sha256_digest, architecture,
                total_parameters, saved_path, verification_status, created_at, fingerprint_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                fingerprint["model_id"], fingerprint["model_name"], fingerprint["model_format"],
                fingerprint["access_level"], fingerprint["sha256_digest"], fingerprint.get("architecture"),
                fingerprint.get("total_parameters"), saved_path, fingerprint.get("verification_status"),
                _now(), json.dumps(fingerprint),
            ),
        )


def list_model_records(limit: int = 100, db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM model_records ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_model_record(model_id: str, db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM model_records WHERE model_id = ?", (model_id,)).fetchone()
        return dict(row) if row else None


# -- Dataset analyses ---------------------------------------------------------

def insert_dataset_analysis(
    analysis_id: str, dataset_id: str, format_type: str, total_images: int,
    findings: List[Dict[str, Any]], profile: Dict[str, Any], label_verification_method: str,
    db_path: str = DB_PATH,
) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO dataset_analyses
               (analysis_id, dataset_id, format, total_images, finding_count,
                label_verification_method, created_at, profile_json, findings_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id, dataset_id, format_type, total_images, len(findings),
                label_verification_method, _now(), json.dumps(profile), json.dumps(findings),
            ),
        )


def list_dataset_analyses(limit: int = 100, db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT analysis_id, dataset_id, format, total_images, finding_count, "
            "label_verification_method, created_at FROM dataset_analyses ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_dataset_analysis(analysis_id: str, db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM dataset_analyses WHERE analysis_id = ?", (analysis_id,)).fetchone()
        return dict(row) if row else None


# -- Inference records --------------------------------------------------------

def insert_inference_record(record: Dict[str, Any], db_path: str = DB_PATH) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO inference_records
               (record_id, model_id, image_hash, provenance_hash, is_valid, tampering_detected,
                created_at, record_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record["record_id"], record["model_id"], record["image_hash"], record["provenance_hash"],
                int(bool(record.get("is_valid", True))), int(bool(record.get("tampering_detected", False))),
                _now(), json.dumps(record),
            ),
        )


def list_inference_records(limit: int = 100, db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT record_id, model_id, image_hash, provenance_hash, is_valid, tampering_detected, "
            "created_at, record_json FROM inference_records ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_inference_record(record_id: str, db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM inference_records WHERE record_id = ?", (record_id,)).fetchone()
        return dict(row) if row else None


# -- Assurance reports ---------------------------------------------------------

def insert_assurance_report(report: Dict[str, Any], db_path: str = DB_PATH) -> None:
    init_db(db_path)
    assurance_score = report.get("assurance_score")
    if assurance_score is None:
        assurance_score = max(0.0, min(100.0, round(100.0 - float(report.get("overall_risk_score", 0.0)), 1)))
        report["assurance_score"] = assurance_score
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO assurance_reports
               (report_id, overall_disposition, overall_risk_score, assurance_score, generated_at, report_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                report["report_id"], report["overall_disposition"], report["overall_risk_score"],
                assurance_score, report["generated_at"], json.dumps(report),
            ),
        )


def list_assurance_reports(limit: int = 100, db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT report_id, overall_disposition, overall_risk_score, assurance_score, generated_at "
            "FROM assurance_reports ORDER BY generated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_assurance_report(report_id: str, db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM assurance_reports WHERE report_id = ?", (report_id,)).fetchone()
        return dict(row) if row else None


def list_all_findings(limit: int = 150, db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT report_id, overall_disposition, report_json FROM assurance_reports ORDER BY generated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        all_findings = []
        for r in rows:
            try:
                rep = json.loads(r["report_json"])
                for f in rep.get("findings", []):
                    item = dict(f)
                    item["report_id"] = r["report_id"]
                    item["report_disposition"] = r["overall_disposition"]
                    item["generated_at"] = rep.get("generated_at")
                    all_findings.append(item)
            except Exception:
                continue
        return all_findings


def add_manual_finding_to_report(report_id: str, finding: Dict[str, Any], db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT report_json FROM assurance_reports WHERE report_id = ?", (report_id,)).fetchone()
        if not row:
            return None
        rep = json.loads(row["report_json"])
        rep.setdefault("findings", []).append(finding)
        conn.execute(
            "UPDATE assurance_reports SET report_json = ? WHERE report_id = ?",
            (json.dumps(rep), report_id)
        )
        return rep


# -- Evidence-reference check (used to guard deletion of raw uploads) --------

def find_references_to_path(abs_path: str, db_path: str = DB_PATH) -> List[str]:
    """Returns a human-readable description of every persisted evidence
    record that references the given absolute filesystem path, so a
    caller can refuse to delete it while any reference exists.

    Deliberately over-cautious: in addition to the one indexed exact-match
    column (model_records.saved_path), this does a substring search across
    every stored JSON blob (dataset/inference/report records embed file
    paths inside their JSON payloads, not as queryable columns). A
    raw-upload file that still shows up here has already been folded into
    at least one piece of generated evidence -- deleting the source file
    out from under that evidence would make it unable to be
    re-verified/re-examined later, which this system's whole purpose is
    to prevent. False positives (an unrelated record whose JSON happens to
    contain this exact path substring) only make deletion more
    conservative, never less safe."""
    init_db(db_path)
    refs: List[str] = []
    like_pattern = f"%{abs_path}%"
    with get_connection(db_path) as conn:
        for row in conn.execute(
            "SELECT model_id, model_name FROM model_records WHERE saved_path = ?", (abs_path,)
        ):
            refs.append(f"model_record:{row['model_id']} ({row['model_name']})")

        for row in conn.execute(
            "SELECT analysis_id, dataset_id FROM dataset_analyses WHERE profile_json LIKE ? OR findings_json LIKE ?",
            (like_pattern, like_pattern),
        ):
            refs.append(f"dataset_analysis:{row['analysis_id']} ({row['dataset_id']})")

        for row in conn.execute(
            "SELECT record_id FROM inference_records WHERE record_json LIKE ?", (like_pattern,)
        ):
            refs.append(f"inference_record:{row['record_id']}")

        for row in conn.execute(
            "SELECT report_id FROM assurance_reports WHERE report_json LIKE ?", (like_pattern,)
        ):
            refs.append(f"assurance_report:{row['report_id']}")

    return refs
