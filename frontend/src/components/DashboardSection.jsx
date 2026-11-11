/**
 * DashboardSection - mission dashboard.
 *
 * Presentation-only view over the existing mission context. The component keeps
 * the current telemetry, agent, summary, and timeline contracts intact while
 * giving the command team a clearer operational readout.
 */

import { useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  MapPinned,
  Radio,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Siren,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'
import { resolveDecision } from '@/services/missionService'
import RescueMap from '@/components/RescueMap'

const ZONE_LAYOUT = [
  { id: 'north_wall', label: 'North annex' },
  { id: 'basement', label: 'Basement' },
  { id: 'east_wall', label: 'East annex' },
  { id: 'south_wall', label: 'South annex' },
  { id: 'perimeter', label: 'Perimeter' },
]

const RISK = {
  critical: { label: 'Critical', color: '#DC4545' },
  high: { label: 'High', color: '#d97706' },
  monitor: { label: 'Monitor', color: '#2563EB' },
  stable: { label: 'Stable', color: '#15966A' },
  unknown: { label: 'Unavailable', color: '#64748b' },
}

function riskFor(intensity) {
  if (intensity == null) return RISK.unknown
  if (intensity >= 0.75) return RISK.critical
  if (intensity >= 0.5) return RISK.high
  if (intensity >= 0.25) return RISK.monitor
  return RISK.stable
}

function formatStage(stage) {
  return String(stage || 'initialized').replaceAll('_', ' ')
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatValue(value) {
  return value == null || value === '' ? '—' : String(value)
}

function Panel({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-[#E2E7EE] bg-white shadow-[0_1px_3px_rgba(23,32,51,0.06)] ${className}`}>
      {children}
    </div>
  )
}

function PanelHeader({ eyebrow, title, meta, icon: Icon = Activity }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E2E7EE] px-5 py-4 md:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E7EE] bg-[#F7F8FA] text-[#2563EB]">
          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-[#536176]">{eyebrow}</p>
          <h3 className="truncate text-base font-semibold tracking-wide text-[#172033]">{title}</h3>
        </div>
      </div>
      {meta && <span className="shrink-0 text-right text-xs font-medium tracking-[0.04em] text-[#536176]">{meta}</span>}
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'cyan' }) {
  const tones = {
    cyan: 'text-[#2563EB] bg-blue-50 border-blue-100',
    amber: 'text-[#D97706] bg-amber-50 border-amber-100',
    rose: 'text-[#DC4545] bg-rose-50 border-rose-100',
    emerald: 'text-[#15966A] bg-emerald-50 border-emerald-100',
    slate: 'text-[#536176] bg-slate-50 border-slate-200',
  }

  return (
    <div className="rounded-2xl border border-[#E2E7EE] bg-white p-4 shadow-[0_1px_3px_rgba(23,32,51,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-[0.06em] text-[#536176]">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="font-mono text-3xl font-semibold tracking-tight text-[#172033] tabular-nums">{value}</span>
        <span className="text-right text-xs leading-4 text-[#536176]">{detail}</span>
      </div>
    </div>
  )
}

function ReportLine({ label, value, tone = 'text-slate-200' }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E2E7EE] py-2.5 last:border-0">
      <span className="text-sm text-[#536176]">{label}</span>
      <span className={`max-w-[68%] text-right text-sm leading-5 ${tone.replaceAll('text-slate-200', 'text-[#172033]')}`}>{formatValue(value)}</span>
    </div>
  )
}

const OPERATIONAL_AGENTS = [
  { id: 'risk', label: 'Risk Agent', source: 'Structural and environmental assessment' },
  { id: 'victim', label: 'Victim Agent', source: 'Potential victim indicators' },
  { id: 'resource', label: 'Resource Agent', source: 'Resource readiness and allocation' },
  { id: 'knowledge', label: 'Knowledge Agent', source: 'SOPs and building guidance' },
]

function agentState(status) {
  if (status === 'active') return { label: 'Running', color: '#2563EB' }
  if (status === 'completed') return { label: 'Completed', color: '#15966A' }
  if (status === 'error') return { label: 'Failed', color: '#DC4545' }
  return { label: 'Pending', color: '#526078' }
}

