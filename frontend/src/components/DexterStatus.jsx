/**
 * DexterStatus - JARVIS-style caption strip with voice state indicators.
 *
 * Shows whatever D.E.X.T.E.R is currently saying as a subtitle, bottom-center,
 * plus the current voice interaction state (LISTENING, THINKING, SPEAKING, etc.)
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Mic, Brain, Volume2, Loader } from 'lucide-react'
import { voice } from '@/services/voice'
import { VoiceState } from '@/hooks/useVoiceCommand'

const STATE_CONFIG = {
  [VoiceState.IDLE]: { color: 'transparent', label: '' },
  [VoiceState.LISTENING]: { color: 'blue', label: 'LISTENING', icon: Mic },
  [VoiceState.WAKE_WORD_DETECTED]: { color: 'cyan', label: 'ACKNOWLEDGED', icon: Bot },
  [VoiceState.COMMAND_LISTENING]: { color: 'cyan', label: 'COMMAND INPUT', icon: Mic },
  [VoiceState.THINKING]: { color: 'amber', label: 'PROCESSING', icon: Brain },
  [VoiceState.SPEAKING]: { color: 'emerald', label: 'SPEAKING', icon: Volume2 },
  [VoiceState.STANDBY]: { color: 'slate', label: 'STANDBY', icon: Bot },
}

export default function DexterStatus({ voiceState = VoiceState.IDLE }) {
  const [line, setLine] = useState(null)
  const [ttsState, setTtsState] = useState(null)

  useEffect(() => {
    const unsubscribe = voice.subscribe((event) => {
      if (event.type === 'start') {
        setLine(event.text)
        setTtsState('speaking')
      } else if (event.type === 'end') {
        setLine((prev) => (prev === event.text ? null : prev))
        setTtsState(null)
      }
    })
    return unsubscribe
  }, [])

  // Determine the active state: TTS overrides for visual consistency
  const activeState = ttsState === 'speaking' ? VoiceState.SPEAKING : voiceState
  const config = STATE_CONFIG[activeState] || STATE_CONFIG[VoiceState.IDLE]
  const showState = activeState !== VoiceState.IDLE
  const showCaption = Boolean(line) && !voice.isMuted() && voice.supported

  if (!showState && !showCaption) return null

  const colorMap = {
    blue: { border: 'border-blue-500/30', bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
    cyan: { border: 'border-cyan-500/30', bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
    amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    slate: { border: 'border-white/10', bg: 'bg-white/5', text: 'text-white/40', dot: 'bg-white/40' },
  }
  const colors = colorMap[config.color] || colorMap.slate
  const IconComp = config.icon || Bot

  return (
    <AnimatePresence mode="wait">
      {(showState || showCaption) && (
        <motion.div
          key={showState ? activeState : 'caption'}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.35 }}
          className="glass-soft fixed bottom-7 left-1/2 z-40 flex max-w-[min(90vw,38rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 px-5 py-3 pointer-events-none"
        >
          {/* State indicator icon */}
          {showState && (
            <div className={`relative shrink-0 w-7 h-7 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}>
              <IconComp className={`w-3.5 h-3.5 ${colors.text}`} />
              {(activeState === VoiceState.LISTENING || activeState === VoiceState.THINKING || activeState === VoiceState.COMMAND_LISTENING) && (
                <div className={`absolute inset-0 rounded-full ${colors.border} border animate-ping opacity-30`} />
              )}
            </div>
          )}

          <div className="min-w-0">
            {/* State label */}
            {showState && (
              <div className={`text-[10px] font-display font-semibold tracking-[0.24em] ${colors.text} uppercase mb-0.5`}>
                D.E.X.T.E.R · {config.label}
              </div>
            )}
            {/* Caption text */}
            {showCaption && (
              <p className="text-[13px] text-white/85 leading-snug truncate max-w-[28rem]">
                {line}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
