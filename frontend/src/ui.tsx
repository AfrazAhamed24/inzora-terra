/**
 * INZORA TERRA — shared UI components
 * Panel / badges / empty states / forms — one visual language for every page.
 */

import type { ReactNode } from 'react';
import { Link } from './router';
import { AGENT_DEFS, scenarioLabel, type MissionListItem } from './api';

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case 'resource':
      return (
        <svg {...common}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
      );
    case 'agent':
      return (
        <svg {...common}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 8V4" />
          <path d="M12 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          <path d="M9 13h.01M15 13h.01" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'incident':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'droplet':
      return (
        <svg {...common}>
          <path d="M12 2.7s6 6.3 6 10.3a6 6 0 0 1-12 0c0-4 6-10.3 6-10.3z" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'health':
      return (
        <svg {...common}>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z" />
          <path d="M3.5 12h4l2-3 3.2 6 2-3h5.8" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="m4 12 5 5L20 6" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case 'arrow-left':
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="m6 4 14 8-14 8V4z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v4h1" />
        </svg>
      );
    case 'plug':
      return (
        <svg {...common}>
          <path d="M9 7V3M15 7V3" />
          <path d="M6 7h12v3a6 6 0 0 1-12 0V7z" />
          <path d="M12 16v5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  tag,
  count,
  actions,
  children,
  className = '',
  bodyClass = '',
}: {
  title?: string;
  tag?: string;
  count?: string | number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={`panel ${className}`.trim()}>
      {title !== undefined && (
        <div className="panel-header">
          <h2>{title}</h2>
          {actions}
          {count !== undefined && <span className="panel-count">{count}</span>}
          {tag !== undefined && <span className="panel-tag">{tag}</span>}
        </div>
      )}
      <div className={`panel-body ${bodyClass}`.trim()}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges / status                                                     */
/* ------------------------------------------------------------------ */

export type Tone = 'red' | 'orange' | 'green' | 'blue' | 'muted';

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function riskTone(risk: string | undefined | null): Tone {
  const r = (risk || '').toUpperCase();
  if (r === 'CRITICAL') return 'red';
  if (r === 'HIGH') return 'orange';
  if (r === 'MEDIUM') return 'blue';
  if (r === 'LOW') return 'green';
  return 'muted';
}

export function stageTone(stage: string): Tone {
  const s = (stage || '').toLowerCase();
  if (s === 'awaiting_confirmation') return 'orange';
  if (s === 'running' || s === 'executing') return 'blue';
  if (s === 'completed') return 'green';
  if (s === 'failed' || s === 'error') return 'red';
  return 'muted';
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon = 'info',
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={20} />
      <span>{title}</span>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function EmptyCompact({ children }: { children: ReactNode }) {
  return <div className="empty-state empty-compact">{children}</div>;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="loading-spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <Icon name="alert" size={14} />
      <span className="error-note-text">{message}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function IntegrationNotice({ children }: { children: ReactNode }) {
  return (
    <div className="integration-notice">
      <Icon name="plug" size={14} />
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confidence bar                                                      */
/* ------------------------------------------------------------------ */

export function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) {
    return <span className="confidence-bar confidence-bar-empty">No score</span>;
  }
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="confidence-bar">
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="confidence-value">{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function MissionSelect({
  missions,
  value,
  onChange,
  disabled = false,
}: {
  missions: MissionListItem[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mission-select">
      <span className="mission-select-label">Mission</span>
      <select
        className="input"
        value={value}
        disabled={disabled || missions.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {missions.length === 0 ? (
          <option value="">No missions registered</option>
        ) : (
          missions.map((m) => (
            <option key={m.mission_id} value={m.mission_id}>
              {m.mission_id}
              {m.mission_name ? ` — ${m.mission_name}` : ''}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

export function RefreshButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={onClick} disabled={disabled}>
      <Icon name="refresh" size={13} />
      Refresh
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Agents / helpers                                                    */
/* ------------------------------------------------------------------ */

export function AgentLabel({ agentKey }: { agentKey: string }) {
  const def = AGENT_DEFS.find((a) => a.key === agentKey);
  return <>{def ? def.label : agentKey}</>;
}

export function formatTime(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export { Link, scenarioLabel };