function Unavailable({ children = 'Unavailable from current mission data.' }) {
  return <p className="text-sm leading-6 text-[#526078]">{children}</p>
}

function RiskIntelligence({ report }) {
  const hazards = Array.isArray(report.hazards) ? report.hazards : []
  const hasAssessment = Object.keys(report).length > 0
  return (
    <Panel>
      <PanelHeader eyebrow="Risk intelligence" title="Structural assessment" meta={hasAssessment ? 'Assessed finding' : 'Awaiting assessment'} icon={ShieldAlert} />
      <div className="space-y-5 p-5 md:p-6">
        {!hasAssessment ? <Unavailable /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#E2E7EE] bg-[#F5F7FA] p-3">
                <p className="text-xs text-[#526078]">Severity</p>
                <p className="mt-1 text-lg font-semibold text-[#172033]">{formatValue(report.likelihood)}</p>
              </div>
              <div className="rounded-xl border border-[#E2E7EE] bg-[#F5F7FA] p-3">
                <p className="text-xs text-[#526078]">Risk score</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#172033]">{typeof report.risk_score === 'number' ? report.risk_score.toFixed(2) : '—'}</p>
              </div>
              <div className="rounded-xl border border-[#E2E7EE] bg-[#F5F7FA] p-3">
                <p className="text-xs text-[#526078]">Confidence</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#172033]">{typeof report.confidence === 'number' ? report.confidence.toFixed(2) : '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-[#172033]">Identified hazards</p>
              {hazards.length ? <ul className="space-y-2">{hazards.map((hazard, index) => <li key={`${hazard}-${index}`} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm leading-5 text-[#172033]"><span className="mr-2 text-[#DC4545]">•</span>{hazard}</li>)}</ul> : <Unavailable>No hazards were reported by the Risk Agent.</Unavailable>}
            </div>
            <div className="border-t border-[#E2E7EE] pt-4">
              <p className="text-xs font-semibold text-[#526078]">Recommendation</p>
              <p className="mt-1 text-sm leading-6 text-[#172033]">{formatValue(report.recommendation)}</p>
              {report.reasoning && <><p className="mt-3 text-xs font-semibold text-[#526078]">Assessment rationale</p><p className="mt-1 text-sm leading-6 text-[#172033]">{report.reasoning}</p></>}
              <p className="mt-3 text-xs text-[#526078]">Assessment source: Risk Agent report. Sensor readings remain observations, not confirmed structural outcomes.</p>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function VictimIntelligence({ report }) {
  const zones = Array.isArray(report.zones) ? report.zones : []
  const hasAssessment = Object.keys(report).length > 0
  return (
    <Panel>
      <PanelHeader eyebrow="Victim intelligence" title="Potential indicators" meta={hasAssessment ? `${zones.length} indicator${zones.length === 1 ? '' : 's'}` : 'Awaiting assessment'} icon={Users} />
      <div className="p-5 md:p-6">
        {!hasAssessment ? <Unavailable /> : zones.length ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-[#79520b]">Indicators are unconfirmed. They require field verification before being treated as victims.</div>
            {zones.map((zone, index) => (
              <div key={`${zone.zone || 'zone'}-${index}`} className="rounded-xl border border-[#E2E7EE] bg-[#F5F7FA] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-semibold text-[#172033]">Zone {formatValue(zone.zone)}</p><p className="mt-1 text-xs text-[#526078]">{formatValue(zone.level)} · source: {formatValue(zone.source)}</p></div>
                  <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-[#D97706]">{formatValue(zone.priority)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#526078]">
                  <span>Probability: <strong className="text-[#172033]">{typeof zone.probability === 'number' ? zone.probability.toFixed(2) : '—'}</strong></span>
                  <span>Confidence: <strong className="text-[#172033]">{typeof zone.confidence === 'number' ? zone.confidence.toFixed(2) : '—'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        ) : <Unavailable>No potential victim indicators were reported.</Unavailable>}
      </div>
    </Panel>
  )
}

function ResourceReadiness({ report }) {
  const assignments = Array.isArray(report.assignments) ? report.assignments : []
  const hasAssessment = Object.keys(report).length > 0
  return (
    <Panel>
      <PanelHeader eyebrow="Resource readiness" title="Available response plan" meta={hasAssessment ? `${assignments.length} recommendation${assignments.length === 1 ? '' : 's'}` : 'Awaiting assessment'} icon={Siren} />
      <div className="space-y-4 p-5 md:p-6">
        {!hasAssessment ? <Unavailable /> : assignments.length ? assignments.map((assignment, index) => (
          <div key={assignment.id || `${assignment.zone}-${index}`} className="rounded-xl border border-[#E2E7EE] bg-[#F5F7FA] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#172033]">{formatValue(assignment.type)} · Zone {formatValue(assignment.zone)}</p><span className="text-xs font-semibold text-[#D97706]">{formatValue(assignment.priority)}</span></div>
            <div className="mt-2 grid gap-1 text-xs text-[#526078] sm:grid-cols-3"><span>Team: <strong className="text-[#172033]">{formatValue(assignment.assigned_to)}</strong></span><span>ETA: <strong className="text-[#172033]">{assignment.eta_minutes == null ? '—' : `${assignment.eta_minutes} min`}</strong></span><span>Equipment: <strong className="text-[#172033]">{Array.isArray(assignment.equipment) && assignment.equipment.length ? assignment.equipment.join(', ') : 'Unavailable'}</strong></span></div>
          </div>
        )) : <Unavailable>No resource assignments were recommended.</Unavailable>}
        {Array.isArray(report.bottlenecks) && report.bottlenecks.length > 0 && <div className="border-t border-[#E2E7EE] pt-3"><p className="text-xs font-semibold text-[#526078]">Constraints</p><p className="mt-1 text-sm text-[#172033]">{report.bottlenecks.join(' · ')}</p></div>}
        <p className="text-xs text-[#526078]">Recommendations remain subject to operator approval. No dispatch is performed by this panel.</p>
      </div>
    </Panel>
  )
}

function AgentActivity({ agents }) {
  const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]))
  return (
    <Panel>
      <PanelHeader eyebrow="Agent activity" title="Operational analysis chain" meta="Four specialist agents" icon={Activity} />
      <div className="divide-y divide-[#E2E7EE] px-5 md:px-6">
        {OPERATIONAL_AGENTS.map((definition) => {
          const agent = byId[definition.id]
          const state = agentState(agent?.status)
          const output = agent?.report || agent?.reasoning
          return <div key={definition.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} /><p className="text-sm font-semibold text-[#172033]">{definition.label}</p><span className="rounded-full border border-[#E2E7EE] bg-[#F5F7FA] px-2 py-0.5 text-xs text-[#526078]">{state.label}</span></div><p className="mt-1 text-xs text-[#526078]">{definition.source}</p>{output && <p className="mt-2 text-sm leading-5 text-[#172033]">{output}</p>}</div><div className="shrink-0 text-xs text-[#526078]">{agent?.latency == null ? 'Execution time unavailable' : `${agent.latency} ms`}</div></div>
        })}
      </div>
    </Panel>
  )
}

function DecisionPanel({ decisions, missionId, reports }) {
  const [resolving, setResolving] = useState(null)
  const [resolved, setResolved] = useState({})
  const [error, setError] = useState('')

  const pending = decisions.filter((decision) => decision.status === 'pending' && !resolved[decision.id])

  async function handleResolve(decision, action) {
    if (!missionId || resolving) return
    setResolving(decision.id)
    setError('')
    try {
      await resolveDecision(
        missionId,
        decision.id,
        action,
        action === 'approve' ? 'Approved by operator via dashboard.' : 'Overridden by operator via dashboard.'
      )
      setResolved((current) => ({ ...current, [decision.id]: action }))
    } catch (resolutionError) {
      setError(resolutionError?.status === 401
        ? 'Authorization rejected. Check the configured operator key.'
        : 'Resolution failed. Retry or resolve from the API directly.')
    } finally {
      setResolving(null)
    }
  }

  return (
    <Panel className="mt-5">
      <PanelHeader eyebrow="Operator decision" title="Recommendations awaiting review" meta={pending.length ? `${pending.length} pending` : 'No pending action'} icon={ShieldAlert} />
      <div className="p-5 md:p-6">
        {pending.length ? (
          <div className="space-y-4">
            {pending.map((decision) => {
              const related = reports[decision.related_agent] || {}
              const evidence = related.risk_score != null
                ? `Risk score ${related.risk_score}`
                : related.total_victims_estimated != null
                  ? `${related.total_victims_estimated} estimated victims`
                  : related.utilization != null
                    ? `Resource utilization ${Math.round(related.utilization * 100)}%`
                    : 'Supporting evidence is recorded in the linked agent report.'
              return (
                <div key={decision.id} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-6 text-white">{decision.summary}</p>
                      <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                        <div><p className="text-slate-500">Reason</p><p className="mt-1 leading-5 text-slate-300">{decision.request_type === 'verify' ? 'Confidence threshold requires manual verification.' : 'Mission trigger requires operator authorization.'}</p></div>
                        <div><p className="text-slate-500">Evidence</p><p className="mt-1 leading-5 text-slate-300">{evidence}</p></div>
                        <div><p className="text-slate-500">Source</p><p className="mt-1 leading-5 text-slate-300">{decision.related_agent || 'Mission engine'}</p></div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 lg:w-52 lg:flex-col">
                      <button type="button" disabled={Boolean(resolving)} onClick={() => handleResolve(decision, 'approve')} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200 transition-colors hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                        <ShieldCheck aria-hidden="true" className="h-4 w-4" />{resolving === decision.id ? 'Approving…' : 'Approve'}
                      </button>
                      <button type="button" disabled={Boolean(resolving)} onClick={() => handleResolve(decision, 'override')} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-rose-300/30 bg-rose-300/10 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-200 transition-colors hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
                        <ShieldX aria-hidden="true" className="h-4 w-4" />{resolving === decision.id ? 'Overriding…' : 'Override'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-4 py-5">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-slate-500" />
            <p className="text-xs leading-5 text-slate-500">No pending recommendations. Any future operational recommendation will appear here before dispatch.</p>
          </div>
        )}
      </div>
    </Panel>
  )
}

function DashboardSection() {
  const { state } = useMissionContext()
  const live = state.telemetryLive || {}
  const isLive = Object.keys(live).length > 0 || Boolean(state.telemetry)
  const briefing = state.summary?.mission_briefing || {}
  const agentEntries = state.agents || []
  const reports = Object.fromEntries(agentEntries.map((agent) => [agent.id, agent.report_full || {}]))
  const riskReport = reports.risk || {}
  const victimReport = reports.victim || {}
  const resourceReport = reports.resource || {}

  const zones = ZONE_LAYOUT.map((zone) => {
    const tilt = live[`${zone.id}|tilt`]?.value
    const stress = live[`${zone.id}|stress`]?.value
    const hasSignal = tilt != null || stress != null
    const intensity = !hasSignal
      ? null
      : Math.min(1, (tilt != null ? Math.min(1, Math.abs(tilt) / 10) * 0.6 : 0) + (stress != null ? Math.min(1, stress / 100) * 0.4 : 0))
    return { ...zone, intensity, risk: riskFor(intensity) }
  })

  const measuredZones = zones.filter((zone) => zone.intensity != null)
  const specialistAgents = agentEntries.filter((agent) => OPERATIONAL_AGENTS.some((definition) => definition.id === agent.id))
  const activeSpecialists = specialistAgents.filter((agent) => agent.status === 'active').length
  const criticalZones = measuredZones.filter((zone) => zone.intensity >= 0.75).length
  const overallRisk = briefing.overall_risk || riskReport.likelihood || 'UNAVAILABLE'
  const victims = briefing.total_victims_estimated ?? victimReport.total_victims_estimated
  const activeRiskZones = Array.isArray(victimReport.zones) ? victimReport.zones.length : 0
  const latestEvents = (state.timeline || []).slice(-10)
  const connectionLive = state.connectionStatus === 'connected'

  return (
    <section id="mission-dashboard" className="scroll-mt-20 px-4 py-12 text-[#172033] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[#2563EB]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              Situation report
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#172033] md:text-[34px]">Mission dashboard</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[#536176]">A live operational view of structural risk, agent findings, and response readiness.</p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-xl border border-[#E2E7EE] bg-white px-3 py-2 md:self-auto">
            {connectionLive ? <Wifi aria-hidden="true" className="h-4 w-4 text-[#15966A]" /> : <WifiOff aria-hidden="true" className="h-4 w-4 text-[#536176]" />}
            <span className="text-xs font-semibold tracking-[0.04em] text-[#536176]">{connectionLive ? 'Uplink connected' : 'Uplink unavailable'}</span>
          </div>
        </div>

        <Panel className="mb-5">
          <PanelHeader eyebrow="Primary spatial view" title="Rescue map" meta={isLive ? 'Telemetry available' : 'Orientation only'} icon={MapPinned} />
          <RescueMap state={state} />
        </Panel>

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Mission briefing posture" value={String(overallRisk).toUpperCase()} detail={criticalZones ? `${criticalZones} measured critical zone${criticalZones === 1 ? '' : 's'}` : 'Mission summary output'} icon={ShieldAlert} tone={String(overallRisk).toUpperCase() === 'CRITICAL' ? 'rose' : String(overallRisk).toUpperCase() === 'UNAVAILABLE' ? 'slate' : 'amber'} />
          <MetricCard label="Potential victims" value={formatValue(victims)} detail={activeRiskZones ? `${activeRiskZones} reported search zone${activeRiskZones === 1 ? '' : 's'}` : 'No victim map reported'} icon={Users} tone="cyan" />
          <MetricCard label="Specialists active" value={`${activeSpecialists}/4`} detail={specialistAgents.length ? 'Risk, victim, resource, knowledge' : 'No specialist status received'} icon={Activity} tone="emerald" />
          <MetricCard label="Telemetry feed" value={isLive ? 'AVAILABLE' : 'UNAVAILABLE'} detail={state.telemetry ? 'Latest packet received' : 'No telemetry packet'} icon={Radio} tone={isLive ? 'emerald' : 'slate'} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <RiskIntelligence report={riskReport} />
          <VictimIntelligence report={victimReport} />
          <ResourceReadiness report={resourceReport} />
          <AgentActivity agents={agentEntries} />
        </div>

        <Panel className="mt-5">
          <PanelHeader eyebrow="Mission activity" title="Chronological event history" meta={latestEvents.length ? `${latestEvents.length} recent events` : 'Awaiting events'} icon={CheckCircle2} />
          <div className="p-5 md:p-6">
            {latestEvents.length ? <div className="divide-y divide-[#E2E7EE]">{latestEvents.map((event, index) => (
              <div key={`${event.time}-${event.agent}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-[#526078]">{formatTime(event.time)}</span>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color || '#2563EB' }} />
                <div className="min-w-0"><p className="text-sm leading-5 text-[#172033]">{event.message || 'Event recorded'}</p><p className="mt-1 text-xs text-[#526078]">{event.agent}{event.stage ? ` · ${event.stage}` : ''}</p></div>
              </div>
            ))}</div> : <Unavailable>Mission activity will appear here once the stream is active.</Unavailable>}
          </div>
        </Panel>

        <DecisionPanel decisions={state.decisions || []} missionId={state.mission?.mission_id} reports={reports} />

        <Panel className="mt-5">
          <PanelHeader eyebrow="Mission context" title="Incident brief" meta={state.mission?.is_running ? 'Live response' : 'Standby'} icon={ArrowUpRight} />
          <div className="grid gap-4 p-5 md:grid-cols-[1.3fr_0.7fr] md:p-6">
            <p className="text-sm leading-6 text-slate-300">{state.mission?.incident_text || 'Authorize a mission to begin collecting structural and victim-location intelligence.'}</p>
            <div className="rounded-xl border border-white/[0.07] bg-[#0c1117] p-4 text-xs">
              <ReportLine label="Stage" value={state.mission ? formatStage(state.mission.stage) : null} />
              <ReportLine label="Connection" value={state.connectionStatus} />
              <ReportLine label="Summary" value={state.summary ? 'Available' : 'Unavailable'} />
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

export default DashboardSection
