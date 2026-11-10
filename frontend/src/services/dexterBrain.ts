/**
 * DexterBrain - local rule-based mission query logic.
 *
 * Answers are concise and derived from available mission state.
 * Uses live telemetry, agent progress, and the briefing — in that priority
 * order — so the commander always gets a grounded, specific answer.
 * Never dumps internal logs. Never narrates agent states.
 * Speaks only operationally useful status.
 */

import type {
  MissionResponse,
  MissionSummaryResponse,
  AgentStatus,
  TimelineEvent,
  TelemetryPacket,
} from '@/types/api'

export interface DexterContext {
  mission: MissionResponse | null
  summary: MissionSummaryResponse | null
  agents: AgentStatus[]
  timeline: TimelineEvent[]
  connectionStatus: string
  /** Latest telemetry packet per (zone|sensor) — live sensor feed. */
  telemetryLive?: Record<string, TelemetryPacket>
}

export type DexterCommandAction =
  | 'start_mission'
  | 'open_assistant'
  | 'mute'
  | 'unmute'

export interface DexterCommandResult {
  kind: 'action' | 'answer'
  action?: DexterCommandAction
  text: string
}

function briefingOf(ctx: DexterContext): Record<string, unknown> {
  return ctx.summary?.mission_briefing || {}
}

/**
 * Domain glossary for local informational answers.
 * Used ONLY to answer informational questions (info ≠ action): the assistant
 * explains a term without activating any agent, mission, or tool. This is real
 * knowledge content, not simulated operational state.
 */
const GLOSSARY: Record<string, string> = {
  gpr: 'Ground Penetrating Radar uses short electromagnetic pulses to image the subsurface — mapping voids, buried structures, and anomalies without excavation.',
  'ground penetrating radar': 'Ground Penetrating Radar uses short electromagnetic pulses to image the subsurface — mapping voids, buried structures, and anomalies without excavation.',
  thermal: 'Thermal imaging detects infrared radiation to reveal heat signatures — our primary way to locate survivors by body heat through rubble and debris.',
  'thermal imaging': 'Thermal imaging detects infrared radiation to reveal heat signatures — our primary way to locate survivors by body heat through rubble and debris.',
  lidar: 'LiDAR fires rapid laser pulses to build high-resolution 3D maps of terrain and collapsed structures, even in low light.',
  seismic: 'Seismic sensors measure ground vibration and tilt to detect aftershocks or the onset of a secondary collapse.',
  'structural risk': 'Structural risk rates the likelihood of further collapse from wall tilt, load paths, and material stress. Above threshold it demands evacuation.',
  hazmat: 'HazMat — hazardous materials — covers chemical, biological, or radiological threats that require containment before any entry.',
  'search and rescue': 'Search and rescue — SAR — locates, stabilizes, and extracts survivors from a disaster zone under a coordinated plan.',
  sar: 'Search and rescue — SAR — locates, stabilizes, and extracts survivors from a disaster zone under a coordinated plan.',
  rover: 'The rover is our field platform: it carries sensors and, when deployed, executes the route the orchestrator calculates.',
  'dexter': 'The voice/query layer is a local control surface for Inzora Terra OS. It is rule-based in this prototype.',
}

