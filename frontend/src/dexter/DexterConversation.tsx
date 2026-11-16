/**
 * D.E.X.T.E.R. — Conversation transcript (Phase 2)
 *
 * Mission-aware operator↔assistant transcript. Every assistant answer comes
 * from the backend (grounded on live mission state, provider-labelled). Errors
 * are rendered inline as system-style rows. Scroll stays pinned to the newest
 * message.
 */

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './useDexterChat';

export function DexterConversation({
  messages,
  busy,
  interim,
  capturing,
  micOn,
}: {
  messages: ChatMessage[];
  busy: boolean;
  interim: string;
  capturing: boolean;
  micOn: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, interim]);

  const empty = messages.length === 0;

  return (
    <div className="dx-conversation" aria-live="polite" aria-label="D.E.X.T.E.R. conversation transcript">
      <div className="dx-conversation-scroll" ref={scrollRef}>
        {empty && (
          <div className="dx-conversation-empty">
            <span className="dx-conversation-empty-title">MISSION INTELLIGENCE CHANNEL</span>
            <span>
              Ask about mission status, risk, victims, resources, knowledge, rescue guidance,
              approvals, or confidence — grounded on live mission state.
            </span>
            {micOn && (
              <span className="dx-conversation-hint">
                {capturing ? 'Listening — state your question…' : 'Say “DEXTER” to speak, or type below.'}
              </span>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`dx-msg dx-msg-${m.role}${m.error ? ' dx-msg-error' : ''}`}>
            <span className="dx-msg-role">
              {m.role === 'user' ? 'OPERATOR' : m.error ? 'SYSTEM' : 'D.E.X.T.E.R.'}
            </span>
            <span className="dx-msg-text">{m.text}</span>
            {m.role === 'assistant' && !m.error && m.provider && (
              <span className="dx-msg-meta">
                {m.provider === 'llm' ? 'grounded · llm' : 'grounded · mission state'}
              </span>
            )}
          </div>
        ))}

        {interim && (
          <div className="dx-msg dx-msg-user dx-msg-interim">
            <span className="dx-msg-role">OPERATOR (LISTENING)</span>
            <span className="dx-msg-text">{interim}…</span>
          </div>
        )}

        {busy && (
          <div className="dx-msg dx-msg-assistant dx-msg-thinking" aria-label="Assistant thinking">
            <span className="dx-msg-role">D.E.X.T.E.R.</span>
            <span className="dx-thinking-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
