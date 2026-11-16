/**
 * INZORA TERRA — Emergency Response Command Centre
 * Multi-page application shell: fixed sidebar navigation (History routing),
 * compact topbar, routed pages. React + TypeScript + Vite | No 3D | No fake data.
 */

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/operations-dashboard.css';

import { api, type Health } from './api';
import { useAsyncData } from './hooks';
import { Link, RouterProvider, useRouter } from './router';
import { Icon } from './ui';

import { CommandCenterPage } from './pages/command';
import { EmergenciesPage } from './pages/emergencies';
import { ResourceAllocationPage } from './pages/resource-allocation';
import { AgentCommandPage } from './pages/AgentCommandPage';
import { RiskAssessmentPage } from './pages/risk';
import { ResourceBoardPage } from './pages/ResourceBoardPage';
import { ReportsPage } from './pages/reports';
import { FloodMonitoringPage } from './pages/flood';
import { ActivityLogPage } from './pages/activity';
import { DexterEntry } from './dexter/DexterEntry';
import { DexterExperience } from './dexter/DexterExperience';

/* ------------------------------------------------------------------ */
/* Route registry                                                      */
/* ------------------------------------------------------------------ */

interface RouteDef {
  path: string;
  title: string;
  element: JSX.Element;
  section: string;
  icon: string;
}

const ROUTES: RouteDef[] = [
  { path: '/', title: 'Command Center', section: 'Operations', icon: 'map', element: <CommandCenterPage /> },
  { path: '/emergencies', title: 'Emergencies', section: 'Operations', icon: 'incident', element: <EmergenciesPage /> },
  { path: '/resource-allocation', title: 'Resource Allocation', section: 'Operations', icon: 'resource', element: <ResourceAllocationPage /> },
  { path: '/reports', title: 'Report', section: 'Operations', icon: 'list', element: <ReportsPage /> },
  { path: '/agents', title: 'AI Agents', section: 'Intelligence', icon: 'agent', element: <AgentCommandPage /> },
  { path: '/risk-assessment', title: 'Risk Assessment', section: 'Intelligence', icon: 'alert', element: <RiskAssessmentPage /> },
  { path: '/resources', title: 'Resources', section: 'Assets', icon: 'resource', element: <ResourceBoardPage /> },
  { path: '/flood-monitoring', title: 'Flood Monitoring', section: 'Assets', icon: 'droplet', element: <FloodMonitoringPage /> },
  { path: '/activity-log', title: 'Activity Log', section: 'System', icon: 'list', element: <ActivityLogPage /> },
];

const SECTIONS = ['Operations', 'Intelligence', 'Assets', 'System'] as const;

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

const appRoot = document.getElementById('app-root') as HTMLElement | null;

if (appRoot) {
  createRoot(appRoot).render(
    <RouterProvider>
      <AppShell />
    </RouterProvider>
  );
} else {
  console.error('Application root element not found');
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

function AppShell() {
  const { path, navigate } = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [dexterActive, setDexterActive] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: health, error: healthError, refresh: refreshHealth } = useAsyncData<Health>(
    (signal) => api.health(signal),
    []
  );

  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];

  // Browser tab title follows the active page.
  useEffect(() => {
    document.title = `INZORA TERRA — ${route.title}`;
  }, [route.title]);

  // Reset content scroll when navigating between pages.
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [path]);

  // Unknown paths redirect to the Command Center (keeps deep links safe).
  useEffect(() => {
    if (!ROUTES.some((r) => r.path === path)) {
      navigate('/');
    }
  }, [path, navigate]);

  return (
    <div className="app-shell">
      {/* ============ LEFT SIDEBAR ============ */}
      <aside className={`sidebar${navOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Icon name="shield" size={20} />
          </div>
          <div className="brand-text">
            <span className="brand-title">INZORA TERRA</span>
            <span className="brand-subtitle">Emergency Response</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {SECTIONS.map((section) => (
            <div className="nav-section" key={section}>
              <span className="nav-section-label">{section}</span>
              {ROUTES.filter((r) => r.section === section).map((r) => (
                <Link
                  key={r.path}
                  to={r.path}
                  className={`nav-link${path === r.path ? ' active' : ''}`}
                  onClick={() => setNavOpen(false)}
                >
                  <Icon name={r.icon} size={16} />
                  <span>{r.title}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-dot" />
          <span className="sidebar-footer-text">
            {healthError
              ? 'Backend unreachable'
              : health
                ? `Backend ${health.status}`
                : 'Connecting…'}
          </span>
        </div>
      </aside>

      {/* ============ MAIN LAYOUT ============ */}
      <div className="main-layout">
        {/* ---- TOP BAR ---- */}
        <header className="topbar">
          <button
            className="nav-toggle"
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="topbar-title-group">
            <h1 className="topbar-title">{route.title}</h1>
            <span className="topbar-status">
              <span className="status-dot" />
              {healthError ? 'Backend Offline' : 'System Operational'}
            </span>
          </div>

          <div className="topbar-actions">
            {/* D.E.X.T.E.R. entry — dedicated button inside the Command Centre */}
            {path === '/' && !dexterActive && (
              <DexterEntry onLaunch={() => setDexterActive(true)} />
            )}
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={refreshHealth}
              title="Re-check backend health"
            >
              <Icon name="refresh" size={13} />
              Health
            </button>
            <span className="topbar-time">{health ? `v${health.version}` : '—'}</span>
          </div>
        </header>

        {/* ---- PAGE CONTENT ---- */}
        <div className="dashboard-content" ref={contentRef}>
          <PageView routeKey={route.path} element={route.element} />
        </div>
      </div>

      {/* ============ D.E.X.T.E.R. IMMERSIVE EXPERIENCE (overlay) ============ */}
      {dexterActive && (
        <DexterExperience onExit={() => setDexterActive(false)} />
      )}
    </div>
  );
}

/**
 * Remounts the page component when the route changes so every page re-fetches
 * its own data on navigation (fresh data on every visit).
 */
function PageView({ routeKey, element }: { routeKey: string; element: JSX.Element }) {
  return <div key={routeKey}>{element}</div>;
}
