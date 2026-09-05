/**
 * TerraX - The single companion chat of D.E.X.T.E.R (the assistant surface).
 *
 * D.E.X.T.E.R is the system; this dock is the chat you talk to. Answers strictly from
 * the live mission state (DexterBrain — no LLM, no keys) and reads replies aloud.
 * Open state is controlled by the parent so voice commands ("Dexter, open the assistant")
 * can raise the dock.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Terminal } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'
import { answerQuestion } from '@/services/dexterBrain'
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
        setMessages((m) => [...m, { id: nextId(), role: 'agent', agent: 'D.E.X.T.E.R', content: answer }])
        setTyping(false)
        voice.speak(answer)
      }, 500)
    },
    [typing, state]
  )

  const latest = messages[messages.length - 1]

  return (
    <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            id="terra-x-panel"
            role="dialog"
            aria-label="D.E.X.T.E.R assistant"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="glass-soft w-[21rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-cyan-500/25 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-display font-semibold tracking-[0.08em] text-white/90">D.E.X.T.E.R</div>
                  <div className="text-[10px] font-display font-medium tracking-[0.14em] text-white/35">Mission Assistant · Online</div>
                </div>
              </div>
              <button
                onClick={() => onOpenChange?.(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                aria-label="Close D.E.X.T.E.R assistant"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick queries */}
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
              {QUICK_QUERIES.map((item) => (
                <button
                  key={item.label}
                  onClick={() => send(item.query)}
                  disabled={typing}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-display text-[11px] font-medium tracking-[0.1em] text-white/55 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-300 disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div aria-live="polite" aria-atomic="false" className="px-4 py-3 h-56 overflow-y-auto space-y-3">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400/50" />
                  <p className="text-xs text-white/35 leading-[1.7] max-w-[16rem]">
                    Quick answers from the live mission state, Commander. Tap a chip or ask
                    anything — no fluff, no latency.
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/10 border border-cyan-500/25'
                        : 'bg-white/[0.04] border border-white/[0.07]'
                    }`}
                  >
                    {msg.agent && <div className="mb-1.5 text-[10px] font-display font-semibold tracking-[0.16em] text-cyan-400/80">{msg.agent}</div>}
                    <p className="text-[13px] leading-[1.75] text-white/70">{msg.content}</p>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
                          className="w-1 h-1 rounded-full bg-cyan-400/60"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send(input)}
                  placeholder="Ask about the mission…"
                  aria-label="Ask about the mission"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-cyan-500/40 transition-colors"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || typing}
                  className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-cyan-500/10"
                  aria-label="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              {latest && (
                <div className="mt-2 text-[10px] font-display font-medium tracking-[0.14em] text-white/25 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-cyan-400/50" />
                  D.E.X.T.E.R · grounded in live agent output
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
        aria-label={open ? 'Close D.E.X.T.E.R assistant' : 'Open D.E.X.T.E.R assistant'}
        className={`flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full border backdrop-blur-xl transition-all duration-300 ${
          open
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/85'
        }`}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${open ? 'bg-cyan-500/20' : 'bg-white/5'}`}>
          <Terminal className="w-3 h-3" />
        </div>
        <span className="text-[11px] font-display font-semibold tracking-[0.22em] uppercase">D.E.X.T.E.R</span>
      </motion.button>
    </div>
  )
}
