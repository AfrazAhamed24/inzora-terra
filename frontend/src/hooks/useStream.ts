/**
 * useStream - Hook for SSE streaming and real-time updates.
 *
 * Maps the backend's typed SSE payloads (type embedded in JSON) into mission
 * context state: status/stage, agent outputs, timeline entries, summary,
 * telemetry packets. Handles reconnection and cleanup.
 */

import { useEffect, useCallback, useRef } from 'react'
import { useMissionContext } from '@/context/MissionContext'
import { createStreamConnection } from '@/services/streamService'
import type { StreamEvent, AgentStatus, TimelineEvent, KnowledgeDocument, HumanDecision } from '@/types/api'

/** Agent color mapping */
const AGENT_COLORS: Record<string, string> = {
  risk: '#ef4444',
  victim: '#f59e0b',
  resource: '#22c55e',
  knowledge: '#8b5cf6',
  rescue: '#06b6d4',
  orchestrator: '#3b82f6',
}

/** Agent icon mapping */
const AGENT_ICONS: Record<string, string> = {
  risk: 'Shield',
  victim: 'MapPin',
  resource: 'Users',
  knowledge: 'BookOpen',
  rescue: 'HeartPulse',
  orchestrator: 'Brain',
}

/** Map backend agent names to the canonical UI ids */
const AGENT_ID_BY_NAME: Record<string, string> = {
  risk_assessment: 'risk',
  victim_localization: 'victim',
  resource_coordination: 'resource',
  knowledge_retrieval: 'knowledge',
  rescue_coordination: 'rescue',
  briefing_generator: 'orchestrator',
}

const AGENT_NAME_BY_ID: Record<string, string> = {
  risk: 'Risk Assessment',
  victim: 'Victim Localization',
  resource: 'Resource Coordination',
  knowledge: 'Knowledge Retrieval',
  rescue: 'Rescue Coordination',
  orchestrator: 'Orchestrator',
}

function agentIdFromName(name: string): string {
  return AGENT_ID_BY_NAME[name] || name.replace(/_/g, ' ')
}

/** Convert a streamed agent output to an AgentStatus */
function eventToAgent(event: StreamEvent): AgentStatus | null {
  if (event.event !== 'agent') return null

  const data = event.data
  const name = (data.agent as string) || 'unknown'
  const id = agentIdFromName(name)
  const rawStatus = (data.status as string) || 'ok'
  const settled = rawStatus === 'ok' || rawStatus === 'fallback' || rawStatus === 'completed'

  return {
    id,
    name: AGENT_NAME_BY_ID[id] || name,
    icon: AGENT_ICONS[id] || 'Brain',
    color: AGENT_COLORS[id] || '#6b7280',
    status: settled ? 'completed' : 'error',
    confidence: (data.confidence as number) || 0,
    latency: data.latency_ms as number | undefined,
    report: data.report as string | undefined,
    report_full: data.report_full as Record<string, unknown> | undefined,
    reasoning: (data.reasoning as string) || undefined,
  }
}

/** Build an AgentStatus update from a raw execution timeline event (start/retry/fail). */
function statusFromTimeline(
  event: StreamEvent,
  status: 'active' | 'error'
): AgentStatus | null {
  const raw = event.data.event as Record<string, unknown> | undefined
  const name = (raw?.agent as string) || ''
  if (!name) return null
  const id = agentIdFromName(name)
  return {
    id,
    name: AGENT_NAME_BY_ID[id] || name,
    icon: AGENT_ICONS[id] || 'Brain',
    color: AGENT_COLORS[id] || '#6b7280',
    status,
    confidence: 0,
  }
}

/** Convert a streamed timeline entry to the UI shape */
function eventToTimeline(event: StreamEvent): TimelineEvent | null {
  if (event.event !== 'timeline') return null

  const entry = event.data.event as Record<string, unknown> | undefined
  if (!entry) return null

  const agentName = (entry.agent as string) || 'system'
  const id = agentIdFromName(agentName)

  return {
    time: (entry.ts as string) || new Date().toISOString(),
    agent: id === agentName ? agentName : AGENT_NAME_BY_ID[id] || agentName,
    color: AGENT_COLORS[id] || '#6b7280',
    message: (entry.message as string) || '',
    stage: entry.type as string | undefined,
  }
}

