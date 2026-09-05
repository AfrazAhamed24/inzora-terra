/**
 * MissionEngineStatus - JARVIS-style engine status bar.
 *
 * Displays the current mission execution state driven by real backend events,
 * not artificial timers. States map to actual orchestrator lifecycle stages.
 *
 * IDLE → INITIALIZING → RUNNING → SYNTHESIS → BRIEFING → COMPLETE
 *                                                    ↘ ERROR
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useMissionContext } from '@/context/MissionContext'

/**
 * Map backend lifecycle stages to display states.
 * The backend stages are: initialized, evidence_ingested, risk_assessed,
 * victims_localized, knowledge_queried, resources_allocated, briefing_ready,
 * completed, errored
 */
function stageToDisplay(stage, isRunning) {
  if (!stage) return 'IDLE'
  if (stage === 'errored') return 'ERROR'
  if (stage === 'completed') return 'COMPLETE'
  if (stage === 'briefing_ready') return 'BRIEFING'
  if (stage === 'knowledge_queried' || stage === 'resources_allocated') return 'SYNTHESIS'
  if (isRunning) return 'RUNNING'
  if (stage === 'initialized' || stage === 'evidence_ingested') return 'INITIALIZING'
  return 'IDLE'
}

const STATUS_CONFIG = {
  IDLE: { label: 'D.E.X.T.E.R ENGINE — STANDBY', color: '#6b7280', pulse: false },
  INITIALIZING: { label: 'DEXTER ENGINE — INITIALIZING', color: '#f59e0b', pulse: true },
  RUNNING: { label: 'MISSION PROCESS — ACTIVE', color: '#22d3ee', pulse: true },
  SYNTHESIS: { label: 'MISSION SYNTHESIS — COMPILING', color: '#a78bfa', pulse: true },
  BRIEFING: { label: 'MISSION BRIEFING — READY', color: '#22c55e', pulse: false },
  COMPLETE: { label: 'MISSION — COMPLETE', color: '#22c55e', pulse: false },
  ERROR: { label: 'ENGINE ERROR', color: '#ef4444', pulse: true },
}

export default function MissionEngineStatus() {
  const { state } = useMissionContext()
  const stage = state.mission?.stage
  const isRunning = state.mission?.is_running

  const displayState = stageToDisplay(stage, isRunning)
  const config = STATUS_CONFIG[displayState]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={displayState}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2.5"
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
          style={{ background: config.color }}
        />
        <span
          className="text-[9px] font-display font-semibold tracking-[0.28em] uppercase"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </motion.div>
    </AnimatePresence>
  )
}
