/**
 * HeroSection - Mission status hero with drowning momentum effect.
 *
 * Connected to live: environment/sensor data from telemetry endpoint.
 * Features a slowly drowning background with momentum-based parallax motion.
 *
 * D.E.X.T.E.R (Disaster Emergency eXtraction & Threat Elimination Response)
 * provides the system intelligence overlay.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Thermometer, Wind, Droplets, Eye, Waves, Ship, ArrowDown } from 'lucide-react'
import { useEnvironment, useMissionStage, useIsRunning } from '@/context/MissionContext'
import NeuralBackdrop from '@/components/NeuralBackdrop'

function SensorBadge({ icon, label, value }) {
  return (
    <div className="glass-card flex items-center gap-3 rounded-xl px-4 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/55">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-[8px] font-display font-semibold text-white/35 tracking-[0.18em]">{label}</div>
        <div className="mt-0.5 font-mono text-sm text-white/70">{value}</div>
      </div>
    </div>
  )
}

function HeroSection() {
  const environment = useEnvironment()
  const stage = useMissionStage()
  const isRunning = useIsRunning()

  // Stable particle positions — seeded PRNG so they don't jitter on re-render
  const particles = useMemo(() => Array.from({ length: 80 }, (_, i) => {
    let s = i * 2654435761
    s = ((s >>> 16) ^ s) * 0x45d9f3b
    s = ((s >>> 16) ^ s) * 0x45d9f3b
    s = (s >>> 16) ^ s
    const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
    return {
      left: `${rand() * 100}%`,
      top: `${rand() * 100}%`,
      duration: 8 + rand() * 12,
      delay: rand() * 5,
    }
  }), [])

  // Extract sensor data from environment (with fallbacks for demo)
  const thermal = Math.round((environment.temperature || 32.4))
  const wind = Math.round((environment.wind_speed || 12.8 * 10) / 10 * 10) / 10
  const humidity = Math.round(environment.humidity || 67)
  const visibility = Math.round((environment.visibility || 0.8) * 10) / 10

  // Stage-based status text
  const stageText = {
    created: 'SYSTEM ONLINE',
    initialized: 'MISSION INITIALIZED',
    evidence_ingested: 'ENVIRONMENT MAPPED',
    risk_assessed: 'RISK ASSESSMENT COMPLETE',
    victims_localized: 'VICTIMS DETECTED',
    resources_allocated: 'RESOURCES DEPLOYED',
    knowledge_queried: 'KNOWLEDGE RETRIEVED',
    briefing_ready: 'BRIEFING READY',
    awaiting_confirmation: 'AWAITING COMMANDER APPROVAL',
    completed: 'MISSION COMPLETE',
    stopped: 'MISSION STOPPED',
    aborted: 'MISSION ABORTED',
    errored: 'MISSION ERROR',
  }[stage] || 'AWAITING MISSION'

  const isActive = [
    'initialized',
    'evidence_ingested',
    'risk_assessed',
    'victims_localized',
    'resources_allocated',
    'knowledge_queried',
    'briefing_ready',
    'awaiting_confirmation',
  ].includes(stage)

  const isActiveRunning = isRunning || isActive

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Neural tactical backdrop */}
      <NeuralBackdrop dense={isActiveRunning} />

      {/* Drowning momentum background layers */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Slow drift layer - creates the drowning feel */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#09090b] to-[#04050a]"
          animate={{
            backgroundPosition: ['0% 0%', '0% 20px', '0% 0%'],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'linear',
          }}
        />

        {/* Deep water layers - slowly undulating */}
        <motion.div
          className="absolute -top-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-purple-500/10 blur-3xl"
          animate={{
            x: [0, 50, -30, 0],
            y: [0, -40, 20, 0],
            scale: [1, 1.05, 1.1, 1.05, 1],
            opacity: [0.3, 0.4, 0.35, 0.3],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-cyan-500/10 blur-3xl"
          animate={{
            x: [0, -50, 30, 0],
            y: [0, 40, -20, 0],
            scale: [1, 1.08, 1.15, 1.1, 1],
            opacity: [0.25, 0.35, 0.3, 0.25],
          }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
        />

        {/* Surface disturbance waves - slowly spreading */}
        <motion.div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[200px] rounded-full bg-cyan-500/5"
          animate={{
            width: ['800px', '820px', '800px'],
            height: ['200px', '220px', '200px'],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Subtle particle field for depth — stable positions across re-renders */}
        <div className="absolute inset-0">
          {particles.map((p, i) => (
            <motion.div
              key={i}
              className="absolute w-[2px] h-[2px] rounded-full bg-white/15"
              style={{ left: p.left, top: p.top }}
              animate={{ y: [0, -20, 0], opacity: [0, 0.4, 0] }}
              transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
            />
          ))}
        </div>

        {/* D.E.X.T.E.R watermark - subtle, drowning into background */}
        <motion.div
          className="absolute bottom-8 right-8 text-[140px] font-display font-bold tracking-[0.1em] pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(59, 130, 246, 0.02))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 40px rgba(59, 130, 246, 0.05)',
          }}
          animate={{
            opacity: [0.03, 0.05, 0.03],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        >
          DEXTER
        </motion.div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6"
        >
          <motion.div
            animate={{
              boxShadow: [
                '0 0 0px rgba(34, 211, 238, 0.3)',
                '0 0 20px rgba(34, 211, 238, 0.5)',
                '0 0 0px rgba(34, 211, 238, 0.3)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="glass-card inline-flex items-center gap-2.5 rounded-full px-5 py-2.5"
          >
            <motion.div
              animate={{
                scale: isActiveRunning ? [1, 1.2, 1] : 1,
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className={`h-2 w-2 rounded-full ${isActiveRunning ? 'bg-cyan-400 animate-pulse' : 'bg-white/30'}`}
            />
            <span className="text-xs font-display font-medium tracking-[0.22em] text-white/70 uppercase">
              {stageText}
            </span>
          </motion.div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mb-5 font-display text-5xl font-semibold tracking-[-0.03em] md:text-7xl lg:text-8xl"
        >
          D<span className="text-white/30">.</span>E<span className="text-white/30">.</span>X<span className="text-white/30">.</span>T<span className="text-white/30">.</span>E<span className="text-white/30">.</span>R
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-3 text-sm font-display font-medium tracking-[0.32em] text-white/50 uppercase"
        >
          Disaster Emergency Extraction & Threat Elimination Response
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mb-12 text-[10px] font-mono tracking-[0.25em] text-white/25 uppercase"
        >
          Orchestrating risk · victim · resource · knowledge · rescue agents
        </motion.p>

        {/* Sensor badges with enhanced glass effect */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <SensorBadge icon={<Thermometer className="w-3.5 h-3.5" />} label="THERMAL" value={`${thermal}°C`} />
          <SensorBadge icon={<Wind className="w-3.5 h-3.5" />} label="WIND" value={`${wind} m/s`} />
          <SensorBadge icon={<Droplets className="w-3.5 h-3.5" />} label="HUMIDITY" value={`${humidity}%`} />
          <SensorBadge icon={<Eye className="w-3.5 h-3.5" />} label="VISIBILITY" value={`${visibility} km`} />
          <SensorBadge icon={<Waves className="w-3.5 h-3.5" />} label="DEPTH" value={environment.depth || '3.2m'} />
          <SensorBadge icon={<Ship className="w-3.5 h-3.5" />} label="STATUS" value={isActiveRunning ? 'ACTIVE' : 'STANDBY'} />
        </motion.div>

        <motion.a
          href="#mission-dashboard"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 inline-flex items-center gap-2 text-[10px] font-display font-semibold tracking-[0.24em] text-cyan-300/70 uppercase transition-colors hover:text-cyan-200"
        >
          Open mission dashboard
          <ArrowDown className="h-3.5 w-3.5" />
        </motion.a>

        {/* DEXTER activation prompt */}
        {isActiveRunning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-12"
          >
            <motion.span
              className="text-[9px] font-mono tracking-[0.2em] text-white/40 uppercase"
              animate={{ opacity: [0.4, 0.6, 0.4] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Say "DEXTER" to activate voice command
            </motion.span>
          </motion.div>
        )}
      </div>
    </section>
  )
}

export default HeroSection
