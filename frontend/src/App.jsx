/**
 * App - Main application entry point.
 *
 * Cinematic flow: BootSequence (wake + environment scan) → mission auto-starts →
 * useDexterNarration narrates agents one by one from live events.
 * D.E.X.T.E.R. is available via the floating button with full conversational flow.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useSpring, MotionConfig } from 'framer-motion'
import Lenis from 'lenis'
import { Volume2, VolumeX, Mic, Square, Loader, Crosshair } from 'lucide-react'

import { MissionProvider, useMissionContext } from '@/context/MissionContext'
import { useMission } from '@/hooks/useMission'
import { useStream } from '@/hooks/useStream'
import { useDexterNarration } from '@/hooks/useDexterNarration'
import { useVoiceCommand, VoiceState } from '@/hooks/useVoiceCommand'
import { voice } from '@/services/voice'
import { handleVoiceCommand } from '@/services/dexterBrain'


import Nav from '@/components/Nav'
import HeroSection from '@/components/HeroSection'
import DashboardSection from '@/components/DashboardSection'
import AgentSection from '@/components/AgentSection'
import RAGSection from '@/components/RAGSection'
import TimelineSection from '@/components/TimelineSection'
import DexterStatus from '@/components/DexterStatus'
import TerraX from '@/components/TerraX'
import BootSequence from '@/components/BootSequence'
import MissionEngineStatus from '@/components/MissionEngineStatus'
import HITLGate from '@/components/HITLGate'

const BOOT_KEY = 'terra-boot-shown'

/** Inner app with context access */
function AppInner() {
  const [terraOpen, setTerraOpen] = useState(false)
  const [booted, setBooted] = useState(() => {
    try {
      return sessionStorage.getItem(BOOT_KEY) === '1'
    } catch {
      return false
    }
  })
  const [muted, setMuted] = useState(voice.isMuted())
  const { state } = useMissionContext()
  const { createMission, startMission, stopMission } = useMission()

  // Human-in-the-Loop: the mission engine must NOT start on its own. A confirmation
  // gate (rendered below) asks the commander to authorize before telemetry streams.
  const [startPrompt, setStartPrompt] = useState(false)
  const [startBusy, setStartBusy] = useState(false)

  const requestStart = useCallback(() => {
    if (state.mission?.is_running) return
    setStartPrompt(true)
  }, [state.mission])

  const confirmStart = useCallback(async () => {
    setStartBusy(true)
    try {
      if (!state.mission) {
        const m = await createMission({
          incident_text: 'Two-floor building collapse, 3 missing persons reported. Immediate response required.',
          mission_name: 'Live Response',
        })
        await startMission(m.mission_id)
      } else if (!state.mission.is_running) {
        await startMission(state.mission.mission_id)
      }
    } catch {
      // Backend not reachable — leave the system in STANDBY; the user can retry.
    } finally {
      setStartBusy(false)
      setStartPrompt(false)
    }
  }, [state.mission, createMission, startMission])

  const { scrollYProgress } = useScroll()
  const progressScale = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })

  /** Handle voice commands from the conversation manager */
  const onVoiceCommand = useCallback(
    (input) => {
      // If it's an action from the conversation manager (e.g., deploy)
      if (input && typeof input === 'object' && input.type === 'action') {
        switch (input.action) {
          case 'deploy': {
            // Authorization required before starting the engine.
            voice.speak('Authorization required to start the mission.')
            requestStart()
            break
          }
          case 'open_assistant':
            setTerraOpen(true)
            break
          default:
            break
        }
        return
      }

      // Regular text command from dexterBrain
      const transcript = typeof input === 'string' ? input : ''
      if (!transcript) return

      const result = handleVoiceCommand(transcript, {
        mission: state.mission,
        summary: state.summary,
        agents: state.agents,
        timeline: state.timeline,
        connectionStatus: state.connectionStatus,
        telemetryLive: state.telemetryLive,
      })

      if (result.kind === 'action') {
        switch (result.action) {
          case 'start_mission': {
            voice.speak(result.text)
            requestStart()
            break
          }
          case 'open_assistant':
            voice.speak(result.text)
            setTerraOpen(true)
            break
          case 'stop_mission':
            voice.speak(result.text)
            if (state.mission?.is_running) {
              stopMission(state.mission.mission_id)
            }
            break
          case 'mute':
            voice.speak(result.text)
            window.setTimeout(() => {
              voice.setMuted(true)
              setMuted(true)
            }, 1800)
            break
          case 'unmute':
            voice.setMuted(false)
            setMuted(false)
            voice.speak(result.text)
            break
          default:
            break
        }
      } else {
        voice.speak(result.text)
      }
    },
    [state, createMission, startMission]
  )

  const {
    voiceState,
    conversationPhase,
    dialogue,
    listening: voiceListening,
    unsupported: voiceUnsupported,
    permissionDenied: voiceDenied,
    toggle: toggleVoice,
  } = useVoiceCommand({ onCommand: onVoiceCommand })

  // Lenis smooth scroll
  const lenisRef = useRef(null)
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    })
    lenisRef.current = lenis
    let rafId
    function raf(time) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  // After boot, ask the commander for explicit authorization before the mission
  // engine starts streaming telemetry. The mission does NOT auto-start.
  const promptedRef = useRef(false)
  useEffect(() => {
    if (!booted || promptedRef.current) return
    promptedRef.current = true
    setStartPrompt(true)
  }, [booted])

  const onBootComplete = useCallback(() => {
    try {
      sessionStorage.setItem(BOOT_KEY, '1')
    } catch {
      /* ignore */
    }
    setBooted(true)
  }, [])

  // Cinematic narration driven by live mission events
  useDexterNarration()

  // Connect to SSE stream when mission is available
  useStream(state.mission?.mission_id || null)

  const toggleMute = () => {
    const next = !muted
    voice.setMuted(next)
    setMuted(next)
    if (!next) voice.uiSound('ok')
  }

  // Conversation phase display labels
  const PHASE_LABELS = {
    IDLE: '',
    ACTIVATED: 'D.E.X.T.E.R · ACTIVATED',
    BRIEFING: 'D.E.X.T.E.R · BRIEFING',
    AWAITING_SCAN_APPROVAL: 'D.E.X.T.E.R · AWAITING COMMAND',
    SCANNING: 'SCANNING ENVIRONMENT',
    ANALYZING: 'ANALYZING TERRAIN',
    DETECTING: 'DETECTING SURVIVORS',
    ROUTE_CALCULATION: 'CALCULATING ROUTES',
    AWAITING_DEPLOYMENT_APPROVAL: 'D.E.X.T.E.R · AWAITING DEPLOYMENT',
    DEPLOYING: 'DEPLOYING RESCUE ENGINE',
    MISSION_ACTIVE: 'MISSION ACTIVE',
    COMPLETED: 'MISSION COMPLETE',
    STANDING_BY: 'D.E.X.T.E.R · STANDING BY',
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[#09090b] text-[#fafafa]">
      {/* Progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[1px] bg-white/20 origin-left z-[100]"
        style={{ scaleX: progressScale }}
      />

      {/* Navigation */}
      <Nav />

      {/* Live engine status bar */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40">
        <MissionEngineStatus />
      </div>

      {/* Main content */}
      <main>
        <HeroSection />
        <DashboardSection />
        <AgentSection />
        <RAGSection />
        <TimelineSection />
      </main>

      {/* Terra X — the single D.E.X.T.E.R companion chatbot */}
      <TerraX open={terraOpen} onOpenChange={setTerraOpen} />

      {/* HITL Approval Gate — shown when human authorization is required */}
      <HITLGate />

      {/* Mission Start Authorization — commander must explicitly approve before
          the engine starts streaming telemetry (Human-in-the-Loop). */}
      <AnimatePresence>
        {startPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 14 }}
              transition={{ duration: 0.25 }}
              className="glass-card w-full max-w-md rounded-2xl p-6 border border-blue-500/25"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <Crosshair className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-display font-semibold tracking-[0.12em] text-white/85">
                  MISSION START AUTHORIZATION
                </h3>
              </div>
              <p className="text-[13px] text-white/70 leading-relaxed mb-2">
                D.E.X.T.E.R. is ready to deploy the rescue simulation. Authorizing will begin live
                telemetry streaming, multi-agent analysis and the mission timeline.
              </p>
              <p className="text-[11px] font-mono text-white/40 mb-5">
                Incident: Two-floor building collapse · 3 persons reported missing
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setStartPrompt(false)}
                  className="text-[11px] font-display font-semibold tracking-[0.18em] uppercase px-4 py-2.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStart}
                  disabled={startBusy}
                  className="text-[11px] font-display font-semibold tracking-[0.18em] uppercase px-4 py-2.5 rounded-lg bg-blue-500/90 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                >
                  {startBusy ? 'Starting…' : 'Authorize ▶'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* JARVIS-style caption strip */}
      <DexterStatus voiceState={voiceState} />

      {/* Conversation dialogue display — shows what D.E.X.T.E.R. is saying */}
      <AnimatePresence>
        {dialogue && (voiceState === VoiceState.THINKING || voiceState === VoiceState.SPEAKING ||
          voiceState === VoiceState.ACKNOWLEDGING || voiceState === VoiceState.EXPLAINING_NAME) && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.35 }}
            className="glass-soft fixed bottom-20 left-1/2 z-40 flex max-w-[min(90vw,38rem)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-white/10 px-5 py-4 pointer-events-none"
          >
            <div className="relative shrink-0 w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mt-0.5">
              <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-display font-semibold tracking-[0.24em] text-blue-400/80 uppercase mb-1">
                D.E.X.T.E.R · {PHASE_LABELS[conversationPhase] || 'PROCESSING'}
              </div>
              <p className="text-[13px] text-white/85 leading-relaxed">{dialogue}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice state status pill */}
      <AnimatePresence>
        {voiceState === VoiceState.LISTENING && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-blue-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/60">Say D.E.X.T.E.R…</span>
          </motion.div>
        )}
        {(voiceState === VoiceState.WAKE_WORD_DETECTED || voiceState === VoiceState.ACKNOWLEDGING) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-cyan-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-cyan-400/80">D.E.X.T.E.R · ACKNOWLEDGING</span>
          </motion.div>
        )}
        {voiceState === VoiceState.EXPLAINING_NAME && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-cyan-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-cyan-400/80">D.E.X.T.E.R · IDENTIFYING</span>
          </motion.div>
        )}
        {voiceState === VoiceState.CONVERSING && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-emerald-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-400/80">
              {PHASE_LABELS[conversationPhase] || 'D.E.X.T.E.R · LISTENING'}
            </span>
          </motion.div>
        )}
        {voiceState === VoiceState.THINKING && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-amber-500/30"
          >
            <Loader className="w-3 h-3 text-amber-400 animate-spin" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-amber-400/80">D.E.X.T.E.R · PROCESSING</span>
          </motion.div>
        )}
        {voiceState === VoiceState.SPEAKING && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-emerald-500/30"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-400/80">D.E.X.T.E.R · SPEAKING</span>
          </motion.div>
        )}
        {voiceUnsupported && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-amber-500/30"
          >
            <span className="text-[10px] text-amber-300/80">Voice input isn't available — use Terra X to type commands</span>
          </motion.div>
        )}
        {voiceDenied && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#09090b]/85 backdrop-blur-xl border border-red-500/30"
          >
            <span className="text-[10px] text-red-300/80">Microphone permission denied — allow mic access in your browser</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating controls */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.2 }}
          onClick={toggleVoice}
          aria-label={
            voiceState === VoiceState.IDLE || voiceState === VoiceState.STANDBY
              ? 'Activate D.E.X.T.E.R voice command'
              : 'Cancel voice command'
          }
          aria-pressed={voiceListening}
          title={
            voiceState === VoiceState.IDLE || voiceState === VoiceState.STANDBY
              ? 'Click to activate voice — say "Dexter"'
              : 'Stop listening'
          }
          className={`w-11 h-11 rounded-full border backdrop-blur-xl flex items-center justify-center transition-all duration-300 ${
            voiceState === VoiceState.IDLE || voiceState === VoiceState.STANDBY
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300'
              : voiceState === VoiceState.LISTENING || voiceState === VoiceState.CONVERSING
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse'
                : voiceState === VoiceState.WAKE_WORD_DETECTED || voiceState === VoiceState.ACKNOWLEDGING || voiceState === VoiceState.EXPLAINING_NAME
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : voiceState === VoiceState.THINKING
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : voiceState === VoiceState.SPEAKING
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          {(voiceState === VoiceState.IDLE || voiceState === VoiceState.STANDBY) ? (
            <Mic className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </motion.button>
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.6 }}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute D.E.X.T.E.R' : 'Mute D.E.X.T.E.R'}
          aria-pressed={muted}
          title={muted ? 'Unmute D.E.X.T.E.R' : 'Mute D.E.X.T.E.R'}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl flex items-center justify-center hover:bg-white/10 transition-all duration-300 text-white/50 hover:text-white/80"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </motion.button>
      </div>

      {/* Cinematic boot sequence */}
      <AnimatePresence>
        {!booted && <BootSequence onComplete={onBootComplete} />}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}

/** Root app with providers */
function App() {
  return (
    <MissionProvider>
      <AppInner />
    </MissionProvider>
  )
}

export default App
