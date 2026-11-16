/**
 * D.E.X.T.E.R. — Immersive intelligence experience (Phase 2)
 *
 * Flow: operator clicks the D.E.X.T.E.R. entry button inside the Command
 * Centre → full-screen standby experience → cinematic activation sequence
 * (click, or the "DEXTER" wake word when the microphone is on) → five-agent
 * intelligence command centre reading only real backend data, with a
 * mission-aware conversational channel: Web Speech API wake word + question
 * capture in, grounded assistant answers out (spoken via SpeechSynthesis).
 *
 * Phase boundary honored: no always-on recognition, no LLM function calling,
 * no RAG, no 3D, no gestures. The assistant never mutates mission state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './dexter.css';
import { DexterOrb, type DexterOrbState } from './DexterOrb';
import { AgentNetwork } from './AgentNetwork';
import { AgentIntelPanel } from './AgentIntelPanel';
import { DexterFooter } from './DexterFooter';
import { DexterConversation } from './DexterConversation';
import { useDexterChat } from './useDexterChat';
import { useDexterVoice } from './useDexterVoice';
import {
  fetchDexterData,
  useDexterStream,
  useDexterPoll,
  type DexterConnection,
  type DexterData,
} from './useDexterData';
import { useAsyncData } from '../hooks';
import { scenarioLabel } from '../api';

type DexterPhase = 'standby' | 'activating' | 'online';

/** Duration of the cinematic activation sequence (ms). */
const ACTIVATION_MS = 2400;

