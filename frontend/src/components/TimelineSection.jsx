/**
 * TimelineSection - Live mission timeline.
 *
 * Connected to live: timeline events from context (SSE stream).
 * Shows agent execution flow with thinking indicators and handoff visualization.
 */

import { motion } from 'framer-motion'
import { useMissionContext } from '@/context/MissionContext'
import { ArrowDown, Zap, Shield, MapPin, Users, BookOpen, HeartPulse, Brain } from 'lucide-react'

const DEFAULT_EVENTS = [
  { time: new Date().toISOString(), agent: 'System', color: '#6b7280', message: 'Awaiting mission start...' },
]

/** Rolling window so a long mission stays a clean one-shot story instead of a flood. */
const MAX_VISIBLE_EVENTS = 80

/** Event type icons for visual distinction */
const EVENT_ICONS = {
  agent_start: Zap,
  agent_complete: Zap,
  handoff: ArrowDown,
  stage_change: ArrowDown,
  decision: Shield,
}

function TimelineSection() {
  const { state } = useMissionContext()

  // Use live timeline if available, fallback to default
  const all = state.timeline.length > 0 ? state.timeline : DEFAULT_EVENTS
  // Keep the most recent events and cap the stagger
  const events = all.length > MAX_VISIBLE_EVENTS ? all.slice(-MAX_VISIBLE_EVENTS) : all

  // Format timestamp for display
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return isoString.slice(11, 16) || '00:00'
    }
  }

  // Get icon for event type
  const getEventIcon = (event) => {
    const stage = event.stage || ''
    if (stage.includes('start')) return '▶'
    if (stage.includes('complete')) return '✓'
    if (stage.includes('handoff')) return '→'
    if (stage.includes('decision')) return '⚠'
    if (stage.includes('retry')) return '↻'
    if (stage.includes('failed')) return '✗'
    if (stage.includes('stage_change')) return '◆'
    return '•'
  }

  // Color coding for different event types
  const getEventAccent = (event) => {
    const stage = event.stage || ''
    if (stage.includes('decision')) return '#f59e0b'
    if (stage.includes('failed') || stage.includes('retry')) return '#ef4444'
    if (stage.includes('complete')) return '#22c55e'
    if (stage.includes('handoff')) return '#22d3ee'
    if (stage.includes('stage_change')) return '#3b82f6'
    return event.color || '#6b7280'
  }

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <div className="section-eyebrow mb-4">Mission Log</div>
          <h2 className="section-title font-display text-3xl font-semibold tracking-[0.04em] md:text-4xl">Timeline</h2>
          <p className="mt-3 font-mono text-xs text-white/35">
            {events.length} event{events.length !== 1 ? 's' : ''} recorded
          </p>
        </div>

        <div className="space-y-2">
          {events.map((event, idx) => {
            const accent = getEventAccent(event)
            const icon = getEventIcon(event)
            const isHandoff = (event.stage || '').includes('handoff')
            const isDecision = (event.stage || '').includes('decision')
            const isStart = (event.stage || '').includes('agent_start')
            const isComplete = (event.stage || '').includes('agent_complete')

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(idx, 15) * 0.04, duration: 0.3 }}
                className={`flex gap-4 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isDecision ? 'bg-amber-500/5 border border-amber-500/15' :
                  isHandoff ? 'bg-cyan-500/5 border border-cyan-500/10' :
                  'glass-card'
                }`}
              >
                <div className="w-14 flex-shrink-0 pt-0.5 font-mono text-[10px] text-white/25">
                  {formatTime(event.time)}
                </div>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                    style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}
                  >
                    {icon}
                  </div>
                  {idx < events.length - 1 && (
                    <div className="w-px h-3" style={{ background: `${accent}30` }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: accent }}>
                      {event.agent}
                    </span>
                    {event.stage && (
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/30 uppercase tracking-[0.1em]">
                        {event.stage.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] leading-[1.7] text-white/55">{event.message}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default TimelineSection
