import { FunkAudioEngine } from './audio';
import { generateChartForTrack } from './chartGenerator';
import { DIFFICULTIES, getLaneKeys } from './difficulties';
import { GameRenderer, LaneVisualState } from './renderer';
import { GameSettings, getPaletteLanes, loadSettings, saveSettings } from './settings';
import { CREO_TRACKS, CreoTrack, pickRandomCreoTrack } from './songs';
import {
  DifficultyConfig,
  DifficultyId,
  FloatingPopup,
  GameMode,
  HighScoreEntry,
  HitParticle,
  Judgment,
  LaneIndex,
  NoteBar,
  RunStats,
  ScreenState,
} from './types';

const STORAGE_KEY = 'rhythm_fnf_dfjk_highscores_v1';

export interface GameUiCallbacks {
  onStateChange: (state: ScreenState) => void;
}

export class RhythmGame {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer;
  public audio: FunkAudioEngine;
  private callbacks: GameUiCallbacks;

  public state: ScreenState = 'menu';
  public isSettingsOpen = false;
  public settings: GameSettings = loadSettings();
  public selectedDifficulty: DifficultyId = 'normal';
  public mode: GameMode = 'stage';
  public currentTrack: CreoTrack = CREO_TRACKS[0];
  private nextQueuedTrack: CreoTrack = pickRandomCreoTrack();

  private config: DifficultyConfig = DIFFICULTIES.normal;
  private currentBpm = 115;
  private leadInSec = 2.0;
  private totalDurationSec = 192;
  private generatedMeasures = 0;
  private endlessLoopIndex = 0;
  private nextNoteId = 1;

  private notes: NoteBar[] = [];
  private lanes: LaneVisualState[] = Array.from({ length: 6 }, () => ({
    pressed: false,
    hitFlash: 0,
    whiffFlash: 0,
    jamRemainingSec: 0,
  }));

  // Anti-spam tracking
  private laneWhiffTimes: number[][] = Array.from({ length: 6 }, () => []);
  private globalWhiffTimes: number[] = [];
  private spamHeat = 0;

  public stats: RunStats = this.freshStats();
  private popups: FloatingPopup[] = [];
  private particles: HitParticle[] = [];

  private lastCountdownStep = 4;
  private lastFramePerf = performance.now();
  private highScores: Record<string, HighScoreEntry> = {};

