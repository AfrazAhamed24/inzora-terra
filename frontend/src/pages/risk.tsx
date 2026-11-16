/**
 * PAGE 5 — RISK ASSESSMENT
 * Risk intelligence from the real Risk Assessment output surfaced through the
 * mission briefing (overall_risk, confidence, priority zones, constraints).
 */

import { useState } from 'react';
import { api, type MissionListItem, type MissionSummaryResp } from '../api';
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
  riskTone,
} from '../ui';

interface RiskData {
  missions: MissionListItem[];
  summary: MissionSummaryResp | null;
}

export function RiskAssessmentPage() {
  const [selectedId, setSelectedId] = useState<string>('');

  const { data, error, loading, refresh, loadedKey } = useAsyncData<RiskData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const latest = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
    let summary: MissionSummaryResp | null = null;
    if (latest) {
      try {
        summary = await api.summary(latest, signal);
      } catch {
        summary = null;
      }
    }
    return { missions, summary };
  }, [selectedId]);

  const missions = data?.missions ?? [];
  const currentId = selectedId || (missions.length > 0 ? missions[missions.length - 1].mission_id : '');
  const summary = data?.summary ?? null;
  const briefing =
    summary && summary.generated_at
      ? (summary.mission_briefing as import('../api').MissionBriefing)
      : null;
  const confidence =
    summary?.confidence_scores?.risk_assessment ?? briefing?.overall_confidence ?? null;

  const expectedKey = JSON.stringify([currentId]);
  const stale = loading && loadedKey !== null && loadedKey !== expectedKey;
  if (loading && (!data || stale)) return <LoadingBlock label="Loading risk assessment…" />;

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
        <Panel title="Risk Assessment">
          <EmptyState
            icon="alert"
            title="No risk assessment available"
            hint="Register and run an emergency mission — the Risk Assessment Agent then classifies the hazard"
          />
        </Panel>
      ) : !briefing ? (
        <Panel title="Risk Assessment" tag={`Mission ${currentId}`}>
          <EmptyState
            icon="alert"
            title="No assessment generated for this mission yet"
            hint="The Risk Assessment Agent publishes its classification when the mission briefing is generated"
          />
        </Panel>
      ) : (
        <>
          <div className="detail-grid detail-grid-risk">
            <div className="detail-card detail-risk-class">
              <span className="detail-label">Risk classification</span>
              <span className="detail-risk-value">
                <Badge tone={riskTone(briefing.overall_risk)}>{briefing.overall_risk}</Badge>
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Assessment confidence</span>
              <span className="detail-value">
                <ConfidenceBar value={confidence} />
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Related mission</span>
              <span className="detail-value detail-mono">{summary?.mission_id}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Generated at</span>
              <span className="detail-value detail-mono">{formatDateTime(summary?.generated_at ?? '')}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Estimated victims</span>
              <span className="detail-value">{briefing.total_victims_estimated}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Human review required</span>
              <span className="detail-value">
                <Badge tone={summary?.needs_human_review ? 'orange' : 'green'}>
                  {summary?.needs_human_review ? 'YES' : 'NO'}
                </Badge>
              </span>
            </div>
          </div>

          <div className="lower-grid lower-grid-risk">
            <Panel title="Priority Zones (HIGH)">
              {briefing.priority_zones.length === 0 ? (
                <EmptyCompact>No high-priority zones recorded</EmptyCompact>
              ) : (
                <div className="chip-row">
                  {briefing.priority_zones.map((z) => (
                    <span className="chip chip-high" key={z}>
                      {z}
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Safety Constraints (Rescue Guidance)">
              {briefing.rescue_guidance.safety_constraints.length === 0 ? (
                <EmptyCompact>No safety constraints recorded</EmptyCompact>
              ) : (
                <ul className="detail-list">
                  {briefing.rescue_guidance.safety_constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Immediate Actions (Knowledge Retrieval)">
            {briefing.immediate_actions.length === 0 ? (
              <EmptyCompact>No immediate actions recorded</EmptyCompact>
            ) : (
              <ul className="detail-list">
                {briefing.immediate_actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
