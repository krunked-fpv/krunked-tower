// ============================================================================
// Krunked Tower — Web Audio Engine (Procedural Synth + Optional Custom Pack)
// Implements AudioEngineAPI from `../contracts/index`.
// Safe in headless Node/Vitest environments when AudioContext is absent!
// ============================================================================

import type {
  AudioEngineAPI,
  AudioSettings,
  MusicTrackId,
  SfxId,
  SimEvent,
} from '../contracts/index';
import { DEFAULT_AUDIO_SETTINGS } from '../contracts/index';
import { ProceduralSynth } from './ProceduralSynth';
import { MUSIC_MANIFEST, SFX_MANIFEST } from './soundManifest';

interface AudioGlobalScope {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  fetch?: typeof fetch;
}

function getAudioContextCtor(): (typeof AudioContext) | null {
  const scope = globalThis as unknown as AudioGlobalScope;
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class AudioEngine implements AudioEngineAPI {
  private ctx: AudioContext | null = null;
  private synth: ProceduralSynth | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };

  private currentTrack: MusicTrackId = 'none';
  private musicActive = false;
  private disposed = false;

  // Custom Pack Audio Override Support
  private customAudioMap = new Map<string, string>();
  private decodedCache = new Map<string, AudioBuffer>();
  private pendingDecodes = new Map<string, Promise<AudioBuffer | null>>();
  private failedUrls = new Set<string>();

  private customMusicSource: AudioBufferSourceNode | null = null;
  private customMusicGain: GainNode | null = null;
  private customMusicTrack: MusicTrackId = 'none';
  private musicPlayToken = 0;

  constructor(initialSettings?: Partial<AudioSettings>) {
    if (initialSettings) {
      this.settings = {
        ...DEFAULT_AUDIO_SETTINGS,
        ...initialSettings,
      };
    }
  }

  /**
   * Unlocks/resumes Web Audio immediately on first user gesture (click, key, touch, gamepad).
   * Safe no-op in headless Node environments where AudioContext does not exist.
   */
  public unlock(): void {
    if (this.disposed) return;

    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
        this.synth = new ProceduralSynth(this.ctx);
        this.synth.applySettings(this.settings);
      } catch {
        this.ctx = null;
        this.synth = null;
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Browser may still require a direct user-gesture stack frame; next unlock retries.
      });
    }

    // If a music track was requested prior to unlock, kick it off seamlessly now
    if (this.currentTrack !== 'none' && !this.musicActive) {
      this.startActiveTrack(this.currentTrack);
    }
  }

  public applySettings(settings: AudioSettings): void {
    this.settings = {
      masterVolume: clamp01(settings.masterVolume),
      musicVolume: clamp01(settings.musicVolume),
      sfxVolume: clamp01(settings.sfxVolume),
      muted: Boolean(settings.muted),
    };
    this.synth?.applySettings(this.settings);
  }

  public playMusic(track: MusicTrackId, forceRestart = false): void {
    if (this.disposed) return;

    if (track === 'none') {
      this.currentTrack = 'none';
      this.musicActive = false;
      this.musicPlayToken++;
      this.stopCustomMusic(40);
      this.synth?.stopMusic(40);
      return;
    }

    // Never restart already-playing track unless explicitly requested
    if (track === this.currentTrack && !forceRestart && this.musicActive) {
      return;
    }

    this.currentTrack = track;

    // Wait until AudioContext is initialized via unlock()
    if (!this.ctx || !this.synth) {
      this.musicActive = false;
      return;
    }

    this.startActiveTrack(track);
  }

  public playSfx(
    sfx: SfxId,
    pan = 0,
    pitchJitter?: number,
    volume = 1,
  ): void {
    if (this.disposed) return;
    if (!this.ctx || !this.synth) return;
    if (this.settings.muted || this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) {
      return;
    }

    // Attempt custom pack buffer override if available & already decoded
    const customUrl = this.resolveCustomUrl('sfx', sfx);
    if (customUrl && !this.failedUrls.has(customUrl)) {
      const cached = this.decodedCache.get(customUrl);
      if (cached) {
        this.playCustomSfxBuffer(sfx, cached, pan, pitchJitter, volume);
        return;
      }
      // Kick off background decode for subsequent triggers while using procedural synth immediately
      void this.loadCustomBuffer(customUrl);
    }

    this.synth.playSfx(sfx, { pan, pitchJitter, volume });
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    if (this.disposed || events.length === 0) return;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'music') {
        this.playMusic(ev.track, ev.forceRestart ?? false);
      } else if (ev.type === 'sfx') {
        this.playSfx(ev.sfx, ev.pan, ev.pitchJitter, ev.volume);
      }
    }
  }

  public setCustomAudioMap(map: Map<string, string>): void {
    if (this.disposed) return;
    this.customAudioMap = new Map(map);
    this.failedUrls.clear();

    if (!this.ctx || !this.synth || this.currentTrack === 'none') {
      return;
    }

    const customUrl = this.resolveCustomUrl('music', this.currentTrack);
    if (!customUrl) {
      // Switching back to Built-In audio while custom music is playing
      if (this.customMusicSource) {
        this.stopCustomMusic(40);
        this.synth.startMusic(this.currentTrack);
        this.musicActive = true;
      }
      return;
    }

    // Hot-swap currently playing music into custom pack override once decoded
    this.startActiveTrack(this.currentTrack);
  }

  public getCurrentTrack(): MusicTrackId {
    return this.currentTrack;
  }

  public isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.musicPlayToken++;
    this.musicActive = false;
    this.currentTrack = 'none';

    this.stopCustomMusic(10);
    this.synth?.dispose();
    this.synth = null;

    this.customAudioMap.clear();
    this.decodedCache.clear();
    this.pendingDecodes.clear();
    this.failedUrls.clear();

    if (this.ctx) {
      const closing = this.ctx;
      this.ctx = null;
      void closing.close().catch(() => {
        // Ignore close errors
      });
    }
  }

  // ---- Internal Track & Custom Audio Buffer Management ----

  private startActiveTrack(track: MusicTrackId): void {
    if (!this.ctx || !this.synth) return;

    const token = ++this.musicPlayToken;
    const customUrl = this.resolveCustomUrl('music', track);

    if (customUrl && !this.failedUrls.has(customUrl)) {
      const cached = this.decodedCache.get(customUrl);
      if (cached) {
        this.synth.stopMusic(30);
        this.playCustomMusicBuffer(track, cached);
        this.musicActive = true;
        return;
      }

      // Immediately play procedural music so there is zero silence while decoding custom audio
      this.stopCustomMusic(25);
      this.synth.startMusic(track);
      this.musicActive = true;

      void this.loadCustomBuffer(customUrl).then((buffer) => {
        if (this.disposed || token !== this.musicPlayToken || this.currentTrack !== track) {
          return;
        }
        if (buffer && this.synth) {
          this.synth.stopMusic(40);
          this.playCustomMusicBuffer(track, buffer);
        }
      });
      return;
    }

    // Built-in procedural Web Audio synthesizer
    this.stopCustomMusic(30);
    this.synth.startMusic(track);
    this.musicActive = true;
  }

  private playCustomMusicBuffer(track: MusicTrackId, buffer: AudioBuffer): void {
    if (!this.ctx || !this.synth || this.disposed) return;

    this.stopCustomMusic(30);

    const meta = MUSIC_MANIFEST[track];
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = meta ? meta.loop : true;

    const gain = this.ctx.createGain();
    const targetGain = meta ? Math.max(0.5, meta.gain) : 0.9;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(targetGain, now + 0.05);

    src.connect(gain);
    gain.connect(this.synth.getMusicBus());
    src.start(now);

    this.customMusicSource = src;
    this.customMusicGain = gain;
    this.customMusicTrack = track;

    src.onended = () => {
      if (this.customMusicSource === src) {
        this.customMusicSource = null;
        this.customMusicGain = null;
        this.customMusicTrack = 'none';
      }
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    };
  }

  private stopCustomMusic(fadeMs = 40): void {
    const src = this.customMusicSource;
    const gain = this.customMusicGain;
    this.customMusicSource = null;
    this.customMusicGain = null;
    this.customMusicTrack = 'none';

    if (!src || !gain || !this.ctx) return;

    const now = this.ctx.currentTime;
    const fadeSec = Math.max(0.01, fadeMs / 1000);
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      src.stop(now + fadeSec + 0.01);
    } catch {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private playCustomSfxBuffer(
    sfx: SfxId,
    buffer: AudioBuffer,
    pan: number,
    pitchJitter: number | undefined,
    volume: number,
  ): void {
    if (!this.ctx || !this.synth || this.disposed) return;

    const meta = SFX_MANIFEST[sfx];
    if (!meta) return;

    const nowMs = Date.now();
    if (!this.synth.canTriggerSfx(sfx, nowMs)) return;

    const ctx = this.ctx;
    const now = ctx.currentTime + 0.002;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const pitch = this.synth.computePitchFactor(sfx, pitchJitter);
    src.playbackRate.setValueAtTime(pitch, now);

    const gain = ctx.createGain();
    const peak = clamp01(volume) * meta.baseGain;
    gain.gain.setValueAtTime(Math.max(0.0001, peak), now);

    const panner = this.synth.createPanner(pan);
    src.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.synth.getSfxBus());
    } else {
      gain.connect(this.synth.getSfxBus());
    }

    const durationMs = Math.max(80, Math.round((buffer.duration * 1000) / pitch));
    const stopVoice = () => {
      const stopTime = ctx.currentTime;
      try {
        gain.gain.cancelScheduledValues(stopTime);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), stopTime);
        gain.gain.linearRampToValueAtTime(0.0001, stopTime + 0.012);
        src.stop(stopTime + 0.016);
      } catch {
        // Ignore already-stopped source
      }
    };

    if (!this.synth.reserveSfxVoice(sfx, nowMs, stopVoice, durationMs)) {
      src.disconnect();
      gain.disconnect();
      panner?.disconnect();
      return;
    }

    src.start(now);
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
        panner?.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    };
  }

  private resolveCustomUrl(kind: 'music' | 'sfx', id: string): string | undefined {
    if (this.customAudioMap.size === 0) return undefined;
    return (
      this.customAudioMap.get(`${kind}:${id}`) ??
      this.customAudioMap.get(`${kind}/${id}`) ??
      this.customAudioMap.get(id)
    );
  }

  private loadCustomBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx || this.disposed || this.failedUrls.has(url)) {
      return Promise.resolve(null);
    }

    const cached = this.decodedCache.get(url);
    if (cached) return Promise.resolve(cached);

    const existing = this.pendingDecodes.get(url);
    if (existing) return existing;

    const scope = globalThis as unknown as AudioGlobalScope;
    if (typeof scope.fetch !== 'function') {
      this.failedUrls.add(url);
      return Promise.resolve(null);
    }

    const ctx = this.ctx;
    const promise = scope
      .fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((arrayBuf) => ctx.decodeAudioData(arrayBuf.slice(0)))
      .then((decoded) => {
        this.pendingDecodes.delete(url);
        if (!this.disposed) {
          this.decodedCache.set(url, decoded);
        }
        return decoded;
      })
      .catch(() => {
        this.pendingDecodes.delete(url);
        this.failedUrls.add(url);
        return null;
      });

    this.pendingDecodes.set(url, promise);
    return promise;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
