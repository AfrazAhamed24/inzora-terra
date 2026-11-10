/**
 * useVoiceCommand - conversational voice interaction.
 *
 * State machine:
 *   IDLE → LISTENING → WAKE_WORD_DETECTED → ACKNOWLEDGING →
 *   EXPLAINING_NAME → CONVERSING (mic stays open)
 *
 * During CONVERSING:
 *   - Mic remains active for follow-up commands
 *   - Each utterance is routed through ConversationManager
 *   - Voice control speaks responses and advances phases
 *   - No wake word needed between exchanges
 *
 * Critical invariants:
 *   - Mic is STOPPED during TTS (no self-trigger)
 *   - Wake detection suppressed during TTS
 *   - Only ONE response flow at a time
 *   - ORCHESTRA starts ONLY after explicit approval through conversation
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { voice } from '@/services/voice'
import { ConversationManager } from '@/services/conversationManager'

export const VoiceState = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  WAKE_WORD_DETECTED: 'WAKE_WORD_DETECTED',
  ACKNOWLEDGING: 'ACKNOWLEDGING',
  EXPLAINING_NAME: 'EXPLAINING_NAME',
  CONVERSING: 'CONVERSING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  STANDBY: 'STANDBY',
}

export const EngineState = {
  IDLE: 'IDLE',
  INITIALIZING: 'INITIALIZING',
  RUNNING: 'RUNNING',
  SYNTHESIS: 'SYNTHESIS',
  BRIEFING: 'BRIEFING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
}

const WAKE_REGEX = /(^|[^a-z])(dexter|dextor|d[.\s]*e[.\s]*x[.\s]*t[.\s]*e[.\s]*r)([^a-z]|$)/i
const TERRA_REGEX = /(^|[^a-z])terra\s*x([^a-z]|$)/i

function detectWakeWord(text) {
  if (!text) return { matched: false }
  if (TERRA_REGEX.test(text)) return { matched: true }
  if (WAKE_REGEX.test(text)) return { matched: true }
  return { matched: false }
}

export function useVoiceCommand({ onCommand }) {
  const [voiceState, setVoiceState] = useState(VoiceState.IDLE)
  const [conversationPhase, setConversationPhase] = useState('IDLE')
  const [dialogue, setDialogue] = useState('')
  const [unsupported, setUnsupported] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const stateRef = useRef(VoiceState.IDLE)
  const wakeSuppressed = useRef(false)
  const cmdTimer = useRef(null)
  const standbyTimer = useRef(null)
  const conversationListenTimer = useRef(null)
  const managerRef = useRef(new ConversationManager())
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  const timers = useRef({ unsupported: null, denied: null })

  const flash = useCallback((setter, key) => {
    setter(true)
    if (timers.current[key]) window.clearTimeout(timers.current[key])
    timers.current[key] = window.setTimeout(() => setter(false), 5000)
  }, [])

  const clearAllTimers = useCallback(() => {
    if (cmdTimer.current) { window.clearTimeout(cmdTimer.current); cmdTimer.current = null }
    if (standbyTimer.current) { window.clearTimeout(standbyTimer.current); standbyTimer.current = null }
    if (conversationListenTimer.current) { window.clearTimeout(conversationListenTimer.current); conversationListenTimer.current = null }
  }, [])

  const transition = useCallback((next) => {
    stateRef.current = next
    setVoiceState(next)
  }, [])

  /** Start listening for conversational commands */
  const startConversationListening = useCallback(() => {
    if (stateRef.current !== VoiceState.CONVERSING) return
    voice.startListening({
      onResult: (text, isFinal) => {
        const t = (text || '').trim()
        if (!t || !isFinal) return
        if (stateRef.current !== VoiceState.CONVERSING) return

        const phase = managerRef.current.getPhase()
        const isPhaseTransition = ['AWAITING_SCAN_APPROVAL', 'AWAITING_DEPLOYMENT_APPROVAL'].includes(phase)

        voice.stopListening()
        wakeSuppressed.current = true
        transition(VoiceState.THINKING)

        if (isPhaseTransition) {
          // Phase-specific: use ConversationManager for approve/decline
          const result = managerRef.current.handleCommand(t)
          setDialogue(result.dialogue)
          setConversationPhase(result.phase)
          voice.speak(result.dialogue, { interrupt: true })
          if (result.action) {
            onCommandRef.current({ type: 'action', action: result.action, text: result.dialogue })
          }
        } else {
          // General conversation: route to dexterBrain for real answers
          onCommandRef.current(t)
        }
      },
      onError: (error) => {
        const TRANSIENT = new Set(['no-speech', 'aborted', 'audio-capture', 'network'])
        if (TRANSIENT.has(error) && stateRef.current === VoiceState.CONVERSING) {
          setTimeout(startConversationListening, 200)
          return
        }
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          flash(setPermissionDenied, 'denied')
        }
      },
      onEnd: () => {
        if (stateRef.current === VoiceState.CONVERSING) {
          setTimeout(startConversationListening, 200)
        }
      },
    })
  }, [transition, flash])

  /** Enter conversational mode: start the mic for follow-up commands */
  const enterConversation = useCallback(() => {
    transition(VoiceState.CONVERSING)
    wakeSuppressed.current = false
    setTimeout(startConversationListening, 300)
  }, [transition, startConversationListening])

  // ---- TTS event subscription ----
  useEffect(() => {
    const unsub = voice.subscribe((event) => {
      if (event.type === 'start') {
        const cs = stateRef.current
        if (cs === VoiceState.ACKNOWLEDGING || cs === VoiceState.EXPLAINING_NAME) {
          wakeSuppressed.current = true
          if (voice.isListening) voice.stopListening()
          return
        }
        if (cs !== VoiceState.THINKING) {
          transition(VoiceState.SPEAKING)
        }
        if (voice.isListening) voice.stopListening()
      } else if (event.type === 'end') {
        const cs = stateRef.current

        // Acknowledgement ended → explain the name
        if (cs === VoiceState.ACKNOWLEDGING) {
          cmdTimer.current = window.setTimeout(() => {
            cmdTimer.current = null
            if (stateRef.current === VoiceState.ACKNOWLEDGING) {
              transition(VoiceState.EXPLAINING_NAME)
              voice.speak(
                'Voice control is ready. The mission engine is standing by. Shall I begin the scenario check?',
                { interrupt: true }
              )
            }
          }, 400)
          return
        }

        // Name explanation ended → enter conversation mode
        if (cs === VoiceState.EXPLAINING_NAME) {
          wakeSuppressed.current = false
          managerRef.current.handleCommand('activate') // sets phase to ACTIVATED
          setConversationPhase(managerRef.current.getPhase())
          enterConversation()
          return
        }

        // During THINKING (conversation response just spoken) → re-enter conversation
        if (cs === VoiceState.THINKING) {
          const phase = managerRef.current.getPhase()
          setConversationPhase(phase)
          // Re-enter conversation mode to listen for next command
          enterConversation()
          return
        }

        // Generic TTS ended
        if (cs === VoiceState.SPEAKING) {
          transition(VoiceState.STANDBY)
          standbyTimer.current = window.setTimeout(() => {
            standbyTimer.current = null
            if (stateRef.current === VoiceState.STANDBY) {
              transition(VoiceState.IDLE)
            }
          }, 2000)
        }
      }
    })
    return unsub
  }, [transition, enterConversation])

  // ---- Start listening (initial wake word search) ----
  const startListening = useCallback(() => {
    if (!voice.speechSupported) {
      flash(setUnsupported, 'unsupported')
      return
    }

    const cs = stateRef.current
    if (cs !== VoiceState.IDLE && cs !== VoiceState.STANDBY) return

    setUnsupported(false)
    setPermissionDenied(false)
    wakeSuppressed.current = false
    clearAllTimers()
    managerRef.current.reset()
    setConversationPhase('IDLE')

    transition(VoiceState.LISTENING)

    voice.startListening({
      onResult: (text, _isFinal) => {
        const t = (text || '').trim()
        if (!t) return
        const cs = stateRef.current

        if (!wakeSuppressed.current && cs === VoiceState.LISTENING) {
          if (detectWakeWord(t).matched) {
            voice.stopListening()
            wakeSuppressed.current = true
            clearAllTimers()

            // Check if there's an actual request after the wake word
            // "Dexter" → just wake word
            // "Dexter, what's the survivor count?" → wake word + request
            const stripped = t.replace(/^(?:hey|ok|okay)?\s*(?:d[.\s]*e[.\s]*x[.\s]*t[.\s]*e[.\s]*r|terra\s*x)[,.!?]?\s*/i, '').trim()

            if (stripped) {
              // Wake word + request: skip acknowledgment, process directly
              transition(VoiceState.THINKING)
              onCommandRef.current(stripped)
            } else {
              // Wake word only: acknowledge, then explain identity, then listen
              transition(VoiceState.ACKNOWLEDGING)
              voice.speak('Voice control ready.', { interrupt: true })
            }
            return
          }
          return
        }
      },
      onError: (error) => {
        const TRANSIENT = new Set(['no-speech', 'aborted', 'audio-capture', 'network'])
        if (TRANSIENT.has(error) && stateRef.current !== VoiceState.IDLE) return
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          flash(setPermissionDenied, 'denied')
        } else {
          flash(setUnsupported, 'unsupported')
        }
        clearAllTimers()
        wakeSuppressed.current = false
        transition(VoiceState.IDLE)
      },
      onEnd: () => {
        const cs = stateRef.current
        if (cs === VoiceState.LISTENING) return // voice.ts re-arms
        if (cs !== VoiceState.THINKING && cs !== VoiceState.SPEAKING &&
            cs !== VoiceState.ACKNOWLEDGING && cs !== VoiceState.EXPLAINING_NAME &&
            cs !== VoiceState.CONVERSING) {
          transition(VoiceState.IDLE)
        }
      },
    })
  }, [transition, clearAllTimers, flash])

  const stopListening = useCallback(() => {
    voice.stopListening()
    clearAllTimers()
    wakeSuppressed.current = false
    const cs = stateRef.current
    if (cs !== VoiceState.THINKING && cs !== VoiceState.SPEAKING &&
        cs !== VoiceState.ACKNOWLEDGING && cs !== VoiceState.EXPLAINING_NAME) {
      managerRef.current.reset()
      setConversationPhase('IDLE')
      transition(VoiceState.IDLE)
    }
  }, [transition, clearAllTimers])

  const toggle = useCallback(() => {
    const cs = stateRef.current
    if (cs === VoiceState.IDLE || cs === VoiceState.STANDBY) startListening()
    else stopListening()
  }, [startListening, stopListening])

  useEffect(() => {
    const t = timers.current
    return () => {
      voice.stopListening()
      voice.stop()
      clearAllTimers()
      if (t.unsupported) window.clearTimeout(t.unsupported)
      if (t.denied) window.clearTimeout(t.denied)
    }
  }, [clearAllTimers])

  return {
    voiceState,
    conversationPhase,
    dialogue,
    listening: stateRef.current === VoiceState.LISTENING ||
               stateRef.current === VoiceState.CONVERSING ||
               stateRef.current === VoiceState.WAKE_WORD_DETECTED,
    unsupported,
    permissionDenied,
    toggle,
    stop: stopListening,
    start: startListening,
    manager: managerRef.current,
  }
}

export default useVoiceCommand
