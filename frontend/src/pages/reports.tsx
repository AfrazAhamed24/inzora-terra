import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { api, type MissionListItem, type MissionReportData } from '../api';
import { useAsyncData } from '../hooks';
import { downloadMissionReport } from '../reports/buildPdf';
import { demoReport, DEMO_REPORT_OPTIONS, liveReport, reportOptionLabel, type ReportView } from '../reports/reportModel';
import { Badge, ErrorNote, Icon, LoadingBlock, Panel, RefreshButton } from '../ui';

interface ReportsData {
  missions: MissionListItem[];
  selected: string;
  report: MissionReportData | null;
  reportError: string | null;
}

function ReportToolbar({ missions, selected, onChange, onRefresh, report }: {
  missions: MissionListItem[];
  selected: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRefresh: () => void;
  report: ReportView | null;
}) {
  return (
    <header className="field-report-hero">
      <div className="field-report-brand"><span className="field-report-mark"><Icon name="list" size={19} /></span><div><span className="field-report-kicker">FIELD DOCUMENTATION</span><h2>Disaster response report</h2><p>One clear operational brief for the responding team and incident commander.</p></div></div>
      <div className="field-report-tools">
        <label htmlFor="report-disaster-select">Choose disaster
          <select id="report-disaster-select" value={selected} onChange={onChange}>
            {missions.length > 0 && <optgroup label="Registered missions">{missions.map((mission) => <option key={mission.mission_id} value={`mission:${mission.mission_id}`}>{reportOptionLabel(mission)}</option>)}</optgroup>}
            <optgroup label="Illustrative Tamil Nadu scenarios">{DEMO_REPORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
          </select>
        </label>
        <RefreshButton onClick={onRefresh} />
        <button type="button" className="btn btn-primary report-download-btn" disabled={!report} onClick={() => report && downloadMissionReport(report)}><Icon name="download" size={15} />Download PDF</button>
      </div>
    </header>
  );
}

const formatDate = (value: string) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

function SectionTitle({ number, title, note }: { number: string; title: string; note?: string }) {
  return <div className="field-report-section-title"><span>{number}</span><div><h2>{title}</h2>{note && <small>{note}</small>}</div></div>;
}

export function ReportsPage() {
  const [selection, setSelection] = useState('');
  const { data, error, loading, refresh, loadedKey } = useAsyncData<ReportsData>(async (signal) => {
    const missions = await api.listMissions(signal);
    const selected = selection || (missions.length ? `mission:${missions[missions.length - 1].mission_id}` : 'demo:chennai');
    if (!selected.startsWith('mission:')) return { missions, selected, report: null, reportError: null };
    const missionId = selected.slice('mission:'.length);
    try {
      const report = await api.report(missionId, signal);
      return { missions, selected, report, reportError: null };
    } catch (reportError) {
      return { missions, selected, report: null, reportError: reportError instanceof Error ? reportError.message : 'Mission report could not be loaded.' };
    }
  }, [selection]);

  const stale = loading && loadedKey !== null && loadedKey !== JSON.stringify([selection]);
  if (loading && (!data || stale)) return <LoadingBlock label="Preparing disaster report…" />;
  const missions = data?.missions ?? [];
  const selected = data?.selected || selection || (missions.length ? `mission:${missions[missions.length - 1].mission_id}` : 'demo:chennai');
  const report: ReportView | null = data?.report ? liveReport(data.report) : selected.startsWith('demo:') ? demoReport(selected.replace('demo:', '')) : null;
  const pendingDecisions = report?.decisions.filter((decision) => ['PENDING', 'TIMEOUT'].includes(decision.status)) ?? [];
  const lowConfidence = report?.agents.filter((agent) => agent.confidence !== null && agent.confidence < 0.5) ?? [];

  const handleSelection = (event: ChangeEvent<HTMLSelectElement>) => setSelection(event.target.value);

  if (!report) {
    return <div className="page-stack field-report-page">
      <ReportToolbar missions={missions} selected={selected} onChange={handleSelection} onRefresh={refresh} report={null} />
      <div className="report-source-notice" role="status"><Icon name="info" size={14} />{data?.reportError || 'Select a registered mission or an illustrative scenario to prepare a report.'} No PDF was generated because mission data could not be loaded.</div>
    </div>;
  }

  return (
    <div className="page-stack field-report-page">
      <ReportToolbar missions={missions} selected={selected} onChange={handleSelection} onRefresh={refresh} report={report} />

      {error && <ErrorNote message={error} onRetry={refresh} />}
      {data?.reportError && <div className="report-source-notice"><Icon name="info" size={14} />The selected mission report endpoint was unavailable: {data.reportError}</div>}

      <article className="field-report-document">
        <div className="report-document-top">
          <div><span className="report-document-kicker">{report.demo ? 'ILLUSTRATIVE SCENARIO REPORT' : 'MISSION OPERATIONS REPORT'}</span><h1>{report.title}</h1><p>{report.incident}</p></div>
          <div className="report-risk-stamp"><span>RISK LEVEL</span><strong className={`risk-${report.riskLevel.toLowerCase()}`}>{report.riskLevel}</strong>{report.riskScore !== null && <small>Score {report.riskScore.toFixed(2)} / 1.00</small>}</div>
        </div>
        {report.demo && <div className="report-demo-banner"><span>SIMULATED DATA</span> This report is fictional planning information. It is not live sensing, verified inventory, or a dispatch order.</div>}

        <div className="report-meta-strip">
          <div><span>REPORT ID</span><strong>{report.missionId}</strong></div>
          <div><span>REGION</span><strong>{report.region}</strong></div>
          <div><span>MISSION STAGE</span><strong>{report.stage}</strong></div>
          <div><span>LAST UPDATED</span><strong>{formatDate(report.generatedAt || report.createdAt)}</strong></div>
          <div><span>MISSION STATE</span><strong>{report.isRunning ? 'Response running' : report.demo ? 'Scenario preview' : report.stage}</strong></div>
        </div>

        {(report.needsReview || pendingDecisions.length > 0 || lowConfidence.length > 0 || (report.riskScore ?? 0) > 0.8) && (
          <section className="report-command-flags" aria-label="Command attention items">
            <div className="report-command-flags-title"><Icon name="alert" size={15} /><strong>Command attention</strong></div>
            <ul>
              {(report.riskScore ?? 0) > 0.8 && <li>Risk score exceeds 0.8: notify the supervisor and confirm entry controls.</li>}
              {lowConfidence.map((agent) => <li key={agent.key}>{agent.name} confidence is below 0.50: request manual verification.</li>)}
              {pendingDecisions.length > 0 && <li>{pendingDecisions.length} resource or safety approval(s) remain pending; wait for an operator decision.</li>}
              {report.needsReview && !pendingDecisions.length && <li>Mission summary flags this report for human review.</li>}
            </ul>
          </section>
        )}

        <div className="report-summary-grid">
          <div className="report-summary-card report-risk-card"><span>OVERALL RISK</span><strong>{report.riskLevel}</strong><small>{report.riskScore === null ? 'Score not recorded' : `Risk score ${report.riskScore.toFixed(2)}`}</small></div>
          <div className="report-summary-card"><span>ESTIMATED VICTIMS</span><strong>{report.victimTotal}</strong><small>Primary search: {report.primaryZone}</small></div>
          <div className="report-summary-card"><span>RESOURCE PLAN</span><strong>{report.assignments.length} package(s)</strong><small>{report.resourceStatus}</small></div>
          <div className="report-summary-card"><span>AGENT CONFIDENCE</span><strong>{report.riskConfidence === null ? '—' : `${Math.round(report.riskConfidence * 100)}%`}</strong><small>Risk Assessment Agent</small></div>
        </div>

        <div className="field-report-columns">
          <Panel title="Situation and risk" tag="01 / 06">
            <div className="report-section-content">
              <SectionTitle number="01" title="Hazards and recommendation" />
              <p className="report-recommendation">{report.recommendation || 'No recommendation recorded for this mission.'}</p>
              {report.hazards.length > 0 ? <ul className="report-hazard-list">{report.hazards.map((hazard, index) => <li key={`${index}-${hazard}`}><span>{String(index + 1).padStart(2, '0')}</span>{hazard}</li>)}</ul> : <p className="report-muted">No hazards recorded in the selected mission data.</p>}
              <div className="report-keyline"><span>Risk agent confidence</span><strong>{report.riskConfidence === null ? 'Not recorded' : `${Math.round(report.riskConfidence * 100)}%`}</strong></div>
            </div>
          </Panel>

          <Panel title="Victim localization" tag="02 / 06">
            <div className="report-section-content">
              <SectionTitle number="02" title="Search priorities" note={`Estimated total: ${report.victimTotal}`} />
              <div className="report-zone-list">
                {report.zones.length ? report.zones.map((zone, index) => <div className="report-zone-row" key={`${zone.zone}-${index}`}><span className="report-zone-priority">P{zone.priority}</span><div><strong>{zone.zone}</strong><small>{zone.estimate !== '—' ? `${zone.estimate} estimated` : 'Victim count not separately estimated'}</small></div><div className="report-probability"><strong>{zone.probability === null ? '—' : `${Math.round(zone.probability * 100)}%`}</strong><span>location probability</span><i><b style={{ width: `${Math.min(100, Math.max(0, (zone.probability ?? 0) * 100))}%` }} /></i></div></div>) : <p className="report-muted">Victim zones are not mapped in this mission.</p>}
              </div>
              <div className="report-primary-zone"><span>PRIMARY SEARCH AREA</span><strong>{report.primaryZone}</strong></div>
            </div>
          </Panel>

          <Panel title="Rescue plan and tasks" tag="03 / 06" className="report-wide-panel">
            <div className="report-section-content">
              <SectionTitle number="03" title="Field sequence" note="Follow access and safety clearance at each stage" />
              <div className="report-entry-gate"><span>ENTRY / ACCESS GATE</span><p>{report.entryClearance}</p></div>
              <div className="report-task-list">
                {report.tasks.length ? report.tasks.map((task, index) => <article className="report-task-row" key={`${index}-${task.task}`}><span className="report-task-step">{String(index + 1).padStart(2, '0')}</span><div className="report-task-body"><strong>{task.task}</strong><small>{task.evaluation}</small></div><div className="report-task-owner"><span>RESPONSIBLE AGENT</span><strong>{task.agent}</strong><small>{task.confidence === null ? 'Confidence not recorded' : `${Math.round(task.confidence * 100)}% confidence`}</small></div><Badge tone={task.status === 'COMPLETE' || task.status === 'ASSESSED' ? 'green' : 'blue'}>{task.status}</Badge></article>) : <p className="report-muted">No task sequence is recorded. Review the rescue guidance before entry.</p>}
              </div>
              {report.rescueOrder.length > 0 && <div className="report-order-strip"><span>RESCUE ORDER</span>{report.rescueOrder.map((step, index) => <div key={`${index}-${step}`}><b>{index + 1}</b>{step}</div>)}</div>}
              <div className="report-safety-grid"><div><span>SAFETY CONSTRAINTS</span>{report.safety.length ? <ul>{report.safety.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No specific constraints recorded.</p>}</div><div><span>TRIAGE AND COMMS</span>{report.triage.length ? <ul>{report.triage.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Triage counts not recorded.</p>}<p>{report.comms}</p></div></div>
            </div>
          </Panel>

          <Panel title="Resource staging" tag="04 / 06">
            <div className="report-section-content">
              <SectionTitle number="04" title="Proposed assignments" note={report.utilization === null ? 'Mission data only' : `${Math.round(report.utilization * 100)}% reported utilization`} />
              {report.assignments.length ? <div className="report-resource-list">{report.assignments.map((item) => <div key={item.id} className="report-resource-row"><span className="report-resource-id">{item.id}</span><div><strong>{item.type}</strong><small>{item.assignedTo}</small></div><span className="report-resource-zone">{item.zone}</span><Badge tone={/clearance|pending/i.test(item.status) ? 'orange' : 'blue'}>{item.status}</Badge></div>)}</div> : <p className="report-muted">No resource assignments are recorded in this mission. Do not interpret an empty list as available inventory.</p>}
              {report.bottlenecks.length > 0 && <div className="report-bottlenecks"><span>LOGISTICS CONSTRAINTS</span><ul>{report.bottlenecks.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            </div>
          </Panel>

          <Panel title="Agent evaluation" tag="05 / 06" className="report-wide-panel">
            <div className="report-section-content">
              <SectionTitle number="05" title="What each agent evaluated" note="Confidence is shown per agent; it is not a guarantee of outcome." />
              <div className="report-agent-matrix">
                {report.agents.map((agent) => <article key={agent.key} className="report-agent-row"><div className="report-agent-title"><strong>{agent.name}</strong><span>{agent.status}</span></div><p>{agent.responsibility}</p><div className="report-agent-meter"><div><span>CONFIDENCE</span><strong>{agent.confidence === null ? 'Not recorded' : `${Math.round(agent.confidence * 100)}%`}</strong></div><i><b style={{ width: `${Math.min(100, Math.max(0, (agent.confidence ?? 0) * 100))}%` }} /></i></div><small className="report-agent-eval">{agent.evaluation}</small></article>)}
              </div>
            </div>
          </Panel>

          <Panel title="Approvals and references" tag="06 / 06">
            <div className="report-section-content">
              <SectionTitle number="06" title="Operator decisions" />
              {report.decisions.length ? <div className="report-decisions-list">{report.decisions.map((decision) => <div key={decision.id}><Badge tone={decision.status === 'PENDING' ? 'orange' : 'green'}>{decision.status}</Badge><strong>{decision.summary}</strong><small>{decision.id} · {decision.agent} · {decision.raisedAt ? formatDate(decision.raisedAt) : 'demo record'}</small></div>)}</div> : <p className="report-muted">No operator decisions are recorded for this mission.</p>}
              {report.sops.length > 0 && <div className="report-reference-block"><span>KNOWLEDGE REFERENCES</span><ul>{report.sops.map((item) => <li key={item}>{item}</li>)}{report.knowledgeNotes.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              <div className="report-reference-block"><span>ENVIRONMENT / TELEMETRY</span><p>{report.weather}</p><small>{report.telemetryCount} packet(s) recorded{report.telemetry.length ? ` · latest: ${report.telemetry.slice(0, 3).join(' / ')}` : ''}</small></div>
            </div>
          </Panel>
          <Panel title="Recent mission activity" tag={`${report.activity.length} events`} className="report-wide-panel">
            <div className="report-activity-list">
              {report.activity.length ? report.activity.map((event, index) => <div key={`${index}-${event}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{event}</p></div>) : <p className="report-muted">No timeline events have been recorded for this mission.</p>}
            </div>
          </Panel>
        </div>

        <footer className="field-report-footer"><span>INZORA TERRA · RESCUE OPERATIONS</span><p>{report.sourceNote} Verify changing hazards, access, and command clearance before field action.</p><button type="button" className="btn btn-primary report-download-btn" onClick={() => downloadMissionReport(report)}><Icon name="download" size={15} />Download this report</button></footer>
      </article>
    </div>
  );
}
