/**
 * Nav - Mission status command bar.
 * Premium emergency operations navigation system.
 * Deep dark theme with restrained accent colours.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Clock, Wifi, WifiOff, Crosshair } from 'lucide-react'
import { useMissionContext, useRiskLevel, useIsRunning } from '@/context/MissionContext'

function Pill({ icon, label, color, isActive }) {
  const border = isActive ? color : '#3f444f'
  const textColor = isActive ? color : '#a3a6af'
  return (
    <span className="flex items-center gap-2 rounded-full border bg-[#0d0d0f] px-2.5 py-1.5 text-xs font-display font-semibold tracking-[0.04em]" style={{ borderColor: border }}>
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
  const riskColor =
    riskLevel === 'CRITICAL'
      ? '#ef4444'
      : riskLevel === 'HIGH'
        ? '#f59e0b'
        : riskLevel === 'MEDIUM'
          ? '#3b82f6'
          : '#10b981'

  return (
    <nav
      aria-label="Mission command bar"
      className="fixed inset-x-0 top-0 z-50 border-b border-[#3f444f] bg-[#0d0d0f] shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm">
            <Crosshair className="h-4 w-4 text-[#3b82f6]" />
          </div>
          <div className="min-w-0 leading-none">
            <div className="font-display text-sm font-semibold tracking-[0.12em] text-[#fafafa]">
              INZORA TERRA OS
            </div>
            <div className="mt-1 text-[10px] font-mono tracking-[0.08em] text-[#a3a6af]">
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
            color="#10b981"
            isActive={agentCount > 0}
          />
          <Pill
            icon={<Clock className="h-3 w-3" />}
            label={elapsed}
            color="#a3a6af"
          />
          <Pill
            icon={isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            label={isConnected ? 'Live' : 'Offline'}
            color={isConnected ? '#10b981' : '#ef4444'}
            isActive={isConnected}
          />
        </div>

        {/* Compact status for small screens */}
        <div className="flex items-center gap-2 md:hidden">
          <span
            className="flex items-center gap-1.5 rounded-full border bg-[#3f444f] px-2.5 py-1"
            title={`Risk: ${riskLevel}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor }} />
            <span className="text-[10px] font-display font-semibold tracking-[0.04em] text-[#a3a6af]">{riskLevel}</span>
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full border bg-[#3f444f] px-2.5 py-1"
            title={isConnected ? 'Connected' : 'Offline'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? '#10b981' : '#ef4444' }} />
          </span>
        </div>
      </div>
    </nav>
  )
}

export default Nav