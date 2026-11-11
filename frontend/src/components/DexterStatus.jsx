/**
 * DexterStatus - caption strip with voice state indicators.
 * Premium dark theme with aerospace accent colours.
 * Voice assistance is a core Inzora Terra capability.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Mic, Brain, Volume2, Loader } from 'lucide-react'
import { voice } from '@/services/voice'
import { VoiceState } from '@/hooks/useVoiceCommand'

const STATE_CONFIG = {
  [VoiceState.IDLE]: { label: '', icon: Bot },
  [VoiceState.LISTENING]: { label: 'LISTENING', icon: Mic },
  [VoiceState.WAKE_WORD_DETECTED]: { label: 'ACKNOWLEDGED', icon: Bot },
  [VoiceState.COMMAND_LISTENING]: { label: 'COMMAND INPUT', icon: Mic },
  [VoiceState.THINKING]: { label: 'PROCESSING', icon: Brain },
  [VoiceState.SPEAKING]: { label: 'SPEAKING', icon: Volume2 },
  [VoiceState.STANDBY]: { label: 'STANDBY', icon: Bot },
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
  const showState = activeState !== VoiceState.IDLE
  const showCaption = Boolean(line) && !voice.isMuted() && voice.supported

  if (!showState && !showCaption) return null

  const label = STATE_CONFIG[activeState]?.label || ''
  const IconComp = STATE_CONFIG[activeState]?.icon || Bot

  const bgColor = activeState !== VoiceState.IDLE ? '#1e2328' : '#0d0d0f'
  const borderColor = activeState !== VoiceState.IDLE ? '#3f444f' : '#3f444f'
  const textColor = activeState !== VoiceState.IDLE ? '#a3a6af' : '#6b728b'
  const accentColor = activeState !== VoiceState.IDLE ? '#3b82f6' : '#6b728b'

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
          className="fixed bottom-7 left-1/2 z-40 flex max-w-[min(90vw,38rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-[#0d0d0f] border-[#3f444f] px-3 py-2 pointer-events-none font-display font-medium uppercase tracking-[0.2em] text-[9px] text-[#6b728b]"
        >
          {/* State indicator icon */}
          {showState && (
            <div className="relative shrink-0 w-6 h-6 rounded-full border bg-[#1e2328] border-[#3f444f] flex items-center justify-center">
              <IconComp className="w-2.5 h-2.5 text-[#3b82f6]" />
              {(activeState === VoiceState.LISTENING || activeState === VoiceState.THINKING || activeState === VoiceState.COMMAND_LISTENING) && (
                <div className="absolute inset-0 rounded-full border border-[#3f444f] animate-pulse opacity-30" />
              )}
            </div>
          )}

          <div className="min-w-0">
            {/* State label */}
            {showState && (
              <div className="text-[8px] font-display font-semibold uppercase tracking-[0.2em] text-[#6b728b] mb-0.5">
                Voice · {label}
              </div>
            )}
            {/* Caption text */}
            {showCaption && (
              <p className="text-[9px] text-[#6b728b] leading-snug truncate max-w-[28rem]">
                {line}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}