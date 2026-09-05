/**
 * Nav - Mission status command bar (glassmorphic).
 *
 * Connected to live: risk level, agent count, mission stage and connection status.
 * The brand is D.E.X.T.E.R — the disaster response system. Terra X is the chatbot
 * surface, not the system name.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Clock, Wifi, WifiOff, Crosshair } from 'lucide-react'
import { useMissionContext, useRiskLevel, useIsRunning } from '@/context/MissionContext'

const RISK_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
}

function Pill({ icon, label, color, pulse = false }) {
  return (
    <span className="glass-soft flex items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1.5">
      {pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
        </span>
      ) : (
        <span style={{ color }}>{icon}</span>
      )}
      <span
        className="text-[10px] font-display font-semibold uppercase tracking-[0.18em]"
        style={{ color: color || 'rgba(255,255,255,0.55)' }}
      >
        {label}
      </span>
    </span>
  )
}

function Nav() {
  const { state } = useMissionContext()
  const riskLevel = useRiskLevel()
  const isRunning = useIsRunning()
  const [elapsed, setElapsed] = useState('00:00:00')

  // Update elapsed time while a mission is running.
  useEffect(() => {
    if (!isRunning) return
    const startTime = Date.now()
    const interval = setInterval(() => {
      const diff = Date.now() - startTime
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setElapsed(
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning])

  const riskColor = RISK_COLORS[riskLevel] || '#22c55e'
  const isConnected = state.connectionStatus === 'connected'
  const agentCount = state.agents.length || 4

  return (
    <nav className="glass-nav fixed inset-x-0 top-0 z-50" aria-label="Mission command bar">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="glass-soft flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-400/25">
            <Crosshair className="h-4 w-4 text-cyan-300/90" />
          </div>
          <div className="min-w-0 leading-none">
            <div className="font-display text-sm font-semibold tracking-[0.22em] text-white/90">
              D<span className="text-cyan-400/50">.</span>E<span className="text-cyan-400/50">.</span>X<span className="text-cyan-400/50">.</span>T<span className="text-cyan-400/50">.</span>E<span className="text-cyan-400/50">.</span>R
            </div>
            <div className="mt-1 truncate font-mono text-[9px] tracking-[0.2em] text-white/30 uppercase">
              {state.mission ? state.mission.mission_id : 'Command Uplink · Standby'}
            </div>
          </div>
        </div>

        {/* Live status pills */}
        <div className="hidden items-center gap-2.5 md:flex">
          <Pill icon={<AlertTriangle className="h-3 w-3" />} label={riskLevel} color={riskColor} />
          <Pill icon={<Activity className="h-3 w-3" />} label={`${agentCount} Agents`} color="#22c55e" />
          <Pill icon={<Clock className="h-3 w-3" />} label={elapsed} color="#f59e0b" />
          <Pill
            icon={isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            label={isConnected ? 'Live' : 'Offline'}
            color={isConnected ? '#22c55e' : '#ef4444'}
            pulse={isConnected}
          />
        </div>

        {/* Compact status for small screens */}
        <div className="flex items-center gap-2 md:hidden">
          <span
            className="glass-soft flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1"
            title={`Risk: ${riskLevel}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: riskColor }} />
            <span className="text-[9px] font-display font-semibold tracking-[0.16em] text-white/60 uppercase">{riskLevel}</span>
          </span>
          <span
            className="glass-soft flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1"
            title={isConnected ? 'Connected' : 'Offline'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? '#22c55e' : '#ef4444' }} />
          </span>
        </div>
      </div>
    </nav>
  )
}

export default Nav