export function DexterExperience({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<DexterPhase>('standby');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [micBooting, setMicBooting] = useState(false);
  const activationTimer = useRef<number | null>(null);

  const { data, error, loading, refresh } = useAsyncData<DexterData>(
    (signal) => fetchDexterData(signal),
    []
  );

  const online = phase === 'online';
  const missionId = data?.latestMission?.mission_id ?? null;
  const missionRunning = data?.latestMission?.is_running ?? false;

  const chat = useDexterChat(missionId);

  const activate = useCallback(() => {
    setPhase((current) => {
      if (current !== 'standby') return current;
      activationTimer.current = window.setTimeout(() => {
        activationTimer.current = null;
        setPhase('online');
      }, ACTIVATION_MS);
      return 'activating';
    });
  }, []);

  /* ---------------- voice + conversation wiring ---------------- */

  const chatRef = useRef(chat);
  chatRef.current = chat;
  const phaseRef = useRef<DexterPhase>('standby');
  phaseRef.current = phase;

  const sendVoiceQuery = useCallback(
    (query: string) => {
      const spoken = query.toLowerCase();
      const regionId = spoken.includes('chennai') || spoken.includes('perumbakkam') || spoken.includes('pallikaranai')
        ? 'demo-chennai'
        : spoken.includes('nilgiri') || spoken.includes('coonoor') || spoken.includes('ketty')
          ? 'demo-nilgiris'
          : spoken.includes('cuddalore') || spoken.includes('parangipettai') || spoken.includes('pichavaram')
            ? 'demo-cuddalore'
            : null;
      if (regionId) {
        window.dispatchEvent(new CustomEvent('terra:focus-region', { detail: { id: regionId } }));
      }
      if (phaseRef.current !== 'online') {
        // Wake during standby → bring the interface up; the operator repeats
        // the question once the channel is live.
        if (phaseRef.current === 'standby') activate();
        return;
      }
      void chatRef.current.send(query, (answer) => voiceRef.current?.speak(answer));
    },
    [activate],
  );

  const voice = useDexterVoice({
    onWakeWord: () => {
      if (phaseRef.current === 'standby') activate();
    },
    onQuery: sendVoiceQuery,
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /* Mic boot indicator: brief ACTIVATING-style transition when enabled. */
  const startMicWithBoot = useCallback(() => {
    if (voiceRef.current.micOn || !voiceRef.current.supported) {
      voiceRef.current.toggleMic();
      return;
    }
    setMicBooting(true);
    voiceRef.current.startMic();
    window.setTimeout(() => setMicBooting(false), 1200);
  }, []);

  const stream = useDexterStream(missionId, online);
  // Gentle refresh while a mission loop is running — keeps the network honest.
  useDexterPoll(refresh, 7000, online && missionRunning);

  const connection: DexterConnection =
    error && !data ? 'offline' : loading && !data ? 'connecting' : 'online';

  useEffect(() => () => {
    if (activationTimer.current !== null) window.clearTimeout(activationTimer.current);
  }, []);

  /* Auto-select the most recently active agent once online. */
  useEffect(() => {
    if (phase === 'online' && data && selectedKey === null) {
      const active = data.agents.find((a) => a.status === 'active');
      setSelectedKey(active ? active.key : data.agents[0]?.key ?? null);
    }
  }, [phase, data, selectedKey]);

  /* Escape returns to the Command Centre. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  /* Tab title while inside D.E.X.T.E.R. — restored on exit. */
  useEffect(() => {
    const previous = document.title;
    document.title = 'INZORA TERRA — D.E.X.T.E.R.';
    return () => {
      document.title = previous;
    };
  }, []);

  /* Focus the activation control when the standby screen mounts. */
  const activateRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase === 'standby') activateRef.current?.focus();
  }, [phase]);

  /* ---------------- derived orb state ---------------- */

  const orbState: DexterOrbState =
    phase === 'standby'
      ? 'standby'
      : phase === 'activating'
        ? 'activating'
        : voice.phase === 'error'
          ? 'error'
          : connection === 'offline'
            ? 'error'
            : voice.speaking
              ? 'speaking'
              : chat.busy || voice.capturing
                ? 'processing'
                : loading
                  ? 'processing'
                  : 'online';

  const selectedAgent =
    (data && selectedKey ? data.agents.find((a) => a.key === selectedKey) : null) ?? null;

  const latest = data?.latestMission ?? null;
  const briefing =
    data?.summary && data.summary.generated_at
      ? (data.summary.mission_briefing as Record<string, unknown>)
      : null;
  const overallRisk = typeof briefing?.overall_risk === 'string' ? briefing.overall_risk : null;

  const activityEvents = data ? data.timeline.slice(-6) : [];

  return (
    <div className="dx-root" role="dialog" aria-modal="true" aria-label="D.E.X.T.E.R. intelligence command centre">
      <div className="dx-ambient">
        <div className="dx-ambient-grid" />
      </div>

      {phase !== 'online' ? (
        /* ================= STANDBY / ACTIVATING ================= */
        <div className="dx-standby">
          <div className="dx-standby-top">
            <span className="dx-brandline">INZORA TERRA · EMERGENCY RESPONSE OS</span>
            <button className="dx-btn" type="button" onClick={onExit}>
              ← Return to INZORA TERRA
            </button>
          </div>

          <div className="dx-standby-center">
            <DexterOrb state={orbState} size={260} />

            <div className="dx-identity">
              <h1 className="dx-identity-name dx-gradient-text">D.E.X.T.E.R.</h1>
              <span className="dx-identity-full">
                DISASTER EXTRACTION AND TERRESTRIAL EXCELLENCE &amp; RESCUE
              </span>
              <span className="dx-identity-tagline">AI DISASTER RESPONSE INTELLIGENCE</span>
              <span className="dx-statusline">
                SYSTEM STATUS:&nbsp;
                <strong>{phase === 'activating' ? 'INITIALISING…' : 'STANDBY'}</strong>
              </span>
            </div>

            <div className="dx-standby-actions">
              <button
                ref={activateRef}
                className="dx-btn dx-btn-primary"
                type="button"
                onClick={activate}
                disabled={phase === 'activating'}
              >
                {phase === 'activating' ? 'Activating…' : '◉ Activate D.E.X.T.E.R.'}
              </button>
              {voice.supported ? (
                <button
                  className={`dx-mic-btn ${voice.micOn ? 'dx-mic-on' : ''}`}
                  type="button"
                  onClick={startMicWithBoot}
                  aria-pressed={voice.micOn}
                  title={
                    voice.micOn
                      ? 'Microphone on — say “DEXTER” to activate'
                      : 'Enable the microphone, then say “DEXTER”'
                  }
                >
                  <span className="dx-mic-dot" aria-hidden="true" />
                  {micBooting
                    ? 'MIC INITIALISING…'
                    : voice.micOn
                      ? 'MIC ON — SAY “DEXTER”'
                      : 'ENABLE MICROPHONE'}
                </button>
              ) : (
                <span
                  className="dx-mic-placeholder"
                  title="This browser does not support speech recognition — activate by click; type questions in the command bar"
                >
                  <span className="dx-mic-dot" />
                  Voice unsupported · click to activate
                </span>
              )}
            </div>

            <span className="dx-instruction">
              {phase === 'activating'
                ? 'Intelligence core energising — agent command centre loading…'
                : voice.micOn && voice.supported
                  ? 'Microphone armed — say “DEXTER” to activate, or click Activate.'
                  : 'Activate D.E.X.T.E.R. to enter the intelligence command centre.'}
            </span>
            {voice.error && (
              <span className="dx-voice-error" role="alert">
                {voice.error}
              </span>
            )}
          </div>

          <div className="dx-standby-bottom">
            <span className="dx-brandline">
              {connection === 'offline'
                ? 'BACKEND UNREACHABLE — CONNECT THE MISSION API'
                : connection === 'connecting'
                  ? 'CONNECTING TO MISSION API…'
                  : `MISSION API CONNECTED · v${data?.health.version ?? '—'}`}
            </span>
            <span className="dx-brandline">PHASE 2 · VOICE + CONVERSATIONAL INTELLIGENCE</span>
          </div>
        </div>
      ) : (
        /* ================= ONLINE COMMAND CENTRE ================= */
        <>
          <header className="dx-top">
            <div className="dx-top-left">
              <DexterOrb state={orbState} size={44} />
              <div className="dx-top-brand">
                <span className="dx-top-brand-name dx-gradient-text">D.E.X.T.E.R.</span>
                <span className="dx-top-brand-sub">AI DISASTER RESPONSE INTELLIGENCE</span>
              </div>
            </div>

            <div className="dx-top-spacer" />

            <div className="dx-top-mission">
              <span
                className={`dx-chip ${connection === 'offline' ? 'dx-chip-error' : connection === 'online' ? 'dx-chip-live' : ''}`}
              >
                <span className={`dx-dot${connection === 'online' ? ' dx-dot-pulse' : ''}`} />
                {connection === 'offline'
                  ? 'API OFFLINE'
                  : connection === 'connecting'
                    ? 'CONNECTING'
                    : 'SYSTEM ONLINE'}
              </span>
              {latest ? (
                <>
                  <span className="dx-chip">
                    MISSION {latest.mission_id}
                    {latest.is_running ? ' · RUNNING' : ` · ${latest.stage.toUpperCase()}`}
                  </span>
                  <span className="dx-mission-name" title={latest.mission_name || latest.incident_text}>
                    {latest.mission_name || latest.incident_text}
                  </span>
                  {latest.environment_id && (
                    <span className="dx-chip" title="Backend simulation scenario">
                      {scenarioLabel(latest.environment_id)}
                    </span>
                  )}
                </>
              ) : (
                <span className="dx-chip">NO MISSION REGISTERED</span>
              )}
              {overallRisk && (
                <span
                  className={`dx-chip ${overallRisk === 'CRITICAL' || overallRisk === 'HIGH' ? 'dx-chip-error' : ''}`}
                >
                  RISK {overallRisk}
                </span>
              )}
              {voice.micOn && (
                <span
                  className={`dx-chip ${voice.capturing ? 'dx-chip-live' : ''}`}
                  title={voice.capturing ? 'Capturing your question' : 'Wake listening — say “DEXTER”'}
                >
                  <span className={`dx-dot${voice.capturing ? ' dx-dot-pulse' : ''}`} />
                  {voice.capturing ? 'LISTENING' : 'WAKE “DEXTER”'}
                </span>
              )}
              {voice.muted && <span className="dx-chip">VOICE MUTED</span>}
              <span className="dx-chip dx-chip-sim" title="INZORA TERRA runs on simulated sensor data">
                SIMULATED TELEMETRY
              </span>
              <button className="dx-btn" type="button" onClick={onExit}>
                ← Return to INZORA TERRA
              </button>
            </div>
          </header>

          <div className="dx-main">
            <div className="dx-center">
              <AgentNetwork
                agents={data?.agents ?? []}
                selectedKey={selectedKey}
                onSelect={(key) => setSelectedKey((cur) => (cur === key ? null : key))}
                connection={connection}
                executing={missionRunning}
              />
              <DexterConversation
                messages={chat.messages}
                busy={chat.busy}
                interim={voice.interim}
                capturing={voice.capturing}
                micOn={voice.micOn}
              />
              <DexterFooter
                activity={activityEvents}
                connection={connection}
                busy={chat.busy}
                onSend={(text) => void chat.send(text, (answer) => voice.speak(answer))}
                onReset={chat.reset}
                micOn={voice.micOn}
                micSupported={voice.supported}
                onToggleMic={startMicWithBoot}
                capturing={voice.capturing}
                muted={voice.muted}
                onToggleMute={voice.toggleMute}
                speaking={voice.speaking}
                onStopSpeaking={voice.stopSpeaking}
                onRepeat={voice.repeatLast}
                voiceError={voice.error}
              />
            </div>

            <aside className="dx-side" aria-label="Agent intelligence panel">
              <AgentIntelPanel
                agent={selectedAgent}
                frame={selectedKey ? stream.agents[selectedKey] ?? null : null}
                hasMission={latest !== null}
                missionRunning={missionRunning}
                connection={connection}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
