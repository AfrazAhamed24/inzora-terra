/**
 * D.E.X.T.E.R. — Agent Intelligence Panel
 * Shows ONLY information that actually exists in the backend contracts:
 *  - identity + responsibility      (AGENT_DEFS, mirrors backend registry)
 *  - declared contract              (real orchestration graph reads/writes)
 *  - confidence                     (summary.confidence_scores)
 *  - executions / attempts / time   (timeline events)
 *  - handoffs                       (handoff timeline events)
 *  - reasoning / report             (live SSE agent frames when streaming)
 * Idle / offline / no-mission states are honest — nothing is invented.
 */

import type { DexterAgentRow, DexterAgentFrame } from './useDexterData';
import { DEXTER_AGENT_CONTRACTS } from './useDexterData';
import { formatTime } from '../ui';

interface AgentIntelPanelProps {
  agent: DexterAgentRow | null;
  frame: DexterAgentFrame | null;
  hasMission: boolean;
  missionRunning: boolean;
  connection: 'connecting' | 'online' | 'offline';
}

function ContractChips({ items, kind }: { items: string[]; kind: 'read' | 'write' }) {
  return (
    <div className="dx-contract">
      {items.map((item) => (
        <span key={item} className={`dx-contract-chip${kind === 'write' ? ' write' : ''}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function AgentIntelPanel({
  agent,
  frame,
  hasMission,
  missionRunning,
  connection,
}: AgentIntelPanelProps) {
  if (!agent) {
    return (
      <div className="dx-panel">
        <div className="dx-empty">
          <span className="dx-label">Agent Intelligence</span>
          <span className="dx-empty-title">Select a specialist agent</span>
          <span className="dx-empty-hint">
            Choose any of the five agents on the network to inspect its responsibility, declared
            contract and available execution intelligence.
          </span>
        </div>
      </div>
    );
  }

  const contract = DEXTER_AGENT_CONTRACTS[agent.key];
  const offline = connection === 'offline';
  const reasoning = frame?.reasoning ?? null;
  const report = frame?.report ?? null;

  return (
    <div className="dx-panel">
      {/* identity */}
      <div className="dx-panel-head">
        <span className="dx-panel-head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {agent.icon === 'alert' && <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />}
            {agent.icon === 'search' && <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>}
            {agent.icon === 'resource' && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>}
            {agent.icon === 'list' && <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>}
            {agent.icon === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
          </svg>
        </span>
        <div className="dx-panel-head-body">
          <span className="dx-panel-title">{agent.label}</span>
          <span className="dx-panel-slug">identifier · {agent.key}</span>
        </div>
      </div>

      {offline ? (
        <div className="dx-empty">
          <span className="dx-empty-title">Backend unreachable</span>
          <span className="dx-empty-hint">
            No execution data can be read right now. D.E.X.T.E.R. will not display simulated agent
            activity — reconnect and retry.
          </span>
        </div>
      ) : !hasMission ? (
        <div className="dx-empty">
          <span className="dx-empty-title">No mission registered</span>
          <span className="dx-empty-hint">
            D.E.X.T.E.R. has no execution data to show. Register an emergency in INZORA TERRA and
            start the mission to see this agent work.
          </span>
        </div>
      ) : (
        <>
          {/* responsibility */}
          <div className="dx-panel-section">
            <span className="dx-label">Responsibility</span>
            <p className="dx-panel-text">{agent.responsibility}</p>
          </div>

          {/* declared contract (real orchestration graph) */}
          {contract && (
            <div className="dx-panel-section">
              <span className="dx-label">Declared orchestration contract</span>
              <div>
                <span className="dx-label" style={{ opacity: 0.7 }}>inputs</span>
                <ContractChips items={contract.reads} kind="read" />
              </div>
              <div>
                <span className="dx-label" style={{ opacity: 0.7 }}>outputs</span>
                <ContractChips items={contract.writes} kind="write" />
              </div>
            </div>
          )}

          {/* execution intelligence */}
          <div className="dx-panel-section">
            <span className="dx-label">Execution intelligence</span>
            <div className="dx-confidence">
              <div className="dx-confidence-track">
                <div
                  className="dx-confidence-fill"
                  style={{ width: `${agent.confidence !== null ? Math.round(agent.confidence * 100) : 0}%` }}
                />
              </div>
              <span className="dx-confidence-value">
                {agent.confidence !== null ? `${Math.round(agent.confidence * 100)}%` : 'no score'}
              </span>
            </div>
            <div className="dx-facts">
              <div className="dx-fact">
                <span className="dx-label">Executions</span>
                <span className="dx-fact-value">{agent.executions}</span>
              </div>
              <div className="dx-fact">
                <span className="dx-label">Status</span>
                <span className="dx-fact-value">
                  {agent.status === 'active' ? 'executed' : 'standby'}
                </span>
              </div>
              <div className="dx-fact">
                <span className="dx-label">Last execution</span>
                <span className="dx-fact-value">
                  {agent.lastTs ? formatTime(agent.lastTs) : 'none'}
                </span>
              </div>
              <div className="dx-fact">
                <span className="dx-label">Retry attempts</span>
                <span className="dx-fact-value">
                  {agent.attempts !== null ? String(agent.attempts) : 'n/a'}
                </span>
              </div>
            </div>
            {!missionRunning && (
              <span className="dx-panel-note">
                Snapshot data from the latest mission — live reasoning appears while a mission is
                running.
              </span>
            )}
          </div>

          {/* handoffs */}
          {agent.handoffTargets.length > 0 && (
            <div className="dx-panel-section">
              <span className="dx-label">Handoffs</span>
              <div className="dx-handoffs">
                {agent.handoffTargets.slice(0, 3).map((target, i) => (
                  <div className="dx-handoff" key={`${target}-${i}`}>
                    <span>{agent.key}</span>
                    <span>→</span>
                    <strong>{target}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* reasoning — only when the live stream actually delivered it */}
          {(reasoning || report || agent.lastMessage) && (
            <div className="dx-panel-section">
              <span className="dx-label">
                {reasoning ? 'Live reasoning' : 'Latest activity'}
              </span>
              <div className="dx-reasoning">{reasoning || report || agent.lastMessage}</div>
            </div>
          )}
          {!reasoning && !report && !agent.lastMessage && (
            <div className="dx-panel-section">
              <span className="dx-label">Reasoning</span>
              <span className="dx-panel-note">
                No reasoning has been streamed for this agent yet — it appears here when the
                orchestrator executes it during a running mission.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
