import type { MissionReportData } from '../api';
import { AGENT_DEFS, type MissionListItem } from '../api';
import { DEMO_RESOURCES } from '../resources/demoData';

export interface ReportZone { zone: string; priority: string; probability: number | null; estimate: string; }
export interface ReportAssignment { id: string; type: string; zone: string; assignedTo: string; status: string; }
export interface ReportTask { task: string; agent: string; confidence: number | null; status: string; evaluation: string; }
export interface ReportAgent { key: string; name: string; responsibility: string; confidence: number | null; status: string; evaluation: string; }

export interface ReportView {
  title: string;
  missionId: string;
  incident: string;
  region: string;
  stage: string;
  phase: string;
  createdAt: string;
  generatedAt: string;
  isRunning: boolean;
  demo: boolean;
  riskLevel: string;
  riskScore: number | null;
  riskConfidence: number | null;
  recommendation: string;
  needsReview: boolean;
  victimTotal: string;
  primaryZone: string;
  zones: ReportZone[];
  hazards: string[];
  entryClearance: string;
  rescueOrder: string[];
  safety: string[];
  triage: string[];
  comms: string;
  tasks: ReportTask[];
  assignments: ReportAssignment[];
  resourceStatus: string;
  utilization: number | null;
  bottlenecks: string[];
  agents: ReportAgent[];
  decisions: Array<{ id: string; status: string; summary: string; agent: string; raisedAt: string }>;
  sops: string[];
  knowledgeNotes: string[];
  activity: string[];
  telemetryCount: number;
  telemetry: string[];
  weather: string;
  sourceNote: string;
}

type Dict = Record<string, unknown>;
const obj = (value: unknown): Dict => value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {};
const str = (value: unknown, fallback = ''): string => typeof value === 'string' && value.trim() ? value : fallback;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const strings = (value: unknown): string[] => arr(value).map((item) => typeof item === 'string' ? item : '').filter(Boolean);
const confidenceLabel = (value: number | null) => value === null ? 'Not recorded' : `${Math.round(value * 100)}%`;

const agentKeyFor = (value: unknown, task = ''): string => {
  const normalized = str(value).toLowerCase().replace(/[^a-z]/g, '');
  const found = AGENT_DEFS.find((agent) => normalized.includes(agent.key.replace(/_/g, '')) || normalized.includes(agent.short.toLowerCase()));
  if (found) return found.key;
  const text = task.toLowerCase();
  if (/victim|survivor|search|trapped|locat/.test(text)) return 'victim_localization';
  if (/resource|team|boat|ambulance|equipment|stage|deploy/.test(text)) return 'resource_coordination';
  if (/sop|code|guidance|procedure|knowledge/.test(text)) return 'knowledge_retrieval';
  if (/rescue|extract|evacuat|triage|entry|safety/.test(text)) return 'rescue_coordination';
  return 'risk_assessment';
};

const outputSummary = (output: unknown): string => {
  const value = obj(output);
  for (const key of ['summary', 'recommendation', 'message', 'assessment', 'finding']) {
    if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  }
  const score = num(value.risk_score);
  if (score !== null) return `Reported structural risk score ${score.toFixed(2)}.`;
  const recommendations = strings(value.recommendations);
  if (recommendations.length) return recommendations.slice(0, 2).join(' ');
  return '';
};

function buildAgents(confidence: Dict, outputs: unknown[]): ReportAgent[] {
  return AGENT_DEFS.map((agent) => {
    const score = num(confidence[agent.key]);
    const matches = outputs.map(obj).filter((item) => agentKeyFor(item.agent_name) === agent.key);
    const latest = matches[matches.length - 1];
    return {
      key: agent.key,
      name: agent.label,
      responsibility: agent.responsibility,
      confidence: score ?? (latest ? num(latest.confidence) : null),
      status: latest ? str(latest.status, 'reported').toUpperCase() : 'NO RUN RECORDED',
      evaluation: latest ? outputSummary(latest.output) || 'Agent output is recorded; no summary text was supplied.' : 'No execution output is recorded for this mission.',
    };
  });
}