  constructor(canvas: HTMLCanvasElement, callbacks: GameUiCallbacks) {
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);
    this.audio = new FunkAudioEngine();
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume
    );
    this.callbacks = callbacks;
    this.highScores = this.loadHighScores();
    this.bindInputListeners();
    // Pre-fetch the first random Creo song right away so Start feels instantaneous
    this.audio.preloadTrack(this.nextQueuedTrack);
  }

  public updateSettings(partial: Partial<GameSettings>): GameSettings {
    this.settings = { ...this.settings, ...partial };
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume
    );
    saveSettings(this.settings);
    return this.settings;
  }

  private freshStats(): RunStats {
    return {
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 50,
      counts: {
        SICK: 0,
        GOOD: 0,
        BAD: 0,
        SHIT: 0,
        MISS: 0,
        SPAM: 0,
      },
      totalJudgedWeight: 0,
      totalJudgedEvents: 0,
    };
  }

  public getHighScore(diff: DifficultyId, mode: GameMode): HighScoreEntry | null {
    return this.highScores[`${diff}_${mode}`] ?? null;
  }

  private loadHighScores(): Record<string, HighScoreEntry> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, HighScoreEntry>) : {};
    } catch {
      return {};
    }
  }

  private saveHighScore(cleared: boolean): void {
    const key = `${this.selectedDifficulty}_${this.mode}`;
    const prev = this.highScores[key];
    const acc = this.getAccuracy();
    const grade = this.getGrade();

    const updated: HighScoreEntry = {
      bestScore: Math.max(prev?.bestScore ?? 0, this.stats.score),
      bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, acc),
      bestGrade: !prev || this.stats.score >= prev.bestScore ? grade : prev.bestGrade,
      maxCombo: Math.max(prev?.maxCombo ?? 0, this.stats.maxCombo),
      clears: (prev?.clears ?? 0) + (cleared ? 1 : 0),
    };
    this.highScores[key] = updated;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.highScores));
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }

  public startRun(
    diffId: DifficultyId = this.selectedDifficulty,
    mode: GameMode = this.mode
  ): void {
    (document.activeElement as HTMLElement | null)?.blur?.();

    this.selectedDifficulty = diffId;
    this.mode = mode;
    this.config = DIFFICULTIES[diffId];

    // Consume the pre-fetched random Creo track and immediately queue/preload the next random one!
    this.currentTrack = this.nextQueuedTrack;
    this.nextQueuedTrack = pickRandomCreoTrack();
    this.audio.preloadTrack(this.nextQueuedTrack);

    this.currentBpm = this.currentTrack.bpm;

    const secPerBeat = 60 / this.currentBpm;
    this.leadInSec = secPerBeat * 4; // 4-beat pre-song countdown (-leadInSec .. 0)
    this.endlessLoopIndex = 0;

    this.stats = this.freshStats();
    this.popups = [];
    this.particles = [];
    this.laneWhiffTimes = Array.from({ length: this.config.laneCount }, () => []);
    this.globalWhiffTimes = [];
    this.spamHeat = 0;
    this.lanes = Array.from({ length: this.config.laneCount }, () => ({
      pressed: false,
      hitFlash: 0,
      whiffFlash: 0,
      jamRemainingSec: 0,
    }));
    this.lastCountdownStep = 4;

    const secPerMeasure = secPerBeat * 4;
    const fullTrackMeasures = Math.ceil(this.currentTrack.durationSec / secPerMeasure);
    const initialMeasures = mode === 'endless' ? 16 : fullTrackMeasures;

    const section = generateChartForTrack(
      this.config,
      this.currentTrack,
      0,
      initialMeasures,
      1,
      0
    );
    this.notes = section.playerNotes;
    this.generatedMeasures = section.endMeasure;
    this.nextNoteId = section.nextNoteId;

    this.totalDurationSec = this.currentTrack.durationSec;

    this.audio.startTrack(this.currentTrack, this.leadInSec, mode === 'endless');
    this.setState('playing');
  }

  public pauseRun(): void {
    if (this.state !== 'playing') return;
    this.audio.pauseSong();
    this.lanes.forEach((l) => (l.pressed = false));
    this.setState('paused');
  }

  public resumeRun(): void {
    if (this.state !== 'paused') return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.audio.resumeSong();
    this.setState('playing');
  }

  public returnToMenu(): void {
    this.audio.stopSong();
    this.setState('menu');
  }

  private setState(next: ScreenState): void {
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  public getAccuracy(): number {
    if (this.stats.totalJudgedEvents === 0) return 100;
    return Math.max(
      0,
      Math.min(100, (this.stats.totalJudgedWeight / this.stats.totalJudgedEvents) * 100)
    );
  }

  public getGrade(): string {
    if (this.stats.totalJudgedEvents === 0) return 'S+';
    const acc = this.getAccuracy();
    if (acc >= 97 && this.stats.counts.MISS === 0 && this.stats.counts.SPAM === 0) return 'S+';
    if (acc >= 93) return 'S';
    if (acc >= 85) return 'A';
    if (acc >= 75) return 'B';
    if (acc >= 62) return 'C';
    return 'D';
  }

  private bindInputListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || this.isSettingsOpen) return;

      const key = e.key.toLowerCase();

      if (key === 'escape') {
        if (this.state === 'playing') {
          e.preventDefault();
          this.pauseRun();
          return;
        } else if (this.state === 'paused') {
          e.preventDefault();
          this.resumeRun();
          return;
        }
      }

      if (this.state === 'gameover' || this.state === 'results') {
        if (key === 'r' || key === 'enter') {
          e.preventDefault();
          this.startRun(this.selectedDifficulty, this.mode);
          return;
        }
      }

      if (this.state !== 'playing') return;

      this.audio.resumeContextIfNeeded();

      const activeKeys = getLaneKeys(this.config.laneCount);
      const laneIdx = activeKeys.indexOf(key);
      if (laneIdx !== -1) {
        e.preventDefault();
        this.handleLanePress(laneIdx as LaneIndex);
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      const activeKeys = getLaneKeys(this.config.laneCount);
      const laneIdx = activeKeys.indexOf(key);
      if (laneIdx !== -1 && this.lanes[laneIdx]) {
        this.lanes[laneIdx].pressed = false;
      }
    });

    window.addEventListener('blur', () => {
      if (this.state === 'playing') {
        this.pauseRun();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.pauseRun();
      }
    });
  }

  private handleLanePress(lane: LaneIndex): void {
    const songTime = this.audio.getSongTime();
    const laneState = this.lanes[lane];
    if (!laneState) return;
    laneState.pressed = true;

    const { laneWidth, highwayWidth, highwayX, receptorY } = this.renderer.getHighwayGeometry(
      this.canvas.width,
      this.canvas.height,
      this.config.laneCount
    );
    const laneCenterX = highwayX + lane * laneWidth + laneWidth / 2;

    // 1. Check if this bar is currently jammed by Anti-Spam Lockout!
    if (laneState.jamRemainingSec > 0) {
      this.stats.hp = Math.max(0, this.stats.hp - 2.5);
      laneState.whiffFlash = 1;
      this.audio.playMissSound();
      this.spawnPopup('Locked!', 'No Spam', '#FF264B', laneCenterX, receptorY - 46, 0.82);
      this.checkKo();
      return;
    }

    // 2. Search for the earliest unhit note in this lane within the catch window [-150ms, +180ms]
    let targetNote: NoteBar | null = null;
    for (const note of this.notes) {
      if (note.lane !== lane || note.hit || note.missed) continue;
      const delta = note.time - songTime;
      if (delta < -0.15) continue;
      if (delta <= 0.18) {
        targetNote = note;
      }
      break;
    }

    // 3. Valid note bar in range -> Score Judgment!
    if (targetNote) {
      const absDelta = Math.abs(targetNote.time - songTime);
      targetNote.hit = true;

      let judgment: Judgment;
      let points: number;
      let weight: number;
      let hpDelta: number;
      let popColor: string;
      let popText: string;

      if (absDelta <= 0.045) {
        judgment = 'SICK';
        points = 350;
        weight = 1.0;
        hpDelta = this.config.sickHpGain;
        popColor = '#63F0FF';
        popText = 'Sick!!';
      } else if (absDelta <= 0.092) {
        judgment = 'GOOD';
        points = 200;
        weight = 0.78;
        hpDelta = this.config.goodHpGain;
        popColor = '#72FF1D';
        popText = 'Good!';
      } else if (absDelta <= 0.135) {
        judgment = 'BAD';
        points = 60;
        weight = 0.35;
        hpDelta = -1.5;
        popColor = '#FFE44D';
        popText = 'Bad';
      } else {
        judgment = 'SHIT';
        points = 15;
        weight = 0.1;
        hpDelta = -4.2;
        popColor = '#FF9F38';
        popText = 'Early!';
      }

      if (judgment === 'SHIT') {
        this.stats.combo = 0;
      } else {
        this.stats.combo++;
        this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      }

      const comboMultiplier = 1 + Math.min(1.5, Math.floor(this.stats.combo / 15) * 0.15);
      this.stats.score += Math.round(points * comboMultiplier);
      this.stats.hp = Math.max(0, Math.min(100, this.stats.hp + hpDelta));
      this.stats.counts[judgment]++;
      this.stats.totalJudgedWeight += weight;
      this.stats.totalJudgedEvents++;

      this.spamHeat = Math.max(0, this.spamHeat - (judgment === 'SICK' ? 0.16 : 0.09));

      laneState.hitFlash = 1.0;
      this.audio.playPlayerHit(judgment === 'SICK');

      if (targetNote.duration > 0) {
        targetNote.holding = true;
        targetNote.lastHoldTickTime = Math.max(songTime, targetNote.time);
      }

      const msSigned = Math.round((songTime - targetNote.time) * 1000);
      const timingTag = judgment === 'SICK' ? '' : `${msSigned > 0 ? '+' : ''}${msSigned}ms`;
      this.spawnPopup(
        popText,
        timingTag,
        popColor,
        highwayX + highwayWidth / 2,
        receptorY - 125,
        judgment === 'SICK' ? 1.08 : 0.94
      );

      const burstCount = judgment === 'SICK' ? 14 : judgment === 'GOOD' ? 8 : 3;
      const laneCols = getPaletteLanes(this.settings.notePalette, this.config.laneCount);
      this.spawnBurst(laneCenterX, receptorY, (laneCols[lane] ?? laneCols[0]).main, burstCount);

      this.checkKo();
      return;
    }

    // 4. NO NOTE IN WINDOW -> STRICT ANTI-SPAM PENALTY!
    if (songTime < -this.leadInSec + 0.35) return;

    const nowPerf = performance.now() / 1000;
    this.laneWhiffTimes[lane] = this.laneWhiffTimes[lane].filter((t) => nowPerf - t < 0.68);
    this.laneWhiffTimes[lane].push(nowPerf);

    this.globalWhiffTimes = this.globalWhiffTimes.filter((t) => nowPerf - t < 0.7);
    this.globalWhiffTimes.push(nowPerf);

    this.spamHeat = Math.min(1, this.spamHeat + 0.34);
    laneState.whiffFlash = 1.0;

    this.stats.combo = 0;
    this.stats.score = Math.max(0, this.stats.score - 120);
    this.stats.hp = Math.max(0, this.stats.hp - this.config.whiffHpPenalty);
    this.stats.counts.SPAM++;
    this.stats.totalJudgedEvents++;

    const laneMashing = this.laneWhiffTimes[lane].length >= 3;
    const globalMashing = this.globalWhiffTimes.length >= (this.config.laneCount === 6 ? 6 : 5);

    if (laneMashing || globalMashing) {
      if (globalMashing) {
        for (const l of this.lanes) l.jamRemainingSec = Math.max(l.jamRemainingSec, 0.55);
        this.globalWhiffTimes = [];
      } else {
        laneState.jamRemainingSec = 0.55;
      }
      this.laneWhiffTimes[lane] = [];
      this.stats.hp = Math.max(0, this.stats.hp - 5.0);
      this.audio.playSpamJamSound();
      this.spawnPopup('No Spam!', 'Bar Jammed', '#FF5C7A', laneCenterX, receptorY - 68, 0.95);
    } else {
      this.audio.playMissSound();
      this.spawnPopup('Ghost!', '-120 • -HP', '#FF7597', laneCenterX, receptorY - 58, 0.82);
    }

    this.checkKo();
  }

  private checkKo(): boolean {
    if (this.stats.hp <= 0 && this.state === 'playing') {
      this.stats.hp = 0;
      this.audio.stopSong();
      this.audio.playSpamJamSound();
      this.saveHighScore(false);
      this.setState('gameover');
      return true;
    }
    return false;
  }

  private spawnPopup(
    text: string,
    subtext: string,
    color: string,
    x: number,
    y: number,
    scale = 1
  ): void {
    if (this.popups.length > 12) {
      this.popups.shift();
    }
    this.popups.push({
      text,
      subtext: subtext || undefined,
      color,
      x,
      y,
      vx: (Math.random() - 0.5) * 18,
      vy: -58,
      age: 0,
      lifetime: 0.58,
      scale,
    });
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    if (this.particles.length > 140) {
      this.particles.splice(0, this.particles.length - 140);
    }
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 210;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 5 + Math.random() * 6,
        color: i % 3 === 0 ? '#FFFFFF' : color,
        age: 0,
        lifetime: 0.28 + Math.random() * 0.2,
      });
    }
  }

  public tick(nowPerf: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (nowPerf - this.lastFramePerf) / 1000));
    this.lastFramePerf = nowPerf;

    if (this.state === 'menu') {
      const previewLaneCount = DIFFICULTIES[this.selectedDifficulty]?.laneCount ?? 4;
      this.renderer.renderMenuBackground(
        this.canvas.width,
        this.canvas.height,
        nowPerf / 1000,
        this.settings,
        previewLaneCount
      );
      return;
    }

    const songTime = this.audio.getSongTime();

    if (this.state === 'playing') {
      // Seamless Endless mode chart extension across multi-loop Creo playback!
      if (this.mode === 'endless' && !this.audio.isTrackLoading()) {
        const secPerMeasure = (60 / this.currentBpm) * 4;
        const maxMeasuresInLoop = Math.max(
          1,
          Math.floor((this.currentTrack.durationSec - 0.4) / secPerMeasure)
        );
        const loopOffset = this.endlessLoopIndex * this.currentTrack.durationSec;
        const generatedEndSec = loopOffset + this.generatedMeasures * secPerMeasure;

        if (generatedEndSec - songTime < 15) {
          const remainingInLoop = maxMeasuresInLoop - this.generatedMeasures;
          if (remainingInLoop <= 0) {
            this.endlessLoopIndex++;
            this.generatedMeasures = 0;
          } else {
            const toGen = Math.min(8, remainingInLoop);
            const next = generateChartForTrack(
              this.config,
              this.currentTrack,
              this.generatedMeasures,
              toGen,
              this.nextNoteId,
              loopOffset
            );
            this.notes.push(...next.playerNotes);
            this.generatedMeasures = next.endMeasure;
            this.nextNoteId = next.nextNoteId;
            this.notes = this.notes.filter(
              (n) => n.time + n.duration > songTime - 2 || n.holding
            );
          }
        }
      }

      if (!this.audio.isTrackLoading()) {
        this.updateCountdownTicks(songTime);
        this.updatePlayerNotesAndHolds(songTime, dt);
      }
      this.updateVisualTimers(dt);

      // Check Stage Clear when the Creo song completes!
      if (this.mode === 'stage' && this.audio.isTrackEnded() && this.state === 'playing') {
        this.audio.stopSong();
        this.saveHighScore(true);
        this.setState('results');
      }
    }

    const countdownText = this.getCountdownLabel(songTime);
    const visuals = this.audio.getVisualFrame();

    this.renderer.renderGameplay({
      width: this.canvas.width,
      height: this.canvas.height,
      songTime,
      beatOffsetSec: this.currentTrack.beatOffsetSec,
      totalDurationSec: this.totalDurationSec,
      mode: this.mode,
      difficulty: this.config,
      settings: this.settings,
      trackTitle: this.currentTrack.title,
      trackArtist: this.currentTrack.artist,
      currentBpm: this.currentBpm,
      kickPulse: visuals.kickPulse,
      visuals,
      notes: this.notes,
      lanes: this.lanes,
      stats: this.stats,
      accuracy: this.getAccuracy(),
      grade: this.getGrade(),
      spamHeat: this.spamHeat,
      popups: this.popups,
      particles: this.particles,
      countdownText,
    });
  }

  private updateCountdownTicks(songTime: number): void {
    if (songTime > 0.25) return;
    const beatDur = 60 / this.currentBpm;
    // songTime runs from -4*beatDur up to 0
    const elapsedInCountdown = songTime + this.leadInSec;
    const beatIdx = Math.max(0, Math.floor(elapsedInCountdown / beatDur)); // 0, 1, 2, 3
    const stepRemaining = 3 - beatIdx;
    if (stepRemaining >= 0 && stepRemaining < this.lastCountdownStep) {
      this.lastCountdownStep = stepRemaining;
      this.audio.playCountdownTick(stepRemaining as 3 | 2 | 1 | 0);
    }
  }

  private getCountdownLabel(songTime: number): string | null {
    if (this.audio.isTrackLoading()) return 'Loading...';
    if (songTime >= 0) return null;
    const beatDur = 60 / this.currentBpm;
    const elapsed = songTime + this.leadInSec;
    const beatIdx = Math.floor(elapsed / beatDur);
    if (beatIdx <= 0) return '3';
    if (beatIdx === 1) return '2';
    if (beatIdx === 2) return '1';
    return 'FUNK!';
  }

  private updatePlayerNotesAndHolds(songTime: number, dt: number): void {
    const { laneWidth, highwayX, receptorY } = this.renderer.getHighwayGeometry(
      this.canvas.width,
      this.canvas.height,
      this.config.laneCount
    );
    const laneCols = getPaletteLanes(this.settings.notePalette, this.config.laneCount);

    for (const note of this.notes) {
      if (note.time - songTime > 0.25) break;

      const noteCol = laneCols[note.lane] ?? laneCols[0];
      if (note.holding && !note.holdCompleted) {
        const endTime = note.time + note.duration;
        if (songTime >= endTime) {
          note.holding = false;
          note.holdCompleted = true;
          this.stats.score += 100;
          this.stats.hp = Math.min(100, this.stats.hp + 1.4);
          const cx = highwayX + note.lane * laneWidth + laneWidth / 2;
          this.spawnBurst(cx, receptorY, noteCol.glow, 6);
        } else if (!this.lanes[note.lane]?.pressed) {
          if (endTime - songTime <= 0.11) {
            note.holding = false;
            note.holdCompleted = true;
            this.stats.score += 80;
          } else {
            note.holding = false;
            note.holdReleasedEarly = true;
            this.stats.combo = 0;
            this.stats.hp = Math.max(0, this.stats.hp - 3.5);
            this.checkKo();
          }
        } else {
          this.stats.score += Math.round(180 * dt);
          this.stats.hp = Math.min(100, this.stats.hp + 2.2 * dt);
          this.lanes[note.lane].hitFlash = Math.max(this.lanes[note.lane].hitFlash, 0.55);
          if (songTime - note.lastHoldTickTime >= 0.09) {
            note.lastHoldTickTime = songTime;
            const cx = highwayX + note.lane * laneWidth + laneWidth / 2;
            this.spawnBurst(cx, receptorY, noteCol.main, 2);
          }
        }
      }

      if (!note.hit && !note.missed && songTime - note.time > 0.155) {
        note.missed = true;
        this.stats.combo = 0;
        this.stats.counts.MISS++;
        this.stats.totalJudgedEvents++;
        this.stats.hp = Math.max(0, this.stats.hp - this.config.missHpPenalty);
        this.audio.playMissSound();

        const cx = highwayX + note.lane * laneWidth + laneWidth / 2;
        this.spawnPopup('Miss!', '', '#FF5C7A', cx, receptorY - 52, 0.88);
        if (this.checkKo()) return;
      }
    }
  }

  private updateVisualTimers(dt: number): void {
    this.spamHeat = Math.max(0, this.spamHeat - dt * 0.28);

    for (const l of this.lanes) {
      l.hitFlash = Math.max(0, l.hitFlash - dt * 6.5);
      l.whiffFlash = Math.max(0, l.whiffFlash - dt * 4.5);
      l.jamRemainingSec = Math.max(0, l.jamRemainingSec - dt);
    }

    for (const p of this.popups) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 95 * dt;
    }
    this.popups = this.popups.filter((p) => p.age < p.lifetime);

    for (const pt of this.particles) {
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 320 * dt;
    }
    this.particles = this.particles.filter((pt) => pt.age < pt.lifetime);
  }
}
