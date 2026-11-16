/**
 * PAGE 6 — RESOURCES
 * Resource inventory. The backend currently exposes NO inventory endpoint,
 * so this page shows an honest integration-pending state (no fictional
 * records) and links to the mission-driven allocation workflow.
 */

import { api, type Health } from '../api';
import { useAsyncData } from '../hooks';
import { Link } from '../router';
import { EmptyState, ErrorNote, LoadingBlock, Panel, IntegrationNotice } from '../ui';

export function ResourcesPage() {
  const { data: health, error, loading, refresh } = useAsyncData<Health>(
    (signal) => api.health(signal),
    []
  );

  if (loading && !health) return <LoadingBlock label="Loading resources…" />;

  return (
    <div className="page-stack">
      {error && <ErrorNote message={error} onRetry={refresh} />}

      <Panel title="Resource Inventory" tag="Backend integration pending">
        <div className="inventory-body">
          <EmptyState
            icon="resource"
            title="Resource inventory is not exposed by the backend yet"
            hint="No inventory records are displayed because none exist — nothing is fabricated"
          />
          <IntegrationNotice>
            The FastAPI surface (health, missions, summary, timeline, telemetry, decisions,
            knowledge) does not include a resource-inventory endpoint. When one is added, this page
            will list: Resource ID · Resource name · Agency · Resource type · Availability ·
            Location.
          </IntegrationNotice>
          <div className="detail-grid detail-grid-resources">
            <div className="detail-card">
              <span className="detail-label">Backend status</span>
              <span className="detail-value">
                {health ? `${health.status} (v${health.version})` : 'Unknown'}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Registered missions</span>
              <span className="detail-value">{health?.active_missions ?? 0}</span>
            </div>
          </div>
          <div className="inventory-links">
            <Link to="/resource-allocation" className="btn btn-primary btn-sm">
              Open Resource Allocation (mission-driven approvals)
            </Link>
            <Link to="/flood-monitoring" className="btn btn-ghost btn-sm">
              View Flood Monitoring
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
