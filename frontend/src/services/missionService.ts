/**
 * Mission Service - High-level API for mission operations.
 *
 * Architectural decision: Provides typed methods for each mission endpoint.
 * Keeps API concerns separate from UI logic.
 */

import { get, post } from './apiClient'
import type {
  HealthResponse,
  VersionResponse,
  MissionResponse,
  MissionListResponse,
  MissionSummaryResponse,
  TelemetryResponse,
  ReplayResponse,
  MissionCreateRequest,
  HumanDecision,
} from '@/types/api'

/** Health check */
export function getHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health')
}

/** Version info */
export function getVersion(): Promise<VersionResponse> {
  return get<VersionResponse>('/version')
}

/** Create a new mission */
export function createMission(request: MissionCreateRequest): Promise<MissionResponse> {
  return post<MissionResponse>('/missions', request)
}

/** List all missions */
export function listMissions(): Promise<MissionListResponse> {
  return get<MissionListResponse>('/missions')
}

/** Get a specific mission */
export function getMission(missionId: string): Promise<MissionResponse> {
  return get<MissionResponse>(`/missions/${missionId}`)
}

/** Start a mission */
export function startMission(missionId: string): Promise<MissionResponse> {
  return post<MissionResponse>(`/missions/${missionId}/start`)
}

/** Stop a mission */
export function stopMission(missionId: string): Promise<MissionResponse> {
  return post<MissionResponse>(`/missions/${missionId}/stop`)
}

/** Get mission summary */
export function getMissionSummary(missionId: string): Promise<MissionSummaryResponse> {
  return get<MissionSummaryResponse>(`/missions/${missionId}/summary`)
}

/** Get mission telemetry */
export function getTelemetry(missionId: string): Promise<TelemetryResponse> {
  return get<TelemetryResponse>(`/missions/${missionId}/telemetry`)
}

/** Get mission timeline */
export function getTimeline(missionId: string): Promise<Array<Record<string, unknown>>> {
  return get<Array<Record<string, unknown>>>(`/missions/${missionId}/timeline`)
}

/** Get mission replay */
export function getReplay(missionId: string): Promise<ReplayResponse> {
  return get<ReplayResponse>(`/missions/${missionId}/replay`)
}

/** List decisions awaiting human resolution */
export function fetchDecisions(missionId: string): Promise<HumanDecision[]> {
  return get<HumanDecision[]>(`/missions/${missionId}/decisions`)
}

/** Resolve a pending human decision (approve or override) */
export function resolveDecision(
  missionId: string,
  decisionId: string,
  action: 'approve' | 'override',
  notes?: string
): Promise<HumanDecision> {
  return post<HumanDecision>(`/missions/${missionId}/decisions/${decisionId}/resolve`, {
    action,
    notes,
  })
}

/** Send assistant chat message (501 stub) */
export function sendAssistantMessage(
  missionId: string,
  query: string
): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>(`/missions/${missionId}/assistant/chat`, { query })
}

export default {
  getHealth,
  getVersion,
  createMission,
  listMissions,
  getMission,
  startMission,
  stopMission,
  getMissionSummary,
  getTelemetry,
  getTimeline,
  getReplay,
  sendAssistantMessage,
}
