import { CreoTrack } from './songs';

export class FunkAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicEl: HTMLAudioElement | null = null;
  private mediaSourceConnected = false;

  private currentTrack: CreoTrack | null = null;
  private endlessMode = false;
  private isPlaying = false;
  private isPaused = false;
  private isMuted = false;
  private volume = 0.82;

  // High-precision lead-in + drift-corrected MP3 clock
  private leadInSec = 2.0;
  private leadInStartCtxTime = 0;
  private pauseSongTime = 0;
  private mp3Started = false;
  private loopTimeOffset = 0;
  private clockAnchorCtxTime = 0;
  private clockAnchorSongTime = 0;

  private smoothedBassPulse = 0;
  private onLoopCallback: ((newOffsetSec: number) => void) | null = null;

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
      this.musicGain.gain.value = 0.9;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.65;
      this.freqBins = new Uint8Array(this.analyser.frequencyBinCount);

      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);

      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }

    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.preload = 'auto';
      this.musicEl.crossOrigin = 'anonymous';
      this.musicEl.addEventListener('ended', () => {
        if (!this.isPlaying || this.isPaused || !this.currentTrack || !this.musicEl) return;
        if (this.endlessMode) {
          this.loopTimeOffset += this.currentTrack.durationSec;
          this.musicEl.currentTime = 0;
          void this.musicEl.play();
          if (this.ctx) {
            this.clockAnchorCtxTime = this.ctx.currentTime;
            this.clockAnchorSongTime = this.loopTimeOffset;
          }
          if (this.onLoopCallback) {
            this.onLoopCallback(this.loopTimeOffset);
          }
        }
      });
    }

    if (!this.mediaSourceConnected && this.musicEl && this.musicGain) {
      const srcNode = this.ctx.createMediaElementSource(this.musicEl);
      srcNode.connect(this.musicGain);
      this.mediaSourceConnected = true;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
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

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.volume,
        this.ctx.currentTime,
        0.015
      );
    }
    return this.isMuted;
  }

  public startTrack(
    track: CreoTrack,
    leadInSec: number,
    endless: boolean,
    onEndlessLoop?: (newOffsetSec: number) => void
  ): void {
    const ctx = this.ensureContext();
    if (!this.musicEl) return;

    this.currentTrack = track;
    this.leadInSec = leadInSec;
    this.endlessMode = endless;
    this.onLoopCallback = onEndlessLoop ?? null;

    this.musicEl.pause();
    this.musicEl.src = track.src;
    this.musicEl.currentTime = 0;
    this.musicEl.load();

    // Prime/unlock HTMLAudioElement inside user gesture so delayed start after countdown never blocks
    this.musicEl.muted = true;
    const unlockPromise = this.musicEl.play();
    if (unlockPromise !== undefined) {
      unlockPromise
        .then(() => {
          if (!this.mp3Started && this.musicEl) {
            this.musicEl.pause();
            this.musicEl.currentTime = 0;
            this.musicEl.muted = false;
          }
        })
        .catch(() => {
          if (this.musicEl) this.musicEl.muted = false;
        });
    }

    this.leadInStartCtxTime = ctx.currentTime;
    this.clockAnchorCtxTime = ctx.currentTime;
    this.clockAnchorSongTime = -leadInSec;
    this.pauseSongTime = -leadInSec;
    this.loopTimeOffset = 0;
    this.mp3Started = false;
    this.isPlaying = true;
    this.isPaused = false;
    this.smoothedBassPulse = 0;
  }

  public pauseSong(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.pauseSongTime = this.getSongTime();
    this.isPaused = true;
    if (this.mp3Started && this.musicEl) {
      this.musicEl.pause();
    }
  }

  public resumeSong(): void {
    if (!this.isPlaying || !this.isPaused) return;
    const ctx = this.ensureContext();
    this.isPaused = false;

    if (this.pauseSongTime < 0) {
      // Still in countdown
      this.leadInStartCtxTime = ctx.currentTime - (this.pauseSongTime + this.leadInSec);
      this.clockAnchorCtxTime = ctx.currentTime;
      this.clockAnchorSongTime = this.pauseSongTime;
    } else if (this.musicEl) {
      this.mp3Started = true;
      this.musicEl.muted = false;
      const localTarget = Math.max(0, this.pauseSongTime - this.loopTimeOffset);
      this.musicEl.currentTime = localTarget;
      void this.musicEl.play();
      this.clockAnchorCtxTime = ctx.currentTime;
      this.clockAnchorSongTime = this.pauseSongTime;
    }
  }

  public stopSong(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.mp3Started = false;
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.currentTime = 0;
    }
  }

  /**
   * Returns butter-smooth, drift-corrected song time in seconds:
   *  - Negative during the 4-beat pre-song countdown (-leadInSec .. 0)
   *  - Locked to Creo's MP3 playback from 0.000s onward!
   */
  public getSongTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    if (this.isPaused) return this.pauseSongTime;

    const nowCtx = this.ctx.currentTime;

    if (!this.mp3Started) {
      const countdownTime = nowCtx - this.leadInStartCtxTime - this.leadInSec;
      if (countdownTime >= 0 && this.musicEl) {
        this.mp3Started = true;
        this.musicEl.muted = false;
        this.musicEl.currentTime = 0;
        void this.musicEl.play();
        this.clockAnchorCtxTime = nowCtx;
        this.clockAnchorSongTime = 0;
        return 0;
      }
      return countdownTime;
    }

    const predicted = this.clockAnchorSongTime + (nowCtx - this.clockAnchorCtxTime);

    if (this.musicEl && !this.musicEl.paused && this.musicEl.readyState >= 2) {
      const actualMp3Time = this.loopTimeOffset + this.musicEl.currentTime;
      const drift = actualMp3Time - predicted;
      if (Math.abs(drift) > 0.085) {
        // Snap if tab hiccuped >85ms
        this.clockAnchorCtxTime = nowCtx;
        this.clockAnchorSongTime = actualMp3Time;
        return actualMp3Time;
      } else if (Math.abs(drift) > 0.012) {
        // Gently nudge PLL anchor toward MP3 clock with zero visual jump
        const nudged = predicted + drift * 0.12;
        this.clockAnchorCtxTime = nowCtx;
        this.clockAnchorSongTime = nudged;
        return nudged;
      }
    }

    return predicted;
  }

  public isTrackEnded(): boolean {
    if (!this.isPlaying || this.endlessMode || !this.mp3Started || !this.musicEl || !this.currentTrack) {
      return false;
    }
    return this.musicEl.ended || this.getSongTime() >= this.currentTrack.durationSec - 0.15;
  }

  /**
   * Real-time sub-bass kick pulse extracted directly from Creo's MP3 via WebAudio AnalyserNode!
   */
  public getKickPulse(): number {
    if (!this.ctx || !this.isPlaying || this.isPaused) return 0;

    if (!this.mp3Started && this.currentTrack) {
      // Gentle countdown beat pulse before MP3 kicks in
      const beatDur = 60 / this.currentTrack.bpm;
      const t = this.getSongTime() + this.leadInSec;
      const frac = ((t % beatDur) + beatDur) % beatDur;
      return Math.pow(Math.max(0, 1 - frac / 0.2), 2.2) * 0.65;
    }

    if (!this.analyser || !this.freqBins) return 0;
    this.analyser.getByteFrequencyData(this.freqBins);

    // Bins 1..4 (~43 Hz .. 215 Hz at 44.1kHz / 256 FFT) capture Creo's punchy kick & bass!
    const lowSum =
      (this.freqBins[1] + this.freqBins[2] * 1.2 + this.freqBins[3] + this.freqBins[4] * 0.6) /
      3.8;
    const normalized = Math.max(0, Math.min(1, (lowSum - 135) / 105));
    const shaped = Math.pow(normalized, 1.8);
    this.smoothedBassPulse = Math.max(shaped, this.smoothedBassPulse * 0.86);
    return this.smoothedBassPulse;
  }

  /**
   * Crisp, unpitched percussive rhythm hit-tick so catching bars feels super tactile
   * without clashing harmonically against Creo's music!
   */
  public playPlayerHit(isSick: boolean): void {
    const ctx = this.ensureContext();
    if (!this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Clean woody/crystalline rhythm click
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isSick ? 1150 : 920, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.032);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(isSick ? 0.16 : 0.12, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.042);

    // Subtle crisp transient snap
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
    nGain.connect(this.masterGain);
    snap.start(now);
    snap.stop(now + 0.03);
  }

  public playMissSound(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.13);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playSpamJamSound(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
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
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.24);
    }
  }

  public playCountdownTick(step: 3 | 2 | 1 | 0): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
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
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playUiSelect(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.055);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}
