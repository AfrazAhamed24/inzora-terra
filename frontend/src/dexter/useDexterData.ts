/**
 * D.E.X.T.E.R. — data layer
 * Reuses the existing INZORA TERRA API service layer (../api) exclusively:
 *   GET /health · GET /missions · GET /missions/{id}/summary
 *   GET /missions/{id}/timeline · GET /missions/{id}/stream (SSE)
 * No duplicate mission engine, no fabricated telemetry, no invented agent data.
 * Agent rows are derived exactly like pages/command.tsx derives them —
 * confidence comes from summary.confidence_scores, activity from timeline events.
 */

import { useEffect, useRef, useState } from 'react';
import {
  api,
  AGENT_DEFS,
  API_BASE,
  type Decision,
  type Health,
  type MissionListItem,
  type MissionSummaryResp,
  type TimelineEvent,
} from '../api';

/* ------------------------------------------------------------------ */
/* Declared orchestration contract (mirrors backend/orchestration/graph.py —
   the real MISSION_GRAPH NodeSpec reads/writes; static contract knowledge,
   not runtime data). Used to show each agent's Inputs / Outputs.        */
/* ------------------------------------------------------------------ */

export interface DexterAgentContract {
  reads: string[];
  writes: string[];
}

export const DEXTER_AGENT_CONTRACTS: Record<string, DexterAgentContract> = {
  risk_assessment: {
    reads: ['telemetry', 'environment', 'evidence'],
    writes: ['risk_report', 'confidence_scores', 'tasks', 'human_decisions', 'agent_outputs', 'timeline'],
  },
  victim_localization: {
    reads: ['risk_report', 'telemetry', 'environment', 'evidence'],
    writes: ['victim_map', 'confidence_scores', 'tasks', 'human_decisions'],
  },
  resource_coordination: {
    reads: ['victim_map', 'risk_report', 'tasks'],
    writes: ['resource_allocation', 'tasks'],
  },
  knowledge_retrieval: {
    reads: ['resource_allocation', 'risk_report', 'victim_map', 'environment'],
    writes: ['knowledge_results', 'confidence_scores'],
  },
  rescue_coordination: {
    reads: ['risk_report', 'victim_map', 'resource_allocation', 'knowledge_results'],
    writes: ['rescue_guidance', 'confidence_scores', 'tasks'],
  },
};

/* ------------------------------------------------------------------ */
/* Snapshot (REST)                                                      */
/* ------------------------------------------------------------------ */

export type DexterConnection = 'connecting' | 'online' | 'offline';

export interface DexterAgentRow {
  key: string;
  label: string;
  short: string;
  icon: string;
  responsibility: string;
  status: 'active' | 'standby';
  confidence: number | null;
  executions: number;
  lastEvent: TimelineEvent | null;
  lastMessage: string | null;
  lastTs: string | null;
  /** attempts recorded on the last agent_complete event (real executor data) */
  attempts: number | null;
  /** handoff targets observed in the timeline (real next_handoff declarations) */
  handoffTargets: string[];
}

export interface DexterData {
  health: Health;
  missions: MissionListItem[];
  summary: MissionSummaryResp | null;
  timeline: TimelineEvent[];
  latestMission: MissionListItem | null;
  agents: DexterAgentRow[];
}

function buildAgentRows(
  summary: MissionSummaryResp | null,
  timeline: TimelineEvent[]
): DexterAgentRow[] {
  return AGENT_DEFS.map((def) => {
    const score = summary?.confidence_scores?.[def.key];
    const events = timeline.filter((e) => e.agent === def.key);
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const handoffTargets = events
      .filter((e) => e.type === 'handoff' && e.data && typeof e.data === 'object')
      .map((e) => {
        const to = (e.data as Record<string, unknown>).to;
        return typeof to === 'string' ? to : null;
      })
      .filter((t): t is string => t !== null);
    const attempts =
      lastEvent && lastEvent.data && typeof lastEvent.data === 'object'
        ? typeof (lastEvent.data as Record<string, unknown>).attempts === 'number'
          ? ((lastEvent.data as Record<string, unknown>).attempts as number)
          : null
        : null;
    return {
      key: def.key,
      label: def.label,
      short: def.short,
      icon: def.icon,
      responsibility: def.responsibility,
      status: score !== undefined || lastEvent ? 'active' : 'standby',
      confidence: typeof score === 'number' ? score : null,
      executions: events.length,
      lastEvent: lastEvent ?? null,
      lastMessage: lastEvent ? lastEvent.message || lastEvent.type : null,
      lastTs: lastEvent ? lastEvent.ts : null,
      attempts,
      handoffTargets,
    };
  });
}

