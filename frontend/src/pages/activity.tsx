/**
 * PAGE 8 — ACTIVITY LOG
 * Chronological mission timeline from the real backend
 *   GET /missions/{id}/timeline
 * with functional type/agent/text filters.
 */

import { useMemo, useState } from 'react';
import { api, type MissionListItem, type TimelineEvent } from '../api';
import { useAsyncData } from '../hooks';
import {
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

interface LogData {
  missions: MissionListItem[];
  timeline: TimelineEvent[];
}

export function ActivityLogPage() {
  const [selectedId, setSelectedId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  const { data, error, loading, refresh, loadedKey } = useAsyncData<LogData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const latest = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
    let timeline: TimelineEvent[] = [];
    if (latest) {
      try {
        timeline = await api.timeline(latest, signal);
      } catch {
        timeline = [];
      }
    }
    return { missions, timeline };
  }, [selectedId]);

  const missions = data?.missions ?? [];
  const currentId = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
  const timeline = data?.timeline ?? [];

  const types = useMemo(
    () => Array.from(new Set(timeline.map((e) => e.type))).sort(),
    [timeline]
  );
  const agents = useMemo(
    () =>
      Array.from(new Set(timeline.map((e) => e.agent).filter((a): a is string => Boolean(a)))).sort(),
    [timeline]
  );

  const filtered = timeline.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (agentFilter && e.agent !== agentFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        e.message.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.agent ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const expectedKey = JSON.stringify([currentId]);
  const stale = loading && loadedKey !== null && loadedKey !== expectedKey;
  if (loading && (!data || stale)) return <LoadingBlock label="Loading activity log…" />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <MissionSelect missions={missions} value={currentId} onChange={setSelectedId} />
          <select className="input input-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All event types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="input input-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label className="search-box">
            <Icon name="search" size={14} />
            <input
              className="input"
              type="search"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar-right">
          <RefreshButton onClick={refresh} />
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={refresh} />}

      <Panel title="Mission Timeline" count={filtered.length} tag={currentId ? `Mission ${currentId}` : undefined}>
        <div className="log-list">
          {missions.length === 0 ? (
            <EmptyState
              icon="list"
              title="No events recorded — no missions registered"
              hint="Timeline events stream as missions execute"
            />
          ) : filtered.length === 0 ? (
            <EmptyCompact>No events match the current filters.</EmptyCompact>
          ) : (
            filtered.map((ev, i) => (
              <div className="log-row" key={`${ev.ts}-${i}`}>
                <span className="log-time detail-mono">{formatDateTime(ev.ts)}</span>
                <span className="log-type">{ev.type}</span>
                <span className="log-agent">{ev.agent || 'SYSTEM'}</span>
                <span className="log-message">{ev.message}</span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
