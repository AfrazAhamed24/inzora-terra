/**
 * useDexterNarration - Speech-decision layer for D.E.X.T.E.R.
 *
 * D.E.X.T.E.R. does NOT narrate every agent state. The UI shows system activity.
 * D.E.X.T.E.R. speaks ONLY when the Commander needs to hear something.
 *
 * Speech is event-driven with priority:
 *   PRIORITY 1 — CRITICAL: Probable survivor, hazard, danger, failure
 *   PRIORITY 2 — AUTHORIZATION: Human approval required
 *   PRIORITY 3 — USER REQUEST: Responded via dexterBrain
 *   PRIORITY 4 — NORMAL OPERATION: SILENT (agent start/complete, processing, etc.)
 *
 * This hook handles PRIORITY 2 (authorization) and mission lifecycle events.
 * PRIORITY 3 is handled by the voice command hook + dexterBrain.
 * PRIORITY 1 would require backend event integration (future).
 * PRIORITY 4 is intentionally silent.
 */

import { useEffect, useRef } from 'react'
import { useMissionContext } from '@/context/MissionContext'
import { voice } from '@/services/voice'

export function useDexterNarration() {
  const { state } = useMissionContext()
  const stage = state.mission?.stage

  const hitlAnnounced = useRef(false)

  // Authorization required — D.E.X.T.E.R. MUST speak when human approval is needed.
  // This is the one automatic speech trigger that is always appropriate.
  useEffect(() => {
    if (stage !== 'awaiting_confirmation' || hitlAnnounced.current) return
    hitlAnnounced.current = true
    voice.uiSound('alert')

    // Build a concise authorization request from real mission data
    const decisions = state.decisions || []
    const pending = decisions.filter((d) => d.status === 'pending')
    if (pending.length > 0) {
      const summary = pending[0].summary || 'a resource deployment'
      voice.speak(`Commander, I need your authorization. ${summary}.`)
    } else {
      voice.speak('Commander, I need your authorization to proceed with deployment.')
    }
  }, [stage, state.decisions])
}

export default useDexterNarration