/** Extract knowledge documents from a summary payload */
function extractKnowledge(
  summary: Record<string, unknown> | undefined
): KnowledgeDocument[] {
  const briefing = summary?.mission_briefing as Record<string, unknown> | undefined
  const docs = briefing?.knowledge_results as Array<Record<string, unknown>> | undefined

  if (!Array.isArray(docs)) return []

  return docs.map((doc, idx) => ({
    id: idx + 1,
    title: (doc.title as string) || 'Unknown Document',
    relevance: (doc.relevance as number) || 0,
    snippet: (doc.snippet as string) || '',
  }))
}

/** Hook for SSE streaming */
export function useStream(missionId: string | null) {
  const { dispatch } = useMissionContext()
  const cleanupRef = useRef<(() => void) | null>(null)

  /** Handle incoming stream events */
  const handleEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.event) {
        case 'status': {
          const data = event.data
          if (data.stage) {
            dispatch({
              type: 'SET_MISSION',
              payload: {
                mission_id: event.mission_id || missionId || '',
                stage: data.stage as string,
                phase: (data.phase as string) || '',
                is_running: (data.is_running as boolean) ?? false,
                incident_text: (data.incident_text as string) || '',
                incident_id: (data.incident_id as string) || '',
                environment_id: (data.environment_id as string) || '',
                mission_name: (data.mission_name as string) || '',
                created_at: (data.created_at as string) || '',
                updated_at: (data.updated_at as string) || '',
              },
            })
          }
          break
        }

        case 'agent': {
          const agent = eventToAgent(event)
          if (agent) {
            dispatch({ type: 'SET_AGENTS', payload: [agent] })
          }
          break
        }

        case 'timeline': {
          const entry = eventToTimeline(event)
          if (entry) {
            dispatch({ type: 'SET_TIMELINE', payload: [entry] })

            // Execution events drive the agent roster: activation, retry, failure.
            const raw = event.data.event as Record<string, unknown> | undefined
            const rawType = raw?.type as string
            if (rawType === 'agent_start' || rawType === 'agent_retry') {
              const active = statusFromTimeline(event, 'active')
              if (active) dispatch({ type: 'SET_AGENTS', payload: [active] })
            } else if (rawType === 'agent_failed') {
              const failed = statusFromTimeline(event, 'error')
              if (failed) dispatch({ type: 'SET_AGENTS', payload: [failed] })
            }
          }
          break
        }

        case 'summary': {
          const summary = event.data.summary as Record<string, unknown> | undefined
          if (summary) {
            dispatch({ type: 'SET_SUMMARY', payload: summary as any })

            // Extract knowledge from summary
            const knowledge = extractKnowledge(summary)
            if (knowledge.length > 0) {
              dispatch({ type: 'SET_KNOWLEDGE', payload: knowledge })
            }
          }
          break
        }

        case 'telemetry': {
          const packet = event.data.packet as Record<string, unknown> | undefined
          if (packet) {
            dispatch({ type: 'SET_TELEMETRY', payload: packet as any })
          }
          break
        }

        case 'decision': {
          const decision = event.data.decision as HumanDecision | undefined
          if (decision) {
            dispatch({ type: 'SET_DECISIONS', payload: [decision] })
          }
          break
        }

        default:
          // Ignore unknown event types
          break
      }
    },
    [dispatch, missionId]
  )

  /** Handle connection status changes */
  const handleStatus = useCallback(
    (status: 'connecting' | 'connected' | 'disconnected' | 'error') => {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status })
    },
    [dispatch]
  )

  /** Connect to stream when mission changes */
  useEffect(() => {
    if (!missionId) return

    // Cleanup previous connection
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    // Create new connection
    cleanupRef.current = createStreamConnection({
      missionId,
      onEvent: handleEvent,
      onStatus: handleStatus,
    })

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [missionId, handleEvent, handleStatus])
}

export default useStream
