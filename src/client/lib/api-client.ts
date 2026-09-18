import {
  AssuranceReport,
  AuditLogEntry,
  ContributorRiskSummary,
  DatasetProfile,
  DistributionShiftReport,
  FederatedSimulationResult,
  FindingSchema,
  InferenceRecord,
  ModelBehaviourAssessment,
  ModelFingerprint,
  RecommendedDisposition,
  ScenarioRunResult,
  TrendSummary,
} from '@/shared/types/assurance'

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
const API_KEY_STORAGE_KEY = 'intelx_station_api_key'

function loadStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

let currentApiKey: string | null = loadStoredApiKey()

export interface DatasetAnalysisResult {
  profile: DatasetProfile
  findings: FindingSchema[]
  duplicate_stats: Record<string, unknown>
  label_stats: Record<string, unknown>
  ood_stats: Record<string, unknown>
  poison_stats: Record<string, unknown>
  structure_warnings: string[]
  label_verification_method: string
  visual_check_truncated_to: number | null
  probe_sample_image_paths: string[]
}

export interface AccessCapabilities {
  access_level: string
  supported_methods: string[]
  unavailable_methods: string[]
}

export interface BackdoorProbeResult {
  attack_success_rate: number | null
  findings: FindingSchema[]
  status: 'COMPLETED' | 'UNAVAILABLE'
  reason?: string
}

export interface TriggerReconstructionResult {
  result: Record<string, unknown>
  findings: FindingSchema[]
}

export interface DatasetUploadResult {
  extracted_to: string
  coco_json_candidates: string[]
  coco_images_dir: string | null
  yolo_dir_candidate: string | null
  size_bytes: number
}

export interface ParameterAnalysisResult {
  stats: Record<string, unknown>
  findings: FindingSchema[]
}

export interface BehaviourBatteryResult {
  assessment: ModelBehaviourAssessment
  findings: FindingSchema[]
  battery: Array<Record<string, unknown>>
}

export interface StoredReportSummary {
  report_id: string
  overall_disposition: RecommendedDisposition
  overall_risk_score: number
  assurance_score: number
  generated_at: string
}

export class AssuranceApiClient {
  /** Sets the station's API key (backend/api/auth.py's X-API-Key gate) for
   * every subsequent request, and persists it so a page reload doesn't
   * force re-authentication. Pass null to clear it (logout). */
  static setApiKey(key: string | null): void {
    currentApiKey = key
    if (typeof window === 'undefined') return
    try {
      if (key) window.localStorage.setItem(API_KEY_STORAGE_KEY, key)
      else window.localStorage.removeItem(API_KEY_STORAGE_KEY)
    } catch {
      // Storage unavailable (private browsing, etc.) -- the in-memory key still works for this session.
    }
  }

  static getApiKey(): string | null {
    return currentApiKey
  }

