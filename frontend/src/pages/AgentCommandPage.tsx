import { useState } from 'react';
import type { CSSProperties } from 'react';
import { api, AGENT_DEFS, type MissionListItem, type MissionSummaryResp, type TimelineEvent } from '../api';
import { useAsyncData } from '../hooks';
import { Badge, ErrorNote, LoadingBlock, MissionSelect, Panel, RefreshButton, formatDateTime } from '../ui';
import { AgentConstellation, type ConstellationAgent } from './AgentConstellation';

interface AgentsData {
  missions: MissionListItem[];
  summary: MissionSummaryResp | null;
  timeline: TimelineEvent[];
}

const DEMO_CONFIDENCE: Record<string, number> = {
  risk_assessment: 0.78,
  victim_localization: 0.71,
  resource_coordination: 0.66,
  knowledge_retrieval: 0.8,
  rescue_coordination: 0.88,
};

const COLORS: Record<string, string> = {
  risk_assessment: '#ff6b70',
  victim_localization: '#45c6f2',
  resource_coordination: '#f6bb55',
  knowledge_retrieval: '#9c8cff',
  rescue_coordination: '#4ed6a0',
};

export function AgentCommandPage() {
  const [selectedId, setSelectedId] = useState('');
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const { data, error, loading, refresh } = useAsyncData<AgentsData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const id = selectedId || missions[missions.length - 1]?.mission_id || '';
    let summary: MissionSummaryResp | null = null;
    let timeline: TimelineEvent[] = [];
    if (id) {
      [summary, timeline] = await Promise.all([
        api.summary(id, signal).catch(() => null),
        api.timeline(id, signal).catch(() => [] as TimelineEvent[]),
      ]);
    }
    return { missions, summary, timeline };
  }, [selectedId]);

  if (loading && !data) return <LoadingBlock label="Loading agent network…" />;

  const missions = data?.missions ?? [];
  const currentId = selectedId || missions[missions.length - 1]?.mission_id || '';
  const timeline = data?.timeline ?? [];
  const mostRecentAgent = [...timeline].reverse().find((event) => AGENT_DEFS.some((agent) => agent.key === event.agent));
  const rows = AGENT_DEFS.map((agent) => {
    const events = timeline.filter((event) => event.agent === agent.key);
    const lastEvent = events[events.length - 1] ?? null;
    const liveConfidence = data?.summary?.confidence_scores?.[agent.key];
    const confidence = typeof liveConfidence === 'number' ? liveConfidence : currentId ? null : DEMO_CONFIDENCE[agent.key];
    const state = !currentId ? 'DEMO' : mostRecentAgent?.agent === agent.key ? 'ACTIVE' : lastEvent ? 'COMPLETE' : 'READY';
    return { ...agent, confidence, events, lastEvent, state, color: COLORS[agent.key] };
  });
  const selected = rows.find((agent) => agent.key === openAgent) ?? rows[0];
  const sceneAgents: ConstellationAgent[] = rows.map(({ key, short, confidence, state, color }) => ({ key, short, confidence, state, color }));
  const recentEvents = timeline.slice(-4).reverse();

  return (
    <div className="page-stack agent-command-page">
      <div className="page-toolbar">
        <div className="toolbar-left"><MissionSelect missions={missions} value={currentId} onChange={setSelectedId} /></div>
        <div className="toolbar-right"><RefreshButton onClick={refresh} /></div>
      </div>
      {error && <ErrorNote message={error} onRetry={refresh} />}

      <section className="agent-command-deck">
        <header className="agent-deck-heading">
          <div>
            <span className="agent-eyebrow">TERRA INTELLIGENCE NETWORK</span>
            <h1>Meet your response team</h1>
            <p>Five specialist agents pass evidence forward to turn an incident into coordinated field guidance.</p>
          </div>
          <span className={`agent-mode-pill${currentId ? ' agent-mode-live' : ' agent-mode-demo'}`}>
            <i />{currentId ? `MISSION ${currentId}` : 'ILLUSTRATIVE DEMO · NOT LIVE'}
          </span>
        </header>

        <div className="agent-deck-layout">
          <section className="agent-network-panel" aria-label="Interactive AI agent workflow">
            <div className="agent-network-topline">
              <span><i className="agent-live-pip" /> SPECIALIST HANDOFF NETWORK</span>
              <span>{openAgent ? `CAMERA TRACK · ${selected.short.toUpperCase()}` : currentId ? 'MISSION SNAPSHOT' : 'SIMULATED FLOW'}</span>
              {openAgent && <button type="button" className="agent-camera-reset" onClick={() => setOpenAgent(null)}>Reset overview</button>}
            </div>
            <AgentConstellation agents={sceneAgents} selectedKey={openAgent ?? ''} onSelect={setOpenAgent} />
            <div className="agent-network-legend">
              <span><i className="legend-dot legend-dot-blue" /> Shared mission state</span>
              <span><i className="legend-dot legend-dot-green" /> Report handoff</span>
              <span>Select a node or specialist below</span>
            </div>
          </section>

          <aside className="agent-focus-panel" style={{ '--agent-focus': selected.color } as CSSProperties}>
            <div className="agent-focus-topline"><span>SELECTED SPECIALIST</span><Badge tone={selected.state === 'ACTIVE' ? 'green' : 'muted'}>{selected.state}</Badge></div>
            <div className="agent-focus-orb"><span>{String(rows.indexOf(selected) + 1).padStart(2, '0')}</span></div>
            <h2>{selected.label}</h2>
            <p className="agent-focus-duty">{selected.responsibility}</p>
            <div className="agent-focus-metric">
              <div><span>{currentId ? 'MISSION CONFIDENCE' : 'DEMO CONFIDENCE'}</span><strong>{selected.confidence === null ? '—' : `${Math.round(selected.confidence * 100)}%`}</strong></div>
              <div className="agent-focus-track"><i style={{ width: `${Math.round((selected.confidence ?? 0) * 100)}%` }} /></div>
            </div>
            <div className="agent-focus-handoff">
              <span>{selected.lastEvent ? 'LAST REPORT' : 'NEXT HANDOFF'}</span>
              <p>{selected.lastEvent?.message || selected.lastEvent?.type || `${selected.short} shares its findings with the next specialist in the chain.`}</p>
              {selected.lastEvent && <small>{formatDateTime(selected.lastEvent.ts)}</small>}
            </div>
            <div className="agent-sequence" aria-label="Agent handoff order">
              {rows.map((agent, index) => <span key={agent.key} className={agent.key === selected.key ? 'sequence-current' : ''}>{agent.short}{index < rows.length - 1 && <i>›</i>}</span>)}
            </div>
          </aside>
        </div>

        <div className="agent-specialist-list" aria-label="Select an AI specialist">
          {rows.map((agent, index) => (
            <button type="button" key={agent.key} className={`agent-specialist-card${selected.key === agent.key ? ' specialist-selected' : ''}`}
              style={{ '--agent-color': agent.color, '--agent-index': index } as CSSProperties}
              onClick={() => setOpenAgent(agent.key)} aria-pressed={selected.key === agent.key}>
              <span className="specialist-index">0{index + 1}</span>
              <span className="specialist-main"><strong>{agent.short}</strong><small>{agent.label.replace(' Agent', '')}</small></span>
              <span className={`specialist-state state-${agent.state.toLowerCase()}`}><i />{agent.state}</span>
              <span className="specialist-confidence">{agent.confidence === null ? '—' : `${Math.round(agent.confidence * 100)}%`}</span>
            </button>
          ))}
        </div>

        <div className="agent-lower-grid">
          <Panel title="How the response comes together" tag="5 specialist handoffs">
            <div className="agent-flow-explainer">
              {rows.map((agent, index) => (
                <button type="button" key={agent.key} onClick={() => setOpenAgent(agent.key)} className={selected.key === agent.key ? 'flow-step flow-step-selected' : 'flow-step'}>
                  <span className="flow-step-num" style={{ color: agent.color }}>0{index + 1}</span>
                  <span><strong>{agent.short}</strong><small>{agent.responsibility}</small></span>
                  {index < rows.length - 1 && <i aria-hidden="true">→</i>}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Mission activity" tag={recentEvents.length ? `${recentEvents.length} recent events` : 'Awaiting first run'}>
            {recentEvents.length ? (
              <div className="agent-recent-events">{recentEvents.map((event, index) => (
                <div key={`${event.ts}-${index}`}><span>{formatDateTime(event.ts)}</span><strong>{AGENT_DEFS.find((agent) => agent.key === event.agent)?.short || 'System'}</strong><p>{event.message || event.type}</p></div>
              ))}</div>
            ) : (
              <div className="agent-activity-empty"><span className="activity-empty-core" /><strong>{currentId ? 'Mission ready to run' : 'The specialists are standing by'}</strong><p>{currentId ? 'Agent reports and handoffs will appear here when orchestration begins.' : 'Choose a mission above to view live reports. The scene currently shows illustrative demo confidence.'}</p></div>
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}
