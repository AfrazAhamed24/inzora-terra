/**
 * PAGE 1 — COMMAND CENTER
 * The main operations landing page. Preserves the original dashboard layout:
 * KPI row, operational overview, active incidents, resource availability,
 * recent activity, five-agent status. KPI cards navigate to their pages.
 */

import { Fragment, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  api,
  AGENT_DEFS,
  REGION_ANCHORS,
  anchorForEnvironment,
  type Health,
  type MissionBriefing,
  type MissionListItem,
  type MissionSummaryResp,
  type RegionAnchor,
  type TimelineEvent,
} from '../api';
import { TerrainMap, type MapMarker } from '../map';
import { useAsyncData } from '../hooks';
import { Link, useRouter } from '../router';
import {
  Badge,
  ConfidenceBar,
  EmptyCompact,
  EmptyState,
  Icon,
  LoadingBlock,
  Panel,
  formatTime,
  riskTone,
} from '../ui';

const VIRTUAL_TERRAIN_REGIONS: Array<MapMarker & { detail: string; zoom: number }> = [
  { id: 'demo-chennai', lat: 13.0827, lon: 80.2707, label: 'Chennai flood', sublabel: 'Perumbakkam · simulated', tone: 'blue', detail: 'Urban flood · priority search Perumbakkam', zoom: 11 },
  { id: 'demo-nilgiris', lat: 11.3468, lon: 76.6432, label: 'Nilgiris landslide', sublabel: 'Coonoor · simulated', tone: 'orange', detail: 'Landslide · geotechnical clearance before entry', zoom: 11 },
  { id: 'demo-cuddalore', lat: 11.49, lon: 79.77, label: 'Cuddalore storm surge', sublabel: 'Parangipettai · simulated', tone: 'red', detail: 'Storm surge · coastal extraction and breach watch', zoom: 10 },
];

interface CommandData {
  health: Health;
  missions: MissionListItem[];
  /** summary of the latest mission (may be null when none generated yet) */
  summary: MissionSummaryResp | null;
  /** timeline of the latest mission */
  timeline: TimelineEvent[];
  /** worst risk classification across all fetched mission summaries */
  criticalCount: number;
}

