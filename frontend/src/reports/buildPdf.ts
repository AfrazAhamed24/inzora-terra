import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportView } from './reportModel';

const clean = (value: unknown): string => String(value ?? '—')
  .replace(/[·•]/g, ' / ')
  .replace(/[–—]/g, '-')
  .replace(/→/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

export function downloadMissionReport(report: ReportView) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 15;
  const right = pageWidth - 15;
  let y = 44;

  pdf.setFillColor(10, 22, 37);
  pdf.rect(0, 0, pageWidth, 35, 'F');
  pdf.setTextColor(98, 218, 242);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('INZORA TERRA  /  FIELD OPERATIONS', left, 11);
  pdf.setTextColor(246, 249, 252);
  pdf.setFontSize(19);
  pdf.text(clean(report.title).slice(0, 40), left, 21);
  pdf.setTextColor(181, 200, 217);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`${clean(report.missionId)}  |  ${clean(report.region)}  |  ${report.demo ? 'SIMULATED DEMONSTRATION REPORT' : 'MISSION REPORT'}`, left, 29);
  pdf.setFillColor(report.riskLevel === 'CRITICAL' ? 182 : report.riskLevel === 'HIGH' ? 218 : 62, report.riskLevel === 'CRITICAL' ? 60 : report.riskLevel === 'HIGH' ? 145 : 171, report.riskLevel === 'CRITICAL' ? 65 : report.riskLevel === 'HIGH' ? 44 : 106);
  pdf.roundedRect(right - 38, 8, 38, 11, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(clean(report.riskLevel), right - 19, 15, { align: 'center' });

  if (report.demo) {
    pdf.setTextColor(139, 91, 22);
    pdf.setFillColor(255, 245, 218);
    pdf.roundedRect(left, 39, right - left, 11, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('SIMULATED DATA - NOT LIVE SENSING, CONFIRMED STOCK, OR A DISPATCH ORDER', left + 4, 46);
    y = 56;
  }

  const bodyStyles = { font: 'helvetica' as const, fontSize: 8, cellPadding: 2.4, textColor: [42, 56, 71] as [number, number, number], lineColor: [219, 227, 234] as [number, number, number], lineWidth: 0.15, overflow: 'linebreak' as const };
  const table = (title: string, headers: string[], rows: string[][]) => {
    if (y > pageHeight - 34) { pdf.addPage(); y = 18; }
    pdf.setTextColor(21, 42, 61);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, left, y);
    y += 3;
    autoTable(pdf, {
      startY: y,
      head: [headers.map(clean)],
      body: rows.length ? rows.map((row) => row.map(clean)) : [[`No ${title.toLowerCase()} recorded`, ...headers.slice(1).map(() => '—')]],
      margin: { left, right: 15 },
      theme: 'grid',
      styles: bodyStyles,
      headStyles: { fillColor: [26, 58, 82], textColor: [245, 250, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 249, 252] },
      rowPageBreak: 'avoid',
    });
    const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y + 10) + 8;
  };

  const paragraph = (title: string, text: string) => {
    const lines = pdf.splitTextToSize(clean(text), right - left);
    const height = 9 + lines.length * 4.1;
    if (y + height > pageHeight - 18) { pdf.addPage(); y = 18; }
    pdf.setTextColor(21, 42, 61);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, left, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(52, 69, 84);
    pdf.text(lines, left, y);
    y += lines.length * 4.1 + 7;
  };

  table('1. Situation summary', ['Field', 'Report detail'], [
    ['Incident', report.incident], ['Region / scenario', report.region], ['Mission stage', `${report.stage} (${report.phase})`],
    ['Mission running', report.isRunning ? 'Yes' : 'No'], ['Created', report.createdAt || 'Not recorded'], ['Resource plan status', report.resourceStatus],
    ['Report generated', report.generatedAt || new Date().toLocaleString()], ['Human review', report.needsReview ? 'Required' : 'Not flagged'],
  ]);
  table('2. Risk assessment', ['Assessment', 'Result'], [
    ['Risk level', report.riskLevel], ['Risk score', report.riskScore === null ? 'Not recorded' : `${report.riskScore.toFixed(2)} / 1.00`],
    ['Risk-agent confidence', report.riskConfidence === null ? 'Not recorded' : `${Math.round(report.riskConfidence * 100)}%`],
    ['Recommendation', report.recommendation], ...report.hazards.map((hazard, index) => [`Hazard ${index + 1}`, hazard]),
  ]);
  table('3. Victim localization', ['Search zone', 'Priority', 'Probability', 'Victim estimate'], [
    ['Total estimated victims', '—', '—', report.victimTotal],
    ...report.zones.map((zone) => [zone.zone, zone.priority, zone.probability === null ? 'Not recorded' : `${Math.round(zone.probability * 100)}%`, zone.estimate]),
  ]);
  paragraph('4. Rescue plan and entry controls', `Entry clearance: ${report.entryClearance}`);
  table('Rescue sequence', ['Order', 'Action'], report.rescueOrder.map((action, index) => [String(index + 1), action]));
  table('Safety constraints and triage', ['Type', 'Field guidance'], [
    ...report.safety.map((item) => ['Safety', item]), ...report.triage.map((item) => ['Triage', item]), ['Communications', report.comms],
  ]);
  table('5. Tasks and responsible agents', ['Task / evaluation', 'Responsible agent', 'Confidence', 'Status'], report.tasks.map((task) => [task.task, task.agent, task.confidence === null ? 'Not recorded' : `${Math.round(task.confidence * 100)}%`, `${task.status} - ${task.evaluation}`]));
  table('6. Resource plan', ['ID', 'Resource type', 'Assigned zone', 'Team / package', 'Status'], [
    ...report.assignments.map((item) => [item.id, item.type, item.zone, item.assignedTo, item.status]),
    ...(report.utilization === null ? [] : [['', 'Estimated utilization', '', '', `${Math.round(report.utilization * 100)}%`]]),
    ...report.bottlenecks.map((item) => ['', 'Bottleneck', item, '', 'Review']),
  ]);
  table('7. Agent evaluation and confidence', ['Agent', 'Evaluated responsibility', 'Confidence', 'Run status', 'Latest evaluation'], report.agents.map((agent) => [agent.name, agent.responsibility, agent.confidence === null ? 'Not recorded' : `${Math.round(agent.confidence * 100)}%`, agent.status, agent.evaluation]));
  table('8. Operator decisions', ['Decision ID', 'Status', 'Raised by', 'Request'], report.decisions.map((decision) => [decision.id, decision.status, decision.agent, decision.summary]));
  table('9. Knowledge references', ['Reference / SOP', 'Operational note'], [
    ...report.sops.map((sop) => [sop, 'Reference included in mission knowledge results']),
    ...report.knowledgeNotes.map((note) => ['Recommendation', note]),
  ]);
  table('10. Environment and telemetry', ['Item', 'Value'], [
    ['Environment summary', report.weather], ['Telemetry packets recorded', String(report.telemetryCount)],
    ...report.telemetry.map((packet) => ['Recent reading', packet]),
  ]);
  table('11. Recent mission activity', ['Event', 'Recorded update'], report.activity.map((event, index) => [String(index + 1), event]));
  paragraph('Report notes', report.sourceNote);

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(213, 223, 230);
    pdf.line(left, pageHeight - 12, right, pageHeight - 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(106, 121, 135);
    pdf.text('INZORA TERRA / Operational report - verify access, changing hazards, and command clearance before action.', left, pageHeight - 7);
    pdf.text(`${page} / ${totalPages}`, right, pageHeight - 7, { align: 'right' });
  }

  const filename = `${report.missionId}-${report.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  pdf.save(`${filename || 'inzora-terra-report'}.pdf`);
}
