/**
 * AgentSection - The one-by-one agent report stream.
 *
 * Agents run strictly sequentially (risk → victim → resource → knowledge → rescue →
 * briefing). Each panel reveals in pipeline order with the agent's FULL report — never a
 * summary — plus the "consumed from" handoff provenance, so you can follow every report
 * into the next agent's analysis and finally the mission summary.
 */

import { motion } from 'framer-motion'
import { Shield, MapPin, Users, BookOpen, HeartPulse, Brain, ArrowDown } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'
import { SegmentedBar } from '@/components/hud'

const CHAIN = ['risk', 'victim', 'resource', 'knowledge', 'rescue', 'orchestrator']

const AGENT_ICONS = {
  risk: Shield,
  victim: MapPin,
  resource: Users,
  knowledge: BookOpen,
  rescue: HeartPulse,
  orchestrator: Brain,
}

const AGENT_COLORS = {
  risk: '#ef4444',
  victim: '#f59e0b',
  resource: '#22c55e',
  knowledge: '#a78bfa',
  rescue: '#22d3ee',
  orchestrator: '#3b82f6',
}

const AGENT_CODES = {
  risk: 'AG-01',
  victim: 'AG-02',
  resource: 'AG-03',
  knowledge: 'AG-04',
  rescue: 'AG-05',
  orchestrator: 'ORCH-01',
}

const AGENT_NAMES = {
  risk: 'Risk Assessment',
  victim: 'Victim Localization',
  resource: 'Resource Coordination',
  knowledge: 'Knowledge Retrieval',
  rescue: 'Rescue Coordination',
  orchestrator: 'Orchestrator',
}

/** Which report the previous agent handed to this one. */
const CONSUMED_FROM = {
  risk: 'live sensor & environment evidence',
  victim: 'risk_assessment',
  resource: 'victim_localization',
  knowledge: 'resource_coordination',
  rescue: 'knowledge_retrieval + all specialists',
  orchestrator: 'rescue_coordination + all reports',
}

const STATUS_BANNER = {
  active: { text: 'WORKING', color: '#22d3ee' },
  completed: { text: 'REPORT READY', color: '#22c55e' },
  error: { text: 'ERROR', color: '#ef4444' },
  idle: { text: 'STANDBY', color: '#6b7280' },
}

/** One labeled row of report data. */
function Row({ label, children, tone }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-white/[0.04] py-2.5 sm:grid-cols-[160px_1fr] sm:gap-5 last:border-0">
      <div className="pt-0.5 text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div className="min-w-0 text-[13px] leading-[1.75] text-white/72 sm:text-sm" style={tone ? { color: tone } : undefined}>
        {children}
      </div>
    </div>
  )
}