/** Answer an informational "what is X" question from the glossary, or null if not a glossary query. */
function answerFromGlossary(q: string): string | null {
  for (const [term, def] of Object.entries(GLOSSARY)) {
    if (q.includes(term)) return def
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Live-data helpers — extract real values from telemetry/agents.       */
/* Used as fallback when the full briefing isn't ready yet.           */
/* ------------------------------------------------------------------ */

function liveSensor(live: Record<string, TelemetryPacket> | undefined, zone: string, sensor: string): number | null {
  if (!live) return null
  const pkt = live[`${zone}|${sensor}`]
  return pkt && typeof pkt.value === 'number' ? pkt.value : null
}

function liveWorstSensor(live: Record<string, TelemetryPacket> | undefined, sensor: string): { zone: string; value: number } | null {
  if (!live) return null
  let worst: { zone: string; value: number } | null = null
  for (const key of Object.keys(live)) {
    if (!key.endsWith(`|${sensor}`)) continue
    const zone = key.split('|')[0]
    const pkt = live[key]
    if (pkt && typeof pkt.value === 'number') {
      if (!worst || Math.abs(pkt.value) > Math.abs(worst.value)) worst = { zone, value: pkt.value }
    }
  }
  return worst
}

function liveGasMax(live: Record<string, TelemetryPacket> | undefined): { zone: string; ppm: number } | null {
  if (!live) return null
  let worst: { zone: string; ppm: number } | null = null
  for (const key of Object.keys(live)) {
    if (!key.endsWith('|gas')) continue
    const zone = key.split('|')[0]
    const pkt = live[key]
    if (pkt && typeof pkt.value === 'number' && (!worst || pkt.value > worst.ppm)) worst = { zone, ppm: pkt.value }
  }
  return worst
}

function liveTempMax(live: Record<string, TelemetryPacket> | undefined): { zone: string; temp: number } | null {
  if (!live) return null
  let worst: { zone: string; temp: number } | null = null
  for (const key of Object.keys(live)) {
    if (!key.endsWith('|thermal') && !key.endsWith('|temperature')) continue
    const zone = key.split('|')[0]
    const pkt = live[key]
    if (pkt && typeof pkt.value === 'number' && (!worst || pkt.value > worst.temp)) worst = { zone, temp: pkt.value }
  }
  return worst
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ')
}

function riskFromLive(live: Record<string, TelemetryPacket> | undefined): string {
  if (!live) return 'unknown'
  const tilt = liveWorstSensor(live, 'tilt')
  const gas = liveGasMax(live)
  const temp = liveTempMax(live)
  let score = 0
  if (tilt && Math.abs(tilt.value) > 5) score += 0.5
  else if (tilt && Math.abs(tilt.value) > 3) score += 0.2
  if (gas && gas.ppm > 200) score += 0.3
  else if (gas && gas.ppm > 100) score += 0.1
  if (temp && temp.temp > 50) score += 0.3
  else if (temp && temp.temp > 40) score += 0.15
  if (score >= 0.7) return 'critical'
  if (score >= 0.45) return 'high'
  if (score >= 0.2) return 'elevated'
  return 'low'
}

/* ------------------------------------------------------------------ */
/* answerQuestion — conversational responses grounded in real state.   */
/* Priority: briefing > live telemetry > agent progress > default.     */
/* ------------------------------------------------------------------ */

export function answerQuestion(rawQuery: string, ctx: DexterContext): string {
  const q = rawQuery.toLowerCase().trim()
  if (!q) return 'Voice control is ready.'

  const briefing = briefingOf(ctx)
  const mission = ctx.mission
  const stage = mission?.stage || 'initialized'
  const live = ctx.telemetryLive
  const hasLive = live && Object.keys(live).length > 0

  // Greetings
  if (/^(hi|hello|hey|good (morning|evening|afternoon))/.test(q)) {
    return 'Voice control is ready. What mission status do you need?'
  }

  // Identity
  if (/^(who are you|what are you|what's your name)/.test(q)) {
    return 'This is the local voice and query layer for Inzora Terra OS. It answers from current mission state and prototype rules.'
  }

  // Informational knowledge request — explain a term, do NOT activate anything.
  if (/(what is|what's|what are|define|explain|meaning of|tell me about)\b/.test(q)) {
    const def = answerFromGlossary(q)
    if (def) return def
  }

  // Status — concise operational summary
  if (/(status|how are you|what's happening|what's going on|update|how are we doing|mission status)/.test(q)) {
    if (!mission) return 'Systems are standing by.'

    const risk = briefing.overall_risk
    const zones = briefing.priority_zones
    const victims = briefing.total_victims_estimated

    // Briefing available → use it
    if (risk) {
      const parts: string[] = []
      parts.push(`Risk level is ${String(risk).toLowerCase()}`)
      if (Array.isArray(zones) && zones.length) parts.push(`prioritizing zones ${zones.join(' and ')}`)
      if (victims !== undefined && victims !== null) parts.push(`${victims} probable victims identified`)
      return `${parts[0]}. ${parts.slice(1).join('. ')}.`.replace(/\.\./g, '.')
    }

    // Briefing not ready → derive from live telemetry + agents
    if (mission.is_running) {
      const parts: string[] = []
      const riskLive = riskFromLive(live)
      parts.push(`Risk is ${riskLive}`)
      const active = ctx.agents.filter((a) => a.status === 'active')
      const done = ctx.agents.filter((a) => a.status === 'completed')
      if (active.length) parts.push(`${active.map((a) => a.name).join(' and ')} ${active.length > 1 ? 'are' : 'is'} actively scanning`)
      if (done.length) parts.push(`${done.length} of ${ctx.agents.length} assessments complete`)
      if (hasLive) {
        const tilt = liveWorstSensor(live, 'tilt')
        if (tilt && Math.abs(tilt.value) > 0) parts.push(`max tilt ${Math.abs(tilt.value).toFixed(1)} degrees in ${tilt.zone}`)
        const gas = liveGasMax(live)
        if (gas && gas.ppm > 0) parts.push(`gas ${gas.ppm.toFixed(0)} ppm in ${gas.zone}`)
      }
      return parts.join('. ') + '.'
    }

    return 'Systems are standing by.'
  }

  // Risk
  if (/(risk|danger|safe|dangerous|how bad|structural)/.test(q)) {
    const risk = briefing.overall_risk
    if (risk) {
      const hazards = briefing.hazards as string[] | undefined
      const hazardNote = hazards?.length ? ` Primary concern: ${hazards[0].toLowerCase()}.` : ''
      return `Structural risk is ${String(risk).toLowerCase()}.${hazardNote}`
    }
    // Fallback: derive from live sensors
    if (hasLive) {
      const riskLive = riskFromLive(live)
      const tilt = liveWorstSensor(live, 'tilt')
      const parts: string[] = [`Structural risk is currently ${riskLive}.`]
      if (tilt && Math.abs(tilt.value) > 3) parts.push(`Max tilt angle ${Math.abs(tilt.value).toFixed(1)} degrees in the ${tilt.zone} zone.`)
      const gas = liveGasMax(live)
      if (gas && gas.ppm > 150) parts.push(`Gas at ${gas.ppm.toFixed(0)} ppm in ${gas.zone}.`)
      return parts.join(' ')
    }
    if (mission?.is_running) return 'Risk assessment is still processing — sensors are active.'
    return 'Risk assessment will begin once the mission is authorized.'
  }

  // Victims
  if (/(victim|people|survivor|missing|how many|trapped)/.test(q)) {
    const total = briefing.total_victims_estimated
    const zones = briefing.priority_zones
    if (total !== undefined) return `${total} probable victims. Priority zones: ${Array.isArray(zones) ? zones.join(', ') : 'pending'}.`
    // Fallback: victim agent not done yet
    const victimAgent = ctx.agents.find((a) => a.id === 'victim_localization')
    if (victimAgent?.status === 'active') return 'Victim localization agent is scanning now — I will report the moment detections are confirmed.'
    if (victimAgent?.status === 'completed') return 'Victim detection complete. Awaiting final briefing compilation.'
    if (mission?.is_running) return 'Victim detection is queued — risk assessment runs first.'
    return 'Victim detection will start after mission authorization.'
  }

  // Zones
  if (/(zone|sector|area|where)/.test(q)) {
    const zones = briefing.priority_zones
    if (Array.isArray(zones) && zones.length) return `Priority zones: ${zones.join(', ')}. Concentrate search there first.`
    // Fallback: use live sensor readings to name active zones
    if (hasLive) {
      const activeZones = new Set<string>()
      for (const key of Object.keys(live)) {
        const zone = key.split('|')[0]
        if (zone !== 'site') activeZones.add(zone)
      }
      if (activeZones.size) return `Active sensor coverage: ${[...activeZones].join(', ')}. Full zone analysis pending.`
    }
    return 'Zone analysis is in progress.'
  }

  // Actions / next steps
  if (/(action|next|what (should|do) (we|i)|recommend|plan)/.test(q)) {
    const actions = briefing.immediate_actions
    if (Array.isArray(actions) && actions.length) {
      return actions.length === 1
        ? `Recommended: ${actions[0].toLowerCase()}.`
        : `${actions.length} actions recommended. Top priority: ${actions[0].toLowerCase()}.`
    }
    // Fallback: derive next action from agent progress
    const active = ctx.agents.filter((a) => a.status === 'active')
    const done = ctx.agents.filter((a) => a.status === 'completed')
    if (active.length) return `${active.map((a) => a.name).join(' and ')} ${active.length > 1 ? 'are' : 'is'} working now. Next agent in the chain will activate after.`
    if (done.length && done.length < ctx.agents.length) return `${done.length} of ${ctx.agents.length} agents complete. Pipeline progressing.`
    if (mission?.is_running) return 'All agents are processing. Stand by for the full briefing.'
    return 'Awaiting mission authorization to begin operations.'
  }

  // Rescue guidance
  if (/(rescue|extraction|entry|field|handoff|deploy)/.test(q)) {
    const rescue = briefing.rescue_guidance as Record<string, unknown> | undefined
    if (rescue) {
      const clearance = String(rescue.entry_clearance || '').toLowerCase()
      const seq = Array.isArray(rescue.priority_sequence) ? rescue.priority_sequence : []
      if (seq.length) return `Entry ${clearance}. Priority sequence: ${seq.join(', ')}.`
      return `Entry ${clearance || 'pending'}.`
    }
    const resourceAgent = ctx.agents.find((a) => a.id === 'resource_coordination')
    if (resourceAgent?.status === 'active') return 'Resource coordination is compiling the deployment plan now.'
    if (resourceAgent?.status === 'completed') return 'Resource plan ready. Awaiting final briefing.'
    if (mission?.is_running) return 'Rescue guidance is being compiled — victim and resource agents are working.'
    return 'Rescue guidance will be available after the full assessment.'
  }

  // Agents / who is working
  if (/(agent|who.*(work|active)|system)/.test(q)) {
    const active = ctx.agents.filter((a) => a.status === 'active')
    if (active.length) return `${active.map((a) => a.name).join(' and ')} ${active.length > 1 ? 'are' : 'is'} actively working.`
    const done = ctx.agents.filter((a) => a.status === 'completed')
    if (done.length) return `${done.length} of ${ctx.agents.length} assessments complete.`
    if (mission?.is_running) return 'Agent pipeline is initializing.'
    return 'The agent network is standing by.'
  }

  // Findings
  if (/(what did you find|what have you found|what.*(found|detected|discovered|located)|any (survivors|signals|findings)|your (findings|results)|what.*result|what did the (scan|search) show)/.test(q)) {
    if (!mission || !mission.is_running) return 'No operation is active yet. Authorize the mission to begin the search.'

    // Use briefing if available
    const total = briefing.total_victims_estimated
    const zones = briefing.priority_zones
    if (total !== undefined) return `${total} probable survivor${total === 1 ? '' : 's'} detected. Concentration: ${Array.isArray(zones) ? zones.join(', ') : 'pending'}.`

    // Fallback: derive from live data
    if (hasLive) {
      const parts: string[] = []
      const riskLive = riskFromLive(live)
      parts.push(`Current risk assessment: ${riskLive}`)
      const tilt = liveWorstSensor(live, 'tilt')
      if (tilt) parts.push(`Max tilt ${Math.abs(tilt.value).toFixed(1)} degrees in ${tilt.zone}`)
      const temp = liveTempMax(live)
      if (temp && temp.temp > 31) parts.push(`Thermal signature ${temp.temp.toFixed(0)} degrees in ${temp.zone} — possible survivor indicator`)
      const gas = liveGasMax(live)
      if (gas && gas.ppm > 150) parts.push(`Gas ${gas.ppm.toFixed(0)} ppm in ${gas.zone}`)
      if (parts.length > 1) return parts.join('. ') + '.'
      return 'Sensors are active. Findings will be more specific as agents complete their analysis.'
    }
    const active = ctx.agents.filter((a) => a.status === 'active')
    if (active.length) return `${active[0].name} is scanning now. Results incoming.`
    return 'Scan in progress. Stand by for confirmed findings.'
  }

  // Mission progress
  if (/(mission|stage|phase|progress|where are we)/.test(q)) {
    if (!mission) return 'No active mission.'
    if (mission.is_running) {
      const parts: string[] = [`Stage: ${stageLabel(stage)}.`]
      const done = ctx.agents.filter((a) => a.status === 'completed')
      if (done.length) parts.push(`${done.length} of ${ctx.agents.length} agents complete.`)
      return `Mission active. ${parts.join(' ')}`
    }
    return `Mission ${stage}.`
  }

  // Approval / HITL
  if (/(approve|confirm|waiting|pending|decision)/.test(q)) {
    if (ctx.summary?.needs_human_review) return 'There is one decision awaiting your authorization.'
    return 'No pending authorizations.'
  }

  // Explainability
  if (/(why|explain|how|what happened)/.test(q)) {
    const last = ctx.timeline[ctx.timeline.length - 1]
    if (last) return `Latest: ${last.message}. All decisions are logged in the timeline.`
    return 'Every decision is logged in the timeline. I can walk you through any specific finding.'
  }

  // Thanks
  if (/(thank|appreciate|good|nice)/.test(q)) {
    return 'Voice control is ready.'
  }

  // Help
  if (/(help|what can you do|commands)/.test(q)) {
    return 'Ask me about risk, victims, zones, actions, rescue guidance, mission status, or agent progress. You can also say "start", "stop", or "deploy" to control the mission.'
  }

  // Stop mission
  if (/(stop|halt|pause|abort)/.test(q)) {
    if (mission?.is_running) {
      return { kind: 'action' as const, action: 'stop_mission' as const, text: 'Mission halted.' }
    }
    return 'No active mission to stop.'
  }

  // Deploy resources
  if (/(deploy|send|dispatch|launch)/.test(q) && /(team|resource|unit|rescue)/.test(q)) {
    const resourceAgent = ctx.agents.find((a) => a.id === 'resource_coordination')
    if (resourceAgent?.status === 'completed') return 'Resource plan is ready. Shall I authorize deployment?'
    return 'Resource deployment is being compiled by the rescue coordination agent.'
  }

  // Read the briefing
  if (/(read|speak|tell me the)\s*(mission )?briefing/.test(q)) {
    const risk = briefing.overall_risk
    const zones = briefing.priority_zones
    const victims = briefing.total_victims_estimated
    if (risk) {
      return `Mission briefing: Risk level ${String(risk).toLowerCase()}. Priority zones ${Array.isArray(zones) ? zones.join(', ') : 'pending'}. ${victims || 0} probable victims. Entry clearance: ${((briefing as any).rescue_guidance || {}).entry_clearance || 'pending'}.`
    }
    // Fallback: live summary
    if (hasLive) {
      return `Live briefing: Risk ${riskFromLive(live)}. Stage: ${stageLabel(stage)}. Sensors active across ${new Set(Object.keys(live).map((k) => k.split('|')[0])).size} zones.`
    }
    return 'Briefing is still being compiled.'
  }

  // Agent details
  if (/(which|what).*(agent|who).*(running|active|working|done|complete)/.test(q)) {
    const active = ctx.agents.filter((a) => a.status === 'active')
    const completed = ctx.agents.filter((a) => a.status === 'completed')
    if (active.length) return `${active.map((a) => a.name).join(' and ')} ${active.length > 1 ? 'are' : 'is'} currently processing.`
    if (completed.length) return `${completed.length} agents have completed their assessments.`
    if (mission?.is_running) return 'Agent pipeline is initializing.'
    return 'Agents are standing by for mission activation.'
  }

  // Readiness — "are you ready"
  if (/(ready|prepared|initialized)/.test(q)) {
    if (mission?.is_running) return 'All systems operational. Mission is live.'
    if (mission) return 'Systems initialized. Awaiting your authorization to start.'
    return 'Systems standing by. Say "Dexter" then authorize to begin.'
  }

  // Telemetry — "what are the sensors reading"
  if (/(sensor|telemetry|reading|tilt|gas|temperature|thermal|stress|acceleration)/.test(q)) {
    if (!hasLive) {
      if (mission?.is_running) return 'Sensors are initializing. Readings will be available shortly.'
      return 'Sensors are offline. Authorize the mission to activate them.'
    }
    const parts: string[] = []
    const tilt = liveWorstSensor(live, 'tilt')
    if (tilt) parts.push(`Tilt: max ${Math.abs(tilt.value).toFixed(1)} degrees in ${tilt.zone}`)
    const gas = liveGasMax(live)
    if (gas) parts.push(`Gas: ${gas.ppm.toFixed(0)} ppm in ${gas.zone}`)
    const temp = liveTempMax(live)
    if (temp) parts.push(`Temperature: ${temp.temp.toFixed(0)} degrees in ${temp.zone}`)
    const stress = liveWorstSensor(live, 'stress')
    if (stress) parts.push(`Stress index: ${Math.abs(stress.value).toFixed(0)} in ${stress.zone}`)
    if (parts.length) return parts.join('. ') + '.'
    return 'Sensor data is flowing but no anomalies detected yet.'
  }

  return "I don't have that information yet. Ask about risk, victims, zones, sensors, or mission status."
}

/**
 * Route a command to an action or a spoken answer.
 */
export function handleVoiceCommand(raw: string, ctx: DexterContext): DexterCommandResult {
  const WAKE = /(?:d[.\s]*e[.\s]*x[.\s]*t[.\s]*e[.\s]*r)/i
  const cleaned = raw
    .replace(new RegExp(`^\\s*(?:hey|ok|okay)?\\s*${WAKE.source}[,.!]?\\s+`, 'i'), '')
    .trim()
  const q = cleaned.toLowerCase()

  // Wake word alone — the voice hook already acknowledged readiness.
  // If nothing is running, start the mission
  if (!cleaned) {
    if (!ctx.mission || !ctx.mission.is_running) {
      return { kind: 'action', action: 'start_mission', text: 'Initiating assessment.' }
    }
    return { kind: 'answer', text: `Mission active. Stage: ${(ctx.mission?.stage || 'running').replace(/_/g, ' ')}.` }
  }

  // Wake word + actual request — the voice hook detected "Dexter, <request>"
  // and is calling us directly with the FULL original transcript.
  // We need to use the cleaned query (wake word stripped) for intent matching
  // but the full query for answer generation.
  // This is handled by the answerQuestion function below.

  // Start mission
  if (/^(run|start|launch|begin|execute|initialize|scan|deploy|go|initiate)(\s|$)/.test(q) ||
      /(run|start|launch|begin|execute|initialize|scan|initiate|deploy)\s*(the\s*)?(mission|process|rescue|dexter|operation|sequence)/.test(q)) {
    return { kind: 'action', action: 'start_mission', text: 'Understood.' }
  }

  // Open assistant
  if (/(open (the )?(dexter|assistant|panel|chat|terra)|talk to (terra|you)|hey dexter|open dexter)/.test(q)) {
    return { kind: 'action', action: 'open_assistant', text: 'Opening the assistant.' }
  }

  // Mute/unmute
  if (/(mute|silence|quiet|shut up|stop talking)/.test(q)) {
    return { kind: 'action', action: 'mute', text: 'Going silent.' }
  }
  if (/(unmute|speak up|sound (on|back)|voice on)/.test(q)) {
    return { kind: 'action', action: 'unmute', text: 'Voice restored.' }
  }

  return { kind: 'answer', text: answerQuestion(cleaned || raw, ctx) }
}

export default { answerQuestion, handleVoiceCommand }
