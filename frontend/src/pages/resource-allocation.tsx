/**
 * PAGE 3 — RESOURCE ALLOCATION
 * Human-in-the-loop resource approval. Uses the real HITL endpoints:
 *   GET  /missions/{id}/decisions           (pending decisions)
 *   POST /missions/{id}/decisions/{d}/resolve {action: approve|override}
 * A decision is NEVER auto-resolved; dispatch only happens after operator approval.
 */

import { useState } from 'react';
import { api, type Decision, type MissionListItem, type MissionSummaryResp, ApiError } from '../api';
import { useAsyncData } from '../hooks';
import {
  Badge,
  EmptyCompact,
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  MissionSelect,
  Panel,
  RefreshButton,
  formatDateTime,
} from '../ui';
import { DemoAllocationPlanner } from './DemoAllocationPlanner';

interface AllocationData {
  missions: MissionListItem[];
  summary: MissionSummaryResp | null;
  decisions: Decision[];
}

export function ResourceAllocationPage() {
  const [selectedId, setSelectedId] = useState<string>('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const { data, error, loading, refresh, loadedKey } = useAsyncData<AllocationData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const latest = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
    let summary: MissionSummaryResp | null = null;
    let decisions: Decision[] = [];
    if (latest) {
      try {
        summary = await api.summary(latest, signal);
      } catch {
        summary = null;
      }
      try {
        decisions = await api.decisions(latest, signal);
      } catch {
        decisions = [];
      }
    }
    return { missions, summary, decisions };
  }, [selectedId]);

  const missions = data?.missions ?? [];
  const currentId = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
  const briefing =
    data?.summary && data.summary.generated_at
      ? (data.summary.mission_briefing as import('../api').MissionBriefing)
      : null;

  /* ---------------- resolve decision (real POST) ---------------- */

  async function handleResolve(decision: Decision, action: 'approve' | 'override') {
    if (!currentId) return;
    setBusyId(decision.id);
    setResultError(null);
    setResultMessage(null);
    try {
      const resolved = await api.resolveDecision(
        currentId,
        decision.id,
        action,
        notes[decision.id] || undefined
      );
      setResultMessage(
        `Decision ${resolved.id} ${resolved.status} by ${resolved.resolved_by ?? 'operator'}.`
      );
      refresh();
    } catch (e) {
      setResultError(e instanceof ApiError ? e.message : 'Failed to resolve decision');
    } finally {
      setBusyId(null);
    }
  }

  const expectedKey = JSON.stringify([currentId]);
  const stale = loading && loadedKey !== null && loadedKey !== expectedKey;
  if (loading && (!data || stale)) return <LoadingBlock label="Loading resource allocation…" />;

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
      {resultMessage && <div className="action-note action-ok">{resultMessage}</div>}
      {resultError && <ErrorNote message={resultError} />}

      {missions.length === 0 ? (
        <DemoAllocationPlanner />
      ) : (
        <>
          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Resource status (mission briefing)</span>
              <span className="detail-value">
                {briefing ? (
                  <Badge tone={briefing.resource_status === 'Deployed' ? 'green' : 'blue'}>
                    {briefing.resource_status}
                  </Badge>
                ) : (
                  <span className="cell-muted">No briefing generated yet</span>
                )}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Decisions pending operator approval</span>
              <span className="detail-value">{data?.decisions.length ?? 0}</span>
            </div>
          </div>

          <Panel
            title="Pending Decisions"
            count={data?.decisions.length ?? 0}
            tag="Human-in-the-loop gate"
          >
            <div className="decision-list">
              {!data || data.decisions.length === 0 ? (
                <EmptyState
                  icon="check"
                  title="No decisions awaiting approval"
                  hint="When an agent raises a resource request it will appear here for approval"
                />
              ) : (
                data.decisions.map((d) => (
                  <div className="decision-card" key={d.id}>
                    <div className="decision-top">
                      <span className="cell-id">{d.id}</span>
                      <Badge tone={d.request_type === 'approve' ? 'orange' : 'blue'}>
                        {d.request_type}
                      </Badge>
                      {d.related_agent && (
                        <span className="cell-muted">agent: {d.related_agent}</span>
                      )}
                      <span className="cell-muted detail-mono">{formatDateTime(d.raised_at)}</span>
                    </div>
                    <p className="decision-summary">{d.summary}</p>
                    <div className="decision-actions">
                      <input
                        className="input"
                        type="text"
                        placeholder="Operator note (optional, audit trail)"
                        value={notes[d.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                        disabled={busyId === d.id}
                      />
                      <button
                        className="btn btn-approve"
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => handleResolve(d, 'approve')}
                      >
                        <Icon name="check" size={13} />
                        Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => handleResolve(d, 'override')}
                      >
                        <Icon name="x" size={13} />
                        Override
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="How approval works" className="panel-subtle">
            <EmptyCompact>
              <span>
                Resource dispatch is human-gated: the mission pauses at{' '}
                <span className="detail-mono">awaiting_confirmation</span> until every pending
                decision is approved or overridden by an operator. Nothing is dispatched
                automatically.
              </span>
              <small>
                Resolved decisions are recorded on the mission timeline (see the Activity Log
                page).
              </small>
            </EmptyCompact>
          </Panel>
          <DemoAllocationPlanner />
        </>
      )}
    </div>
  );
}