/** Full structured report per agent type — rendered in full, never truncated. */
function ReportBody({ id, data }) {
  if (!data || Object.keys(data).length === 0) return null

  if (id === 'risk') {
    return (
      <div className="space-y-0">
        <Row label="Likelihood"><span className="font-display font-semibold tracking-[0.1em] text-red-300">{String(data.likelihood || 'UNKNOWN')}</span></Row>
        <Row label="Risk Score">{typeof data.risk_score === 'number' ? data.risk_score.toFixed(2) : data.risk_score}</Row>
        <Row label="Trend">{data.trend || '—'}</Row>
        {Array.isArray(data.hazards) && data.hazards.length > 0 && (
          <Row label="Hazards">
            <ul className="space-y-1">{data.hazards.map((h, i) => <li key={i} className="flex gap-2"><span className="text-red-400">›</span>{h}</li>)}</ul>
          </Row>
        )}
        <Row label="Recommendation">{data.recommendation || '—'}</Row>
      </div>
    )
  }

  if (id === 'victim') {
    const zones = Array.isArray(data.zones) ? data.zones : []
    return (
      <div className="space-y-0">
        <Row label="Primary Zone"><span className="font-display font-semibold tracking-[0.1em] text-amber-300">{data.primary_search_zone || '—'}</span></Row>
        <Row label="Victims Est.">{data.total_victims_estimated ?? '—'}</Row>
        <Row label="Risk Context">{data.risk_context || '—'}</Row>
        {zones.length > 0 && (
          <Row label="Zones">
            <div className="space-y-1.5">
              {zones.map((z, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className="font-display font-semibold tracking-[0.1em] text-white/85">{z.zone}</span>
                  <span className="text-white/40">{z.level}</span>
                  <span className="text-amber-300/80 font-mono">{(z.probability * 100).toFixed(0)}%</span>
                  <span className="text-white/30">{z.source}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-display tracking-[0.14em] uppercase" style={{ background: `${z.priority === 'HIGH' ? '#f59e0b' : '#6b7280'}22`, color: z.priority === 'HIGH' ? '#fbbf24' : '#9ca3af' }}>
                    {z.priority}
                  </span>
                </div>
              ))}
            </div>
          </Row>
        )}
      </div>
    )
  }

  if (id === 'resource') {
    const assignments = Array.isArray(data.assignments) ? data.assignments : []
    return (
      <div className="space-y-0">
        <Row label="Utilization">{typeof data.utilization === 'number' ? `${(data.utilization * 100).toFixed(0)}%` : data.utilization}</Row>
        {assignments.length > 0 && (
          <Row label="Assignments">
            <div className="space-y-2">
              {assignments.map((a, i) => (
                <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-display font-semibold tracking-[0.08em] text-white/85">{String(a.type).toUpperCase()}</span>
                    <span className="font-mono text-[11px] text-emerald-300/80">Zone {a.zone}</span>
                    <span className="text-white/40">{a.assigned_to}</span>
                    <span className="text-white/30 font-mono text-[10px]">ETA {a.eta_minutes}m</span>
                  </div>
                  {Array.isArray(a.equipment) && a.equipment.length > 0 && (
                    <div className="mt-1 text-[10px] text-white/35">{a.equipment.join(' · ')}</div>
                  )}
                </div>
              ))}
            </div>
          </Row>
        )}
        {Array.isArray(data.bottlenecks) && data.bottlenecks.length > 0 && (
          <Row label="Bottlenecks">{data.bottlenecks.join(' · ')}</Row>
        )}
      </div>
    )
  }

  if (id === 'knowledge') {
    const sops = Array.isArray(data.sops) ? data.sops : []
    const codes = Array.isArray(data.building_codes) ? data.building_codes : []
    const recs = Array.isArray(data.recommendations) ? data.recommendations : []
    return (
      <div className="space-y-0">
        {sops.length > 0 && (
          <Row label="Matched SOPs">
            <div className="space-y-1.5">
              {sops.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-[12px]">
                  <span className="font-mono text-[10px] text-purple-300/80">{s.id}</span>
                  <span className="text-white/75">{s.title}</span>
                  <span className="text-white/35 font-mono ml-auto">{(s.relevance * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Row>
        )}
        {codes.length > 0 && (
          <Row label="Building Codes">
            <div className="space-y-1">
              {codes.map((c, i) => (
                <div key={i} className="text-[12px]"><span className="font-mono text-[10px] text-purple-300/80">{c.code}</span>{' '}<span className="text-white/70">{c.title}</span></div>
              ))}
            </div>
          </Row>
        )}
        {recs.length > 0 && (
          <Row label="Recommendations">
            <ul className="space-y-1">{recs.map((r, i) => <li key={i} className="flex gap-2"><span className="text-purple-400">›</span>{r}</li>)}</ul>
          </Row>
        )}
      </div>
    )
  }

  if (id === 'rescue') {
    const seq = Array.isArray(data.priority_sequence) ? data.priority_sequence : []
    const objectives = Array.isArray(data.objectives) ? data.objectives : []
    const constraints = Array.isArray(data.safety_constraints) ? data.safety_constraints : []
    const extraction = Array.isArray(data.extraction_guidance) ? data.extraction_guidance : []
    const clearance = String(data.entry_clearance || 'UNKNOWN')
    const clearanceColor = clearance === 'HOLD' ? '#ef4444' : clearance === 'CLEAR' ? '#22c55e' : '#f59e0b'
    return (
      <div className="space-y-0">
        <Row label="Entry Clearance"><span className="font-display font-semibold tracking-[0.12em]" style={{ color: clearanceColor }}>{clearance}</span></Row>
        {seq.length > 0 && (
          <Row label="Priority Seq">
            <div className="flex flex-wrap gap-1.5">
              {seq.map((z, i) => (
                <span key={i} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                  <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-display font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-[11px] font-display font-semibold tracking-[0.1em] text-white/80">{z}</span>
                </span>
              ))}
            </div>
          </Row>
        )}
        {objectives.length > 0 && (
          <Row label="Objectives">
            <ul className="space-y-1">{objectives.map((o, i) => <li key={i} className="flex gap-2"><span className="text-cyan-400">›</span>{o}</li>)}</ul>
          </Row>
        )}
        {constraints.length > 0 && (
          <Row label="Safety">
            <ul className="space-y-1">{constraints.map((c, i) => <li key={i} className="flex gap-2"><span className="text-red-400">›</span>{c}</li>)}</ul>
          </Row>
        )}
        {extraction.length > 0 && (
          <Row label="Extraction">
            <div className="space-y-1.5">
              {extraction.map((g, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[12px]">
                  <span className="font-display font-bold text-cyan-300 flex-shrink-0">{g.zone}</span>
                  <span className="text-white/70">{g.technique}</span>
                </div>
              ))}
            </div>
          </Row>
        )}
        {data.comms_guidance && <Row label="Comms">{data.comms_guidance}</Row>}
      </div>
    )
  }

  if (id === 'orchestrator') {
    const mb = (data.mission_briefing || {}) || {}
    const actions = Array.isArray(mb.immediate_actions) ? mb.immediate_actions : []
    return (
      <div className="space-y-0">
        <Row label="Overall Risk" tone={mb.overall_risk === 'HIGH' || mb.overall_risk === 'CRITICAL' ? '#f87171' : '#fbbf24'}>
          <span className="font-display font-semibold tracking-[0.12em]">{String(mb.overall_risk || 'UNKNOWN')}</span>
        </Row>
        <Row label="Priority Zones">{Array.isArray(mb.priority_zones) ? mb.priority_zones.join(', ') : '—'}</Row>
        <Row label="Victims Est.">{mb.total_victims_estimated ?? '—'}</Row>
        {actions.length > 0 && (
          <Row label="Actions">
            <ol className="space-y-1">{actions.map((a, i) => <li key={i} className="flex gap-2"><span className="text-amber-400 font-display font-bold">{i + 1}.</span>{a}</li>)}</ol>
          </Row>
        )}
        <Row label="Rescue Summary">
          {(mb.rescue_guidance || {}).summary || '—'}
        </Row>
      </div>
    )
  }

  // Fallback: render anything as labeled rows (flat dict).
  return (
    <div className="space-y-0">
      {Object.entries(data).filter(([k]) => !['cycle_id', 'as_of', 'confidence'].includes(k)).map(([k, v]) => {
          const label = String(v)
          return <Row key={k} label={label} />
        })}
    </div>
  )
}

function AgentSection() {
  const { state } = useMissionContext()
  const byId = Object.fromEntries(state.agents.map((a) => [a.id, a]))

  // The orchestrator's final summary comes from the compiled briefing.
  const briefing = state.summary?.mission_briefing || null

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-14">
          <div className="section-eyebrow mb-4">Multi-Agent System</div>
          <h2 className="section-title font-display text-3xl font-semibold tracking-[0.04em] md:text-4xl">Agent Report Stream</h2>
          <p className="reading-copy mt-3 font-mono text-xs">
            One agent at a time — each report is analysed by the next until the final summary.
          </p>
        </div>

        <div className="space-y-0">
          {CHAIN.map((id, idx) => {
            const agent = byId[id]
            const Icon = AGENT_ICONS[id]
            const color = agent?.color || AGENT_COLORS[id]
            const banner = agent ? (STATUS_BANNER[agent.status] || STATUS_BANNER.idle) : STATUS_BANNER.idle
            const hasReport = !!agent?.report_full
            const reportData = id === 'orchestrator' && briefing
              ? { mission_briefing: briefing }
              : agent?.report_full

            return (
              <div key={id}>
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: Math.min(idx * 0.06, 0.3), ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="glass-soft overflow-hidden rounded-2xl border border-[#E2E7EE] bg-white shadow-[0_1px_3px_rgba(23,32,51,0.06)]">
                    {/* Panel header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E7EE] bg-[#F7F8FA] px-6 py-4 md:px-7">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[#E2E7EE] bg-white">
                          <Icon className="h-5 w-5" style={{ color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-sm font-semibold tracking-[0.1em] text-white/90">
                            {AGENT_CODES[id]} · {AGENT_NAMES[id]}
                          </div>
                          <div className="mt-1 truncate font-mono text-[10px] text-white/35">
                            {id === 'orchestrator' ? 'compiles the final mission summary' : `consumed from: ${CONSUMED_FROM[id]}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {typeof agent?.confidence === 'number' && agent.confidence > 0 && (
                          <span className="text-xs font-mono" style={{ color }}>{(agent.confidence * 100).toFixed(0)}%</span>
                        )}
                        <span className="px-3 py-1 rounded-full border text-[10px] font-display font-semibold tracking-[0.2em] uppercase"
                          style={{ color: banner.color, borderColor: `${banner.color}40`, background: `${banner.color}10` }}>
                          {banner.text}
                        </span>
                      </div>
                    </div>

                    {/* Report body */}
                    <div className="px-6 py-6 md:px-7">
                      {agent?.status === 'active' && !hasReport ? (
                        <div className="flex items-center gap-3 text-[12px] font-display uppercase tracking-[0.18em]" style={{ color }}>
                          <div className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: color }} />
                          Analysing the handoff…
                        </div>
                      ) : reportData ? (
                        <ReportBody id={id} data={reportData} />
                      ) : agent?.report ? (
                        <p className="text-[13px] leading-[1.8] text-white/62">{agent.report}</p>
                      ) : (
                        <div className="font-mono text-[12px] text-white/30">Awaiting report — {AGENT_CODES[id]} has not run yet.</div>
                      )}

                      {/* Reasoning chain display */}
                      {agent?.reasoning && (
                        <div className="mt-4 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                            <span className="text-[10px] font-display font-semibold uppercase tracking-[0.2em]" style={{ color: `${color}cc` }}>
                              Agent Reasoning
                            </span>
                          </div>
                          <p className="text-[12px] leading-[1.8] text-white/55 font-mono">{agent.reasoning}</p>
                        </div>
                      )}

                      {agent && (agent.status === 'active' || agent.status === 'completed') && (
                        <div className="mt-4">
                          <SegmentedBar value={agent.confidence} color={color} segments={14} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Chain connector with inter-agent communication */}
                {idx < CHAIN.length - 1 && (
                  <div className="py-3 pl-7">
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col items-center gap-1">
                        <ArrowDown className="h-3.5 w-3.5" style={{ color: `${AGENT_COLORS[CHAIN[idx]]}60` }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-display font-semibold uppercase tracking-[0.2em] text-white/35">
                            {AGENT_CODES[CHAIN[idx]]} → {AGENT_CODES[CHAIN[idx + 1]]}
                          </span>
                          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                        </div>
                        {/* Show reasoning summary if available */}
                        {agent?.reasoning && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                            <p className="text-[10px] leading-[1.6] text-white/40 font-mono line-clamp-2">
                              {agent.reasoning}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default AgentSection
