/** API response types matching backend schemas (backend/api/schemas/response.py) */

export interface HealthResponse {
  status: string
  version: string
  active_missions: number
  uptime_seconds: number
}

export interface VersionResponse {
  name: string
  version: string
  api_version: string
  api_prefix: string
}

export interface MissionResponse {
  mission_id: string
  stage: string
  phase: string
  is_running: boolean
  incident_text: string
  incident_id: string
  environment_id: string
  mission_name: string
  created_at: string
  updated_at: string
}

export interface MissionListResponse {
  missions: MissionResponse[]
  count: number
}

export interface MissionSummaryResponse {
  mission_id: string
  stage: string
  generated_at: string
  needs_human_review: boolean
  mission_briefing: Record<string, unknown>
  confidence_scores: Record<string, number>
  handoffs: Array<Record<string, unknown>>
}

export interface TelemetryResponse {
  mission_id: string
  count: number
  environment: Record<string, unknown>
  telemetry: Array<Record<string, unknown>>
}

/** One canonical sensor packet from the simulation stream (backend/simulation/models.py). */
export interface TelemetryPacket {
  packet_id: string
  mission_id: string
  ts: string
  zone: string
  sensor_type: string
  metric: string
  value: number
  unit: string
  confidence: number
  source: string
}

export interface ReplayResponse {
  mission_id: string
  format: string
  seed: number | null
  scenario: string
  events: Array<Record<string, unknown>>
}

export interface ErrorResponse {
  detail: string
  code: string
  timestamp: string
  status_code: number
}

/** Request types */
export interface MissionCreateRequest {
  incident_text: string
  mission_name?: string
  environment_id?: string
}

/** SSE stream event types */
export type StreamEventType =
  | 'connected'
  | 'status'
  | 'telemetry'
  | 'timeline'
  | 'agent'
  | 'decision'
  | 'summary'

export interface StreamEvent {
  event: StreamEventType
  data: Record<string, unknown>
  mission_id: string
}

/** Derived UI types */
export interface AgentStatus {
  id: string
  name: string
  icon: string
  color: string
  status: 'idle' | 'active' | 'completed' | 'error'
  confidence: number
  latency?: number
  report?: string
  /** The agent's complete structured report (rendered in full, never summarised). */
  report_full?: Record<string, unknown>
  /** Agent's natural-language reasoning chain (if available). */
  reasoning?: string
}

export interface ZoneRisk {
  id: string
  risk: number
  victims: number
  x: number
  y: number
}

export interface TimelineEvent {
  time: string
  agent: string
  color: string
  message: string
  stage?: string
}

export interface KnowledgeDocument {
  id: number
  title: string
  relevance: number
  snippet: string
}

export interface HumanDecision {
  id: string
  request_type: 'confirm' | 'verify' | 'approve'
  summary: string
  related_agent?: string | null
  related_task_id?: string | null
  status: 'pending' | 'confirmed' | 'overridden' | 'timeout'
  raised_at: string
  resolved_at?: string | null
  resolved_by?: string | null
  decision_notes?: string | null
}

export type MissionStage =
  | 'created'
  | 'initialized'
  | 'evidence_ingested'
  | 'risk_assessed'
  | 'victims_localized'
  | 'resources_allocated'
  | 'knowledge_queried'
  | 'briefing_ready'
  | 'awaiting_confirmation'
  | 'completed'
  | 'stopped'
  | 'aborted'
  | 'errored'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
