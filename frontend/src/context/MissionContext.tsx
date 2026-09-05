/**
 * Mission Context - Centralized state for mission data.
 *
 * Architectural decision: Uses React Context + useReducer for state management.
 * No external library needed - keeps bundle small and logic transparent.
 * All mission data flows through this context to ensure single source of truth.
 */

import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type {
  MissionResponse,
  TelemetryResponse,
  TelemetryPacket,
  MissionSummaryResponse,
  ReplayResponse,
  ConnectionStatus,
  AgentStatus,
  TimelineEvent,
  KnowledgeDocument,
  HumanDecision,
  MissionStage,
} from '@/types/api'

/** Mission state shape */
export interface MissionState {
  /** Current mission */
  mission: MissionResponse | null
  /** Mission list */
  missions: MissionResponse[]
  /** Telemetry data */
  telemetry: TelemetryResponse | null
  /** Latest packet per (zone | sensor_type) — feeds the live tactical dashboard. */
  telemetryLive: Record<string, TelemetryPacket>
  /** Mission summary */
  summary: MissionSummaryResponse | null
  /** Replay data */
  replay: ReplayResponse | null
  /** Timeline events (derived from telemetry) */
  timeline: TimelineEvent[]
  /** Agent statuses (derived from telemetry) */
  agents: AgentStatus[]
  /** Knowledge documents (derived from summary) */
  knowledge: KnowledgeDocument[]
  /** Human-in-the-loop decisions (from SSE stream) */
  decisions: HumanDecision[]
  /** Connection status for SSE */
  connectionStatus: ConnectionStatus
  /** Loading states */
  loading: {
    mission: boolean
    missions: boolean
    telemetry: boolean
    summary: boolean
    replay: boolean
    timeline: boolean
    start: boolean
    stop: boolean
  }
  /** Error states */
  errors: {
    mission: string | null
    missions: string | null
    telemetry: string | null
    summary: string | null
    replay: string | null
    start: string | null
    stop: string | null
  }
}

/** Action types */
type MissionAction =
  | { type: 'SET_MISSION'; payload: MissionResponse | null }
  | { type: 'SET_MISSIONS'; payload: MissionResponse[] }
  | { type: 'SET_TELEMETRY'; payload: TelemetryResponse | null }
  | { type: 'SET_SUMMARY'; payload: MissionSummaryResponse | null }
  | { type: 'SET_REPLAY'; payload: ReplayResponse | null }
  | { type: 'SET_TIMELINE'; payload: TimelineEvent[] }
  | { type: 'SET_AGENTS'; payload: AgentStatus[] }
  | { type: 'SET_KNOWLEDGE'; payload: KnowledgeDocument[] }
  | { type: 'SET_DECISIONS'; payload: HumanDecision[] }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_LOADING'; payload: { key: keyof MissionState['loading']; value: boolean } }
  | { type: 'SET_ERROR'; payload: { key: keyof MissionState['errors']; value: string | null } }
  | { type: 'RESET' }

/** Canonical forward lifecycle order (mirrors backend/core/lifecycle.py). */
const STAGE_ORDER = [
  'created',
  'initialized',
  'evidence_ingested',
  'risk_assessed',
  'victims_localized',
  'resources_allocated',
  'knowledge_queried',
  'briefing_ready',
  'awaiting_confirmation',
  'completed',
  'aborted',
  'errored',
]

/** Stable identity of a timeline row — used to collapse repeated re-run cycles. */
function timelineKey(entry: TimelineEvent): string {
  return `${entry.agent}|${entry.message}|${entry.stage || ''}`
}

/** True for re-run rollback noise: a stage_change that moves BACKWARD (briefing_ready -> risk_assessed). */
function isRollbackStageChange(entry: TimelineEvent): boolean {
  if (entry.stage !== 'stage_change') return false
  const m = /^\s*(\w+)\s*->\s*(\w+)\s*$/.exec(entry.message)
  if (!m) return false
  const from = STAGE_ORDER.indexOf(m[1])
  const to = STAGE_ORDER.indexOf(m[2])
  if (from < 0 || to < 0) return false
  return to < from
}

/** Initial state */
const initialState: MissionState = {
  mission: null,
  missions: [],
  telemetry: null,
  telemetryLive: {},
  summary: null,
  replay: null,
  timeline: [],
  agents: [],
  knowledge: [],
  decisions: [],
  connectionStatus: 'disconnected',
  loading: {
    mission: false,
    missions: false,
    telemetry: false,
    summary: false,
    replay: false,
    timeline: false,
    start: false,
    stop: false,
  },
  errors: {
    mission: null,
    missions: null,
    telemetry: null,
    summary: null,
    replay: null,
    start: null,
    stop: null,
  },
}

