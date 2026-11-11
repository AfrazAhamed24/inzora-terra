/**
 * Nav - Mission status command bar.
 * Minimal Apple-design: clean, no glassmorphism, system font, neutral palette.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Clock, Wifi, WifiOff, Crosshair } from 'lucide-react'
import { useMissionContext, useRiskLevel, useIsRunning } from '@/context/MissionContext'

function Pill({ icon, label, color, isActive }) {
  const border = isActive ? color : '#E2E7EE'
  const textColor = isActive ? color : '#536176'
  return (
    <span className="flex items-center gap-2 rounded-full border bg-white px-2.5 py-1.5 text-xs font-display font-semibold tracking-[0.04em]" style={{ borderColor: border }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: textColor }}>{label}</span>
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

  const isConnected = state.connectionStatus === 'connected'
  const agentCount = state.agents.length
  const riskColor = riskLevel === 'CRITICAL'
    ? '#DC4545'
    : riskLevel === 'HIGH'
      ? '#D97706'
      : riskLevel === 'MEDIUM'
        ? '#2563EB'
        : '#15966A'

  return (
    <nav aria-label="Mission command bar" className="fixed inset-x-0 top-0 z-50 border-b border-[#E2E7EE] bg-white shadow-[0_1px_3px_rgba(23,32,51,0.04)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm">
            <Crosshair className="h-4 w-4 text-[#2563EB]" />
          </div>
          <div className="min-w-0 leading-none">
            <div className="font-display text-sm font-semibold tracking-[0.12em] text-[#172033]">
              INZORA TERRA OS
            </div>
            <div className="mt-1 text-[11px] font-mono tracking-[0.08em] text-[#536176]">
              {state.mission ? state.mission.mission_id : 'Command Uplink A Standby'}
            </div>
          </div>
        </div>

        {/* Live status pills */}
        <div className="hidden items-center gap-2.5 md:flex">
          <Pill
            icon={<AlertTriangle className="h-3 w-3" />}
            label={riskLevel}
            color={riskColor}
            isActive={riskLevel === 'CRITICAL'}
          />
          <Pill
            icon={<Activity className="h-3 w-3" />}
            label={`${agentCount} Agents`}
            color="#15966A"
            isActive={agentCount > 0}
          />
          <Pill
            icon={<Clock className="h-3 w-3" />}
            label={elapsed}
            color="#6b7280"
          />
          <Pill
            icon={isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            label={isConnected ? 'Live' : 'Offline'}
            color={isConnected ? '#15966A' : '#DC4545'}
            isActive={isConnected}
          />
        </div>

        {/* Compact status for small screens */}
        <div className="flex items-center gap-2 md:hidden">
          <span
            className="flex items-center gap-1.5 rounded-full border border-[#E2E7EE] bg-white px-2.5 py-1"
            title={`Risk: ${riskLevel}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor }} />
            <span className="text-[11px] font-display font-semibold tracking-[0.04em] text-[#536176]">{riskLevel}</span>
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full border border-[#E2E7EE] bg-white px-2.5 py-1"
            title={isConnected ? 'Connected' : 'Offline'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? '#15966A' : '#DC4545' }} />
          </span>
        </div>
      </div>
    </nav>
  )
}

export default Nav
