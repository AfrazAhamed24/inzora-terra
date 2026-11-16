/**
 * PAGE 4 — AI AGENTS
 * The five specialist agents. Status/confidence come from the real mission
 * summary (confidence_scores) and timeline events — never fabricated.
 */

import { useState } from 'react';
import { api, AGENT_DEFS, type MissionListItem, type MissionSummaryResp, type TimelineEvent } from '../api';
import { useAsyncData } from '../hooks';
import {
  Badge,
  ConfidenceBar,
  EmptyCompact,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  MissionSelect,
  Panel,
  RefreshButton,
  formatDateTime,
} from '../ui';

interface AgentsData {
  missions: MissionListItem[];
  summary: MissionSummaryResp | null;
  timeline: TimelineEvent[];
}

type AgentStatus = 'ok' | 'standby';

export function AgentsPage() {
  const [selectedId, setSelectedId] = useState<string>('');
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const { data, error, loading, refresh, loadedKey } = useAsyncData<AgentsData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const latest = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
    let summary: MissionSummaryResp | null = null;
    let timeline: TimelineEvent[] = [];
    if (latest) {
      try {
        summary = await api.summary(latest, signal);
      } catch {
        summary = null;
      }
      try {
        timeline = await api.timeline(latest, signal);
      } catch {
        timeline = [];
      }
    }
    return { missions, summary, timeline };
  }, [selectedId]);

  const missions = data?.missions ?? [];
  const currentId = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');

  const rows = AGENT_DEFS.map((agent) => {
    const score = data?.summary?.confidence_scores?.[agent.key];
    const events = (data?.timeline ?? []).filter((e) => e.agent === agent.key);
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const status: AgentStatus = score !== undefined || lastEvent ? 'ok' : 'standby';
    return {
      ...agent,
      confidence: typeof score === 'number' ? score : null,
      events,
      lastEvent,
      status,
    };
  });

  const selected = rows.find((r) => r.key === openAgent) ?? null;

  const expectedKey = JSON.stringify([currentId]);
  const stale = loading && loadedKey !== null && loadedKey !== expectedKey;
  if (loading && (!data || stale)) return <LoadingBlock label="Loading agents…" />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <MissionSelect missions={missions} value={currentId} onChange={setSelectedId} />
        </div>
        <div className="toolbar-right">
          <RefreshButton onClick={refresh} />
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={refresh} />}

      {missions.length === 0 ? (
        <Panel title="AI Agents">
          <EmptyState
            icon="agent"
            title="All agents on STANDBY — no mission active"
            hint="Agents execute when a registered emergency mission runs"
          />
        </Panel>
      ) : (
        <Panel title="Agent Status" tag={currentId ? `Mission ${currentId}` : undefined}>
          <div className="agent-grid agent-grid-page">
            {rows.map((agent) => (
              <button
                type="button"
                key={agent.key}
                className={`agent-card agent-card-btn${openAgent === agent.key ? ' agent-card-open' : ''}`}
                onClick={() => setOpenAgent(openAgent === agent.key ? null : agent.key)}
              >
                <div className="agent-card-top">
                  <span className="agent-name">{agent.label}</span>
                  <span className={`agent-status agent-${agent.status}`}>{agent.status}</span>
                </div>
                <p className="agent-duty">{agent.responsibility}</p>
                <div className="agent-card-bottom">
                  <ConfidenceBar value={agent.confidence} />
                  <span className="agent-metric agent-time">
                    {agent.lastEvent ? formatDateTime(agent.lastEvent.ts) : 'No execution'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {selected && missions.length > 0 && (
        <Panel title={`Agent Detail — ${selected.label}`} count={selected.events.length}>
          <div className="detail-body">
            <div className="detail-grid">
              <div className="detail-card">
                <span className="detail-label">Responsibility</span>
                <span className="detail-value">{selected.responsibility}</span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Execution status</span>
                <span className="detail-value">
                  <Badge tone={selected.status === 'ok' ? 'green' : 'muted'}>{selected.status}</Badge>
                </span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Confidence score</span>
                <span className="detail-value">
                  {selected.confidence === null ? (
                    <span className="cell-muted">Not recorded for this mission</span>
                  ) : (
                    `${Math.round(selected.confidence * 100)}%`
                  )}
                </span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Last execution</span>
                <span className="detail-value detail-mono">
                  {selected.lastEvent ? formatDateTime(selected.lastEvent.ts) : '—'}
                </span>
              </div>
            </div>

            <div className="detail-section">
              <span className="detail-label">Execution events</span>
              {selected.events.length === 0 ? (
                <EmptyCompact>
                  <span>No execution events recorded for this agent on the selected mission</span>
                </EmptyCompact>
              ) : (
                selected.events
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((ev, i) => (
                    <div className="activity-row" key={`${ev.ts}-${i}`}>
                      <span className="activity-time">{formatDateTime(ev.ts)}</span>
                      <span className="activity-dot" />
                      <span className="activity-message">{ev.message || ev.type}</span>
                      <span className="activity-agent">{ev.type}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