/** Reducer */
function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'SET_MISSION':
      return { ...state, mission: action.payload }
    case 'SET_MISSIONS':
      return { ...state, missions: action.payload }
    case 'SET_TELEMETRY': {
      // Streamed packets arrive one at a time; merge them into a live per-zone sensor map
      // so the dashboard shows the latest value for every (zone, sensor_type).
      const packet = action.payload as unknown as TelemetryPacket | null
      if (packet && packet.zone && packet.sensor_type && typeof packet.value === 'number') {
        return {
          ...state,
          telemetry: action.payload,
          telemetryLive: {
            ...state.telemetryLive,
            [`${packet.zone}|${packet.sensor_type}`]: packet,
          },
        }
      }
      return { ...state, telemetry: action.payload }
    }
    case 'SET_SUMMARY':
      return { ...state, summary: action.payload }
    case 'SET_REPLAY':
      return { ...state, replay: action.payload }
    case 'SET_AGENTS': {
      // Upsert: streamed agent events arrive one at a time; never clobber the roster
      const merged = [...state.agents]
      for (const agent of action.payload) {
        const idx = merged.findIndex((a) => a.id === agent.id)
        if (idx >= 0) merged[idx] = agent
        else merged.push(agent)
      }
      return { ...state, agents: merged }
    }
    case 'SET_TIMELINE': {
      // Append: streamed timeline entries arrive one at a time. The mission loop re-runs
      // the agent chain every tick (that's how reports escalate), re-emitting the same
      // agent/handoff/stage events each cycle. Collapse that into ONE clean forward story:
      // drop rollback stage-changes and any (agent, message, stage) row that has already
      // appeared (each cycle repeats the same rows).
      const seen = new Set(state.timeline.map((e) => timelineKey(e)))
      const merged = [...state.timeline]
      for (const entry of action.payload) {
        if (isRollbackStageChange(entry)) continue
        const key = timelineKey(entry)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(entry)
      }
      return { ...state, timeline: merged }
    }
    case 'SET_KNOWLEDGE':
      return { ...state, knowledge: action.payload }
    case 'SET_DECISIONS': {
      // Upsert: decision events stream in one at a time
      const merged = [...state.decisions]
      for (const dec of action.payload) {
        const idx = merged.findIndex((d) => d.id === dec.id)
        if (idx >= 0) merged[idx] = dec
        else merged.push(dec)
      }
      return { ...state, decisions: merged }
    }
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload }
    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.value },
      }
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.key]: action.payload.value },
      }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

/** Context value */
interface MissionContextValue {
  state: MissionState
  dispatch: React.Dispatch<MissionAction>
}

/** Create context */
const MissionContext = createContext<MissionContextValue | null>(null)

/** Provider props */
interface MissionProviderProps {
  children: ReactNode
}

/** Provider component */
export function MissionProvider({ children }: MissionProviderProps) {
  const [state, dispatch] = useReducer(missionReducer, initialState)

  return (
    <MissionContext.Provider value={{ state, dispatch }}>
      {children}
    </MissionContext.Provider>
  )
}

/** Hook to use mission context */
export function useMissionContext(): MissionContextValue {
  const context = useContext(MissionContext)
  if (!context) {
    throw new Error('useMissionContext must be used within a MissionProvider')
  }
  return context
}

/** Derived state selectors */
export function useMissionStage(): MissionStage {
  const { state } = useMissionContext()
  return (state.mission?.stage as MissionStage) || 'initialized'
}

export function useMissionId(): string | null {
  const { state } = useMissionContext()
  return state.mission?.mission_id || null
}

export function useIsRunning(): boolean {
  const { state } = useMissionContext()
  return state.mission?.is_running || false
}

export function useRiskLevel(): string {
  const { state } = useMissionContext()
  if (!state.agents.length) return 'LOW'
  const maxRisk = Math.max(...state.agents.map((a) => 1 - a.confidence))
  if (maxRisk >= 0.8) return 'CRITICAL'
  if (maxRisk >= 0.6) return 'HIGH'
  if (maxRisk >= 0.4) return 'MEDIUM'
  return 'LOW'
}

export function useEnvironment() {
  const { state } = useMissionContext()
  return state.telemetry?.environment || {}
}