function buildLiveReport(data: MissionReportData): ReportView {
  const mission = obj(data.mission);
  const brief = obj(data.mission_briefing);
  const risk = obj(data.risk_report);
  const victims = obj(data.victim_map);
  const resources = obj(data.resource_allocation);
  const rescue = obj(data.rescue_guidance);
  const knowledge = obj(data.knowledge_results);
  const agentOutputs = arr(data.agent_outputs);
  const confidence = { ...obj(brief.confidence_scores), ...data.confidence_scores };

  const zonesRaw = arr(victims.zones);
  const zones: ReportZone[] = zonesRaw.map((item, index) => {
    const zone = obj(item);
    return { zone: str(zone.zone, `Search zone ${index + 1}`), priority: str(zone.priority, String(index + 1)), probability: num(zone.probability), estimate: str(zone.estimated_victims ?? zone.victim_estimate, '—') };
  });
  if (!zones.length) strings(brief.priority_zones).forEach((zone, index) => zones.push({ zone, priority: String(index + 1), probability: null, estimate: '—' }));

  const tasksRaw = arr(data.tasks);
  const tasks: ReportTask[] = tasksRaw.map((item) => {
    const task = obj(item);
    const description = str(task.description, str(task.title, 'Mission task'));
    const agentKey = agentKeyFor(task.assigned_to, description);
    const agent = AGENT_DEFS.find((candidate) => candidate.key === agentKey)!;
    const assignmentNote = str(task.assigned_to) ? 'Assigned in mission task list.' : 'Agent matched from task description; no explicit task owner was recorded.';
    return { task: description, agent: agent.label, confidence: num(data.confidence_scores[agentKey]), status: str(task.status, 'PENDING').toUpperCase(), evaluation: str(task.evaluation, assignmentNote) };
  });
  if (!tasks.length) {
    const actions = [...strings(rescue.priority_sequence), ...strings(brief.immediate_actions)];
    const unique = Array.from(new Set(actions));
    unique.forEach((description) => {
      const key = agentKeyFor('', description);
      const agent = AGENT_DEFS.find((candidate) => candidate.key === key)!;
      tasks.push({ task: description, agent: agent.label, confidence: num(data.confidence_scores[key]), status: 'PLANNED', evaluation: 'Derived from the recorded mission guidance.' });
    });
  }

  const assignments: ReportAssignment[] = arr(resources.assignments).map((item, index) => {
    const assignment = obj(item);
    return { id: str(assignment.id, `R-${index + 1}`), type: str(assignment.type, 'Response resource'), zone: str(assignment.zone, 'Not specified'), assignedTo: str(assignment.assigned_to, 'Unassigned'), status: str(assignment.status, 'Proposed') };
  });
  const decisions = arr(data.human_decisions).map((item, index) => {
    const decision = obj(item);
    return { id: str(decision.id, `D-${index + 1}`), status: str(decision.status, 'pending').toUpperCase(), summary: str(decision.summary, 'Operator review requested'), agent: str(decision.related_agent, '—'), raisedAt: str(decision.raised_at, '') };
  });
  const telemetry = data.telemetry.map((packet) => `${packet.zone}: ${packet.metric} ${packet.value} ${packet.unit} (${packet.sensor_type})`);
  const environment = obj(data.environment);
  const weather = Object.entries(obj(environment.weather)).map(([key, value]) => `${key}: ${String(value)}`).join(' · ');

  return {
    title: str(mission.mission_name, str(mission.environment_id, 'Disaster response report')),
    missionId: str(mission.mission_id, 'Mission ID not recorded'),
    incident: str(mission.incident_text, 'Incident details not recorded.'),
    region: str(mission.environment_id, 'Region not specified'),
    stage: str(mission.stage, 'unknown').replace(/_/g, ' ').toUpperCase(),
    phase: str(mission.phase, 'unknown').replace(/_/g, ' '),
    createdAt: str(mission.created_at),
    generatedAt: str(data.generated_at),
    isRunning: Boolean(mission.is_running),
    demo: false,
    riskLevel: str(risk.likelihood, str(risk.risk_level, str(brief.overall_risk, 'NOT CLASSIFIED'))).toUpperCase(),
    riskScore: num(risk.risk_score),
    riskConfidence: num(data.confidence_scores.risk_assessment),
    recommendation: str(risk.recommendation, strings(brief.immediate_actions).join(' ')),
    needsReview: data.needs_human_review,
    victimTotal: String(victims.total_victims_estimated ?? brief.total_victims_estimated ?? 'Not estimated'),
    primaryZone: str(victims.primary_search_zone, zones[0]?.zone ?? 'Not mapped'),
    zones,
    hazards: strings(risk.hazards),
    entryClearance: str(rescue.entry_clearance, str(brief.rescue_guidance?.entry_clearance, 'No entry clearance recorded.')),
    rescueOrder: [...strings(rescue.priority_sequence), ...strings(brief.rescue_guidance?.priority_sequence)].filter((value, index, list) => list.indexOf(value) === index),
    safety: strings(rescue.safety_constraints).length ? strings(rescue.safety_constraints) : strings(brief.rescue_guidance?.safety_constraints),
    triage: strings(rescue.triage_notes).length ? strings(rescue.triage_notes) : strings(brief.rescue_guidance?.triage_notes),
    comms: str(rescue.comms_guidance, str(brief.rescue_guidance?.comms_guidance, 'Follow the incident command communication plan.')),
    tasks,
    assignments,
    resourceStatus: str(resources.status, str(brief.resource_status, assignments.length ? 'Assignments recorded' : 'Not recorded')),
    utilization: num(resources.utilization),
    bottlenecks: strings(resources.bottlenecks),
    agents: buildAgents(confidence, agentOutputs),
    decisions,
    sops: arr(knowledge.sops).map((item) => { const sop = obj(item); return `${str(sop.id, 'SOP')} · ${str(sop.title, 'Reference')}`; }),
    knowledgeNotes: strings(knowledge.recommendations),
    activity: data.timeline.slice(-10).map((event) => `${event.ts} · ${event.agent || 'System'} · ${event.message || event.type}`),
    telemetryCount: data.telemetry_count,
    telemetry,
    weather: weather || 'No environment summary recorded.',
    sourceNote: 'Generated from the selected mission state, specialist reports, and current decision records. Missing values are marked as not recorded.',
  };
}

