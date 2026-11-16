/**
 * INZORA TERRA — API service layer
 * Centralised HTTP access to the FastAPI backend (/api/v1).
 * Every request is abortable; errors are normalised into ApiError.
 */

/* ------------------------------------------------------------------ */
/* Types — mirror backend/api/schemas                                  */
/* ------------------------------------------------------------------ */

export interface Health {
  status: string;
  version: string;
  active_missions: number;
  uptime_seconds: number;
}

export interface MissionListItem {
  mission_id: string;
  stage: string;
  phase: string;
  is_running: boolean;
  incident_text: string;
  incident_id: string;
  environment_id: string;
  mission_name: string;
  created_at: string;
  updated_at: string;
}

export interface RescueGuidance {
  summary: string;
  entry_clearance: string;
  priority_sequence: unknown[];
  objectives: unknown[];
  extraction_guidance: unknown[];
  safety_constraints: string[];
  triage_notes: string[];
  comms_guidance: string;
}

export interface MissionBriefing {
  incident_id: string;
  overall_risk: string;
  priority_zones: string[];
  total_victims_estimated: number;
  immediate_actions: string[];
  resource_status: string;
  next_update_in: string;
  overall_confidence: number;
  rescue_guidance: RescueGuidance;
}

export interface MissionSummaryResp {
  mission_id: string;
  stage: string;
  generated_at: string;
  needs_human_review: boolean;
  mission_briefing: MissionBriefing | Record<string, never>;
  confidence_scores: Record<string, number>;
  handoffs: Array<{ agent: string; cycle_id: string; next_handoff: Record<string, unknown> }>;
}

export interface MissionReportData {
  mission: Partial<MissionListItem> & { mission_id: string };
  generated_at: string;
  needs_human_review: boolean;
  mission_briefing: MissionBriefing | Record<string, unknown>;
  risk_report: Record<string, unknown>;
  victim_map: Record<string, unknown>;
  resource_allocation: Record<string, unknown>;
  knowledge_results: Record<string, unknown>;
  rescue_guidance: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  agent_outputs: Array<Record<string, unknown>>;
  confidence_scores: Record<string, number>;
  human_decisions: Array<Record<string, unknown>>;
  handoffs: Array<Record<string, unknown>>;
  timeline: TimelineEvent[];
  telemetry_count: number;
  telemetry: TelemetryPacket[];
  environment: EnvironmentSnapshot;
}

export interface TimelineEvent {
  ts: string;
  type: string;
  agent: string | null;
  message: string;
  mission_id: string;
  trace_id: string;
  data?: Record<string, unknown> | null;
}

export interface TelemetryPacket {
  packet_id: string;
  mission_id: string;
  ts: string;
  zone: string;
  sensor_type: string;
  metric: string;
  value: number;
  unit: string;
  confidence: number;
  source: string;
}

export interface EnvironmentSnapshot {
  sensors: Record<string, unknown>;
  weather: Record<string, number | string>;
  seismic: Record<string, unknown>;
  change_detection: Record<string, unknown>;
  building: Record<string, unknown>;
}

export interface TelemetryResp {
  mission_id: string;
  count: number;
  environment: EnvironmentSnapshot;
  telemetry: TelemetryPacket[];
}

export interface Decision {
  id: string;
  request_type: string;
  summary: string;
  related_agent: string | null;
  related_task_id: string | null;
  status: string;
  raised_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  decision_notes?: string | null;
}

/* ------------------------------------------------------------------ */
/* Error handling                                                      */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseError(resp: Response): Promise<ApiError> {
  let detail = `Request failed (HTTP ${resp.status})`;
  let code = '';
  try {
    const body = (await resp.json()) as { detail?: unknown; code?: unknown };
    if (typeof body.detail === 'string' && body.detail) detail = body.detail;
    else if (body.detail && typeof body.detail === 'object') {
      // FastAPI validation errors: [{loc, msg, ...}]
      const arr = body.detail as Array<{ msg?: string }>;
      if (Array.isArray(arr) && arr.length > 0 && arr[0].msg) detail = arr[0].msg;
    }
    if (typeof body.code === 'string') code = body.code;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(detail, resp.status, code);
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('Backend unreachable — verify the FastAPI server is running', 0, 'network');
  }
  if (!resp.ok) throw await parseError(resp);
  return (await resp.json()) as T;
}

export async function postJSON<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: 'POST',
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('Backend unreachable — verify the FastAPI server is running', 0, 'network');
  }
  if (!resp.ok) throw await parseError(resp);
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Endpoint wrappers                                                   */
/* ------------------------------------------------------------------ */

const enc = encodeURIComponent;
/* API origin: same-origin relative by default; override at build time with VITE_API_BASE
   (e.g. VITE_API_BASE=https://api.example.com) for split deployments. */
const base = (import.meta.env.VITE_API_BASE ?? '/api/v1').replace(/\/+$/, '');
/** Same-origin API base — also used by D.E.X.T.E.R.'s SSE EventSource. */
export const API_BASE = base;