export function CommandCenterPage() {
  const { navigate } = useRouter();
  const [openAgentKey, setOpenAgentKey] = useState<string | null>(null);
  const [selectedDemoRegion, setSelectedDemoRegion] = useState<string | null>(null);

  useEffect(() => {
    const handleVoiceRegion = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id && VIRTUAL_TERRAIN_REGIONS.some((region) => region.id === id)) {
        setSelectedDemoRegion(id);
      }
    };
    window.addEventListener('terra:focus-region', handleVoiceRegion);
    return () => window.removeEventListener('terra:focus-region', handleVoiceRegion);
  }, []);

  const toggleAgent = (key: string) =>
    setOpenAgentKey((current) => (current === key ? null : key));

  const { data, error, loading, refresh } = useAsyncData<CommandData>(async (signal) => {
    const health = await api.health(signal);
    const missions = await api.listMissions(signal);
    let summary: MissionSummaryResp | null = null;
    let timeline: TimelineEvent[] = [];
    let criticalCount = 0;

    // Fetch summaries for up to the 10 most recent missions so the
    // "Critical Incidents" KPI reflects real risk classifications.
    const recent = missions.slice(0, 10);
    const summaries = await Promise.all(
      recent.map(async (m) => {
        try {
          return await api.summary(m.mission_id, signal);
        } catch {
          return null;
        }
      })
    );
    for (const s of summaries) {
      if (s && s.generated_at) {
        const briefing = s.mission_briefing as MissionBriefing;
        if (briefing.overall_risk === 'CRITICAL' || briefing.overall_risk === 'HIGH') {
          criticalCount += 1;
        }
      }
    }

    if (missions.length > 0) {
      const latest = missions[missions.length - 1];
      try {
        summary = await api.summary(latest.mission_id, signal);
      } catch {
        summary = null;
      }
      try {
        timeline = await api.timeline(latest.mission_id, signal);
      } catch {
        timeline = [];
      }
    }

    return { health, missions, summary, timeline, criticalCount };
  }, []);

  if (loading && !data) {
    return <LoadingBlock label="Loading command centre…" />;
  }
  if (error && !data) {
    return (
      <div className="page-stack">
        <section className="command-offline-state">
          <span className="command-offline-kicker">COMMAND CENTER</span>
          <h2>Operations view is reconnecting</h2>
          <p>The live dashboard will return when mission services respond. Other sections remain available.</p>
        </section>
      </div>
    );
  }

  const d = data as CommandData;
  const missions = d.missions;
  const latest = missions.length > 0 ? missions[missions.length - 1] : null;
  const summary = d.summary;
  const briefing =
    summary && summary.generated_at
      ? (summary.mission_briefing as import('../api').MissionBriefing)
      : null;

  /* ---------- derived data (all real backend values) ---------- */

  const agentRows = AGENT_DEFS.map((agent) => {
    const score = summary?.confidence_scores?.[agent.key];
    const events = d.timeline.filter((e) => e.agent === agent.key);
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    return {
      ...agent,
      status: score !== undefined || lastEvent ? ('ok' as const) : ('standby' as const),
      confidence: typeof score === 'number' ? score : null,
      timestamp: lastEvent ? lastEvent.ts : null,
      events,
      lastMessage: lastEvent ? lastEvent.message || lastEvent.type : null,
    };
  });
  const agentsOperational = agentRows.filter((a) => a.status === 'ok').length;

  // Specialist agent that produced the most recent timeline event — drives the pipeline
  // highlight. Orchestrator/system events don't belong to any card, so they're skipped.
  const agentKeys = new Set(AGENT_DEFS.map((a) => a.key as string));
  const activeAgentKey = (() => {
    for (let i = d.timeline.length - 1; i >= 0; i -= 1) {
      const ev = d.timeline[i];
      if (ev.agent && agentKeys.has(ev.agent)) return ev.agent;
    }
    return null;
  })();

  const activityEvents = d.timeline.slice(-8).reverse();

  /* ---------- georeferenced incidents (only real anchor matches) ---------- */

  const geoMissions = missions
    .map((m) => ({ mission: m, anchor: anchorForEnvironment(m.environment_id) }))
    .filter((x): x is { mission: MissionListItem; anchor: RegionAnchor } => x.anchor !== null);

  const incidents: MapMarker[] = [...geoMissions.map(({ mission, anchor }) => ({
    id: mission.mission_id,
    lat: anchor.lat,
    lon: anchor.lon,
    label: mission.mission_name || mission.incident_text || mission.mission_id,
    sublabel: anchor.name,
    tone: riskTone(
      briefing && mission.mission_id === latest?.mission_id ? briefing.overall_risk : undefined
    ),
  })), ...VIRTUAL_TERRAIN_REGIONS];

  const lastGeo = geoMissions.length > 0 ? geoMissions[geoMissions.length - 1] : null;
  const selectedDemo = VIRTUAL_TERRAIN_REGIONS.find((region) => region.id === selectedDemoRegion);
  const mapFocus = selectedDemo
    ? { id: selectedDemo.id, lat: selectedDemo.lat, lon: selectedDemo.lon, zoom: selectedDemo.zoom }
    : lastGeo
    ? { id: lastGeo.mission.mission_id, lat: lastGeo.anchor.lat, lon: lastGeo.anchor.lon, zoom: 11 }
    : null;

  /* ---------- KPI cards (clickable) ---------- */

  const kpis: Array<{
    icon: string;
    label: string;
    value: number | string;
    accent: 'red' | 'orange' | 'green' | 'blue';
    to: string;
    hint: string;
  }> = [
    {
      icon: 'incident',
      label: 'Active Emergencies',
      value: d.health.active_missions,
      accent: 'red',
      to: '/emergencies',
      hint: 'View emergencies',
    },
    {
      icon: 'alert',
      label: 'Critical Incidents',
      value: d.criticalCount,
      accent: 'orange',
      to: '/risk-assessment',
      hint: 'View risk assessment',
    },
    {
      icon: 'resource',
      label: 'Resource Approvals',
      value: '—',
      accent: 'green',
      to: '/resource-allocation',
      hint: 'Inventory not connected',
    },
    {
      icon: 'agent',
      label: 'AI Agents Operational',
      value: agentsOperational,
      accent: 'blue',
      to: '/agents',
      hint: 'View agents',
    },
  ];

  return (
    <div className="page-stack">
      {/* KPI ROW */}
      <section className="kpi-grid">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.to}
            className={`kpi-card kpi-${k.accent} kpi-link`}
            title={k.hint}
          >
            <div className="kpi-icon">
              <Icon name={k.icon} size={18} />
            </div>
            <div className="kpi-body">
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
            </div>
          </Link>
        ))}
      </section>

      {/* OPERATIONS GRID */}
      <section className="operations-grid">
        <Panel title="Operational Overview" tag="Tamil Nadu Region" className="operational-overview">
          <div className="map-demo-region-controls" aria-label="Select fictional disaster region">
            <span>SIMULATED TERRAIN SCENARIO</span>
            {VIRTUAL_TERRAIN_REGIONS.map((region) => (
              <button
                key={region.id}
                type="button"
                className={`btn btn-sm${selectedDemoRegion === region.id ? ' btn-primary' : ' btn-ghost'}`}
                aria-pressed={selectedDemoRegion === region.id}
                onClick={() => setSelectedDemoRegion(region.id)}
                title={region.detail}
              >
                {region.label}
              </button>
            ))}
            {selectedDemo && <span className="map-demo-region-detail">{selectedDemo.detail}</span>}
          </div>
          <div className="map-container">
            <TerrainMap
              anchors={REGION_ANCHORS}
              incidents={incidents}
              focus={mapFocus}
              note={`Fictional Tamil Nadu disaster zones · ${missions.length} live mission(s)`}
            />

            <div className="map-legend">
              <span className="legend-item">
                <span className="legend-swatch legend-symbol">⛰️</span>
                Disaster zone (symbol = hazard class)
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-red" />
                Active incident
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Active Incidents"
          count={missions.length}
          className="active-incidents"
          actions={
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('/emergencies')}>
              Manage
            </button>
          }
        >
          <div className="incidents-list">
            {missions.length === 0 ? (
              <EmptyState
                icon="incident"
                title="No active incidents"
                hint="No emergencies registered — register one on the Emergencies page"
              />
            ) : (
              missions
                .slice()
                .reverse()
                .map((m) => (
                  <Link
                    to="/emergencies"
                    className="incident-row incident-row-link"
                    key={m.mission_id}
                  >
                    <Badge tone={riskTone(briefing && m.mission_id === latest?.mission_id ? briefing.overall_risk : undefined)}>
                      {m.stage ? m.stage.replace('_', ' ').toUpperCase().slice(0, 9) : 'OPEN'}
                    </Badge>
                    <div className="incident-body">
                      <span className="incident-id">{m.mission_id}</span>
                      <span className="incident-type">
                        {m.mission_name || m.incident_text || 'Emergency Incident'}
                      </span>
                      <span className="incident-location">{m.environment_id || 'Region unassigned'}</span>
                    </div>
                    <span className={`response-status ${m.is_running ? 'running' : 'idle'}`}>
                      {m.is_running ? 'Responding' : 'Standby'}
                    </span>
                  </Link>
                ))
            )}
          </div>
        </Panel>
      </section>

      {/* LOWER GRID */}
      <section className="lower-grid">
        <Panel title="Resource Availability" tag="State Disaster Management Authority" className="resource-panel">
          <div className="table">
            <div className="table-head table-head-resources">
              <span>Resource ID</span>
              <span>Resource Name</span>
              <span>Agency</span>
              <span>Status</span>
              <span>Location</span>
            </div>
            <EmptyCompact>
              <span>Resource inventory is not connected to the backend yet</span>
              <small>
                No inventory endpoint exists — mission-driven allocations appear on the Resource
                Allocation page
              </small>
            </EmptyCompact>
          </div>
        </Panel>

        <Panel
          title="Recent Activity"
          tag={latest ? `Mission ${latest.mission_id}` : 'No mission selected'}
          className="activity-panel"
        >
          <div className="activity-list">
            {activityEvents.length === 0 ? (
              <EmptyCompact>
                <span>No recent activity recorded</span>
                <small>Events appear as the mission loop executes</small>
              </EmptyCompact>
            ) : (
              activityEvents.map((ev, idx) => (
                <div className="activity-row" key={`${ev.ts}-${idx}`}>
                  <span className="activity-time">{formatTime(ev.ts)}</span>
                  <span className="activity-dot" />
                  <span className="activity-message">{ev.message || ev.type}</span>
                  <span className="activity-agent">{ev.agent || 'SYSTEM'}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      {/* AI AGENT STATUS */}
      <Panel
        className="agent-section"
        title="AI Agent Status"
        tag={latest ? `Mission ${latest.mission_id}` : 'Awaiting mission'}
        actions={
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('/agents')}>
            Open AI Agents
          </button>
        }
      >
        <div className="agent-section-body">
          {/* orchestration pipeline — click a node to expand its card */}
          <div className="agent-pipeline" role="toolbar" aria-label="Agent orchestration pipeline">
            {agentRows.map((agent, i) => (
              <Fragment key={agent.key}>
                {i > 0 && (
                  <span className="pipe-link" aria-hidden="true">
                    <span className="pipe-pulse" />
                  </span>
                )}
                <button
                  type="button"
                  className={`pipe-node${agent.status === 'ok' ? ' pipe-node-ok' : ''}${
                    activeAgentKey === agent.key ? ' pipe-node-active' : ''
                  }${openAgentKey === agent.key ? ' pipe-node-open' : ''}`}
                  aria-pressed={openAgentKey === agent.key}
                  title={`${agent.label} — ${agent.events.length} execution event${agent.events.length === 1 ? '' : 's'}`}
                  onClick={() => toggleAgent(agent.key)}
                >
                  <span className="pipe-dot" />
                  <Icon name={agent.icon} size={13} />
                  <span className="pipe-name">{agent.short}</span>
                  <span className="pipe-count">{agent.events.length}</span>
                </button>
              </Fragment>
            ))}
          </div>

          {/* interactive agent cards */}
          <div className="agent-grid agent-grid-interactive">
            {agentRows.map((agent, i) => (
              <AgentCard
                key={agent.key}
                agent={agent}
                index={i}
                active={activeAgentKey === agent.key}
                open={openAgentKey === agent.key}
                onToggle={() => toggleAgent(agent.key)}
              />
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive agent card                                              */
/* ------------------------------------------------------------------ */

interface AgentCardAgent {
  key: string;
  label: string;
  short: string;
  icon: string;
  responsibility: string;
  status: 'ok' | 'standby';
  confidence: number | null;
  timestamp: string | null;
  events: TimelineEvent[];
  lastMessage: string | null;
}

function AgentCard({
  agent,
  index,
  active,
  open,
  onToggle,
}: {
  agent: AgentCardAgent;
  index: number;
  active: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`agent-card-ix${active ? ' agent-card-active' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <button
        type="button"
        className="agent-card-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="agent-card-head-top">
          <span className="agent-name">{agent.label}</span>
          <span className={`agent-status agent-${agent.status}`}>{agent.status}</span>
        </span>
        <ConfidenceBar value={agent.confidence} />
        <span className="agent-metric agent-time">
          {agent.timestamp ? formatTime(agent.timestamp) : 'No execution'}
        </span>
      </button>
      <div className={`agent-card-reveal${open ? ' agent-reveal-open' : ''}`}>
        <div className="agent-card-reveal-inner">
          <p className="agent-duty">{agent.responsibility}</p>
          {agent.lastMessage && (
            <p className="agent-last" title={agent.lastMessage}>
              {agent.lastMessage}
            </p>
          )}
          <div className="agent-detail-row">
            <span>
              Executions <strong>{agent.events.length}</strong>
            </span>
            <span>
              {agent.lastMessage ? 'Last action shown' : 'Awaiting mission loop'}
            </span>
          </div>
          <Link to="/agents" className="agent-open-link">
            Open AI Agents
            <Icon name="arrow-left" size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}
