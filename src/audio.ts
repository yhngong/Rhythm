const BASS_ROOTS = [36, 44, 41, 43]; // C2, Ab2, F2, G2

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class FunkAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private songStartCtxTime = 0;
  private pauseOffsetSec = 0;
  private isPlaying = false;
  private isPaused = false;
  private isMuted = false;
  private volume = 0.75;

  private bpm = 132;
  private leadInSec = 2.0;
  private nextScheduledStep = 0;
  private lastKickTime = -10;

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
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

  public getMuted(): boolean {
    return this.isMuted;
  }

  public startSong(bpm: number, leadInSec: number): void {
    const ctx = this.ensureContext();
    this.bpm = bpm;
    this.leadInSec = leadInSec;
    this.songStartCtxTime = ctx.currentTime;
    this.pauseOffsetSec = 0;
    this.isPlaying = true;
    this.isPaused = false;
    this.nextScheduledStep = 0;
    this.lastKickTime = -10;
  }

  public pauseSong(): void {
    if (!this.isPlaying || this.isPaused || !this.ctx) return;
    this.pauseOffsetSec = this.ctx.currentTime - this.songStartCtxTime;
    this.isPaused = true;
  }

  public resumeSong(): void {
    if (!this.isPlaying || !this.isPaused) return;
    const ctx = this.ensureContext();
    this.songStartCtxTime = ctx.currentTime - this.pauseOffsetSec;
    this.isPaused = false;
  }

  public stopSong(): void {
    this.isPlaying = false;
    this.isPaused = false;
  }

  public getSongTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    if (this.isPaused) return this.pauseOffsetSec;
    return this.ctx.currentTime - this.songStartCtxTime;
  }

  public setBpm(newBpm: number): void {
    this.bpm = newBpm;
  }

  public getKickPulse(): number {
    if (!this.ctx || !this.isPlaying || this.isPaused) return 0;
    const age = this.ctx.currentTime - this.lastKickTime;
    if (age < 0 || age > 0.24) return 0;
    return Math.pow(1 - age / 0.24, 2.2);
  }

  /**
   * Lookahead scheduler for sample-accurate procedural funk drums, bass, and chords.
   */
  public updateBackingSchedule(maxSongTimeSec?: number): void {
    if (!this.isPlaying || this.isPaused || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const songNow = now - this.songStartCtxTime;
    const lookaheadSec = 0.14;
    const secPerBeat = 60 / this.bpm;
    const secPer16th = secPerBeat / 4;

    while (true) {
      const stepSongTime = this.leadInSec + this.nextScheduledStep * secPer16th;
      if (maxSongTimeSec !== undefined && stepSongTime > maxSongTimeSec) break;
      if (stepSongTime > songNow + lookaheadSec) break;

      const schedCtxTime = this.songStartCtxTime + stepSongTime;
      if (schedCtxTime >= now - 0.03) {
        this.scheduleGrooveStep(this.nextScheduledStep, schedCtxTime, secPer16th);
      }
      this.nextScheduledStep++;
    }
  }

  private scheduleGrooveStep(stepIndex: number, when: number, secPer16th: number): void {
    const stepInBar = stepIndex % 16;
    const measureIdx = Math.floor(stepIndex / 16);
    const bassRoot = BASS_ROOTS[measureIdx % BASS_ROOTS.length];

    // Funky breakbeat kick: 1, &-of-2 (step 6), 3 (step 8), occasional pickup (step 14)
    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || (measureIdx % 2 === 1 && stepInBar === 14)) {
      this.scheduleKick(when);
      this.lastKickTime = when;
    }

    // Crisp snare + clap on beats 2 & 4 (steps 4 & 12)
    if (stepInBar === 4 || stepInBar === 12) {
      this.scheduleSnare(when);
    }

    // Groovy hi-hats
    if (stepInBar % 2 === 0) {
      this.scheduleHat(when, stepInBar === 14);
    } else if (stepInBar === 7 || stepInBar === 15) {
      this.scheduleHat(when, false, 0.035);
    }

    // Octave slap-synth bassline
    const bassPattern: Record<number, number> = {
      0: 0,
      3: 12,
      6: 0,
      8: 0,
      10: 7,
      12: 12,
      14: 10,
    };
    if (stepInBar in bassPattern) {
      const semi = bassPattern[stepInBar];
      this.scheduleBass(when, midiToFreq(bassRoot + semi), secPer16th * 1.7);
    }

    // Warm neon synth chord stab on beat 1 and &-of-2
    if (stepInBar === 0 || stepInBar === 6) {
      this.scheduleChordStab(when, bassRoot + 24, secPer16th * 2.5);
    }
  }

  private scheduleKick(when: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.09);

    gain.gain.setValueAtTime(0.58, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.19);
  }

  private scheduleSnare(when: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1100, when);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.26, when);
    nGain.gain.exponentialRampToValueAtTime(0.001, when + 0.13);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(when);
    noise.stop(when + 0.14);

    // Body pop
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, when);
    osc.frequency.exponentialRampToValueAtTime(110, when + 0.06);
    oGain.gain.setValueAtTime(0.22, when);
    oGain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.09);
  }

  private scheduleHat(when: number, open: boolean, vol = 0.075): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6800, when);

    const gain = this.ctx.createGain();
    const dur = open ? 0.14 : 0.042;
    gain.gain.setValueAtTime(open ? vol * 1.35 : vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain);
    src.start(when);
    src.stop(when + dur + 0.01);
  }

  private scheduleBass(when: number, freq: number, dur: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4.5;
    lp.frequency.setValueAtTime(freq * 5.2, when);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.6, when + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(when);
    osc.stop(when + dur + 0.01);
  }

  private scheduleChordStab(when: number, rootMidi: number, dur: number): void {
    if (!this.ctx || !this.masterGain) return;
    const intervals = [0, 3, 7, 10];
    for (const semi of intervals) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(rootMidi + semi), when);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.045, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(when);
      osc.stop(when + dur + 0.01);
    }
  }

  /**
   * FNF-style Boyfriend vocal/lead synth hit when the player catches a bar!
   */
  public playPlayerHit(midiPitch: number, lane: number, isSick: boolean): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const freq = midiToFreq(midiPitch);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq * 0.985, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.022);

    // Formant vowel filter ("bep / bap / boop / skdoo" per lane!)
    const formants = [920, 1380, 1780, 1140];
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(formants[lane % 4], now);
    bp.frequency.exponentialRampToValueAtTime(formants[lane % 4] * 1.25, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isSick ? 0.24 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);

    // Bright upper shimmer bell
    const sub = ctx.createOscillator();
    const sGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(freq * 2, now);
    sGain.gain.setValueAtTime(isSick ? 0.09 : 0.05, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    sub.connect(sGain);
    sGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.12);
  }

  /**
   * Rival synth voice on the left stage speaker.
   */
  public playRivalNote(midiPitch: number, lane: number, dur = 0.16): void {
    if (!this.ctx || !this.masterGain || this.isPaused) return;
    const now = this.ctx.currentTime;
    const freq = midiToFreq(midiPitch);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3.2;
    lp.frequency.setValueAtTime(750 + lane * 260, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.1, dur));

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + Math.max(0.11, dur + 0.01));
  }

  public playMissSound(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.linearRampToValueAtTime(78, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playSpamJamSound(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    for (const detune of [-18, 19]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(135 + detune, now);
      osc.frequency.linearRampToValueAtTime(62, now + 0.24);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  }

  public playCountdownTick(step: 3 | 2 | 1 | 0): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const freq = step === 0 ? 880 : step === 1 ? 587.33 : step === 2 ? 523.25 : 440;

    const osc = ctx.createOscillator();
    osc.type = step === 0 ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    if (step === 0) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(step === 0 ? 0.24 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (step === 0 ? 0.28 : 0.16));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
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
