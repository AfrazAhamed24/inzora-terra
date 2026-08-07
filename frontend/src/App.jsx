import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion'
import Lenis from 'lenis'
import {
  Shield, MapPin, Users, BookOpen, Crosshair, Search,
  Send, X, Bot, Brain,
  Activity, AlertTriangle, Clock,
  Thermometer, Wind, Droplets, Eye
} from 'lucide-react'

const AGENTS = [
  { id: 'risk', name: 'Risk Assessment', icon: Shield, color: '#ef4444', status: 'active', confidence: 0.94 },
  { id: 'victim', name: 'Victim Localization', icon: MapPin, color: '#f59e0b', status: 'active', confidence: 0.87 },
  { id: 'resource', name: 'Resource Coordination', icon: Users, color: '#22c55e', status: 'active', confidence: 0.91 },
  { id: 'knowledge', name: 'Knowledge Retrieval', icon: BookOpen, color: '#8b5cf6', status: 'active', confidence: 0.78 },
]

const ZONES = [
  { id: 'A', risk: 0.95, victims: 3, x: 25, y: 30 },
  { id: 'B', risk: 0.72, victims: 2, x: 50, y: 45 },
  { id: 'C', risk: 0.45, victims: 1, x: 75, y: 35 },
  { id: 'D', risk: 0.28, victims: 0, x: 40, y: 70 },
  { id: 'E', risk: 0.82, victims: 2, x: 65, y: 65 },
]

const RAG_DOCS = [
  { id: 1, title: 'FEMA USAR Protocol 7.3', relevance: 0.94, snippet: 'Structural collapse response procedures for reinforced concrete buildings...' },
  { id: 2, title: 'Building Code 1968 Pre-Seismic', relevance: 0.89, snippet: 'Structures built before 1970 lack modern seismic reinforcement...' },
  { id: 3, title: 'Confined Space Operations', relevance: 0.82, snippet: 'Safety protocols for victim extraction in confined spaces...' },
  { id: 4, title: 'Thermal Signature Analysis', relevance: 0.78, snippet: 'IR imaging patterns for live victim detection under debris...' },
]

const MESSAGES = [
  { id: 1, role: 'agent', content: 'Mission initialized. All 4 agents online and ready for collaboration.', agent: 'System' },
  { id: 2, role: 'user', content: 'Assess risk in Zone A' },
  { id: 3, role: 'agent', content: 'Zone A shows 95% risk probability. Structural deformation detected at 2.3mm/hour. Recommending immediate evacuation.', agent: 'Risk Assessment' },
  { id: 4, role: 'agent', content: 'Thermal signature detected in Zone A. 3 victims confirmed at 3.2m depth.', agent: 'Victim Localization' },
  { id: 5, role: 'user', content: 'Deploy rescue teams' },
  { id: 6, role: 'agent', content: 'Team Alpha deployed to Zone A. Team Bravo repositioning to Zone E. ETA 4 minutes.', agent: 'Resource Coordination' },
]

