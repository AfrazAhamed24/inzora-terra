/**
 * BriefingOverlay - Cinematic mission briefing (the "final report").
 *
 * Appears when the Orchestrator produces a briefing. Staggered reveal, D.E.X.T.E.R
 * narrates the summary aloud, and pending human decisions are surfaced with an
 * APPROVE action so the Commander can resolve the HITL gate in place.
 *
 * Typography: Rajdhani (font-display) for labels/headings, Inter for reading copy,
 * JetBrains Mono for identifiers — a clear hierarchy so dense agent output stays legible.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X, BrainCircuit, ShieldCheck, HeartPulse, Lock, Unlock, Waves, Target } from 'lucide-react'
import { voice } from '@/services/voice'

const RISK_COLOR = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
}

function Card({ label, value, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card rounded-xl p-4 min-h-[90px] flex flex-col justify-between"
    >
      <div>
        <div className="mb-2 text-[9px] font-display font-semibold uppercase tracking-[0.28em] text-white/45">{label}</div>
        <div className="font-display text-xl font-medium leading-snug md:text-2xl" style={{ color: color || 'rgba(250,250,250,0.92)' }}>
          {value}
        </div>
      </div>
    </motion.div>
  )
}

function SectionLabel({ children, tone = 'text-white/45', icon }) {
  return (
    <div className={`flex items-center gap-3 text-[10px] font-display font-semibold tracking-[0.3em] uppercase ${tone} mb-4`}>
      {icon && <span className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tone.includes('cyan') ? '#22d3ee' : tone.includes('red') ? '#ef4444' : '#f59e0b' }}>{icon}</span>}
      <span className="w-6 h-px bg-white/20" />
      {children}
    </div>
  )
}

export default function BriefingOverlay({
  briefing,
  confidence,
  needsHumanReview,
  decisions = [],
  stage,
  onResolve,
  onClose,
}) {
  const narrated = useRef(false)
  const [resolvingId, setResolvingId] = useState(null)
  const [approved, setApproved] = useState(false)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  const pending = decisions.filter((d) => d.status === 'pending')
  const missionComplete = stage === 'completed' || stage === 'stopped'

  // Dialog semantics + keyboard: focus the dismiss control on open, restore focus on
  // close, close on Escape, and trap Tab so focus can't leak into the page behind it.
  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  // Narrate the summary once, shortly after reveal (after the agent narration).
  useEffect(() => {
    if (narrated.current || !briefing) return
    narrated.current = true
    const t = window.setTimeout(() => {
      voice.sweep(300, 1100, 0.8)
      const risk = briefing.overall_risk || 'unknown'
      const zones = Array.isArray(briefing.priority_zones) ? briefing.priority_zones : []
      const victims = briefing.total_victims_estimated
      const actions = Array.isArray(briefing.immediate_actions) ? briefing.immediate_actions : []
      const parts = [`Mission briefing complete. Overall risk: ${risk}.`]
      if (zones.length) parts.push(`Priority zones: ${zones.join(', ')}.`)
      if (victims !== undefined && victims !== null) parts.push(`Estimated victims: ${victims}.`)
      if (actions.length) parts.push(`Immediate actions: ${actions.join(', ')}.`)
      const rescue = briefing.rescue_guidance
      if (rescue?.summary) {
        parts.push(`Rescue guidance: ${rescue.summary}.`)
        if (rescue.entry_clearance) {
          parts.push(`Entry clearance: ${rescue.entry_clearance.toLowerCase()}.`)
        }
      }
      parts.push('D.E.X.T.E.R standing by for your orders, Commander.')
      voice.speak(parts.join(' '))
    }, 4800)
    return () => clearTimeout(t)
  }, [briefing])

  const handleResolve = async (decision) => {
    if (resolvingId) return
    setResolvingId(decision.id)
    try {
      await onResolve?.(decision, 'approve')
      setApproved(true)
      voice.uiSound('ok')
      voice.speak('Approved, Commander. Deployment authorized. Executing.')
    } catch {
      voice.uiSound('alert')
      voice.speak('Approval failed. The decision could not be resolved.')
    } finally {
      setResolvingId(null)
    }
  }

  const risk = String(briefing.overall_risk || 'UNKNOWN').toUpperCase()
  const riskColor = RISK_COLOR[risk] || '#fafafa'
  const zones = Array.isArray(briefing.priority_zones) ? briefing.priority_zones : []
  const victims = briefing.total_victims_estimated
  const actions = Array.isArray(briefing.immediate_actions) ? briefing.immediate_actions : []
  const resources = briefing.resource_status
  const rescue = briefing.rescue_guidance
  const clearance = String(rescue?.entry_clearance || '').toUpperCase()
  const overallConfidence =
    confidence.overall_confidence ?? confidence.overall ?? briefing.overall_confidence
  const pct = overallConfidence !== undefined ? Math.round(Number(overallConfidence) * 100) : null

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[150] bg-[#09090b]/85 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6"
    >
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: `radial-gradient(circle, ${riskColor}12 0%, transparent 50%)` }}
        />
      </div>

      <div className="relative z-10 w-full max-w-3xl max-h-[min(88vh,calc(100vh-2rem))] overflow-y-auto overscroll-contain rounded-2xl bg-[#0c0c10]/90 border border-white/[0.06] shadow-2xl">
        <div className="px-5 sm:px-7 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-10"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 id="briefing-title" className="text-2xl md:text-3xl font-display font-semibold tracking-[0.2em] text-white/95">
                {missionComplete ? 'Mission Complete' : 'Mission Briefing'}
              </h2>
              <div className="text-[11px] font-display font-medium tracking-[0.36em] text-white/35 uppercase">
                {missionComplete ? 'Orchestrator · Final Report' : 'Orchestrator · Live Report'}
              </div>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            aria-label="Acknowledge and close briefing"
            title="Acknowledge"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>

        {/* HITL status */}
        {missionComplete && !needsHumanReview && !approved ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-8 flex items-center gap-3 px-5 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-display font-semibold tracking-[0.2em] text-emerald-300 uppercase">Mission complete</div>
              <div className="text-[11px] text-emerald-200/60 mt-0.5">
                All decisions resolved. Mission log archived, Commander.
              </div>
            </div>
          </motion.div>
        ) : pending.length > 0 && !approved ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-8 rounded-xl bg-amber-500/10 border border-amber-500/30"
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
              <div>
                <div className="text-xs font-display font-semibold tracking-[0.2em] text-amber-300 uppercase">
                  {pending.length} decision{pending.length > 1 ? 's' : ''} awaiting your approval
                </div>
                <div className="text-[11px] text-amber-200/60 mt-0.5">
                  No critical action is dispatched without your confirmation, Commander.
                </div>
              </div>
            </div>
            <div className="px-5 pb-4 space-y-3">
              {pending.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-white/40">{d.id}</div>
                    <div className="text-[13px] text-white/75 truncate">{d.summary}</div>
                  </div>
                  <button
                    onClick={() => handleResolve(d)}
                    disabled={!!resolvingId}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-display font-semibold tracking-[0.26em] uppercase transition-colors disabled:opacity-40"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {resolvingId === d.id ? 'Approving…' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        ) : approved ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center gap-3 px-5 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-display font-semibold tracking-[0.2em] text-emerald-300 uppercase">Approved by Commander</div>
              <div className="text-[11px] text-emerald-200/60 mt-0.5">
                Deployment authorized. Mission completing.
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Metric cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
        >
          <Card label="Overall Risk" value={risk} color={riskColor} delay={0.15} />
          <Card label="Priority Zones" value={zones.length ? zones.join(', ') : '—'} delay={0.22} />
          <Card label="Estimated Victims" value={victims ?? '—'} delay={0.29} />
          <Card label="Resource Status" value={resources || 'Pending'} delay={0.36} />
          <Card label="Overall Confidence" value={pct !== null ? `${pct}%` : '—'} color={pct !== null && pct >= 70 ? '#22c55e' : pct !== null && pct >= 50 ? '#f59e0b' : '#ef4444'} delay={0.43} />
        </motion.div>

        {/* Immediate actions — full-width numbered strip */}
        {actions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-card rounded-2xl p-5 mb-8"
          >
            <SectionLabel icon={<Target className="w-3.5 h-3.5" />}>Immediate Actions</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {actions.map((action, i) => (
                <div key={i} className="glass-soft flex items-start gap-3 rounded-xl border border-white/[0.06] p-4">
                  <span className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-display font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[14px] text-white/75 leading-[1.7]">{action}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Rescue guidance — the field-team handoff compiled by the Rescue Coordination Agent */}
        {rescue && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-soft mt-6 rounded-2xl border border-cyan-500/25"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                  <HeartPulse className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-display font-semibold tracking-[0.14em] text-white/95">Rescue Guidance</div>
                  <div className="text-[9px] font-display font-medium tracking-[0.28em] text-white/40 uppercase">
                    Field handoff · Rescue Coordination Agent
                  </div>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] font-display font-semibold tracking-[0.26em] uppercase ${
                  clearance === 'HOLD'
                    ? 'bg-red-500/10 border-red-500/40 text-red-300'
                    : clearance === 'CLEAR'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                }`}
              >
                {clearance === 'HOLD' ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                Entry: {clearance || 'UNKNOWN'}
              </div>
            </div>

            <div className="p-5 md:p-6 space-y-5">
              {rescue.summary && (
                <p className="reading-copy text-[14px] md:text-[15px] leading-[1.7]">
                  {rescue.summary}
                </p>
              )}

              {Array.isArray(rescue.priority_sequence) && rescue.priority_sequence.length > 0 && (
                <div>
                  <SectionLabel tone="text-cyan-300/70">Priority Sequence</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {rescue.priority_sequence.map((zone, i) => (
                      <div
                        key={zone}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]"
                      >
                        <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-display font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-[11px] font-display font-semibold tracking-[0.16em] text-white/75">{zone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {Array.isArray(rescue.objectives) && rescue.objectives.length > 0 && (
                  <div>
                    <SectionLabel tone="text-cyan-300/70">Objectives</SectionLabel>
                    <ul className="space-y-3.5">
                      {rescue.objectives.map((obj, i) => (
                        <li key={i} className="flex gap-3 text-[13px] text-white/68 leading-[1.9]">
                          <span className="text-cyan-400 mt-0.5 flex-shrink-0">›</span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(rescue.safety_constraints) && rescue.safety_constraints.length > 0 && (
                  <div>
                    <SectionLabel tone="text-red-300/70">Safety Constraints</SectionLabel>
                    <ul className="space-y-3.5">
                      {rescue.safety_constraints.map((s, i) => (
                        <li key={i} className="flex gap-3 text-[13px] text-white/68 leading-[1.9]">
                          <span className="text-red-400 mt-0.5 flex-shrink-0">›</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {Array.isArray(rescue.extraction_guidance) && rescue.extraction_guidance.length > 0 && (
                <div>
                  <SectionLabel tone="text-cyan-300/70">Extraction Guidance</SectionLabel>
                  <div className="space-y-3">
                    {rescue.extraction_guidance.map((g) => (
                      <div key={g.zone} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-display font-bold text-cyan-300">{g.zone}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-white/75 leading-[1.6]">{g.technique}</div>
                          {Array.isArray(g.notes) && g.notes.length > 0 && (
                            <div className="mt-1 text-[11px] text-white/40 leading-relaxed">{g.notes.join(' · ')}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rescue.comms_guidance && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <Waves className="w-4 h-4 text-cyan-400/70 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-white/55 leading-[1.8]">{rescue.comms_guidance}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8"
        >
          <div className="flex items-center gap-2 text-[11px] font-display font-medium tracking-[0.3em] text-white/40 uppercase">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Compiled by the Orchestrator from agent outputs
          </div>
          <button
            onClick={onClose}
            className="glass-soft rounded-lg border border-white/15 px-6 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            {pending.length && !approved ? 'Stand by' : 'Acknowledged'}
          </button>
        </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

