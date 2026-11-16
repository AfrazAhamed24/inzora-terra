/**
 * PAGE 2 — EMERGENCIES
 * Dedicated emergency management: mission list, searchable, with a real
 * "Register Emergency" form (POST /missions) and mission detail with real
 * start/stop lifecycle actions.
 */

import { useState } from 'react';
import { Link } from '../router';
import {
  api,
  SCENARIOS,
  scenarioLabel,
  type MissionListItem,
  type MissionSummaryResp,
  type Decision,
  type TimelineEvent,
  ApiError,
} from '../api';
import { useAsyncData } from '../hooks';
import {
  Badge,
  EmptyCompact,
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  Panel,
  RefreshButton,
  formatDateTime,
  riskTone,
  stageTone,
} from '../ui';

type DetailBundle = {
  mission: MissionListItem;
  summary: MissionSummaryResp | null;
  decisions: Decision[];
  timelineCount: number;
};

export function EmergenciesPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { data: missions, error, loading, refresh } = useAsyncData<MissionListItem[]>(
    (signal) => api.listMissions(signal),
    []
  );

  const list = missions ?? [];
  const filtered = list.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      m.mission_id.toLowerCase().includes(q) ||
      (m.mission_name || '').toLowerCase().includes(q) ||
      m.incident_text.toLowerCase().includes(q) ||
      m.environment_id.toLowerCase().includes(q)
    );
  });

  const selected =
    (selectedId && list.find((m) => m.mission_id === selectedId)) ||
    (list.length > 0 ? list[list.length - 1] : null);

  const { data: detail, error: detailError, loading: detailLoading, refresh: refreshDetail } =
    useAsyncData<DetailBundle | null>(async (signal) => {
      if (!selected) return null;
      let summary: MissionSummaryResp | null = null;
      let decisions: Decision[] = [];
      let timelineCount = 0;
      try {
        summary = await api.summary(selected.mission_id, signal);
      } catch {
        summary = null;
      }
      try {
        decisions = await api.decisions(selected.mission_id, signal);
      } catch {
        decisions = [];
      }
      try {
        const timeline = await api.timeline(selected.mission_id, signal);
        timelineCount = timeline.length;
      } catch {
        timelineCount = 0;
      }
      return { mission: selected, summary, decisions, timelineCount };
    }, [selected?.mission_id ?? '']);

  // Never act on a stale detail: while a newly selected mission is loading,
  // the previous mission's bundle must not be actionable.
  const detailStale =
    !detailLoading &&
    !!detail &&
    !!selected &&
    detail.mission.mission_id !== selected.mission_id;
  const showDetailLoading =
    (!!selected && detailLoading) || detailStale;

  /* ---------------- register emergency (real POST /missions) ---------------- */

  async function handleRegister(formData: FormData) {
    setFormBusy(true);
    setFormError(null);
    try {
      const incidentText = String(formData.get('incident_text') || '').trim();
      const missionName = String(formData.get('mission_name') || '').trim();
      const environmentId = String(formData.get('environment_id') || '').trim();
      if (!incidentText) {
        setFormError('Incident description is required.');
        return;
      }
      await api.createMission({
        incident_text: incidentText,
        ...(missionName ? { mission_name: missionName } : {}),
        ...(environmentId ? { environment_id: environmentId } : {}),
      });
      setFormOpen(false);
      setActionMessage('Emergency registered.');
      setActionError(null);
      refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Failed to register emergency');
    } finally {
      setFormBusy(false);
    }
  }

  /* ---------------- lifecycle actions (real POST start/stop) ---------------- */

  async function handleLifecycle(action: 'start' | 'stop') {
    if (!selected) return;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      if (action === 'start') await api.startMission(selected.mission_id);
      else await api.stopMission(selected.mission_id);
      setActionMessage(`Mission ${action === 'start' ? 'started' : 'stop requested'} successfully.`);
      refresh();
      refreshDetail();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Failed to ${action} mission`);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading && !missions) return <LoadingBlock label="Loading emergencies…" />;

  const briefing =
    detail?.summary && detail.summary.generated_at
      ? (detail.summary.mission_briefing as import('../api').MissionBriefing)
      : null;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <label className="search-box">
            <Icon name="search" size={14} />
            <input
              className="input"
              type="search"
              placeholder="Search by ID, incident, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar-right">
          <RefreshButton onClick={refresh} />
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => setFormOpen((v) => !v)}
          >
            <Icon name="plus" size={13} />
            {formOpen ? 'Close form' : 'Register Emergency'}
          </button>
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={refresh} />}

      {formOpen && (
        <Panel title="Register Emergency" tag="POST /missions">
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRegister(new FormData(e.currentTarget));
            }}
          >
            <div className="form-field form-field-wide">
              <label className="form-label" htmlFor="incident_text">
                Incident description *
              </label>
              <textarea
                id="incident_text"
                name="incident_text"
                className="input textarea"
                rows={3}
                required
                placeholder="Describe the emergency (e.g. multi-storey collapse with victims trapped, heavy rain)"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="mission_name">
                Mission name
              </label>
              <input id="mission_name" name="mission_name" className="input" type="text" placeholder="Optional" />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="environment_id">
                Scenario
              </label>
              <select id="environment_id" name="environment_id" className="input" defaultValue="scenario_collapse_rain">
                <option value="">Auto (backend default)</option>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {formError && <ErrorNote message={formError} />}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={formBusy}>
                {formBusy ? 'Registering…' : 'Register emergency'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* EMERGENCY TABLE */}
      <Panel title="Emergency Register" count={filtered.length}>
        <div className="table table-scroll">
          <div className="table-head table-head-emergencies">
            <span>Emergency ID</span>
            <span>Incident Description</span>
            <span>Location</span>
            <span>Disaster Type</span>
            <span>Stage</span>
            <span>Status</span>
          </div>
          {list.length === 0 ? (
            <EmptyState
              icon="incident"
              title="No active emergencies registered"
              hint="Register an emergency to start a response mission"
            />
          ) : filtered.length === 0 ? (
            <EmptyCompact>No emergencies match the current search.</EmptyCompact>
          ) : (
            filtered
              .slice()
              .reverse()
              .map((m) => (
                <button
                  type="button"
                  key={m.mission_id}
                  className={`table-row table-row-btn${
                    selected?.mission_id === m.mission_id ? ' table-row-selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedId(m.mission_id);
                    setActionMessage(null);
                    setActionError(null);
                  }}
                >
                  <span className="cell-id">{m.mission_id}</span>
                  <span className="cell-name" title={m.incident_text}>
                    {m.mission_name || m.incident_text}
                  </span>
                  <span className="cell-muted">{m.environment_id || '—'}</span>
                  <span className="cell-muted">{scenarioLabel(m.environment_id)}</span>
                  <span>
                    <Badge tone={stageTone(m.stage)}>{m.stage.replace('_', ' ')}</Badge>
                  </span>
                  <span className={`response-status ${m.is_running ? 'running' : 'idle'}`}>
                    {m.is_running ? 'Responding' : 'Standby'}
                  </span>
                </button>
              ))
          )}
        </div>
      </Panel>

      {/* DETAIL */}
      {selected && (
        <Panel
          title={`Emergency Detail — ${selected.mission_id}`}
          tag={detail?.summary?.generated_at ? 'Briefing available' : 'No briefing yet'}
          actions={
            <div className="panel-actions">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={actionBusy || selected.is_running}
                onClick={() => handleLifecycle('start')}
                title={selected.is_running ? 'Mission already running' : 'Start mission loop'}
              >
                <Icon name="play" size={12} />
                Start
              </button>
              <button
                className="btn btn-danger btn-sm"
                type="button"
                disabled={actionBusy || !selected.is_running}
                onClick={() => handleLifecycle('stop')}
                title={selected.is_running ? 'Request mission stop' : 'Mission not running'}
              >
                <Icon name="stop" size={12} />
                Stop
              </button>
              <RefreshButton onClick={refreshDetail} />
            </div>
          }
        >
          <div className="detail-body">
            {showDetailLoading && <LoadingBlock label="Loading mission detail…" />}
            {!showDetailLoading && detailError && <ErrorNote message={detailError} onRetry={refreshDetail} />}
            {!showDetailLoading && actionMessage && <div className="action-note action-ok">{actionMessage}</div>}
            {!showDetailLoading && actionError && <ErrorNote message={actionError} />}

            {!showDetailLoading && detail && (
              <>
                <div className="detail-grid">
                  <div className="detail-card">
                    <span className="detail-label">Incident</span>
                    <span className="detail-value">{detail.mission.incident_text}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Location / Scenario</span>
                    <span className="detail-value">{detail.mission.environment_id || '—'}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Disaster type</span>
                    <span className="detail-value">{scenarioLabel(detail.mission.environment_id)}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Mission stage</span>
                    <span className="detail-value">
                      <Badge tone={stageTone(detail.mission.stage)}>{detail.mission.stage}</Badge>
                    </span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Risk classification</span>
                    <span className="detail-value">
                      {briefing ? (
                        <Badge tone={riskTone(briefing.overall_risk)}>{briefing.overall_risk}</Badge>
                      ) : (
                        <span className="cell-muted">No briefing generated yet</span>
                      )}
                    </span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Registered</span>
                    <span className="detail-value detail-mono">{formatDateTime(detail.mission.created_at)}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Last update</span>
                    <span className="detail-value detail-mono">{formatDateTime(detail.mission.updated_at)}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Timeline events</span>
                    <span className="detail-value">{detail.timelineCount}</span>
                  </div>
                </div>

                {briefing && (
                  <div className="detail-section">
                    <span className="detail-label">Briefing highlights</span>
                    <ul className="detail-list">
                      {briefing.immediate_actions.length === 0 && (
                        <li className="cell-muted">No immediate actions recorded</li>
                      )}
                      {briefing.immediate_actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="detail-section">
                  <span className="detail-label">
                    Pending decisions awaiting operator approval ({detail.decisions.length})
                  </span>
                  {detail.decisions.length === 0 ? (
                    <EmptyCompact>
                      <span>No pending decisions for this mission</span>
                      <small>Approvals are handled on the Resource Allocation page</small>
                    </EmptyCompact>
                  ) : (
                    detail.decisions.map((d) => (
                      <div className="decision-mini" key={d.id}>
                        <Badge tone="orange">{d.request_type}</Badge>
                        <span className="decision-mini-text">{d.summary}</span>
                        <Link to="/resource-allocation" className="btn btn-ghost btn-sm">
                          Review
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
