/**
 * TerraX - Local mission query panel.
 * Premium dark theme: clean panel, no glassmorphism, no gradients,
 * neutral palette, rule-based logic over mission state.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Terminal } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'
import { voice } from '@/services/voice'

let msgId = 0
const nextId = () => ++msgId

const QUICK_QUERIES = [
  { label: 'Risk', query: 'What is the overall risk?' },
  { label: 'Victims', query: 'How many victims are there?' },
  { label: 'Next actions', query: 'What are the recommended actions?' },
  { label: 'Rescue guidance', query: 'What is the rescue guidance?' },
  { label: 'Who is working', query: 'Which agents are working right now?' },
]

export default function TerraX({ open = false, onOpenChange }) {
  const { state } = useMissionContext()

  // Escape closes the panel (matches the briefing overlay behavior).
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing, open])

  const send = useCallback(
    (text) => {
      const q = String(text || '').trim()
      if (!q || typing) return
      setMessages((m) => [...m, { id: nextId(), role: 'user', content: q }])
      setInput('')
      setTyping(true)
      window.setTimeout(() => {
        const answer = answerQuestion(q, {
          mission: state.mission,
          summary: state.summary,
          agents: state.agents,
          timeline: state.timeline,
          connectionStatus: state.connectionStatus,
          telemetryLive: state.telemetryLive,
        })
        setMessages((m) => [...m, { id: nextId(), role: 'agent', agent: 'Mission Query', content: answer }])
        setTyping(false)
        voice.speak(answer)
      }, 500)
    },
    [typing, state]
  )

  const latest = messages[messages.length - 1]

  return (
    <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            id="terra-x-panel"
            role="dialog"
            aria-label="Local mission query panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-[21rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl glass-panel border border-[#3f444f] bg-[#1e2328] shadow-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3f444f]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg glass-surface bg-[#1e2328] border border-[#3f444f] flex items-center justify-center">
                  <Terminal className="w-3.5 h-3.5 text-[#6b728b]" />
                </div>
                <div>
                  <div className="text-sm font-display font-semibold tracking-[0.08em] text-[#6b728b]">Mission Query</div>
                  <div className="text-[8px] font-display font-medium tracking-[0.14em] text-[#6b728b]/60">
                    Local query mode · rule-based
                  </div>
                </div>
              </div>
              <button
                onClick={() => onOpenChange?.(false)}
                className="p-1.5 rounded-lg hover:bg-[#1e2328] hover:text-[#cfe7ff] transition-colors"
                aria-label="Close local mission query panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick queries */}
            <div className="px-3 pt-2 flex flex-wrap gap-1">
              {QUICK_QUERIES.map((item) => (
                <button
                  key={item.label}
                  onClick={() => send(item.query)}
                  disabled={typing}
                  className="rounded-full border border-[#3f444f] bg-[#1e2328] px-2.5 py-1 font-display text-[9px] font-medium tracking-[0.1em] text-[#6b728b] transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div aria-live="polite" aria-atomic="false" className="px-3 py-3 h-48 overflow-y-auto space-y-2">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                  <Sparkles className="w-3 h-3 text-[#6b728b]/30" />
                  <p className="text-xs text-[#6b728b]/50 leading-[1.7] max-w-[14rem]">
                    Quick answers from available mission state. Tap a chip or ask about risk,
                    victims, resources, sensors, or current status.
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-2.5 py-1.5 rounded-xl glass-surface border border-[#3f444f] ${
                      msg.role === 'user'
                        ? 'bg-[#1e2328]'
                        : 'bg-[#1e2328]'}
                    }`}
                  >
                    {msg.agent && <div className="mb-0.5 text-[8px] font-display font-semibold tracking-[0.14em] text-[#6b728b]/60">{msg.agent}</div>}
                    <p className="text-[9px] leading-[1.6] text-[#a3a6af]">{msg.content}</p>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="px-2 py-1 rounded glass-surface border border-[#3f444f]">
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-0.5 h-0.5 rounded-full bg-[#1e2328]"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-3 pb-3">
              <div className="flex items-center gap-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send(input)}
                  placeholder="Ask about the mission…"
                  aria-label="Ask about the mission"
                  className="flex-1 glass-surface border border-[#3f444f] rounded-lg px-2 py-1.5 text-[8px] text-[#5b6078] outline-none placeholder:text-[#6b728b]/50 focus:border-[#3b82f6] transition-colors"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || typing}
                  className="p-1.5 rounded-lg glass-surface border border-[#3f444f] text-[#6b728b] hover:bg-[#1e2328] transition-colors disabled:opacity-40 disabled:hover:bg-[#1e2328]"
                >
                  <Send className="w-2.5 h-2.5" />
                </button>
              </div>
              {latest && (
                <div className="mt-1 text-[7px] font-display font-medium tracking-[0.12em] text-[#6b728b]/50 flex items-center gap-1">
                  <span className="w-0.5 h-0.5 rounded-full bg-[#1e2328]" />
                  Local response · not the backend assistant endpoint
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dock trigger */}
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2 }}
        onClick={() => onOpenChange?.(!open)}
        aria-expanded={open}
        aria-controls="terra-x-panel"
        aria-label={open ? 'Close local query panel' : 'Open local query panel'}
        className="flex items-center gap-1.5 pl-2 py-1.5 rounded-full border border-[#3f444f] transition-all duration-300 text-[8px] font-display font-medium uppercase tracking-[0.1em] text-[#6b728b] hover:border-[#3b82f6] hover:text-[#3b82f6]"
      >
        <div className="w-4 h-4 rounded-full flex items-center justify-center">
          <Terminal className="w-2.5 h-2.5" />
        </div>
        <span>Query</span>
      </motion.button>
    </div>
  )
}