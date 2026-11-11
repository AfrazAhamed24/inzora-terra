/**
 * BootSequence - minimal system readiness screen.
 * Minimal Apple-design: clean, no glassmorphism, no gradients,
 * neutral palette, system-ready feel.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radar, Thermometer, Satellite, Navigation, Wind, Waves, Volume2, VolumeX } from 'lucide-react'
import { voice } from '@/services/voice'
import { HudFrame, RadarDial } from '@/components/hud'

const SENSORS = [
  { id: 'gpr', name: 'GPR', detail: 'Subsurface radar' },
  { id: 'thermal', name: 'THERMAL', detail: 'Heat signature array' },
  { id: 'gps', name: 'GPS', detail: 'Position lock' },
  { id: 'imu', name: 'IMU', detail: 'Inertial orientation' },
  { id: 'gas', name: 'GAS', detail: 'Atmospheric monitor' },
  { id: 'weather', name: 'WEATHER', detail: 'Environmental feed' },
]

const BOOT_LINES = [
  'Core systems online',
  'Mission state initialized',
  'Simulation scenario loaded',
  'Telemetry stream ready',
  'Agent registry ready',
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

    voice.speak('Mission interface ready. Initializing the demo response system.', { delay: 400 })

    // Phase 2: environment scan
    later(() => {
      setPhase('scan')
      voice.speak('Checking simulated sensor feeds.', { interrupt: true })
    }, 3100)

    // Sensors light up one by one
    SENSORS.forEach((_, i) => {
      later(() => {
        setOnline(i + 1)
        voice.uiSound('tick')
      }, 3900 + i * 620)
    })
    later(() => {
      voice.speak('Scenario telemetry is ready. Mission engine is standing by.', { interrupt: true })
    }, 3900 + SENSORS.length * 620 + 200)

    // Done
    later(() => {
      setPhase('done')
      voice.uiSound('ok')
      voice.speak('Mission control is ready.')
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
      className="fixed inset-0 z-[200] bg-gray-950 flex items-center justify-center overflow-hidden"
      onClick={phase === 'idle' ? start : undefined}
    >
      {/* Core wordmark + status */}
      <div className="relative z-10 w-full max-w-3xl px-5">
        <HudFrame className="p-6 md:p-8" right={PHASE_STATUS[phase]}>
          {/* Wordmark + tagline */}
          <div className="flex flex-col items-center text-center mb-7">
            <motion.h1
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-6xl font-display font-semibold tracking-[0.04em] text-gray-100"
            >
              INZORA TERRA OS
            </motion.h1>
            <p className="mt-2 text-[10px] md:text-xs font-display font-medium text-gray-400 tracking-[0.34em] uppercase">
              Disaster response mission control
            </p>
          </div>

          {/* Core dial + status column */}
          <div className="flex flex-col md:flex-row items-center gap-6 mb-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="flex flex-col items-center gap-2"
            >
              <RadarDial size={172} />
              <div className="text-[9px] font-display font-semibold tracking-[0.28em] text-gray-500 uppercase">
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
                  className="flex flex-col items-center md:items-start gap-4"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-900/5 border border-gray-700/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-700 animate-pulse" />
                    <span className="text-[11px] font-display font-semibold tracking-[0.3em] text-gray-400 uppercase">System Ready</span>
                  </div>
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="text-xs font-display font-medium text-gray-500 tracking-[0.3em] uppercase"
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
                      className="flex items-center gap-2 text-left"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                      <span className="text-[11px] font-mono text-gray-300 tracking-wide">{line}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {phase === 'scan' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                  {SENSORS.map((s, i) => {
                    const isOnline = i < online
                    return (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0.3 }}
                        animate={{ opacity: isOnline ? 1 : 0.3 }}
                        className="p-2 rounded bg-gray-900/5 border border-gray-700/30 flex flex-col items-center gap-1"
                      >
                        <div className="w-3 h-3 rounded-full bg-gray-700" />
                        <div>
                          <div className="text-[10px] font-display font-semibold tracking-[0.18em] text-gray-300">
                            {s.name}
                          </div>
                          <div className="text-[8px] font-mono text-gray-500/50">
                            {isOnline ? 'ONLINE' : s.detail.toUpperCase()}
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
                  className="flex items-center justify-center md:justify-start gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-gray-700 animate-pulse" />
                  <span className="text-xs font-display font-semibold tracking-[0.3em] text-gray-400 uppercase">
                    Mission engine standing by
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Mission progress meter */}
          <div className="pt-4 border-t border-gray-700/20 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-display font-semibold tracking-[0.3em] text-gray-500/60 uppercase">Mission Progress</span>
              <span className="text-sm font-display font-bold text-gray-300">{meterValue}%</span>
            </div>
            <div className="h-1 w-full bg-gray-900/50 overflow-hidden rounded">
              <motion.div
                animate={{ width: `${meterValue}%` }}
                transition={{ duration: 0.2, ease: 'linear' }}
                className="h-full bg-gray-700"
              />
            </div>
            <div className="mt-2 flex justify-between text-[8px] font-mono text-gray-500/30">
              {['CORE', 'MESH', 'UPLINK', 'GRID', 'AGENTS', 'ORCHESTRATE'].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        </HudFrame>

        {/* Scrolling data footer */}
        <div className="mt-4 flex items-center justify-center">
          <span className="text-[9px] font-mono text-gray-500/25 tracking-[0.2em]">
            {DATA_FOOTER}
          </span>
        </div>
      </div>

      {/* Voice state status pill */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 text-[9px] font-display font-medium tracking-[0.3em] text-gray-400 uppercase"
          >
            {phase === 'done' ? 'Initiating mission' : 'Initializing…'}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}