export const api = {
  health: (signal?: AbortSignal) => getJSON<Health>(`${base}/health`, signal),

  listMissions: (signal?: AbortSignal) =>
    getJSON<{ missions: MissionListItem[]; count: number }>(`${base}/missions`, signal).then(
      (r) => r.missions || []
    ),

  getMission: (id: string, signal?: AbortSignal) =>
    getJSON<MissionListItem>(`${base}/missions/${enc(id)}`, signal),

  createMission: (payload: {
    incident_text: string;
    mission_name?: string;
    environment_id?: string;
  }) => postJSON<MissionListItem>(`${base}/missions`, payload),

  startMission: (id: string) => postJSON<MissionListItem>(`${base}/missions/${enc(id)}/start`),

  stopMission: (id: string) => postJSON<MissionListItem>(`${base}/missions/${enc(id)}/stop`),

  summary: (id: string, signal?: AbortSignal) =>
    getJSON<MissionSummaryResp>(`${base}/missions/${enc(id)}/summary`, signal),

  report: (id: string, signal?: AbortSignal) =>
    getJSON<MissionReportData>(`${base}/missions/${enc(id)}/report`, signal),

  timeline: (id: string, signal?: AbortSignal) =>
    getJSON<TimelineEvent[]>(`${base}/missions/${enc(id)}/timeline`, signal),

  telemetry: (id: string, signal?: AbortSignal) =>
    getJSON<TelemetryResp>(`${base}/missions/${enc(id)}/telemetry`, signal),

  decisions: (id: string, signal?: AbortSignal) =>
    getJSON<Decision[]>(`${base}/missions/${enc(id)}/decisions`, signal),

  resolveDecision: (id: string, decisionId: string, action: 'approve' | 'override', notes?: string) =>
    postJSON<Decision>(`${base}/missions/${enc(id)}/decisions/${enc(decisionId)}/resolve`, {
      action,
      ...(notes ? { notes } : {}),
    }),

  assistantChat: (id: string, query: string, conversationId?: string) =>
    postJSON<{
      mission_id: string;
      conversation_id: string;
      answer: string;
      provider: string;
      sources: string[];
      timestamp: string;
    }>(
      `${base}/missions/${enc(id)}/assistant/chat`,
      { query, ...(conversationId ? { conversation_id: conversationId } : {}) },
    ),
};

/* ------------------------------------------------------------------ */
/* Domain constants (real backend values)                              */
/* ------------------------------------------------------------------ */

export const SCENARIOS = [
  { id: 'scenario_collapse_rain', label: 'Structural Collapse — Rain' },
  { id: 'scenario_stable_monitoring', label: 'Stable Monitoring' },
  { id: 'scenario_gas_leak', label: 'Gas Leak' },
] as const;

export function scenarioLabel(id: string): string {
  return SCENARIOS.find((s) => s.id === id)?.label ?? (id ? id : 'Unassigned scenario');
}

/* Real geographical reference anchors, mirrored from backend/geography.py
   (TamilNaduScenarios). Coordinates are WGS-84 reference points — Ooty,
   Chennai, Thanjavur and Nagapattinam — not simulated values. Each anchor
   carries the hazard class of its scenario for map symbolisation. */
export interface RegionAnchor {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  terrain: string;
  /** Hazard class of the scenario, used for map symbolisation. */
  hazardType: string;
  /** Clean map symbol (emoji) representing the hazard class. */
  hazardSymbol: string;
}

export const REGION_ANCHORS: RegionAnchor[] = [
  {
    id: 'nilgiris-landslide',
    name: 'Nilgiris Landslide',
    district: 'Nilgiris',
    lat: 11.3468,
    lon: 76.6432,
    terrain: 'mountain',
    hazardType: 'Landslide',
    hazardSymbol: '⛰️',
  },
  {
    id: 'chennai-urban-flood',
    name: 'Chennai Urban Flood',
    district: 'Chennai',
    lat: 13.0827,
    lon: 80.2707,
    terrain: 'urban',
    hazardType: 'Urban flood',
    hazardSymbol: '🌧️',
  },
  {
    id: 'cauvery-delta-flood',
    name: 'Cauvery Delta Flood',
    district: 'Thanjavur',
    lat: 11.1424,
    lon: 79.5192,
    terrain: 'floodplain',
    hazardType: 'River flood',
    hazardSymbol: '🌊',
  },
  {
    id: 'nagapattinam-coastal-flood',
    name: 'Nagapattinam Coastal Flood',
    district: 'Nagapattinam',
    lat: 10.7792,
    lon: 79.8376,
    terrain: 'coastal',
    hazardType: 'Coastal flood',
    hazardSymbol: '🌀',
  },
];

/** Match a mission environment_id to a real geographical anchor (case-insensitive). */
export function anchorForEnvironment(envId: string): RegionAnchor | null {
  const e = envId.trim().toLowerCase();
  if (!e) return null;
  return (
    REGION_ANCHORS.find(
      (a) => a.name.toLowerCase() === e || a.id === e || a.district.toLowerCase() === e
    ) ?? null
  );
}

export const AGENT_DEFS = [
  {
    key: 'risk_assessment',
    label: 'Risk Assessment Agent',
    short: 'Risk',
    icon: 'alert',
    responsibility: 'Evaluates structural risk and classifies the overall hazard level.',
  },
  {
    key: 'victim_localization',
    label: 'Victim Localization Agent',
    short: 'Victims',
    icon: 'search',
    responsibility: 'Locates victims by zone probability using sensor and witness evidence.',
  },
  {
    key: 'resource_coordination',
    label: 'Resource Coordination Agent',
    short: 'Resources',
    icon: 'resource',
    responsibility: 'Allocates rescue teams and equipment across priority zones.',
  },
  {
    key: 'knowledge_retrieval',
    label: 'Knowledge Retrieval Agent',
    short: 'Knowledge',
    icon: 'list',
    responsibility: 'Queries SOPs and building codes for response guidance.',
  },
  {
    key: 'rescue_coordination',
    label: 'Rescue Coordination Agent',
    short: 'Rescue',
    icon: 'shield',
    responsibility: 'Synthesises specialist reports into field-ready rescue guidance.',
  },
] as const;