export function fetchDexterData(signal: AbortSignal): Promise<DexterData> {
  return (async () => {
    const health = await api.health(signal);
    const missions = await api.listMissions(signal);
    let summary: MissionSummaryResp | null = null;
    let timeline: TimelineEvent[] = [];
    const latestMission = missions.length > 0 ? missions[missions.length - 1] : null;

    if (latestMission) {
      try {
        summary = await api.summary(latestMission.mission_id, signal);
      } catch {
        summary = null;
      }
      try {
        timeline = await api.timeline(latestMission.mission_id, signal);
      } catch {
        timeline = [];
      }
    }

    return {
      health,
      missions,
      summary,
      timeline,
      latestMission,
      agents: buildAgentRows(summary, timeline),
    };
  })();
}

/* ------------------------------------------------------------------ */
/* Live SSE stream (GET /missions/{id}/stream)                          */
/* Emits typed frames: connected | status | telemetry | timeline |      */
/* agent | decision | summary. The `agent` frames carry the backend's   */
/* narrated report + reasoning for each completed agent execution.      */
/* ------------------------------------------------------------------ */

export interface DexterAgentFrame {
  status: string;
  confidence: number | null;
  reasoning: string | null;
  report: string | null;
  cycleId: string | null;
  ts: string | null;
}

export interface DexterStreamState {
  connected: boolean;
  /** true once the EventSource errored out repeatedly (backend unreachable). */
  degraded: boolean;
  /** latest live agent frame per agent slug — empty when nothing streamed yet. */
  agents: Record<string, DexterAgentFrame>;
  decisions: Decision[];
}

const EMPTY_STREAM: DexterStreamState = { connected: false, degraded: false, agents: {}, decisions: [] };

export function useDexterStream(
  missionId: string | null,
  enabled: boolean
): DexterStreamState {
  const [state, setState] = useState<DexterStreamState>(EMPTY_STREAM);
  const [missionKey, setMissionKey] = useState(missionId);

  useEffect(() => {
    if (!enabled || !missionId) {
      setState(EMPTY_STREAM);
      setMissionKey(null);
      return;
    }
    setMissionKey(missionId);
    setState(EMPTY_STREAM);

    let errors = 0;
    let alive = true;
    let source: EventSource | null = null;

    const open = () => {
      source = new EventSource(`${API_BASE}/missions/${encodeURIComponent(missionId)}/stream`);
      source.onopen = () => {
        if (alive) errors = 0;
      };
      source.onmessage = (event) => {
        if (!alive) return;
        try {
          const frame = JSON.parse(event.data) as Record<string, unknown>;
          const type = frame.type;
          if (type === 'connected') {
            setState((s) => ({ ...s, connected: true, degraded: false }));
          } else if (type === 'agent') {
            const agent = typeof frame.agent === 'string' ? frame.agent : null;
            if (!agent) return;
            const confidence =
              typeof frame.confidence === 'number' ? (frame.confidence as number) : null;
            setState((s) => ({
              ...s,
              connected: true,
              agents: {
                ...s.agents,
                [agent]: {
                  status: typeof frame.status === 'string' ? (frame.status as string) : 'unknown',
                  confidence,
                  reasoning: typeof frame.reasoning === 'string' ? (frame.reasoning as string) : null,
                  report: typeof frame.report === 'string' ? (frame.report as string) : null,
                  cycleId: typeof frame.cycle_id === 'string' ? (frame.cycle_id as string) : null,
                  ts:
                    typeof frame.timestamp === 'string'
                      ? (frame.timestamp as string)
                      : new Date().toISOString(),
                },
              },
            }));
          } else if (type === 'decision' && frame.decision && typeof frame.decision === 'object') {
            const decision = frame.decision as unknown as Decision;
            setState((s) => ({
              ...s,
              decisions: s.decisions.some((d) => d.id === decision.id)
                ? s.decisions
                : [...s.decisions, decision],
            }));
          } else if (type === 'status' && frame.terminal === true) {
            source?.close();
          }
        } catch {
          /* non-JSON frame — ignore */
        }
      };
      source.onerror = () => {
        errors += 1;
        if (errors >= 3 && alive) {
          alive = false;
          source?.close();
          setState((s) => ({ ...s, connected: false, degraded: true }));
        }
      };
    };

    open();
    return () => {
      alive = false;
      source?.close();
    };
  }, [enabled, missionId]);

  return state;
}

/* ------------------------------------------------------------------ */
/* Gentle polling while the mission loop is running                     */
/* ------------------------------------------------------------------ */

export function useDexterPoll(refresh: () => void, intervalMs: number, enabled: boolean): void {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
}
