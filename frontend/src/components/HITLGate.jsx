/**
 * HITLGate - Human-in-the-Loop approval gate.
 *
 * Surfaces pending human decisions from the backend and provides Approve/Deny
 * buttons so the Commander can authorize critical actions directly in the UI.
 * Only visible when decisions are pending (mission stage = awaiting_confirmation).
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, ShieldX, AlertTriangle, Clock } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'

const API_BASE = '/api/v1'

export default function HITLGate() {
  const { state } = useMissionContext()
  const decisions = state.decisions.filter((d) => d.status === 'pending')
  const [resolving, setResolving] = useState({})
  const [resolved, setResolved] = useState({})

  const missionId = state.mission?.mission_id

  const handleResolve = useCallback(
    async (decisionId, action) => {
      if (!missionId || resolving[decisionId]) return
      setResolving((prev) => ({ ...prev, [decisionId]: true }))

      try {
        const res = await fetch(
          `${API_BASE}/missions/${missionId}/decisions/${decisionId}/resolve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              notes: action === 'approve' ? 'Approved by Commander via D.E.X.T.E.R.' : 'Overridden by Commander via D.E.X.T.E.R.',
            }),
          }
        )

        if (res.ok) {
          setResolved((prev) => ({ ...prev, [decisionId]: action }))
        }
      } catch {
        // Decision resolution failed — will be retried
      } finally {
        setResolving((prev) => ({ ...prev, [decisionId]: false }))
      }
    },
    [missionId, resolving]
  )

  if (!decisions.length) return null

  return (
    <AnimatePresence>
      {decisions.map((decision) => {
        const isResolved = resolved[decision.id]
        if (isResolved) return null

        return (
          <motion.div
            key={decision.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-28 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2"
          >
            <div className="glass-soft rounded-2xl border border-amber-500/20 shadow-[0_0_60px_-12px_rgba(245,158,11,0.25)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-amber-500/10 bg-amber-500/5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-amber-400/80">
                    Authorization Required
                  </div>
                  <div className="text-[11px] text-white/50 font-mono truncate">
                    {decision.id} · {decision.request_type}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                  <Clock className="w-3 h-3" />
                  <span>Pending</span>
                </div>
              </div>

              {/* Summary */}
              <div className="px-5 py-4">
                <p className="text-[13px] leading-[1.75] text-white/75">
                  {decision.summary}
                </p>
                {decision.related_agent && (
                  <div className="mt-2 text-[10px] font-mono text-white/35">
                    Source: {decision.related_agent}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 px-5 pb-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={resolving[decision.id]}
                  onClick={() => handleResolve(decision.id, 'approve')}
                  className="flex-1 flex items-center justify-center gap-2.5 rounded-xl py-3 text-[12px] font-display font-semibold tracking-[0.12em] uppercase transition-all duration-200 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/50 disabled:opacity-40"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {resolving[decision.id] ? 'Approving…' : 'Approve'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={resolving[decision.id]}
                  onClick={() => handleResolve(decision.id, 'override')}
                  className="flex-1 flex items-center justify-center gap-2.5 rounded-xl py-3 text-[12px] font-display font-semibold tracking-[0.12em] uppercase transition-all duration-200 bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-40"
                >
                  <ShieldX className="w-4 h-4" />
                  {resolving[decision.id] ? 'Overriding…' : 'Override'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}