function App() {
  const [showBot, setShowBot] = useState(false)

  const { scrollYProgress } = useScroll()
  const progressScale = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })

  useEffect(() => {
    const lenis = new Lenis({ duration: 1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true })
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
    return () => lenis.destroy()
  }, [])

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa]">
      {/* Progress bar */}
      <motion.div className="fixed top-0 left-0 right-0 h-[1px] bg-white/20 origin-left z-[100]" style={{ scaleX: progressScale }} />

      {/* Navigation */}
      <Nav />

      {/* Main content */}
      <main>
        <HeroSection />
        <DashboardSection />
        <AgentSection />
        <RAGSection />
        <TimelineSection />
      </main>

      {/* Assistive Bot */}
      <AnimatePresence>
        {showBot && <AssistiveBot onClose={() => setShowBot(false)} />}
      </AnimatePresence>

      {/* Bot trigger */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2 }}
        onClick={() => setShowBot(!showBot)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl flex items-center justify-center hover:bg-white/10 transition-all duration-300"
      >
        {showBot ? <X className="w-5 h-5 text-white/70" /> : <Bot className="w-5 h-5 text-white/70" />}
      </motion.button>
    </div>
  )
}

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 backdrop-blur-xl flex items-center justify-center">
              <Crosshair className="w-4 h-4 text-white/70" />
            </div>
            <span className="text-sm font-medium tracking-tight">TERRA-X</span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4">
              <StatusPill icon={<AlertTriangle className="w-3 h-3" />} label="HIGH RISK" color="#ef4444" />
              <StatusPill icon={<Activity className="w-3 h-3" />} label="4 AGENTS" color="#22c55e" />
              <StatusPill icon={<Clock className="w-3 h-3" />} label="09:45:12" color="#f59e0b" />
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Search className="w-3.5 h-3.5 text-white/40" />
              <span className="text-xs text-white/40">⌘K</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function StatusPill({ icon, label, color }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
      <div style={{ color }}>{icon}</div>
      <span className="text-[10px] font-mono tracking-wider" style={{ color }}>{label}</span>
    </div>
  )
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1920&q=80')`,
            filter: 'brightness(0.2) saturate(0.5)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/60 via-[#09090b]/40 to-[#09090b]" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/60">MISSION ACTIVE</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-[-0.03em] mb-4"
        >
          TERRA<span className="text-white/30">-</span><span className="text-white/40">X</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-sm text-white/40 tracking-widest uppercase mb-12"
        >
          AI-Native Mission Operating System
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex items-center justify-center gap-8"
        >
          <SensorBadge icon={<Thermometer className="w-3.5 h-3.5" />} label="THERMAL" value="32.4C" />
          <SensorBadge icon={<Wind className="w-3.5 h-3.5" />} label="WIND" value="12.8 m/s" />
          <SensorBadge icon={<Droplets className="w-3.5 h-3.5" />} label="HUMIDITY" value="67%" />
          <SensorBadge icon={<Eye className="w-3.5 h-3.5" />} label="VISIBILITY" value="0.8 km" />
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-5 h-8 rounded-full border border-white/20 flex justify-center pt-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-white/40" />
        </motion.div>
      </motion.div>
    </section>
  )
}

function SensorBadge({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-xl">
      <div className="text-white/50">{icon}</div>
      <div>
        <div className="text-[8px] text-white/30 tracking-wider">{label}</div>
        <div className="text-xs font-mono text-white/60">{value}</div>
      </div>
    </div>
  )
}

function DashboardSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-1 rounded-full bg-white/40" />
            <span className="text-[10px] text-white/30 tracking-[0.2em] uppercase">Situation Report</span>
          </div>
          <h2 className="text-3xl font-light text-white/90 tracking-tight">Mission Dashboard</h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Risk Overview */}
          <div className="lg:col-span-2 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-medium text-white/60">Zone Risk Overview</h3>
              <span className="text-[10px] text-white/30 font-mono">LIVE</span>
            </div>
            <div className="relative h-64 rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=60')`,
                  filter: 'brightness(0.15) saturate(0.3)',
                }}
              />
              {ZONES.map((zone) => (
                <div
                  key={zone.id}
                  className="absolute w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                  style={{
                    left: `${zone.x}%`,
                    top: `${zone.y}%`,
                    transform: 'translate(-50%, -50%)',
                    background: `radial-gradient(circle, ${getRiskColor(zone.risk)}30 0%, transparent 70%)`,
                    border: `1.5px solid ${getRiskColor(zone.risk)}50`,
                  }}
                >
                  <span className="text-[10px] font-medium text-white/80">{zone.id}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4">
              <LegendItem color="#ef4444" label="Critical" />
              <LegendItem color="#f59e0b" label="High" />
              <LegendItem color="#22c55e" label="Low" />
            </div>
          </div>

          {/* Agent Status */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-6">Agent Status</h3>
            <div className="space-y-4">
              {AGENTS.map((agent) => {
                const Icon = agent.icon
                return (
                  <div key={agent.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}>
                      <Icon className="w-4 h-4" style={{ color: agent.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white/70 truncate">{agent.name}</div>
                      <div className="text-[10px] text-white/30 capitalize">{agent.status}</div>
                    </div>
                    <div className="text-xs font-mono" style={{ color: agent.color }}>
                      {(agent.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AgentSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-1 rounded-full bg-white/40" />
            <span className="text-[10px] text-white/30 tracking-[0.2em] uppercase">Multi-Agent System</span>
          </div>
          <h2 className="text-3xl font-light text-white/90 tracking-tight">Agent Collaboration</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {AGENTS.map((agent, idx) => {
            const Icon = agent.icon
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-5 hover:bg-white/[0.04] transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}>
                    <Icon className="w-5 h-5" style={{ color: agent.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/80">{agent.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: agent.color }} />
                      <span className="text-[10px] text-white/30">Active</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/30">Confidence</span>
                    <span className="text-xs font-mono" style={{ color: agent.color }}>{(agent.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${agent.confidence * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: idx * 0.2 }}
                      className="h-full rounded-full"
                      style={{ background: agent.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/20">Latency</span>
                    <span className="text-white/30 font-mono">{18 + idx * 12}ms</span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function RAGSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-1 rounded-full bg-white/40" />
            <span className="text-[10px] text-white/30 tracking-[0.2em] uppercase">Knowledge Base</span>
          </div>
          <h2 className="text-3xl font-light text-white/90 tracking-tight">Knowledge Retrieval</h2>
        </div>

        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-white/80">Knowledge Retrieval Engine (Prototype)</div>
              <div className="text-[10px] text-white/30">Matched 4 relevant documents</div>
            </div>
          </div>

          <div className="space-y-3">
            {RAG_DOCS.map((doc) => (
              <div key={doc.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-white/70">{doc.title}</div>
                  <div className="text-[10px] font-mono text-emerald-400">{(doc.relevance * 100).toFixed(0)}%</div>
                </div>
                <p className="text-xs text-white/30 leading-relaxed">{doc.snippet}</p>
                <div className="mt-2 w-full h-0.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-emerald-400/50" style={{ width: `${doc.relevance * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function TimelineSection() {
  const events = [
    { time: '09:41', agent: 'Risk Assessment', color: '#ef4444', message: 'Zone A structural integrity at 34%. Recommending immediate evacuation.' },
    { time: '09:41', agent: 'Victim Localization', color: '#f59e0b', message: 'Thermal signature confirmed. 3 victims detected at 3.2m depth.' },
    { time: '09:42', agent: 'Resource Coordination', color: '#22c55e', message: 'Team Alpha deployed to Zone A. ETA 4 minutes.' },
    { time: '09:43', agent: 'Knowledge Retrieval', color: '#8b5cf6', message: 'Protocol match: FEMA USAR Section 7.3.2. Exterior wall breach recommended.' },
    { time: '09:44', agent: 'Risk Assessment', color: '#ef4444', message: 'Secondary collapse probability: 23%. Zone A risk elevated to CRITICAL.' },
    { time: '09:45', agent: 'Resource Coordination', color: '#22c55e', message: 'Phase 1 complete. Teams Alpha and Bravo active.' },
  ]

  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-1 rounded-full bg-white/40" />
            <span className="text-[10px] text-white/30 tracking-[0.2em] uppercase">Mission Log</span>
          </div>
          <h2 className="text-3xl font-light text-white/90 tracking-tight">Timeline</h2>
        </div>

        <div className="space-y-4">
          {events.map((event, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]"
            >
              <div className="text-[10px] font-mono text-white/20 w-12 flex-shrink-0">{event.time}</div>
              <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: event.color }} />
              <div>
                <div className="text-[10px] font-medium mb-1" style={{ color: event.color }}>{event.agent}</div>
                <p className="text-xs text-white/40 leading-relaxed">{event.message}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AssistiveBot({ onClose }) {
  const [messages, setMessages] = useState(MESSAGES)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim()) return
    setMessages([...messages, { id: messages.length + 1, role: 'user', content: input }])
    setInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        role: 'agent',
        content: 'I can help you with mission analysis, risk assessment, and resource coordination. What would you like to know?',
        agent: 'TERRA-X Assistant'
      }])
    }, 1000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className="fixed right-0 top-0 bottom-0 w-96 z-50 flex flex-col"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xl border-l border-white/10" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white/70" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/80">TERRA-X Assistant</div>
            <div className="text-[10px] text-white/30">Knowledge Retrieval</div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <X className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-xl ${
              msg.role === 'user'
                ? 'bg-white/10 border border-white/10'
                : 'bg-white/[0.03] border border-white/[0.06]'
            }`}>
              {msg.agent && <div className="text-[10px] text-white/30 mb-1">{msg.agent}</div>}
              <p className="text-xs text-white/60 leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about the mission..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-white/20 transition-colors"
          />
          <button
            onClick={sendMessage}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Send className="w-4 h-4 text-white/40" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-white/30">{label}</span>
    </div>
  )
}

function getRiskColor(risk) {
  if (risk >= 0.8) return '#ef4444'
  if (risk >= 0.6) return '#f59e0b'
  return '#22c55e'
}

export default App