const DEMO_CONFIDENCE: Record<string, number> = { risk_assessment: 0.78, victim_localization: 0.71, resource_coordination: 0.66, knowledge_retrieval: 0.8, rescue_coordination: 0.88 };
const DEMO_AGENTS = buildAgents(DEMO_CONFIDENCE, []);

const DEMO_REPORTS: Record<string, ReportView> = {
  chennai: {
    title: 'Chennai · Urban flooding', missionId: 'DEMO-CHENNAI', incident: 'Fictional flood response scenario affecting low-lying neighborhoods in Chennai.', region: 'Chennai', stage: 'SIMULATION', phase: 'planning', createdAt: '', generatedAt: '', isRunning: false, demo: true,
    riskLevel: 'HIGH', riskScore: 0.78, riskConfidence: 0.78, recommendation: 'Evacuate ground-floor households in Perumbakkam and Pallikaranai; use boats and high-ground vehicles.', needsReview: true,
    victimTotal: '63 estimated affected or missing', primaryZone: 'Perumbakkam blocks A–C',
    zones: [{ zone: 'Perumbakkam blocks A–C', priority: '1', probability: 0.86, estimate: '—' }, { zone: 'Pallikaranai marsh-edge housing', priority: '2', probability: 0.74, estimate: '—' }, { zone: 'Manali New Town', priority: '3', probability: 0.62, estimate: '—' }],
    hazards: ['Rising Kosasthalaiyar river', 'Submerged underpasses and open manholes', 'Live electrical wires in floodwater', 'Sewage contamination risk'],
    entryClearance: 'Boats and high-ground vehicles only; keep underpasses closed.', rescueOrder: ['Rooftop stranded families in Perumbakkam', 'Hospital perimeter pump-out in Pallikaranai', 'Stock shelters in Manali New Town'],
    safety: ['Do not wade near downed power lines.', 'Use buddy checks for all boat crews.', 'Run night operations only with floodlights.'], triage: ['12 RED', '28 YELLOW', '23 GREEN'], comms: 'Report boat launches and extractions to local incident command; confirm shelter capacity before transfer.',
    tasks: [
      { task: 'Classify river rise, electrical exposure, and contaminated-water hazards.', agent: 'Risk Assessment Agent', confidence: 0.78, status: 'ASSESSED', evaluation: 'High-risk response recommended.' },
      { task: 'Search Perumbakkam blocks A–C, then Pallikaranai marsh-edge housing.', agent: 'Victim Localization Agent', confidence: 0.71, status: 'PRIORITIZED', evaluation: 'Priority-zone probabilities: 0.86, 0.74, 0.62.' },
      { task: 'Stage IRB boats and divers at Perumbakkam; pump and shelter support at Pallikaranai.', agent: 'Resource Coordination Agent', confidence: 0.66, status: 'PROPOSED', evaluation: 'Proposed packages require operator confirmation.' },
      { task: 'Apply urban flood evacuation and shelter-density procedures.', agent: 'Knowledge Retrieval Agent', confidence: 0.8, status: 'REVIEWED', evaluation: 'Use SOP-V14 for evacuation and sheltering.' },
      { task: 'Extract rooftop families, then support hospital perimeter access.', agent: 'Rescue Coordination Agent', confidence: 0.88, status: 'PLANNED', evaluation: 'Sequence constrained by electrical hazards and access.' },
    ],
    assignments: DEMO_RESOURCES.filter((item) => item.region === 'chennai' || item.region === 'all').map((item) => ({ id: item.id, type: item.name, zone: item.assignedTo, assignedTo: item.package, status: item.readiness })), resourceStatus: 'Proposed · not dispatched',
    utilization: 0.72, bottlenecks: ['PPE stock running low at Chennai staging.', 'Power outage at Pallikaranai pump house.'], agents: DEMO_AGENTS, decisions: [{ id: 'DEMO-APPROVAL-01', status: 'PENDING', summary: 'Confirm the proposed flood-rescue package before any real dispatch.', agent: 'Resource Coordination Agent', raisedAt: '' }],
    sops: ['SOP-V14 · TNSDMA Urban Flood Response — evacuation and sheltering'], knowledgeNotes: ['Respect shelter-density limits at Perumbakkam relief centers.'], activity: ['Scenario initialized · fictional rainfall and flood-response picture prepared.'], telemetryCount: 0, telemetry: [], weather: 'Fictional scenario rainfall; no live weather feed.', sourceNote: 'All details on this report are fictional planning data for demonstration only. Not live sensing, confirmed stock, or a dispatch order.',
  },
  nilgiris: {
    title: 'Nilgiris · Landslide response', missionId: 'DEMO-NILGIRIS', incident: 'Fictional rainfall-triggered landslide scenario around Coonoor Ghat Road and Ketty Valley.', region: 'Nilgiris', stage: 'SIMULATION', phase: 'planning', createdAt: '', generatedAt: '', isRunning: false, demo: true,
    riskLevel: 'CRITICAL', riskScore: 0.83, riskConfidence: 0.78, recommendation: 'Obtain geotechnical clearance before void search at the slide fan; monitor the Ketty stream debris dam.', needsReview: true,
    victimTotal: '41 estimated affected or missing', primaryZone: 'Coonoor Ghat Road slide fan',
    zones: [{ zone: 'Coonoor Ghat Road slide fan', priority: '1', probability: 0.81, estimate: '—' }, { zone: 'Ketty Valley hamlets', priority: '2', probability: 0.69, estimate: '—' }, { zone: 'Gudalur estates', priority: '3', probability: 0.58, estimate: '—' }],
    hazards: ['Active afterslip on Coonoor Ghat Road cut slope', 'Debris dam forming on Ketty stream', 'Blocked SH-67 limits ambulance access', 'Continuing rainfall increases slope saturation'],
    entryClearance: 'Geotechnical team sign-off is required before entering the slide fan.', rescueOrder: ['Ghat Road slide fan void search', 'Ketty Valley hamlet evacuation', 'Clear SH-67 for ambulance access'],
    safety: ['Maintain an upstream debris-dam watch.', 'Use a spotter during excavation.', 'Halt work if rainfall intensity rises.'], triage: ['9 RED', '14 YELLOW', '18 GREEN'], comms: 'Use a spotter-to-team radio check before excavation; report SH-67 access status to ambulance coordinators.',
    tasks: [
      { task: 'Assess active slip, rainfall saturation, and the Ketty stream debris dam.', agent: 'Risk Assessment Agent', confidence: 0.78, status: 'ASSESSED', evaluation: 'Critical risk; immediate safety controls required.' },
      { task: 'Prioritize void search at the Ghat Road slide fan, then Ketty Valley.', agent: 'Victim Localization Agent', confidence: 0.71, status: 'PRIORITIZED', evaluation: 'Priority-zone probabilities: 0.81, 0.69, 0.58.' },
      { task: 'Stage collapse search and geotechnical units; account for SH-67 blockage.', agent: 'Resource Coordination Agent', confidence: 0.66, status: 'PROPOSED', evaluation: 'Access blockage may delay unit rotation.' },
      { task: 'Apply shoring and slope-cut re-entry guidance.', agent: 'Knowledge Retrieval Agent', confidence: 0.8, status: 'REVIEWED', evaluation: 'Use SOP-V07 and CODE-V16 where applicable.' },
      { task: 'Hold entry for clearance, then run void search with spotters.', agent: 'Rescue Coordination Agent', confidence: 0.88, status: 'PLANNED', evaluation: 'Entry gate and stop-work conditions stated.' },
    ],
    assignments: DEMO_RESOURCES.filter((item) => item.region === 'nilgiris').map((item) => ({ id: item.id, type: item.name, zone: item.assignedTo, assignedTo: item.package, status: item.readiness })), resourceStatus: 'Proposed · not dispatched',
    utilization: 0.72, bottlenecks: ['SH-67 blockage slows Nilgiris team rotation.', 'Continuing rainfall may halt slope operations.'], agents: DEMO_AGENTS, decisions: [{ id: 'DEMO-APPROVAL-02', status: 'PENDING', summary: 'Require geotechnical clearance before entry to the slide fan.', agent: 'Rescue Coordination Agent', raisedAt: '' }],
    sops: ['SOP-V07 · Structural Collapse Search & Rescue', 'CODE-V16 · NBC 2016 slope-cut construction guidance'], knowledgeNotes: ['Apply shoring before void search; evaluate house re-entry individually.'], activity: ['Scenario initialized · fictional landslide and access constraints prepared.'], telemetryCount: 0, telemetry: [], weather: 'Fictional ongoing rainfall; no live weather feed.', sourceNote: 'All details on this report are fictional planning data for demonstration only. Not live sensing, confirmed stock, or a dispatch order.',
  },
  cuddalore: {
    title: 'Cuddalore · Cyclone storm surge', missionId: 'DEMO-CUDDALORE', incident: 'Fictional cyclone and storm-surge scenario across Parangipettai and nearby backwater communities.', region: 'Cuddalore', stage: 'SIMULATION', phase: 'planning', createdAt: '', generatedAt: '', isRunning: false, demo: true,
    riskLevel: 'HIGH', riskScore: 0.74, riskConfidence: 0.78, recommendation: 'Stage boats inland, plug the Parangipettai embankment breach, and withdraw before the second surge band.', needsReview: true,
    victimTotal: '20 estimated affected or missing', primaryZone: 'Parangipettai coast belt',
    zones: [{ zone: 'Parangipettai coast belt', priority: '1', probability: 0.77, estimate: '—' }, { zone: 'Pichavaram channel hamlets', priority: '2', probability: 0.71, estimate: '—' }, { zone: 'Chidambaram backwaters', priority: '3', probability: 0.66, estimate: '—' }],
    hazards: ['Second surge band expected with next rain band', 'Breached embankment at Parangipettai', 'Saltwater intrusion into drinking wells', 'Strong Pichavaram mangrove-channel currents'],
    entryClearance: 'Sea state permitting; stage boats 4 km inland before launch.', rescueOrder: ['Plug Parangipettai embankment breach', 'Extract families from Pichavaram channels', 'Stock relief line at Chidambaram'],
    safety: ['Withdraw from the coast before the second surge band.', 'Life jackets are mandatory for all boat operations.'], triage: ['5 RED', '9 YELLOW', '6 GREEN'], comms: 'Track surge-band timing on the coastal radio net; confirm sea state and landing zones before each boat launch.',
    tasks: [
      { task: 'Assess surge band timing, breach, well contamination, and channel currents.', agent: 'Risk Assessment Agent', confidence: 0.78, status: 'ASSESSED', evaluation: 'High risk; boat staging and withdrawal window emphasized.' },
      { task: 'Prioritize Parangipettai coast, then Pichavaram and Chidambaram backwaters.', agent: 'Victim Localization Agent', confidence: 0.71, status: 'PRIORITIZED', evaluation: 'Priority-zone probabilities: 0.77, 0.71, 0.66.' },
      { task: 'Stage coastal rescue boats and breach-plug crew inland.', agent: 'Resource Coordination Agent', confidence: 0.66, status: 'PROPOSED', evaluation: 'Deployment remains subject to sea state and operator decision.' },
      { task: 'Use cyclone surge staging and coastal evacuation procedures.', agent: 'Knowledge Retrieval Agent', confidence: 0.8, status: 'REVIEWED', evaluation: 'Use SOP-V21 coastal surge guidance.' },
      { task: 'Plug breach, extract channel families, then stock relief line.', agent: 'Rescue Coordination Agent', confidence: 0.88, status: 'PLANNED', evaluation: 'Sequence respects surge withdrawal and life-jacket constraints.' },
    ],
    assignments: DEMO_RESOURCES.filter((item) => item.region === 'cuddalore' || item.region === 'all').map((item) => ({ id: item.id, type: item.name, zone: item.assignedTo, assignedTo: item.package, status: item.readiness })), resourceStatus: 'Proposed · not dispatched',
    utilization: 0.72, bottlenecks: ['Boat launch depends on sea state.', 'Second surge timing controls safe coastal access.'], agents: DEMO_AGENTS, decisions: [{ id: 'DEMO-APPROVAL-03', status: 'PENDING', summary: 'Confirm coastal boat staging and breach-plug resources before a real deployment.', agent: 'Resource Coordination Agent', raisedAt: '' }],
    sops: ['SOP-V21 · Cyclone Coastal Surge — pre-landfall staging'], knowledgeNotes: ['Life jackets mandatory; stage boats inland and respect the second-surge withdrawal window.'], activity: ['Scenario initialized · fictional cyclone surge and coastal access plan prepared.'], telemetryCount: 0, telemetry: [], weather: 'Fictional cyclone scenario; no live weather feed.', sourceNote: 'All details on this report are fictional planning data for demonstration only. Not live sensing, confirmed stock, or a dispatch order.',
  },
};

export const DEMO_REPORT_OPTIONS = Object.entries(DEMO_REPORTS).map(([id, report]) => ({ id: `demo:${id}`, label: `${report.region} · ${report.title.split('·')[1].trim()} (demo)` }));
export const demoReport = (key: string): ReportView => DEMO_REPORTS[key] ?? DEMO_REPORTS.chennai;

export function liveReport(data: MissionReportData): ReportView {
  return buildLiveReport(data);
}

export function reportOptionLabel(mission: MissionListItem): string {
  return `${mission.mission_name || mission.incident_text || mission.mission_id} · ${mission.mission_id}`;
}

export function formatConfidence(value: number | null): string { return confidenceLabel(value); }
