/**
 * BriefingOverlay - mission briefing final report.
 * Minimal Apple-design: clean cards, no glassmorphism, no gradients,
 * neutral palette, clear hierarchy for dense agent output.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X, BrainCircuit, ShieldCheck, HeartPulse, Lock, Unlock, Target } from 'lucide-react'
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
      className="rounded-xl bg-white/5 border border-white/10 p-4 min-h-[90px] flex flex-col justify-between transition-colors hover:border-white/15"
    >
      <div>
        <div className="mb-2 text-[9px] font-display font-semibold uppercase tracking-[0.28em] text-gray-400">{label}</div>
        <div className="font-display text-xl font-medium leading-snug md:text-2xl text-gray-200">{value}</div>
      </div>
    </motion.div>
  )
}

function SectionLabel({ children, icon }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-display font-semibold uppercase tracking-[0.3em] mb-4 text-gray-500">
      {icon && <span className="w-3.5 h-3.5 flex-shrink-0"><Icon className="w-3.5 h-3.5" /></span>}
      <span className="w-6 h-px bg-gray-900/30" />
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
      parts.push('Mission control is standing by for operator review.')
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
      voice.speak('Approved. Deployment authorized. Executing.')
    } catch {
      voice.uiSound('alert')
      voice.speak('Approval failed. The decision could not be resolved.')
    } finally {
      setResolvingId(null)
    }
  }

  const risk = String(briefing.overall_risk || 'UNKNOWN').toUpperCase()
  const riskColor = RISK_COLOR[risk] || '#6b7280'
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
      className="fixed inset-0 z-[150] bg-gray-950 flex items-center justify-center p-4 sm:p-6"
    >
      {/* No ambient glow - clean minimal backdrop */}

      <div className="relative z-10 w-full max-w-3xl max-h-[min(88vh,calc(100vh-2rem))] overflow-y-auto overscroll-contain rounded-2xl bg-gray-950 border border-white/10 shadow-none">
        <div className="px-5 sm:px-7 py-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-900/5 border border-white/15 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <h2 id="briefing-title" className="text-2xl md:text-3xl font-display font-semibold tracking-[0.2em] text-gray-100">
                  {missionComplete ? 'Mission Complete' : 'Mission Briefing'}
                </h2>
                <div className="text-[11px] font-display font-medium tracking-[0.36em] text-gray-400 uppercase">
                  {missionComplete ? 'Orchestrator · Final Report' : 'Orchestrator · Live Report'}
                </div>
              </div>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white/80 transition-colors"
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
              className="mb-6 rounded-xl bg-gray-900/30 border border-white/15 p-4 flex items-center gap-3"
            >
              <CheckCircle2 className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-xs font-display font-semibold tracking-[0.2em] text-gray-400 uppercase">Mission complete</div>
                <div className="text-[11px] text-gray-500/60 mt-0.5">
                  All decisions resolved. Mission log archived.
                </div>
              </div>
            </motion.div>
          ) : pending.length > 0 && !approved ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mb-6 rounded-xl bg-gray-900/30 border border-white/15 p-4 flex items-center gap-3"
            >
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-xs font-display font-semibold tracking-[0.2em] text-gray-400 uppercase">
                  {pending.length} decision{pending.length > 1 ? 's' : ''} awaiting your approval
                </div>
                <div className="text-[11px] text-gray-500/60 mt-0.5">
                  No critical action is dispatched without operator confirmation.
                </div>
              </div>
            </motion.div>
          ) : approved ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl bg-gray-900/30 border border-white/15 p-4 flex items-center gap-3"
            >
              <CheckCircle2 className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-xs font-display font-semibold tracking-[0.2em] text-gray-400 uppercase">Approved by Operator</div>
                <div className="text-[11px] text-gray-500/60 mt-0.5">
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6"
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
              className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-6"
            >
              <SectionLabel icon={<Target className="w-3.5 h-3.5" }}>Immediate Actions</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {actions.map((action, i) => (
                  <div key={i} className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-400">
                    <span className="w-4 h-4 rounded-md flex items-center justify-center text-gray-500">{i + 1}</span>
                    <span className="ml-2 text-gray-300">{action}</span>
                  </div>
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
              className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        <HeartPulse className="w-4 h-4 text-gray-400" />
      </div>
                  <div>
                    <div className="text-sm font-display font-semibold tracking-[0.14em] text-gray-950">Rescue Guidance</div>
                    <div className="text-[9px] font-display font-medium tracking-[0.28em] text-gray-400 uppercase">
                      Field handoff · Rescue Coordination Agent
                    </div>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-gray-700/30 text-[9px] font-display font-semibold uppercase tracking-[0.26em] text-gray-500"
                >
                  {clearance === 'HOLD' ? <Lock className="w-3 h-3 text-gray-400" /> : <Unlock className="w-3 h-3 text-gray-400" />}
                  Entry: {clearance || 'UNKNOWN'}
                </div>
              </div>

              <div className="p-4 md:p-6 space-y-4">
                {rescue.summary && (
                  <p className="reading-copy text-[14px] md:text-[15px] leading-[1.7] text-gray-200">
                    {rescue.summary}
                  </p>
                )}

                {Array.isArray(rescue.priority_sequence) && rescue.priority_sequence.length > 0 && (
                  <div>
                    <SectionLabel>Priority Sequence</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {rescue.priority_sequence.map((zone, i) => (
                        <div
                          key={zone}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-display font-semibold uppercase tracking-[0.1em] text-gray-400"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-700" />
                          <span>{i + 1}. {zone}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(rescue.objectives) && rescue.objectives.length > 0 && (
                  <div>
                    <SectionLabel>Objectives</SectionLabel>
                    <ul className="space-y-3 text-[13px] text-gray-400">
                      {rescue.objectives.map((obj, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-gray-500 mt-0.5 flex-shrink-0">›</span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(rescue.safety_constraints) && rescue.safety_constraints.length > 0 && (
                  <div>
                    <SectionLabel>Safety Constraints</SectionLabel>
                    <ul className="space-y-3 text-[13px] text-gray-400">
                      {rescue.safety_constraints.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-gray-500 mt-0.5 flex-shrink-0">›</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {rescue.comms_guidance && (
                  <div className="flex items-start gap-2.5 px-3 py-3 rounded bg-white/5 border border-white/10">
                    <Waves className="w-3 h-3 text-gray-400/60 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-gray-500 leading-[1.8]">{rescue.comms_guidance}</p>
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
            className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-6 border-t border-white/10"
          >
            <div className="flex items-center gap-2 text-[11px] font-display font-medium uppercase tracking-[0.3em] text-gray-500">
              <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
              Compiled by the Orchestrator from agent outputs
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/5 border border-white/15 px-5 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 transition-colors hover:border-white/20 hover:text-white"
            >
              {pending.length && !approved ? 'Stand by' : 'Acknowledged'}
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}