  /** Verifies the current (or given) API key against the real backend RBAC
   * gate and returns the role it resolves to (`null` role means this
   * deployment has no keys configured at all -- see backend/api/auth.py). */
  static async whoami(apiKey?: string): Promise<{ authenticated: boolean; role: string | null }> {
    return this.request('/api/auth/whoami', apiKey !== undefined ? { headers: { 'X-API-Key': apiKey } } : undefined)
  }

  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(currentApiKey ? { 'X-API-Key': currentApiKey } : {}),
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`API Error ${res.status}: ${errorText}`)
    }

    return res.json()
  }

  private static async requestForm<T>(endpoint: string, formData: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: currentApiKey ? { 'X-API-Key': currentApiKey } : undefined,
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`API Error ${res.status}: ${errorText}`)
    }

    return res.json()
  }

  static async listScenarios(): Promise<Array<{ id: string; name: string; badge: string; disposition: string; description: string }>> {
    return this.request('/api/scenarios/list')
  }

  static async evaluateDistributionShift(params: {
    referenceProfile: Record<string, unknown>
    observedSamples: Array<Record<string, unknown>>
    declaredReferenceId?: string
    observedDatasetId?: string
    referenceSamplesMetadata?: Array<Record<string, unknown>>
  }): Promise<DistributionShiftReport> {
    return this.request('/api/drift/evaluate', {
      method: 'POST',
      body: JSON.stringify({
        reference_profile: params.referenceProfile,
        observed_samples: params.observedSamples,
        declared_reference_id: params.declaredReferenceId,
        observed_dataset_id: params.observedDatasetId,
        reference_samples_metadata: params.referenceSamplesMetadata ?? null,
      }),
    })
  }

  static async runFederatedSimulation(params: {
    branchIds: string[]
    numRounds: number
    maliciousBranchIds?: string[]
  }): Promise<FederatedSimulationResult> {
    return this.request('/api/federated/simulate', {
      method: 'POST',
      body: JSON.stringify({
        branch_ids: params.branchIds,
        num_rounds: params.numRounds,
        malicious_branch_ids: params.maliciousBranchIds && params.maliciousBranchIds.length > 0 ? params.maliciousBranchIds : null,
      }),
    })
  }

  static async runScenario(scenarioId: string): Promise<ScenarioRunResult> {
    return this.request(`/api/scenarios/run/${scenarioId}`, {
      method: 'POST',
    })
  }

  static async verifyInferenceRecord(record: InferenceRecord, checkReplay = false): Promise<{ is_valid: boolean; errors: string[] }> {
    return this.request('/api/inference/verify', {
      method: 'POST',
      body: JSON.stringify({ record, check_replay: checkReplay }),
    })
  }

  static async simulateTampering(record: InferenceRecord, modifiedClass: string, modifiedConfidence: number): Promise<{
    original_provenance_hash: string
    tampered_record: InferenceRecord
    is_valid: boolean
    verification_errors: string[]
  }> {
    return this.request('/api/inference/tamper-simulate', {
      method: 'POST',
      body: JSON.stringify({
        record,
        modified_class: modifiedClass,
        modified_confidence: modifiedConfidence,
      }),
    })
  }

  /** The real, process-wide, hash-chained audit ledger -- every real API
   * action across every scenario and live assessment writes into this one
   * ledger, so the Audit view should always read from here directly
   * rather than a per-scenario-run side channel that's empty for any
   * report not generated via Scenario Replay. */
  static async getAuditEntries(): Promise<{
    entries: AuditLogEntry[]
    total_entries: number
    chain_digest: string
    is_chain_valid: boolean
    verification_errors: string[]
  }> {
    return this.request('/api/audit/entries')
  }

  static async verifyAuditLedger(): Promise<{ is_chain_valid: boolean; chain_digest: string; errors: string[] }> {
    return this.request('/api/audit/verify', {
      method: 'POST',
    })
  }

  static async getTrends(limit = 200): Promise<TrendSummary> {
    return this.request(`/api/report/trends/summary?limit=${limit}`)
  }

  /** Every assessment ever generated (scenario replay and live analysis
   * alike), newest first -- the summary columns only (no findings), which
   * is exactly what a Home triage list needs without pulling every
   * report's full body over the wire. */
  /** Every model ever fingerprinted through this service, newest first --
   * a real query against the persisted model records table. */
  static async listModelRecords(limit = 100): Promise<Array<Record<string, unknown>>> {
    const res = await this.request<{ models: Array<Record<string, unknown>> }>(`/api/model/list?limit=${limit}`)
    return res.models
  }

  /** Every dataset integrity analysis ever run, newest first. */
  static async listDatasetAnalyses(limit = 100): Promise<Array<Record<string, unknown>>> {
    const res = await this.request<{ analyses: Array<Record<string, unknown>> }>(`/api/dataset/history?limit=${limit}`)
    return res.analyses
  }

  /** Every provenance-signed inference record ever executed, newest first. */
  static async listInferenceRecords(limit = 100): Promise<Array<Record<string, unknown>>> {
    const res = await this.request<{ records: Array<Record<string, unknown>> }>(`/api/inference/list?limit=${limit}`)
    return res.records
  }

  static async listReportSummaries(limit = 100): Promise<StoredReportSummary[]> {
    const res = await this.request<{ reports: StoredReportSummary[] }>(`/api/report/list?limit=${limit}`)
    return res.reports
  }

  /** Fetches one persisted assessment's full AssuranceReport (findings,
   * contributor summaries, coverage, everything) by id -- used to open a
   * report from the Home screen into the same result card + findings
   * triage UI a fresh scenario/live run gets. */
  static async getReportById(reportId: string): Promise<AssuranceReport> {
    const row = await this.request<{ report_json: string }>(`/api/report/${encodeURIComponent(reportId)}`)
    return JSON.parse(row.report_json)
  }

  /** Direct download URL for a stored report -- opened in a new tab / used
   * as an <a href>, not fetched as JSON, so the browser handles the
   * Content-Disposition attachment itself. */
  static reportExportUrl(reportId: string, format: 'html' | 'pdf'): string {
    return `${API_BASE}/api/report/${encodeURIComponent(reportId)}/export.${format}`
  }

  static async listAllFindings(limit = 150): Promise<Array<FindingSchema & { report_id: string; report_disposition: string; generated_at?: string }>> {
    const res = await this.request<{ findings: Array<FindingSchema & { report_id: string; report_disposition: string; generated_at?: string }> }>(`/api/report/findings/all?limit=${limit}`)
    return res.findings
  }

  static async recordManualFinding(
    reportId: string,
    finding: FindingSchema,
    actor = "Operator"
  ): Promise<{ report: AssuranceReport; finding: FindingSchema; audit_entry: AuditLogEntry }> {
    return this.request(`/api/report/${encodeURIComponent(reportId)}/findings/manual`, {
      method: "POST",
      body: JSON.stringify({ finding, actor }),
    })
  }

  // -- Live analysis: real, user-supplied files, no canned scenario involved --

  static async uploadModel(file: File): Promise<ModelFingerprint> {
    const form = new FormData()
    form.append('file', file)
    return this.requestForm('/api/model/upload', form)
  }

  static async uploadDatasetArchive(file: File): Promise<DatasetUploadResult> {
    const form = new FormData()
    form.append('file', file)
    return this.requestForm('/api/dataset/upload', form)
  }

  static async uploadProbeImage(file: File): Promise<{ image_path: string; size_bytes: number }> {
    const form = new FormData()
    form.append('file', file)
    return this.requestForm('/api/inference/upload-image', form)
  }

  static async analyzeDatasetProfile(params: {
    datasetId: string
    formatType: 'COCO' | 'YOLO'
    cocoPath?: string
    imagesDir?: string
    yoloDir?: string
    referenceModelPath?: string
  }): Promise<DatasetAnalysisResult> {
    return this.request('/api/dataset/analyze-profile', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: params.datasetId,
        format_type: params.formatType,
        coco_path: params.cocoPath,
        images_dir: params.imagesDir,
        yolo_dir: params.yoloDir,
        reference_model_path: params.referenceModelPath,
      }),
    })
  }

  static async executeInference(imagePath: string, modelPath: string, confidenceThreshold = 0.25): Promise<InferenceRecord> {
    return this.request('/api/inference/execute', {
      method: 'POST',
      body: JSON.stringify({
        image_path: imagePath,
        model_path: modelPath,
        config: { confidence_threshold: confidenceThreshold },
      }),
    })
  }

  static async runParameterAnalysis(modelPath: string, modelId?: string): Promise<ParameterAnalysisResult> {
    return this.request('/api/model/parameter-analysis', {
      method: 'POST',
      body: JSON.stringify({ model_path: modelPath, model_id: modelId }),
    })
  }

  /** Compiles whatever findings/contributor evidence Live Analysis has
   * accumulated so far into one governance-ready AssuranceReport -- the
   * same object shape a Scenario Replay run produces, so the Live
   * Analysis result can be shown through the exact same
   * AssessmentResultCard/FindingsTriage UI rather than a separate,
   * bespoke "live results" presentation. */
  static async generateReport(params: {
    findings: FindingSchema[]
    contributorSummaries?: ContributorRiskSummary[]
    datasetStatus?: string
    modelStatus?: string
    inferenceStatus?: string
    driftStatus?: string
  }): Promise<AssuranceReport> {
    return this.request('/api/report/generate', {
      method: 'POST',
      body: JSON.stringify({
        findings: params.findings,
        contributor_summaries: params.contributorSummaries ?? [],
        dataset_status: params.datasetStatus ?? 'VERIFIED',
        model_status: params.modelStatus ?? 'VERIFIED',
        inference_status: params.inferenceStatus ?? 'VERIFIED',
        drift_status: params.driftStatus ?? 'NORMAL',
      }),
    })
  }

  /** Persists an analyst's final disposition decision on a stored report
   * and records it as a real, hash-chained audit ledger entry -- there is
   * no client-side fabrication of this event; the returned `audit_entry`
   * is the actual entry the backend just appended to the shared ledger. */
  static async recordReportDecision(
    reportId: string,
    decision: RecommendedDisposition,
    notes: string,
    actor: string
  ): Promise<{ report: AssuranceReport; audit_entry: AuditLogEntry }> {
    return this.request(`/api/report/${encodeURIComponent(reportId)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes, actor }),
    })
  }

  static async runBehaviourBattery(params: {
    referenceModelPath: string
    candidateModelPath: string
    probeImagePaths: string[]
    confidenceThreshold?: number
  }): Promise<BehaviourBatteryResult> {
    return this.request('/api/model/behaviour-battery', {
      method: 'POST',
      body: JSON.stringify({
        reference_model_path: params.referenceModelPath,
        candidate_model_path: params.candidateModelPath,
        probe_image_paths: params.probeImagePaths,
        confidence_threshold: params.confidenceThreshold ?? 0.25,
      }),
    })
  }

  /** What this declared access level actually lets the model-assurance
   * pipeline check, and what it explicitly cannot (FR-07 access-tier
   * disclosure) -- surfaced to the operator before/alongside running any
   * deeper probe, so a BLACK_BOX/HASH_ONLY model's coverage gaps are
   * visible rather than only implied by a check silently not running. */
  static async getAccessCapabilities(accessLevel: string): Promise<AccessCapabilities> {
    return this.request(`/api/model/access-capabilities?access_level=${encodeURIComponent(accessLevel)}`, {
      method: 'POST',
    })
  }

  static async verifyModelDigest(
    supplied: ModelFingerprint,
    expectedReferenceDigest?: string | null
  ): Promise<{ is_match: boolean; status: string; finding: FindingSchema | null }> {
    return this.request('/api/model/verify-digest', {
      method: 'POST',
      body: JSON.stringify({
        supplied_fingerprint: supplied,
        expected_reference_digest: expectedReferenceDigest ?? null,
      }),
    })
  }

  /** Known-trigger clean-vs-triggered probing (`BackdoorDetector`): runs
   * the candidate model once clean and once with a checkerboard trigger
   * patch stamped on each supplied real image, and reports the real
   * attack-success-rate of predictions flipping to the backdoor's target
   * class. Needs only real execution access (BLACK_BOX or WHITE_BOX). */
  static async runBackdoorProbe(params: {
    modelPath: string
    probeImagePaths: string[]
    modelId?: string
    accessLevel?: string
    confidenceThreshold?: number
  }): Promise<BackdoorProbeResult> {
    return this.request('/api/model/backdoor-probe', {
      method: 'POST',
      body: JSON.stringify({
        model_path: params.modelPath,
        probe_image_paths: params.probeImagePaths,
        model_id: params.modelId,
        access_level: params.accessLevel ?? 'BLACK_BOX',
        confidence_threshold: params.confidenceThreshold ?? 0.25,
      }),
    })
  }

  /** Blind, gradient-based unknown-trigger reconstruction (Neural
   * Cleanse) -- never told what a trigger looks like, optimizes one from
   * scratch per candidate class. WHITE_BOX-only; reports UNAVAILABLE with
   * a reason for unsupported architectures rather than a silent skip. */
  static async runTriggerReconstruction(params: {
    modelPath: string
    cleanImagePaths: string[]
    classNames: string[]
    modelId?: string
  }): Promise<TriggerReconstructionResult> {
    return this.request('/api/model/trigger-reconstruction', {
      method: 'POST',
      body: JSON.stringify({
        model_path: params.modelPath,
        clean_image_paths: params.cleanImagePaths,
        class_names: params.classNames,
        model_id: params.modelId,
      }),
    })
  }
}
