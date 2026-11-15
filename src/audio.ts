import { CreoTrack } from './songs';

export class FunkAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Pre-fetched & WebAudio-decoded buffer caches for zero-stall, drift-free playback
  private rawBufferCache = new Map<string, Promise<ArrayBuffer>>();
  private decodedCache = new Map<string, AudioBuffer>();
  private decodingCache = new Map<string, Promise<AudioBuffer>>();

  private activeSource: AudioBufferSourceNode | null = null;
  private playSessionId = 0;

  private currentTrack: CreoTrack | null = null;
  private endlessMode = false;
  private isPlaying = false;
  private isPaused = false;
  private isLoading = false;
  private isMuted = false;
  private volume = 0.82;
  private musicVolume = 0.9;
  private sfxVolume = 0.85;

  // Sample-accurate hardware clock + automatic wall-clock fallback watchdog
  private leadInSec = 2.0;
  private playStartCtxTime = 0;
  private pauseSongTime = 0;

  private lastObservedCtxTime = -1;
  private lastCtxAdvancePerfSec = 0;
  private lastResumeAttemptPerfSec = 0;
  private useWallClockFallback = false;
  private wallClockZeroPerfSec = 0;

  private smoothedBassPulse = 0;

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.65;
      this.freqBins = new Uint8Array(this.analyser.frequencyBinCount);

      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);

      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }

    this.resumeContextIfNeeded();
    return this.ctx;
  }

  public resumeContextIfNeeded(): void {
    if (!this.ctx) return;
    if ((this.ctx.state as string) !== 'running' && (this.ctx.state as string) !== 'closed') {
      void this.ctx.resume().catch(() => {
        // Ignore transient autoplay rejection outside user gesture
      });
    }
  }

  /**
   * Pre-fetches the MP3 bytes in the background (even before AudioContext exists)
   * and decodes into an AudioBuffer if AudioContext is already initialized.
   */
  public preloadTrack(track: CreoTrack): void {
    void this.fetchRawTrack(track)
      .then(() => {
        if (this.ctx) {
          return this.decodeTrack(track);
        }
      })
      .catch(() => {
        // Handled on startTrack fallback if network offline
      });
  }

  private fetchRawTrack(track: CreoTrack): Promise<ArrayBuffer> {
    const existing = this.rawBufferCache.get(track.id);
    if (existing) return existing;

    const req = fetch(track.src)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading ${track.src}`);
        }
        return res.arrayBuffer();
      })
      .catch((err) => {
        this.rawBufferCache.delete(track.id);
        throw err;
      });

    this.rawBufferCache.set(track.id, req);
    return req;
  }

  private decodeTrack(track: CreoTrack): Promise<AudioBuffer> {
    const cached = this.decodedCache.get(track.id);
    if (cached) return Promise.resolve(cached);

    const inflight = this.decodingCache.get(track.id);
    if (inflight) return inflight;

    const ctx = this.ensureContext();
    const promise = this.fetchRawTrack(track)
      .then((raw) => ctx.decodeAudioData(raw.slice(0)))
      .then((decoded) => {
        this.decodedCache.set(track.id, decoded);
        this.decodingCache.delete(track.id);
        return decoded;
      })
      .catch((err) => {
        this.decodingCache.delete(track.id);
        throw err;
      });

    this.decodingCache.set(track.id, promise);
    return promise;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private stopActiveSource(): void {
    if (!this.activeSource) return;
    const src = this.activeSource;
    this.activeSource = null;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // Already stopped
    }
    try {
      src.disconnect();
    } catch {
      // Already disconnected
    }
  }

  private scheduleBufferFromSongTime(buffer: AudioBuffer, fromSongTime: number): void {
    const ctx = this.ensureContext();
    this.stopActiveSource();

    const nowCtx = ctx.currentTime;
    const nowPerf = performance.now() / 1000;

    this.playStartCtxTime = nowCtx - fromSongTime;
    this.wallClockZeroPerfSec = nowPerf - fromSongTime;
    this.lastObservedCtxTime = nowCtx;
    this.lastCtxAdvancePerfSec = nowPerf;
    this.useWallClockFallback = false;

    if (!this.endlessMode && fromSongTime >= buffer.duration - 0.02) {
      return;
    }

    if (!this.musicGain) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = this.endlessMode;
    src.connect(this.musicGain);
    src.onended = () => {
      try {
        src.disconnect();
      } catch {
        // Ignore
      }
      if (this.activeSource === src) {
        this.activeSource = null;
      }
    };

    if (fromSongTime < 0) {
      src.start(nowCtx + -fromSongTime, 0);
    } else {
      const offset = this.endlessMode
        ? ((fromSongTime % buffer.duration) + buffer.duration) % buffer.duration
        : Math.min(Math.max(0, fromSongTime), Math.max(0, buffer.duration - 0.02));
      src.start(nowCtx, offset);
    }

    this.activeSource = src;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.volume,
        this.ctx.currentTime,
        0.015
      );
    }
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public setVolumes(master: number, music: number, sfx: number): void {
    this.volume = Math.max(0, Math.min(1, master));
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));

    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, now, 0.015);
      }
      if (this.musicGain) {
        this.musicGain.gain.setTargetAtTime(this.musicVolume, now, 0.015);
      }
      if (this.sfxGain) {
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.015);
      }
    }
  }

  public isTrackLoading(): boolean {
    return this.isPlaying && this.isLoading;
  }

  public startTrack(track: CreoTrack, leadInSec: number, endless: boolean): void {
    this.ensureContext();
    const sessionId = ++this.playSessionId;
    this.stopActiveSource();

    this.currentTrack = track;
    this.leadInSec = leadInSec;
    this.endlessMode = endless;
    this.pauseSongTime = -leadInSec;
    this.isPlaying = true;
    this.isPaused = false;
    this.smoothedBassPulse = 0;
    this.useWallClockFallback = false;

    const cached = this.decodedCache.get(track.id);
    if (cached) {
      this.isLoading = false;
      this.scheduleBufferFromSongTime(cached, -leadInSec);
      return;
    }

    this.isLoading = true;
    void this.decodeTrack(track)
      .then((buffer) => {
        if (this.playSessionId !== sessionId || !this.isPlaying) return;
        this.isLoading = false;
        if (this.isPaused) {
          this.pauseSongTime = -this.leadInSec;
          return;
        }
        this.scheduleBufferFromSongTime(buffer, -this.leadInSec);
      })
      .catch((err) => {
        console.error('Failed to decode Creo track; running fallback clock:', err);
        if (this.playSessionId !== sessionId || !this.isPlaying) return;
        this.isLoading = false;
        this.useWallClockFallback = true;
        this.wallClockZeroPerfSec = performance.now() / 1000 + this.leadInSec;
      });
  }

  public pauseSong(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.pauseSongTime = this.getSongTime();
    this.isPaused = true;
    this.stopActiveSource();
  }

  public resumeSong(): void {
    if (!this.isPlaying || !this.isPaused) return;
    this.ensureContext();
    this.isPaused = false;

    if (this.isLoading) {
      return;
    }

    const cached = this.currentTrack ? this.decodedCache.get(this.currentTrack.id) : undefined;
    if (cached && !this.useWallClockFallback) {
      this.scheduleBufferFromSongTime(cached, this.pauseSongTime);
    } else {
      this.useWallClockFallback = true;
      this.wallClockZeroPerfSec = performance.now() / 1000 - this.pauseSongTime;
    }
  }

  public stopSong(): void {
    this.playSessionId++;
    this.isPlaying = false;
    this.isPaused = false;
    this.isLoading = false;
    this.stopActiveSource();
  }

  /**
   * Sample-accurate song time in seconds:
   *  - Negative during the 4-beat pre-song countdown (-leadInSec .. 0)
   *  - Hardware-locked to Creo's WebAudio buffer from 0.000s onward
   *  - Protected by a wall-clock watchdog so gameplay can never freeze if OS audio stalls
   */
  public getSongTime(): number {
    if (!this.isPlaying) return 0;
    if (this.isLoading) return -this.leadInSec;
    if (this.isPaused) return this.pauseSongTime;

    const nowPerf = performance.now() / 1000;

    if (!this.ctx || this.useWallClockFallback) {
      if (this.ctx && (this.ctx.state as string) === 'running') {
        // AudioContext recovered — seamlessly re-lock to hardware audio!
        const currentFallbackTime = nowPerf - this.wallClockZeroPerfSec;
        const cached = this.currentTrack ? this.decodedCache.get(this.currentTrack.id) : undefined;
        if (cached) {
          this.scheduleBufferFromSongTime(cached, currentFallbackTime);
          return currentFallbackTime;
        }
      }
      return nowPerf - this.wallClockZeroPerfSec;
    }

    const nowCtx = this.ctx.currentTime;
    if (Math.abs(nowCtx - this.lastObservedCtxTime) > 1e-6) {
      this.lastObservedCtxTime = nowCtx;
      this.lastCtxAdvancePerfSec = nowPerf;
    } else {
      const stalledSec = nowPerf - this.lastCtxAdvancePerfSec;
      if (stalledSec > 0.08 && nowPerf - this.lastResumeAttemptPerfSec > 0.25) {
        this.lastResumeAttemptPerfSec = nowPerf;
        this.resumeContextIfNeeded();
      }
      if (stalledSec > 0.35) {
        const currentSongT = nowCtx - this.playStartCtxTime;
        this.useWallClockFallback = true;
        this.wallClockZeroPerfSec = nowPerf - currentSongT;
        return currentSongT;
      }
    }

    return nowCtx - this.playStartCtxTime;
  }

  public isTrackEnded(): boolean {
    if (!this.isPlaying || this.isLoading || this.endlessMode || !this.currentTrack) {
      return false;
    }
    const bufferDur = this.decodedCache.get(this.currentTrack.id)?.duration ?? this.currentTrack.durationSec;
    return this.getSongTime() >= bufferDur - 0.12;
  }

  /**
   * Real-time sub-bass kick pulse extracted directly from Creo's audio via WebAudio AnalyserNode!
   */
  public getKickPulse(): number {
    if (!this.ctx || !this.isPlaying || this.isPaused || this.isLoading) return 0;

    const songTime = this.getSongTime();
    if (songTime < 0 && this.currentTrack) {
      const beatDur = 60 / this.currentTrack.bpm;
      const t = songTime + this.leadInSec;
      const frac = ((t % beatDur) + beatDur) % beatDur;
      return Math.pow(Math.max(0, 1 - frac / 0.2), 2.2) * 0.65;
    }

    if (!this.analyser || !this.freqBins) return 0;
    this.analyser.getByteFrequencyData(this.freqBins);

    // Bins 1..4 (~43 Hz .. 215 Hz) capture Creo's punchy kick & sub-bass!
    const lowSum =
      (this.freqBins[1] + this.freqBins[2] * 1.2 + this.freqBins[3] + this.freqBins[4] * 0.6) /
      3.8;
    const normalized = Math.max(0, Math.min(1, (lowSum - 135) / 105));
    const shaped = Math.pow(normalized, 1.8);
    this.smoothedBassPulse = Math.max(shaped, this.smoothedBassPulse * 0.86);
    return this.smoothedBassPulse;
  }

  /**
   * Crisp, unpitched percussive rhythm hit-tick with full WebAudio node cleanup on ended!
   */
  public playPlayerHit(isSick: boolean): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain || !this.noiseBuffer || (ctx.state as string) !== 'running') return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isSick ? 1150 : 920, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.032);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(isSick ? 0.16 : 0.12, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    osc.connect(oGain);
    oGain.connect(this.sfxGain);
    osc.onended = () => {
      osc.disconnect();
      oGain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.042);

    const snap = ctx.createBufferSource();
    snap.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3800, now);
    bp.Q.value = 1.8;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(isSick ? 0.1 : 0.06, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    snap.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.sfxGain);
    snap.onended = () => {
      snap.disconnect();
      bp.disconnect();
      nGain.disconnect();
    };
    snap.start(now);
    snap.stop(now + 0.03);
  }

  public playMissSound(): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain || (ctx.state as string) !== 'running') return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.13);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playSpamJamSound(): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain || (ctx.state as string) !== 'running') return;
    const now = ctx.currentTime;

    for (const detune of [-16, 17]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(132 + detune, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.22);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + 0.24);
    }
  }

  public playCountdownTick(step: 3 | 2 | 1 | 0): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain || (ctx.state as string) !== 'running') return;
    const now = ctx.currentTime;
    const freq = step === 0 ? 880 : step === 1 ? 587.33 : step === 2 ? 523.25 : 440;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    if (step === 0) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(step === 0 ? 0.2 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (step === 0 ? 0.24 : 0.14));

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playUiSelect(): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain || (ctx.state as string) !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.055);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.09);
  }
}
