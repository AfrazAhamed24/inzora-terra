/**
 * D.E.X.T.E.R. — Bottom command bar (Phase 2)
 *
 * Real conversational interface: text input + Web Speech API microphone.
 * Wake word "DEXTER" is handled by useDexterVoice; this bar also allows
 * direct typing. The activity area still shows only real timeline events.
 */

import { useRef, useState, type FormEvent } from 'react';
import type { TimelineEvent } from '../api';
import { formatTime } from '../ui';
import type { DexterConnection } from './useDexterData';

interface DexterFooterProps {
  activity: TimelineEvent[];
  connection: DexterConnection;
  busy: boolean;
  onSend: (text: string) => void;
  onReset: () => void;
  micOn: boolean;
  micSupported: boolean;
  onToggleMic: () => void;
  capturing: boolean;
  muted: boolean;
  onToggleMute: () => void;
  speaking: boolean;
  onStopSpeaking: () => void;
  onRepeat: () => void;
  voiceError: string | null;
}

export function DexterFooter({
  activity,
  connection,
  busy,
  onSend,
  onReset,
  micOn,
  micSupported,
  onToggleMic,
  capturing,
  muted,
  onToggleMute,
  speaking,
  onStopSpeaking,
  onRepeat,
  voiceError,
}: DexterFooterProps) {
  const latest = activity.length > 0 ? activity[activity.length - 1] : null;
  const previous = activity.length > 1 ? activity[activity.length - 2] : null;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft('');
    inputRef.current?.focus();
  };

  const micStatus = !micSupported
    ? 'VOICE N/A'
    : capturing
      ? 'LISTENING…'
      : micOn
        ? 'WAKE: “DEXTER”'
        : 'MIC OFF';

  return (
    <div className="dx-bottom">
      {/* conversational command input — real in Phase 2 */}
      <form className="dx-command" aria-label="Conversational command interface" onSubmit={submit}>
        <input
          ref={inputRef}
          className="dx-command-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            busy ? 'D.E.X.T.E.R. is processing…' : 'Ask about risk, victims, resources, approvals…'
          }
          aria-label="Ask D.E.X.T.E.R. a mission question"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="dx-btn dx-command-send"
          disabled={busy || draft.trim().length === 0}
        >
          {busy ? '···' : 'Send'}
        </button>
        <button
          type="button"
          className="dx-command-reset"
          title="Start a new conversation"
          aria-label="Start a new conversation"
          onClick={onReset}
        >
          Reset
        </button>
      </form>

      {/* voice controls */}
      <div className="dx-voice-controls">
        <button
          type="button"
          className={`dx-mic-btn ${micOn ? 'dx-mic-on' : ''}`}
          onClick={onToggleMic}
          disabled={!micSupported}
          title={
            micSupported
              ? micOn
                ? 'Microphone on — say “DEXTER” then ask your question'
                : 'Enable microphone (wake word: “DEXTER”)'
              : 'Speech recognition not supported in this browser'
          }
          aria-pressed={micOn}
        >
          <span className="dx-mic-dot" aria-hidden="true" />
          {micStatus}
        </button>

        {voiceError && (
          <span className="dx-voice-error" role="status" title={voiceError}>
            {voiceError.length > 46 ? `${voiceError.slice(0, 46)}…` : voiceError}
          </span>
        )}

        <button
          type="button"
          className="dx-voice-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          title={muted ? 'Voice playback muted' : 'Voice playback on'}
        >
          {muted ? 'Muted' : 'Voice On'}
        </button>
        <button
          type="button"
          className="dx-voice-btn"
          onClick={onRepeat}
          title="Repeat the last answer aloud"
        >
          Repeat
        </button>
        {speaking && (
          <button
            type="button"
            className="dx-voice-btn dx-voice-stop"
            onClick={onStopSpeaking}
            title="Stop speaking"
          >
            ■ Stop
          </button>
        )}
      </div>

      {/* live system activity (real timeline events) */}
      <div className="dx-activity">
        {latest ? (
          <>
            <span className="dx-activity-line">
              <strong>{latest.agent ? latest.agent : 'SYSTEM'}</strong>{' '}
              {latest.message || latest.type}
            </span>
            {previous && (
              <span className="dx-activity-line" style={{ opacity: 0.65 }}>
                <span className="dx-activity-time">{formatTime(previous.ts)}</span>{' '}
                {previous.message || previous.type}
              </span>
            )}
            <span className="dx-activity-time">
              {connection === 'online' ? 'connected' : connection} · simulated telemetry —
              demonstration data
            </span>
          </>
        ) : (
          <>
            <span className="dx-activity-line">No mission activity recorded</span>
            <span className="dx-activity-time">
              {connection === 'online' ? 'connected' : connection} · awaiting a mission
            </span>
          </>
        )}
      </div>
    </div>
  );
}
