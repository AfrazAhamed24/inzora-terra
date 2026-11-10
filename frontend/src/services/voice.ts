/**
 * VoiceDirector - browser voice prompt layer.
 *
 * Zero-dependency: uses the Web Speech API (speechSynthesis + SpeechRecognition) and
 * Web Audio for UI sounds. Everything degrades gracefully when unsupported or muted.
 * Swap points: a premium TTS/STT provider can replace `speak`/`startListening` bodies.
 */

type SpeakOptions = {
  /** Interrupt the current queue and speak now */
  interrupt?: boolean
  /** Delay in ms before this utterance (used to sequence narration) */
  delay?: number
  /** Small gap after this utterance */
  gap?: number
}

export type VoiceUtteranceEvent =
  | { type: 'start'; text: string }
  | { type: 'end'; text: string }

type VoiceListener = (event: VoiceUtteranceEvent) => void

const MUTE_KEY = 'terra-dexter-muted'

class VoiceDirector {
  private queue: SpeechSynthesisUtterance[] = []
  private speaking = false
  private muted = false
  private voices: SpeechSynthesisVoice[] = []
  private audioCtx: AudioContext | null = null
  private recognition: any = null
  private listening = false
  private listeners = new Set<VoiceListener>()
  /** Ids of setTimeout handles created by `speak(..., { delay })` — cleared on stop/mute. */
  private pendingDelays = new Set<number>()
  /** The utterance currently being spoken (used by the watchdog, independent of onstart). */
  private current: SpeechSynthesisUtterance | null = null
  /** Set true after the first user gesture unlocks the speech engine. */
  private primed = false
  /** Watchdog: some browsers never fire `onend` (known speechSynthesis stall), so force-drain. */
  private watchdog: number | null = null
  private readonly watchdogMs = 10000

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices()
      }
      load()
      window.speechSynthesis.addEventListener?.('voiceschanged', load)

      // Don't leave the tab speaking/streaming after it's hidden or closed.
      window.addEventListener?.('pagehide', () => this.stop())

      // Browsers block speechSynthesis until a user gesture occurs (autoplay policy).
      // Prime the engine on the first click/keydown so the first voice prompt is audible.
      const unlock = () => {
        this.prime()
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
      }
      window.addEventListener?.('pointerdown', unlock, { once: true })
      window.addEventListener?.('keydown', unlock, { once: true })
    }
  }

  /** Unlock/prime the speech engine. Safe to call repeatedly; cheap after first run. */
  prime(): void {
    if (!this.supported) return
    try {
      if (!this.primed) {
        window.speechSynthesis.cancel()
        this.primed = true
      }
      // A suspended engine (Chrome) silently produces no audio — resume it.
      if ((window.speechSynthesis as any).state === 'paused') {
        window.speechSynthesis.resume()
      }
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------
  // Mute / capability
  // ------------------------------------------------------------------

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (muted) this.stop()
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  /** Watch current voice output (drives the caption strip). */
  subscribe(listener: VoiceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(event: VoiceUtteranceEvent): void {
    this.listeners.forEach((fn) => fn(event))
  }

  get speechSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition
      )
    )
  }

  // ------------------------------------------------------------------
  // Text-to-speech (queued, calm and authoritative)
  // ------------------------------------------------------------------

  /** Pick a clear, authoritative female voice. Falls back to any English voice. */
  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = this.voices.length ? this.voices : window.speechSynthesis.getVoices()
    if (!voices.length) return null

    const preferred = /samantha|victoria|alice|zira|hazel|karen|moira|tessa|female|google.*uk.*english.*female|google.*us.*english.*female|fiona|susan|kate|anna|allison|ava|zoe/i
    const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
    return (
      en.find((v) => preferred.test(v.name)) ||
      en.find((v) => /google|microsoft|natural/i.test(v.name)) ||
      en[0] ||
      voices[0]
    )
  }

  private finishCurrent(next: SpeechSynthesisUtterance): void {
    if (this.current === next) this.current = null
    this.notify({ type: 'end', text: next.text })
    this.speaking = false
    if (this.watchdog !== null) {
      window.clearTimeout(this.watchdog)
      this.watchdog = null
    }
    this.dequeue()
  }

  private dequeue(): void {
    if (this.speaking || this.muted) return
    const next = this.queue.shift()
    if (!next) return

    this.speaking = true
    this.current = next
    next.onstart = () => {
      this.notify({ type: 'start', text: next.text })
    }
    next.onend = () => this.finishCurrent(next)
    next.onerror = () => this.finishCurrent(next)
    window.speechSynthesis.speak(next)

    // Watchdog: some browsers never fire onend (speechSynthesis stall) — force-drain
    // the stuck utterance so the queue doesn't hang silently.
    this.watchdog = window.setTimeout(() => {
      this.watchdog = null
      if (this.speaking && this.current === next) {
        window.speechSynthesis.cancel()
        this.finishCurrent(next)
      }
    }, this.watchdogMs)
  }

  speak(text: string, opts: SpeakOptions = {}): void {
    if (!this.supported || !text || this.muted) return

    const utter = new SpeechSynthesisUtterance(text)
    const voice = this.pickVoice()
    if (voice) utter.voice = voice
    utter.rate = 0.98
    utter.pitch = 1.18
    utter.volume = 0.92

    const enqueue = () => {
      if (opts.interrupt) {
        window.speechSynthesis.cancel()
        this.queue = []
        this.speaking = false
        this.cancelPendingDelays()
      }
      this.queue.push(utter)
      this.dequeue()
    }

    if (opts.delay) {
      const id = window.setTimeout(() => {
        this.pendingDelays.delete(id)
        enqueue()
      }, opts.delay)
      this.pendingDelays.add(id)
    } else {
      enqueue()
    }
  }

  private cancelPendingDelays(): void {
    this.pendingDelays.forEach((id) => window.clearTimeout(id))
    this.pendingDelays.clear()
  }

  stop(): void {
    if (this.watchdog !== null) {
      window.clearTimeout(this.watchdog)
      this.watchdog = null
    }
    this.cancelPendingDelays()
    if (!this.supported) return
    window.speechSynthesis.cancel()
    this.queue = []
    this.speaking = false
    if (this.current) {
      this.notify({ type: 'end', text: this.current.text })
      this.current = null
    }
  }

  // ------------------------------------------------------------------
  // Speech-to-text
  // ------------------------------------------------------------------

  startListening(handlers: {
    onResult: (transcript: string, isFinal: boolean) => void
    onEnd?: () => void
    onError?: (error: string) => void
  }): void {
    if (!this.speechSupported) {
      handlers.onError?.('speech_not_supported')
      return
    }

    const Ctor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (this.recognition) this.stopListening()

    const rec = new Ctor()
    this.recognition = rec
    rec.lang = 'en-US'
    // High-sensitivity capture: keep the session alive across utterances and pauses
    // (a session that dies after one soft utterance is why "dexter" often never lands),
    // ask for several transcript alternatives so accent/noise still match, and deliver
    // interim (partial) transcripts so the wake word can be caught mid-sentence.
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 5

    // Transient errors are not permission failures — quietly re-arm the session so a
    // quiet first attempt doesn't kill the mic (the session stays "listening").
    const TRANSIENT = new Set(['no-speech', 'aborted', 'audio-capture', 'network'])
    let restartTimer: number | null = null
    const rearm = () => {
      if (!this.listening || this.recognition !== rec) return
      restartTimer = window.setTimeout(() => {
        restartTimer = null
        try {
          rec.start()
        } catch {
          /* already started / invalid state */
        }
      }, 120)
    }

    rec.onresult = (event: any) => {
      let transcript = ''
      let isFinal = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
        if (event.results[i].isFinal) isFinal = true
      }
      handlers.onResult(transcript, isFinal)
    }
    rec.onerror = (event: any) => {
      const err = event?.error || 'speech_error'
      if (TRANSIENT.has(err) && this.listening) {
        rearm()
        return
      }
      this.listening = false
      handlers.onError?.(err)
    }
    rec.onend = () => {
      // Continuous sessions still end on long silence in some browsers — resume quietly
      // unless the user (or an error) has already stopped the session.
      if (this.listening) {
        rearm()
        return
      }
      handlers.onEnd?.()
    }

    this.listening = true
    try {
      rec.start()
    } catch {
      // e.g. already-started / invalid state in an embedded or background context.
      this.listening = false
      this.recognition = null
      if (restartTimer !== null) window.clearTimeout(restartTimer)
      handlers.onError?.('start_failed')
    }
  }

  stopListening(): void {
    this.listening = false
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch {
        /* ignore */
      }
      this.recognition = null
    }
  }

  get isListening(): boolean {
    return this.listening
  }

  // ------------------------------------------------------------------
  // UI sounds (Web Audio — subtle, purposeful)
  // ------------------------------------------------------------------

  private ctx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
      if (!this.audioCtx) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
        this.audioCtx = new Ctor()
      }
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
      return this.audioCtx
    } catch {
      return null
    }
  }

  /** A short tone. kind: 'tick' | 'ok' | 'alert' | 'reveal' */
  uiSound(kind: 'tick' | 'ok' | 'alert' | 'reveal' = 'tick'): void {
    if (this.muted) return
    const ctx = this.ctx()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    const freq = kind === 'tick' ? 880 : kind === 'ok' ? 1320 : kind === 'alert' ? 220 : 660
    const dur = kind === 'tick' ? 0.06 : kind === 'ok' ? 0.18 : 0.4

    osc.type = kind === 'alert' ? 'sawtooth' : 'sine'
    osc.frequency.setValueAtTime(freq, now)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.05)
  }

  /** A brief ambient sweep for UI transitions. */
  sweep(freqFrom = 200, freqTo = 900, dur = 0.7): void {
    if (this.muted) return
    const ctx = this.ctx()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freqFrom, now)
    osc.frequency.exponentialRampToValueAtTime(freqTo, now + dur)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.05)
  }
}

export const voice = new VoiceDirector()
export default voice
