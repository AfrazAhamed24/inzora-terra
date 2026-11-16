/**
 * D.E.X.T.E.R. — Voice I/O (Phase 2)
 *
 * Browser-native Web Speech API only: SpeechRecognition (wake word "DEXTER" +
 * question capture) and SpeechSynthesis (grounded answer playback). No always-on
 * cloud service: recognition starts only after the operator explicitly turns the
 * microphone on, and every transcript is sent to our own backend.
 *
 * State machine (recognition):
 *   mic off → (operator enables) → WAKE-LISTENING
 *   WAKE-LISTENING → hears "dexter" → CAPTURING (next utterance is the question)
 *   CAPTURING → final transcript sent → back to WAKE-LISTENING
 *   CAPTURING → 10 s without speech → back to WAKE-LISTENING
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ---------- minimal Web Speech typings (not in lib.dom) ---------- */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as RecognitionCtor | null;
}

const WAKE_WORD = 'dexter';
const CAPTURE_TIMEOUT_MS = 10_000;
/** Consecutive engine failures before we stop retrying and surface the error. */
const MAX_RESTARTS = 4;

export type VoicePhase = 'off' | 'wake' | 'capture' | 'error';

export interface UseDexterVoice {
  supported: boolean;
  ttsSupported: boolean;
  phase: VoicePhase;
  micOn: boolean;
  capturing: boolean;
  interim: string;
  error: string | null;
  muted: boolean;
  speaking: boolean;
  startMic: () => void;
  stopMic: () => void;
  toggleMic: () => void;
  toggleMute: () => void;
  speak: (text: string, onDone?: () => void) => void;
  stopSpeaking: () => void;
  repeatLast: () => void;
  /** Last text handed to the synthesizer (for repeat). */
  lastSpoken: string | null;
}

interface VoiceCallbacks {
  /** Wake word heard while the assistant UI is in standby → activate it. */
  onWakeWord: () => void;
  /** A captured question (final transcript). */
  onQuery: (text: string) => void;
}

export function useDexterVoice(callbacks: VoiceCallbacks): UseDexterVoice {
  const supported = useMemo(() => getRecognitionCtor() !== null, []);
  const ttsSupported = useMemo(() => typeof window.speechSynthesis !== 'undefined', []);

  const [phase, setPhase] = useState<VoicePhase>('off');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastSpoken, setLastSpoken] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const capturingRef = useRef(false);
  const wantMicRef = useRef(false);
  const restartsRef = useRef(0);
  const captureTimerRef = useRef<number | null>(null);
  const lastResultIndexRef = useRef(0);
  /** Latest callbacks (avoid re-binding recognition handlers). */
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const lastSpokenRef = useRef<string | null>(null);

  const micOn = phase === 'wake' || phase === 'capture';

  /* ---------------- synthesis ---------------- */

  const stopSpeaking = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      lastSpokenRef.current = text;
      setLastSpoken(text);
      if (!ttsSupported || mutedRef.current) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        onDone?.();
      };
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [ttsSupported],
  );

  const repeatLast = useCallback(() => {
    const text = lastSpokenRef.current;
    if (text) {
      mutedRef.current = muted;
      // temporarily unmute semantics: repeat forces playback
      if (ttsSupported) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [ttsSupported, muted]);

  /* ---------------- recognition state machine ---------------- */

  const clearCaptureTimer = useCallback(() => {
    if (captureTimerRef.current !== null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }, []);

  const beginCapture = useCallback(() => {
    capturingRef.current = true;
    setPhase('capture');
    setInterim('');
    clearCaptureTimer();
    captureTimerRef.current = window.setTimeout(() => {
      capturingRef.current = false;
      setPhase('wake');
      setInterim('');
    }, CAPTURE_TIMEOUT_MS);
  }, [clearCaptureTimer]);

  const handleFinal = useCallback(
    (text: string) => {
      const cleaned = text.trim().toLowerCase().replace(/[.,!?]/g, '');
      if (!capturingRef.current) {
        // WAKE-LISTENING: does this phrase wake us up?
        if (cleaned === WAKE_WORD || cleaned.startsWith(WAKE_WORD)) {
          cbRef.current.onWakeWord();
          const rest = text.trim().slice(WAKE_WORD.length).replace(/^[.,!?\s]+/, '');
          if (rest.length >= 3) {
            capturingRef.current = false;
            clearCaptureTimer();
            cbRef.current.onQuery(rest);
          } else {
            beginCapture();
          }
        }
        return;
      }
      // CAPTURING: this utterance is the question.
      capturingRef.current = false;
      clearCaptureTimer();
      setPhase('wake');
      setInterim('');
      if (text.trim().length >= 2) cbRef.current.onQuery(text.trim());
    },
    [beginCapture, clearCaptureTimer],
  );

  const buildRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (i < lastResultIndexRef.current) continue; // duplicate deliveries
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          lastResultIndexRef.current = i + 1;
          handleFinal(transcript);
        } else {
          interimText += transcript;
        }
      }
      if (interimText) setInterim(interimText);
      else if (!capturingRef.current) setInterim('');
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantMicRef.current = false;
        setPhase('error');
        setError('Microphone access denied — enable it in your browser and press the mic again.');
        return;
      }
      if (event.error === 'no-speech') return; // normal while wake-listening
      if (event.error === 'aborted') return; // deliberate stop
      setError(`Voice recognition error: ${event.error}`);
    };

    rec.onend = () => {
      // Chrome ends the session periodically; restart while the mic should be on.
      if (wantMicRef.current && getRecognitionCtor()) {
        if (restartsRef.current >= MAX_RESTARTS) {
          wantMicRef.current = false;
          setPhase('error');
          setError('Voice recognition kept failing — voice mode disabled.');
          return;
        }
        restartsRef.current += 1;
        window.setTimeout(() => {
          if (!wantMicRef.current) return;
          try {
            recognitionRef.current?.start();
          } catch {
            /* already started — ignore */
          }
        }, 250);
      }
    };
    return rec;
  }, [handleFinal]);

  const startMic = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('This browser does not support speech recognition — use the text input instead.');
      setPhase('error');
      return;
    }
    wantMicRef.current = true;
    restartsRef.current = 0;
    lastResultIndexRef.current = 0;
    setError(null);
    if (!recognitionRef.current) recognitionRef.current = buildRecognition();
    try {
      recognitionRef.current?.start();
      setPhase('wake'); // brief ACTIVATING-style transition is handled by the caller
    } catch {
      /* start() called while already running — treat as on */
    }
  }, [buildRecognition]);

  const stopMic = useCallback(() => {
    wantMicRef.current = false;
    capturingRef.current = false;
    clearCaptureTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
    setPhase('off');
    setInterim('');
  }, [clearCaptureTimer]);

  const toggleMic = useCallback(() => {
    if (micOn) stopMic();
    else startMic();
  }, [micOn, startMic, stopMic]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next && ttsSupported) window.speechSynthesis.cancel();
      return next;
    });
  }, [ttsSupported]);

  /* Cleanup on unmount. */
  useEffect(
    () => () => {
      wantMicRef.current = false;
      clearCaptureTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    },
    [clearCaptureTimer],
  );

  return {
    supported,
    ttsSupported,
    phase,
    micOn,
    capturing: phase === 'capture',
    interim,
    error,
    muted,
    speaking,
    startMic,
    stopMic,
    toggleMic,
    toggleMute,
    speak,
    stopSpeaking,
    repeatLast,
    lastSpoken,
  };
}
