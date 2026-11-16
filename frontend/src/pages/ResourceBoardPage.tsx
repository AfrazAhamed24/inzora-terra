import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DemoCategory, DemoRegionId } from '../resources/demoData';
import { DEMO_REGIONS, DEMO_RESOURCES } from '../resources/demoData';
import { Link } from '../router';
import { Badge, Icon, Panel } from '../ui';

const CATEGORIES: Array<'All' | DemoCategory> = ['All', ...Array.from(new Set(DEMO_RESOURCES.map((item) => item.category)))];

export function ResourceBoardPage() {
  const [region, setRegion] = useState<'all' | DemoRegionId>('all');
  const [category, setCategory] = useState<'All' | DemoCategory>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_RESOURCES[0]?.id ?? null);

  const filtered = useMemo(() => DEMO_RESOURCES.filter((item) => {
    const matchesRegion = region === 'all' || item.region === region || item.region === 'all';
    const matchesCategory = category === 'All' || item.category === category;
    const searchText = `${item.id} ${item.name} ${item.location} ${item.assignedTo} ${item.capability}`.toLowerCase();
    return matchesRegion && matchesCategory && searchText.includes(query.toLowerCase().trim());
  }), [region, category, query]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="page-stack resource-board-page">
      <header className="resource-board-hero">
        <div>
          <span className="resource-board-eyebrow">FIELD ASSETS · OPERATIONAL VIEW</span>
          <h2>Resource readiness board</h2>
          <p>Browse the proposed rescue packages, see what each team can do, and check the constraints before staging.</p>
        </div>
        <div className="resource-sim-badge"><i />FICTIONAL DEMO · NOT LIVE INVENTORY</div>
      </header>

      <section className="resource-kpi-row" aria-label="Demo resource summary">
        <div className="resource-kpi"><span className="resource-kpi-mark">06</span><span><strong>Response packages</strong><small>Illustrative task-force groups</small></span></div>
        <div className="resource-kpi"><span className="resource-kpi-mark">03</span><span><strong>Regions covered</strong><small>Chennai · Nilgiris · Cuddalore</small></span></div>
        <div className="resource-kpi"><span className="resource-kpi-mark">01</span><span><strong>Entry constraint</strong><small>Geotechnical clearance required</small></span></div>
        <Link to="/resource-allocation" className="resource-kpi resource-kpi-action"><span className="resource-kpi-mark"><Icon name="resource" size={18} /></span><span><strong>Open allocation desk</strong><small>Review approvals and staging plan</small></span><Icon name="chevron" size={15} /></Link>
      </section>

      <section className="resource-board-layout">
        <Panel title="Response package library" count={filtered.length} tag="Scenario planning" className="resource-library-panel">
          <div className="resource-filters">
            <label className="resource-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams, capabilities, locations" aria-label="Search resource packages" /></label>
            <div className="resource-region-tabs" aria-label="Filter by disaster region">
              <button type="button" className={region === 'all' ? 'resource-filter-active' : ''} onClick={() => setRegion('all')}>All regions</button>
              {DEMO_REGIONS.map((item) => <button type="button" key={item.id} className={region === item.id ? 'resource-filter-active' : ''} aria-pressed={region === item.id} onClick={() => setRegion(item.id)}>{item.label}</button>)}
            </div>
            <div className="resource-category-tabs" aria-label="Filter by resource capability">
              {CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? 'resource-filter-active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
          </div>

          <div className="resource-package-list">
            {filtered.map((item, index) => (
              <button type="button" key={item.id} className={`resource-package-card${selected?.id === item.id ? ' resource-package-selected' : ''}`} onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id} style={{ '--resource-index': index } as CSSProperties}>
                <span className={`resource-category-icon resource-type-${item.category.toLowerCase().replace(/ /g, '-')}`}><Icon name={item.category === 'Medical' ? 'health' : item.category === 'Engineering' ? 'map' : item.category === 'Structural search' ? 'search' : 'resource'} size={17} /></span>
                <span className="resource-package-main"><strong>{item.name}</strong><small>{item.location}</small><span>{item.capability}</span></span>
                <span className={`resource-readiness readiness-${item.readiness.toLowerCase().replace(/ /g, '-')}`}>{item.readiness}</span>
                <span className="resource-package-arrow">›</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="resource-filter-empty"><strong>No packages match these filters</strong><button type="button" onClick={() => { setRegion('all'); setCategory('All'); setQuery(''); }}>Clear filters</button></div>}
          </div>
        </Panel>

        <aside className="resource-detail-column">
          {selected ? (
            <Panel title="Package detail" tag={selected.id} className="resource-detail-panel">
              <div className="resource-detail-body">
                <div className="resource-detail-heading"><span className="resource-detail-glyph"><Icon name="agent" size={21} /></span><Badge tone={selected.readiness === 'Clearance required' ? 'orange' : 'green'}>{selected.readiness}</Badge></div>
                <h3>{selected.name}</h3>
                <p className="resource-detail-capability">{selected.capability}</p>
                <div className="resource-detail-fields">
                  <div><span>Assigned zone</span><strong>{selected.assignedTo}</strong></div>
                  <div><span>Staging location</span><strong>{selected.location}</strong></div>
                  <div><span>Package contents</span><strong>{selected.package}</strong></div>
                </div>
                <div className={`resource-safety-note${selected.readiness === 'Clearance required' ? ' resource-safety-warn' : ''}`}><span>FIELD NOTE</span><p>{selected.note}</p></div>
                <Link to="/resource-allocation" className="btn btn-primary resource-detail-cta">Review in Allocation Desk <Icon name="chevron" size={14} /></Link>
              </div>
            </Panel>
          ) : (
            <Panel title="Package detail"><div className="resource-filter-empty">Select a package to see its staging notes.</div></Panel>
          )}
          <Panel title="Region overview" tag="3 simulated areas">
            <div className="resource-region-overview">{DEMO_REGIONS.map((item) => {
              const count = DEMO_RESOURCES.filter((resource) => resource.region === item.id || resource.region === 'all').length;
              return <button type="button" key={item.id} className={region === item.id ? 'region-overview-selected' : ''} aria-pressed={region === item.id} onClick={() => setRegion(region === item.id ? 'all' : item.id)}><span><strong>{item.label}</strong><small>{item.hazard}</small></span><b>{count}<small>packages</small></b></button>;
            })}</div>
          </Panel>
        </aside>
      </section>
      <div className="resource-demo-footnote"><span>DEMO DATA</span> These fictional packages help illustrate the response workflow. They do not represent confirmed stock, team locations, or dispatch orders.</div>
    </div>
  );
}
