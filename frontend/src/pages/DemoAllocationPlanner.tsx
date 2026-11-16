import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { DemoRegionId } from '../resources/demoData';
import { DEMO_REGIONS, DEMO_RESOURCES } from '../resources/demoData';
import { Link } from '../router';
import { Badge, Panel } from '../ui';

export function DemoAllocationPlanner() {
  const [regionId, setRegionId] = useState<DemoRegionId>('chennai');
  const region = DEMO_REGIONS.find((item) => item.id === regionId) ?? DEMO_REGIONS[0];
  const packages = DEMO_RESOURCES.filter((item) => item.region === regionId || item.region === 'all');

  return (
    <Panel title="Scenario allocation planner" tag="Fictional Tamil Nadu response">
      <div className="allocation-planner">
        <div className="allocation-planner-heading">
          <div><span className="allocation-demo-label">SIMULATION · PROPOSAL ONLY</span><h3>Stage a response by region</h3><p>Explore example team assignments for the disaster scenario. These are not live assets and nothing is dispatched from this preview.</p></div>
          <span className="allocation-proposal-status"><i />AWAITING OPERATOR DECISION</span>
        </div>

        <div className="allocation-region-tabs" role="tablist" aria-label="Choose a demo region">
          {DEMO_REGIONS.map((item) => <button type="button" role="tab" aria-selected={item.id === regionId} key={item.id} className={item.id === regionId ? 'allocation-region-active' : ''} onClick={() => setRegionId(item.id)}><span>{item.label}</span><small>{item.hazard}</small></button>)}
        </div>

        <div className="allocation-region-summary">
          <div><span>ACTIVE SCENARIO</span><strong>{region.label} · {region.hazard}</strong></div>
          <div><span>PROPOSED PACKAGES</span><strong>{packages.length} task forces</strong></div>
          <div><span>GOVERNANCE</span><strong>Human approval required</strong></div>
        </div>

        <div className="allocation-proposal-list">
          {packages.map((item, index) => <article className="allocation-proposal-row" key={item.id} style={{ '--allocation-index': index } as CSSProperties}>
            <span className="allocation-proposal-number">0{index + 1}</span>
            <div className="allocation-proposal-main"><strong>{item.name}</strong><span>{item.package}</span><small>Stage: {item.location}</small></div>
            <div className="allocation-proposal-zone"><span>ASSIGNED ZONE</span><strong>{item.assignedTo}</strong></div>
            <Badge tone={item.readiness === 'Clearance required' ? 'orange' : 'blue'}>{item.readiness}</Badge>
          </article>)}
        </div>

        <div className="allocation-planner-footer">
          <p><strong>Next safe step:</strong> verify team availability and access constraints, then review the live mission’s approval queue when an actual request exists. This preview cannot approve or dispatch resources.</p>
          <Link to="/resources" className="btn btn-ghost btn-sm">Open package library</Link>
        </div>
      </div>
    </Panel>
  );
}
