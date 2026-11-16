/**
 * D.E.X.T.E.R. — Five-Agent Network
 * D.E.X.T.E.R. Core at the centre; the five existing specialist agents
 * (AGENT_DEFS — real backend identifiers) arranged on an orbital ring.
 * Interactive selection only — the network never fabricates execution state.
 */

import { useMemo, type CSSProperties } from 'react';
import type { DexterAgentRow } from './useDexterData';
import { Icon } from '../ui';
import type { DexterConnection } from './useDexterData';

interface AgentNetworkProps {
  agents: DexterAgentRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  connection: DexterConnection;
  executing: boolean;
}

interface NodePos {
  x: number;
  y: number;
}

const NODE_COUNT = 5;

function nodePos(i: number): NodePos {
  const angle = ((-90 + (360 / NODE_COUNT) * i) * Math.PI) / 180;
  return {
    x: 50 + 44 * Math.cos(angle),
    y: 50 + 42 * Math.sin(angle),
  };
}

export function AgentNetwork({
  agents,
  selectedKey,
  onSelect,
  connection,
  executing,
}: AgentNetworkProps) {
  const positions = useMemo(() => agents.map((_, i) => nodePos(i)), [agents]);
  const offline = connection === 'offline';

  return (
    <div className="dx-network-wrap">
      <div className="dx-network" role="group" aria-label="D.E.X.T.E.R. agent network">
        {/* connector lines core → agents (non-scaling strokes over a stretched viewBox) */}
        <svg
          className="dx-net-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="dx-link-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8957E5" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#3978F6" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <ellipse className="dx-net-orbit" cx="50" cy="50" rx="44" ry="42" />
          {positions.map((p, i) => (
            <line
              key={agents[i]?.key ?? i}
              className="dx-net-line"
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              stroke="url(#dx-link-grad)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              style={executing ? undefined : ({ animationPlayState: 'paused' } as CSSProperties)}
            />
          ))}
        </svg>

        {/* central intelligence core */}
        <div className="dx-core-node">
          <div className="dx-orb" data-state={executing ? 'processing' : 'online'} style={{ '--orb-size': '110px' } as CSSProperties}>
            <div className="dx-orb-atmos" />
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(137,87,229,0.2)" strokeWidth="1" strokeDasharray="3 8" />
              <g className="dx-ring">
                <ellipse cx="100" cy="100" rx="84" ry="30" transform="rotate(20 100 100)" fill="none" stroke="url(#dx-core-grad)" strokeWidth="1.4" />
              </g>
              <g className="dx-ring-r">
                <ellipse cx="100" cy="100" rx="70" ry="44" transform="rotate(-30 100 100)" fill="none" stroke="url(#dx-core-grad)" strokeWidth="1" strokeDasharray="9 7" />
              </g>
              <circle cx="100" cy="100" r="24" fill="url(#dx-core-grad)" />
              <circle cx="100" cy="100" r="10" fill="#F4F1FA" opacity="0.55" />
              <defs>
                <radialGradient id="dx-core-grad" cx="42%" cy="38%" r="75%">
                  <stop offset="0%" stopColor="#F4F1FA" stopOpacity="0.9" />
                  <stop offset="35%" stopColor="#8957E5" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#3978F6" stopOpacity="0.35" />
                </radialGradient>
              </defs>
            </svg>
          </div>
          <span className="dx-core-label">D.E.X.T.E.R. Core</span>
        </div>

        {/* five specialist agents */}
        {agents.map((agent, i) => {
          const p = positions[i];
          const selected = selectedKey === agent.key;
          return (
            <button
              key={agent.key}
              type="button"
              className="dx-node"
              data-selected={selected}
              data-active={agent.status === 'active'}
              data-offline={offline}
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  '--i': i,
                  animationDelay: `${i * 90}ms`,
                } as CSSProperties
              }
              aria-pressed={selected}
              title={`${agent.label} — ${agent.responsibility}`}
              onClick={() => onSelect(agent.key)}
            >
              <span className="dx-node-icon">
                <Icon name={agent.icon} size={17} />
              </span>
              <span className="dx-node-name">{agent.short}</span>
              <span className="dx-node-meta">
                <span
                  className={`dx-node-dot ${offline ? '' : agent.status === 'active' ? 'active' : 'standby'}`}
                />
                {offline
                  ? 'offline'
                  : agent.confidence !== null
                    ? `${Math.round(agent.confidence * 100)}%`
                    : agent.status === 'active'
                      ? 'active'
                      : 'standby'}
              </span>
            </button>
          );
        })}

        <span className="dx-network-note">
          five specialist agents · shared mission state · {executing ? 'live orchestration' : 'snapshot'}
        </span>
      </div>
    </div>
  );
}
