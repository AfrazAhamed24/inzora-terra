/**
 * BootSequence - Hologram HUD system wake for D.E.X.T.E.R.
 *
 * Phases: idle (SYSTEM READY, click to initialize) → boot (D.E.X.T.E.R online)
 * → scan (sensors come online one by one) → done (orchestrator initializing).
 * HUD chrome: angular frame, radar dial, mission-progress meter, sensor tiles and a
 * scrolling data footer. Narrated by D.E.X.T.E.R via the VoiceDirector.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radar, Thermometer, Satellite, Navigation, Wind, Waves, Volume2, VolumeX } from 'lucide-react'
import { voice } from '@/services/voice'
import NeuralBackdrop from '@/components/NeuralBackdrop'
import { HudFrame, RadarDial, TechButton, DataMarquee } from '@/components/hud'

const SENSORS = [
  { id: 'gpr', name: 'GPR', detail: 'Subsurface radar', icon: Radar },
  { id: 'thermal', name: 'THERMAL', detail: 'Heat signature array', icon: Thermometer },
  { id: 'gps', name: 'GPS', detail: 'Position lock', icon: Satellite },
  { id: 'imu', name: 'IMU', detail: 'Inertial orientation', icon: Navigation },
  { id: 'gas', name: 'GAS', detail: 'Atmospheric monitor', icon: Wind },
  { id: 'weather', name: 'WEATHER', detail: 'Environmental feed', icon: Waves },
]

const BOOT_LINES = [
  'Core systems online',
  'Neural mesh initialized',
  'Satellite uplink acquired',
  'Tactical grid locked',
  'D.E.X.T.E.R v1.0 loaded',
]

// Reference-style scrolling data footer (π digits, duplicated for a seamless loop)
const DATA_FOOTER =
  '3.1415926535 8979323846 2643383279 5028841971 6939937510 5820974944 5923078164 0628620899 8628034825 3421170679'

const PHASE_STATUS = {
  idle: 'SYSTEM READY',
  boot: 'INITIALIZING',
  scan: 'SCANNING',
  done: 'STANDBY',
}

export default function BootSequence({ onComplete }) {
  const [phase, setPhase] = useState('idle') // idle | boot | scan | done
  const [bootLine, setBootLine] = useState(0)
  const [online, setOnline] = useState(0)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(voice.isMuted())
  const timers = useRef([])
  const started = useRef(false)

  const later = (fn, ms) => {
    const t = window.setTimeout(fn, ms)
    timers.current.push(t)
    return t
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const start = () => {
    if (started.current) return
    started.current = true
    voice.sweep(160, 640, 0.9)
    setPhase('boot')

    // Boot lines
    BOOT_LINES.forEach((_, i) => later(() => setBootLine(i + 1), 550 + i * 700))
    // Progress bar
    let p = 0
    later(() => {
      const iv = window.setInterval(() => {
        p = Math.min(100, p + 6)
        setProgress(p)
        if (p === 100) clearInterval(iv)
      }, 90)
      timers.current.push(iv)
    }, 300)

    voice.speak('Good evening, Commander. D.E.X.T.E.R online. Initializing disaster response command system.', { delay: 400 })

    // Phase 2: environment scan
    later(() => {
      setPhase('scan')
      voice.speak('Scanning environment. Bringing sensors online.', { interrupt: true })
    }, 3100)

    // Sensors light up one by one
    SENSORS.forEach((_, i) => {
      later(() => {
        setOnline(i + 1)
        voice.uiSound('tick')
      }, 3900 + i * 620)
    })
    later(() => {
      voice.speak('All systems nominal. Telemetry linked. Orchestrator initializing.', { interrupt: true })
    }, 3900 + SENSORS.length * 620 + 200)

    // Done
    later(() => {
      setPhase('done')
      voice.uiSound('ok')
      voice.speak('Mission control at your command, Commander.')
    }, 3900 + SENSORS.length * 620 + 2400)

    later(onComplete, 3900 + SENSORS.length * 620 + 4300)
  }

  const toggleMute = () => {
    const next = !muted
    voice.setMuted(next)
    setMuted(next)
    if (!next) voice.uiSound('ok')
  }

  const scanDone = online >= SENSORS.length
  const meterValue = phase === 'idle' ? 0 : phase === 'boot' ? progress : 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      className="fixed inset-0 z-[200] bg-[#04050a] flex items-center justify-center overflow-hidden"
      onClick={phase === 'idle' ? start : undefined}
    >
      {/* Neural tactical backdrop */}
      <NeuralBackdrop dense />

      {/* Mute regulator */}
      <TechButton
        onClick={(e) => { e.stopPropagation(); toggleMute() }}
        className="absolute top-6 right-6 z-10 w-10 h-10 flex items-center justify-center"
        aria-label={muted ? 'Unmute D.E.X.T.E.R' : 'Mute D.E.X.T.E.R'}
        title={muted ? 'Unmute D.E.X.T.E.R' : 'Mute D.E.X.T.E.R'}
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </TechButton>

      <div className="relative z-10 w-full max-w-3xl px-5">
        <HudFrame className="p-6 md:p-8" right={PHASE_STATUS[phase]}>
          {/* Wordmark + tagline */}
          <div className="flex flex-col items-center text-center mb-7">
            <motion.h1
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-6xl font-display font-semibold tracking-[0.04em] text-white/95"
            >
              D<span className="text-cyan-400/60">.</span>E<span className="text-cyan-400/60">.</span>X<span className="text-cyan-400/60">.</span>T<span className="text-cyan-400/60">.</span>E<span className="text-cyan-400/60">.</span>R
            </motion.h1>
            <p className="mt-2 text-[10px] md:text-xs font-display font-medium text-white/40 tracking-[0.34em] uppercase">
              Disaster Emergency eXtraction & Threat Elimination Response
            </p>
          </div>

          {/* Core dial + status column */}
          <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="flex flex-col items-center gap-2"
            >
              <RadarDial size={172} />
              <div className="text-[9px] font-display font-semibold tracking-[0.28em] text-cyan-400/50 uppercase">
                {phase === 'scan' && !scanDone ? 'Acquiring…' : phase === 'done' ? 'Locked' : 'Sensors'}
              </div>
            </motion.div>

            {/* Status column: boot lines / idle prompt / scan banner */}
            <div className="flex-1 w-full min-w-0">
              {phase === 'idle' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-col items-center md:items-start gap-5"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-400/25 bg-emerald-400/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-display font-semibold tracking-[0.3em] text-emerald-300/85 uppercase">System Ready</span>
                  </div>
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="text-xs font-display font-medium text-white/55 tracking-[0.3em] uppercase"
                  >
                    Click anywhere to initialize
                  </motion.div>
                </motion.div>
              )}

              {phase === 'boot' && (
                <div className="w-full space-y-2.5">
                  {BOOT_LINES.slice(0, bootLine).map((line) => (
                    <motion.div
                      key={line}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 text-left"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                      <span className="text-[11px] font-mono text-cyan-100/70 tracking-wide">{line}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {phase === 'scan' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                  {SENSORS.map((s, i) => {
                    const Icon = s.icon
                    const isOnline = i < online
                    return (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0.3 }}
                        animate={{ opacity: isOnline ? 1 : 0.32 }}
                        className={`hud-frame px-3 py-2.5 ${isOnline ? '' : 'opacity-60'}`}
                        style={{ clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))' }}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isOnline ? 'text-emerald-400' : 'text-white/30'}`} />
                          <div className="min-w-0">
                            <div className={`text-[10px] font-display font-semibold tracking-[0.18em] truncate ${isOnline ? 'text-white/85' : 'text-white/35'}`}>
                              {s.name}
                            </div>
                            <div className="text-[8px] font-mono text-white/25 truncate">
                              {isOnline ? '● ONLINE' : s.detail.toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              {phase === 'done' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center md:justify-start gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-display font-semibold tracking-[0.3em] text-white/75 uppercase">
                    D.E.X.T.E.R standing by
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Mission progress meter */}
          <div className="pt-5 border-t border-cyan-400/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-display font-semibold tracking-[0.3em] text-cyan-300/60 uppercase">Mission Progress</span>
              <span className="text-sm font-display font-bold text-cyan-300">{meterValue}%</span>
            </div>
            <div className="h-[6px] w-full bg-white/5 overflow-hidden">
              <motion.div
                animate={{ width: `${meterValue}%` }}
                transition={{ duration: 0.2, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
              />
            </div>
            <div className="mt-2 flex justify-between text-[8px] font-mono text-white/20">
              {['CORE', 'MESH', 'UPLINK', 'GRID', 'AGENTS', 'ORCHESTRATE'].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        </HudFrame>

        {/* Scrolling data footer */}
        <DataMarquee
          text={DATA_FOOTER}
          className="mt-4 text-[10px] font-mono text-cyan-400/25 tracking-[0.2em]"
        />
      </div>

      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-6 text-[10px] font-display font-medium tracking-[0.3em] text-white/20 uppercase"
          >
            {phase === 'done' ? 'Initiating mission' : 'Initializing…'}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
