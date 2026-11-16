/**
 * D.E.X.T.E.R. — Conversational intelligence state (Phase 2)
 *
 * Talks to the real backend assistant endpoint (mission-aware, grounded,
 * read-only). Owns the conversation id, the transcript, and the busy flag the
 * orb/voice layer key their PROCESSING/SPEAKING states off.
 */

import { useCallback, useRef, useState } from 'react';
import { api } from '../api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
  sources?: string[];
  error?: boolean;
  ts: number;
}

let seq = 0;
const nextId = () => `msg-${Date.now()}-${seq++}`;

export function useDexterChat(missionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const missionRef = useRef<string | null>(missionId);
  missionRef.current = missionId;

  const send = useCallback(
    async (query: string, onAnswer?: (answer: string) => void) => {
      const text = query.trim();
      // The assistant remains usable before an operator registers a live mission.
      // The backend reserves this id for the clearly labelled fictional demo context.
      const mission = missionRef.current ?? 'virtual-tamil-nadu';
      if (!text || busy) return;
      setMessages((m) => [...m, { id: nextId(), role: 'user', text, ts: Date.now() }]);
      setBusy(true);
      try {
        const resp = await api.assistantChat(mission, text, conversationIdRef.current ?? undefined);
        conversationIdRef.current = resp.conversation_id;
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: 'assistant',
            text: resp.answer,
            provider: resp.provider,
            sources: resp.sources,
            ts: Date.now(),
          },
        ]);
        onAnswer?.(resp.answer);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : 'Assistant request failed — try again.';
        setMessages((m) => [
          ...m,
          { id: nextId(), role: 'assistant', text: detail, error: true, ts: Date.now() },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const reset = useCallback(() => {
    conversationIdRef.current = null;
    setMessages([]);
  }, []);

  return { messages, busy, send, reset, conversationId: conversationIdRef.current };
}
