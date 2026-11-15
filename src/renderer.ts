import { LANE_COLORS, LANE_LABELS } from './difficulties';
import {
  DifficultyConfig,
  FloatingPopup,
  GameMode,
  HitParticle,
  NoteBar,
  RunStats,
} from './types';

export interface LaneVisualState {
  pressed: boolean;
  hitFlash: number; // 0..1 decaying flash on successful catch
  whiffFlash: number; // 0..1 decaying red flash on ghost tap
  jamRemainingSec: number; // >0 when locked out by anti-spam
}

export interface CharacterPose {
  lane: -1 | 0 | 1 | 2 | 3; // -1 = idle
  missTimer: number;
  poseTimer: number;
}

export interface RenderFrameState {
  width: number;
  height: number;
  songTime: number;
  totalDurationSec: number;
  mode: GameMode;
  difficulty: DifficultyConfig;
  currentBpm: number;
  kickPulse: number;
  notes: NoteBar[];
  lanes: LaneVisualState[];
  stats: RunStats;
  accuracy: number;
  grade: string;
  spamHeat: number; // 0..1
  popups: FloatingPopup[];
  particles: HitParticle[];
  playerPose: CharacterPose;
  rivalPose: CharacterPose;
  countdownText: string | null;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
  }

  public getHighwayGeometry(width: number, height: number) {
    const laneWidth = Math.min(96, Math.max(66, Math.floor(width * 0.085)));
    const highwayWidth = laneWidth * 4;
    const highwayX = Math.floor((width - highwayWidth) / 2);
    const receptorY = height - 122;
    return { laneWidth, highwayWidth, highwayX, receptorY };
  }

  public renderMenuBackground(width: number, height: number, timeSec: number): void {
    const ctx = this.ctx;
    const beatPulse = Math.pow(0.5 + 0.5 * Math.cos(timeSec * Math.PI * 2 * (124 / 60)), 3);

    // Deep arcade stage gradient
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#090616');
    bg.addColorStop(0.55, '#130b29');
    bg.addColorStop(1, '#070510');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Sweeping concert stage spotlights
    for (let i = 0; i < 4; i++) {
      const col = LANE_COLORS[i].main;
      const baseX = width * (0.18 + i * 0.21);
      const sway = Math.sin(timeSec * 1.1 + i * 1.4) * 110;
      ctx.save();
      ctx.globalAlpha = 0.09 + beatPulse * 0.05;
      ctx.beginPath();
      ctx.moveTo(baseX, -20);
      ctx.lineTo(baseX + sway - 160, height);
      ctx.lineTo(baseX + sway + 160, height);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }

    // Animated demo falling bars in background
    const cols = 8;
    const colW = width / cols;
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 18; i++) {
      const laneIdx = i % 4;
      const x = ((i * 3) % cols) * colW + colW * 0.15;
      const w = colW * 0.7;
      const speed = 150 + (i % 5) * 45;
      const y = ((timeSec * speed + i * 137) % (height + 80)) - 40;
      this.drawRoundedBar(x, y, w, 16, 6, LANE_COLORS[laneIdx].main, LANE_COLORS[laneIdx].glow);
    }
    ctx.restore();
  }

  public renderGameplay(state: RenderFrameState): void {
    const { width, height, songTime, difficulty, kickPulse } = state;
    const ctx = this.ctx;
    const { laneWidth, highwayWidth, highwayX, receptorY } = this.getHighwayGeometry(width, height);

    // Subtle beat camera bump
    ctx.save();
    const zoom = 1 + kickPulse * 0.012;
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    // 1. Concert Stage Background & Spotlights
    this.drawStageBackdrop(width, height, songTime, kickPulse, difficulty.accentColor);

    // 2. Flanking Speakers & FNF Stage Characters (when screen has room around highway)
    if (width >= 820) {
      const leftStageX = highwayX * 0.5;
      const rightStageX = highwayX + highwayWidth + (width - (highwayX + highwayWidth)) * 0.5;
      const stageFloorY = height - 155;

      this.drawSpeakerStack(leftStageX, stageFloorY - 95, kickPulse, '#FF2E93');
      this.drawSpeakerStack(rightStageX, stageFloorY - 95, kickPulse, '#00E5FF');

      this.drawRivalCharacter(leftStageX, stageFloorY, songTime, state.currentBpm, state.rivalPose);
      this.drawPlayerCharacter(rightStageX, stageFloorY, songTime, state.currentBpm, state.playerPose);
    }

    // 3. Center 4-Lane Downscroll Bar Highway
    this.drawHighwayTrack(
      highwayX,
      highwayWidth,
      laneWidth,
      height,
      receptorY,
      songTime,
      state.currentBpm,
      difficulty.scrollSpeed,
      state.lanes
    );

    // 4. Falling Horizontal Bars & Hold Sustain Trails (Downscroll: top -> receptorY)
    this.drawFallingNoteBars(
      state.notes,
      highwayX,
      laneWidth,
      height,
      receptorY,
      songTime,
      difficulty.scrollSpeed
    );

    // 5. Catcher Receptor Bars (D F J K) at Bottom
    this.drawReceptorBars(highwayX, laneWidth, receptorY, state.lanes);

    // 6. Hit Particles & Floating FNF Judgment Popups
    this.drawParticles(state.particles);
    this.drawPopups(state.popups);

    ctx.restore();

    // 7. Top HUD, Anti-Spam Heat Meter & Bottom FNF Tug-of-War Health Bar
    this.drawHud(state, highwayX, highwayWidth);

    // 8. Countdown Overlay ("3 - 2 - 1 - FUNK!")
    if (state.countdownText) {
      this.drawCountdownBanner(width, height, state.countdownText, kickPulse);
    }
  }

  private drawStageBackdrop(
    width: number,
    height: number,
    songTime: number,
    kickPulse: number,
    accentColor: string
  ): void {
    const ctx = this.ctx;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#090718');
    bg.addColorStop(0.68, '#150d2e');
    bg.addColorStop(1, '#080612');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Stage floor perspective horizon
    const horizonY = height - 140;
    ctx.fillStyle = '#0c081d';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.25 + kickPulse * 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Overhead concert beams
    for (let i = 0; i < 4; i++) {
      const col = LANE_COLORS[i].main;
      const bx = width * (0.12 + i * 0.25);
      const sway = Math.sin(songTime * 1.6 + i * 1.5) * 90;
      ctx.save();
      ctx.globalAlpha = 0.06 + kickPulse * 0.06;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + sway - 130, horizonY);
      ctx.lineTo(bx + sway + 130, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSpeakerStack(cx: number, cy: number, kickPulse: number, rimColor: string): void {
    const ctx = this.ctx;
    const bump = 1 + kickPulse * 0.07;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bump, bump);

    // Speaker cabinet
    ctx.fillStyle = '#161329';
    ctx.strokeStyle = '#2d2654';
    ctx.lineWidth = 3;
    this.roundRectPath(-58, -68, 116, 136, 12);
    ctx.fill();
    ctx.stroke();

    // Top & bottom woofers
    for (const wy of [-28, 32]) {
      ctx.beginPath();
      ctx.arc(0, wy, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#090713';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rimColor;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, wy, 9 + kickPulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = '#262042';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRivalCharacter(
    x: number,
    floorY: number,
    songTime: number,
    bpm: number,
    pose: CharacterPose
  ): void {
    const ctx = this.ctx;
    const beatBounce = Math.abs(Math.sin(songTime * Math.PI * (bpm / 60))) * 8;
    const activeColor = pose.lane !== -1 ? LANE_COLORS[pose.lane].main : '#B84DFF';
    const leanX = pose.lane === 0 ? -10 : pose.lane === 3 ? 10 : 0;
    const stretchY = pose.lane === 2 ? -10 : pose.lane === 1 ? 6 : 0;

    ctx.save();
    ctx.translate(x + leanX, floorY);

    // Neon stage aura when singing
    if (pose.lane >= 0) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.ellipse(0, -65, 58, 76, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Torso hoodie (Rival cyber DJ)
    const headY = -108 + beatBounce + stretchY;
    ctx.fillStyle = '#231942';
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 3;
    this.roundRectPath(-30, -78 + beatBounce * 0.5, 60, 68, 14);
    ctx.fill();
    ctx.stroke();

    // Head + Cyber Visor
    ctx.fillStyle = '#141026';
    this.roundRectPath(-28, headY - 26, 56, 50, 16);
    ctx.fill();
    ctx.stroke();

    // Glowing LED visor bar!
    ctx.fillStyle = activeColor;
    this.roundRectPath(-20, headY - 10, 40, 14, 5);
    ctx.fill();

    // Headphones
    ctx.fillStyle = '#FF2E93';
    this.roundRectPath(-35, headY - 14, 8, 24, 4);
    ctx.fill();
    this.roundRectPath(27, headY - 14, 8, 24, 4);
    ctx.fill();

    ctx.font = '700 12px Orbitron, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('RIVAL', 0, 22);
    ctx.restore();
  }

  private drawPlayerCharacter(
    x: number,
    floorY: number,
    songTime: number,
    bpm: number,
    pose: CharacterPose
  ): void {
    const ctx = this.ctx;
    const beatBounce = Math.abs(Math.sin(songTime * Math.PI * (bpm / 60))) * 8;
    const isMiss = pose.missTimer > 0;
    const activeColor = isMiss
      ? '#FF2A4B'
      : pose.lane !== -1
      ? LANE_COLORS[pose.lane].main
      : '#00E5FF';

    const leanX = isMiss
      ? (Math.random() - 0.5) * 8
      : pose.lane === 0
      ? -12
      : pose.lane === 3
      ? 12
      : 0;
    const stretchY = pose.lane === 2 ? -12 : pose.lane === 1 ? 6 : 0;

    ctx.save();
    ctx.translate(x + leanX, floorY);

    if (pose.lane >= 0 || isMiss) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.ellipse(0, -65, 58, 76, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const headY = -106 + beatBounce + stretchY;

    // Hoodie torso
    ctx.fillStyle = isMiss ? '#3b1022' : '#122947';
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 3;
    this.roundRectPath(-30, -76 + beatBounce * 0.5, 60, 66, 14);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = isMiss ? '#2a0d1c' : '#0f1b33';
    this.roundRectPath(-27, headY - 25, 54, 48, 16);
    ctx.fill();
    ctx.stroke();

    // Iconic red/pink FNF-inspired backwards cap!
    ctx.fillStyle = '#FF2E93';
    this.roundRectPath(-29, headY - 30, 58, 15, 7);
    ctx.fill();
    this.roundRectPath(16, headY - 24, 24, 9, 4); // backwards brim
    ctx.fill();

    // Expressive eyes
    ctx.fillStyle = activeColor;
    if (isMiss) {
      // X _ X flinch eyes
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FF385C';
      for (const ex of [-11, 11]) {
        ctx.beginPath();
        ctx.moveTo(ex - 5, headY - 7);
        ctx.lineTo(ex + 5, headY + 3);
        ctx.moveTo(ex + 5, headY - 7);
        ctx.lineTo(ex - 5, headY + 3);
        ctx.stroke();
      }
    } else {
      this.roundRectPath(-16, headY - 7, 10, 11, 3);
      ctx.fill();
      this.roundRectPath(6, headY - 7, 10, 11, 3);
      ctx.fill();
    }

    // Glowing handheld mic
    ctx.fillStyle = activeColor;
    ctx.beginPath();
    ctx.arc(-36, -52 + beatBounce * 0.4, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 12px Orbitron, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('YOU (DFJK)', 0, 22);
    ctx.restore();
  }

  private drawHighwayTrack(
    highwayX: number,
    highwayWidth: number,
    laneWidth: number,
    height: number,
    receptorY: number,
    songTime: number,
    bpm: number,
    scrollSpeed: number,
    lanes: LaneVisualState[]
  ): void {
    const ctx = this.ctx;

    // Dark high-contrast highway backdrop
    ctx.fillStyle = 'rgba(7, 9, 18, 0.92)';
    ctx.fillRect(highwayX, 0, highwayWidth, height - 48);

    // Active key-press vertical lane beams & whiff/jam flashes
    for (let i = 0; i < 4; i++) {
      const lx = highwayX + i * laneWidth;
      const laneState = lanes[i];
      const col = LANE_COLORS[i];

      if (laneState.jamRemainingSec > 0) {
        const grad = ctx.createLinearGradient(0, receptorY - 260, 0, receptorY + 25);
        grad.addColorStop(0, 'rgba(255, 30, 60, 0)');
        grad.addColorStop(1, 'rgba(255, 30, 60, 0.34)');
        ctx.fillStyle = grad;
        ctx.fillRect(lx, receptorY - 260, laneWidth, 285);
      } else if (laneState.pressed || laneState.hitFlash > 0.02) {
        const intensity = Math.max(laneState.pressed ? 0.16 : 0, laneState.hitFlash * 0.32);
        const grad = ctx.createLinearGradient(0, receptorY - 320, 0, receptorY + 20);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, this.hexWithAlpha(col.main, intensity));
        ctx.fillStyle = grad;
        ctx.fillRect(lx, receptorY - 320, laneWidth, 340);
      }

      if (laneState.whiffFlash > 0.02) {
        ctx.fillStyle = `rgba(255, 42, 75, ${laneState.whiffFlash * 0.28})`;
        ctx.fillRect(lx, receptorY - 140, laneWidth, 170);
      }
    }

    // Scrolling beat & measure horizontal lines (moving downward!)
    const secPerBeat = 60 / bpm;
    const firstBeat = Math.max(0, Math.floor((songTime - 0.3) / secPerBeat));
    const maxVisibleTime = songTime + (receptorY + 40) / scrollSpeed;
    const lastBeat = Math.ceil(maxVisibleTime / secPerBeat);

    for (let b = firstBeat; b <= lastBeat; b++) {
      const beatTime = b * secPerBeat;
      const y = receptorY - (beatTime - songTime) * scrollSpeed;
      if (y < -10 || y > height - 55) continue;

      const isMeasure = b % 4 === 0;
      ctx.strokeStyle = isMeasure ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = isMeasure ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(highwayX, y);
      ctx.lineTo(highwayX + highwayWidth, y);
      ctx.stroke();
    }

    // Crisp lane divider lines & outer neon frame
    for (let i = 1; i < 4; i++) {
      const x = highwayX + i * laneWidth;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 48);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.42)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(highwayX, -2, highwayWidth, height - 46);
  }

  private drawFallingNoteBars(
    notes: NoteBar[],
    highwayX: number,
    laneWidth: number,
    height: number,
    receptorY: number,
    songTime: number,
    scrollSpeed: number
  ): void {
    const ctx = this.ctx;
    const padX = 9;
    const barW = laneWidth - padX * 2;
    const barH = 20;

    for (const note of notes) {
      if (note.hit && (note.duration === 0 || note.holdCompleted)) continue;

      const headY = receptorY - (note.time - songTime) * scrollSpeed;
      const endTime = note.time + note.duration;
      const tailY = receptorY - (endTime - songTime) * scrollSpeed;

      // Cull off-screen bars
      const lowestY = Math.max(headY, tailY);
      const highestY = Math.min(headY, tailY);
      if (lowestY < -40 || highestY > height) continue;

      const laneCol = LANE_COLORS[note.lane];
      const lx = highwayX + note.lane * laneWidth + padX;

      // 1. Draw vertical Hold Sustain Trail (if hold bar)
      if (note.duration > 0) {
        const clampBottomY = note.holding ? receptorY : Math.min(headY, height);
        const topY = Math.max(-20, tailY);
        if (clampBottomY > topY) {
          const ribbonW = Math.max(18, Math.floor(barW * 0.42));
          const rx = highwayX + note.lane * laneWidth + (laneWidth - ribbonW) / 2;
          ctx.save();
          ctx.globalAlpha = note.missed || note.holdReleasedEarly ? 0.28 : note.holding ? 0.92 : 0.72;
          const grad = ctx.createLinearGradient(rx, topY, rx + ribbonW, topY);
          grad.addColorStop(0, laneCol.main);
          grad.addColorStop(0.5, laneCol.glow);
          grad.addColorStop(1, laneCol.main);
          ctx.fillStyle = grad;
          this.roundRectPath(rx, topY, ribbonW, clampBottomY - topY, 6);
          ctx.fill();

          // End cap bar on top of hold trail
          this.roundRectPath(rx - 3, topY - 4, ribbonW + 6, 8, 4);
          ctx.fillStyle = laneCol.glow;
          ctx.fill();
          ctx.restore();
        }
      }

      // 2. Draw Horizontal Falling Note Bar (unless head was already caught on a hold note)
      if (!note.hit) {
        ctx.save();
        if (note.missed) {
          ctx.globalAlpha = 0.35;
        }
        this.drawRoundedBar(
          lx,
          headY - barH / 2,
          barW,
          barH,
          7,
          laneCol.main,
          laneCol.glow
        );
        ctx.restore();
      }
    }
  }

  private drawReceptorBars(
    highwayX: number,
    laneWidth: number,
    receptorY: number,
    lanes: LaneVisualState[]
  ): void {
    const ctx = this.ctx;
    const padX = 7;
    const barW = laneWidth - padX * 2;
    const barH = 22;

    // Subtle target horizon line across all 4 lanes
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(highwayX, receptorY);
    ctx.lineTo(highwayX + laneWidth * 4, receptorY);
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const st = lanes[i];
      const col = LANE_COLORS[i];
      const jammed = st.jamRemainingSec > 0;
      const shakeX = jammed ? (Math.random() - 0.5) * 6 : 0;
      const pressOffsetY = st.pressed ? 2 : 0;

      const x = highwayX + i * laneWidth + padX + shakeX;
      const y = receptorY - barH / 2 + pressOffsetY;

      ctx.save();
      if (jammed) {
        // Locked/overheated bar state!
        ctx.fillStyle = '#4A0817';
        ctx.strokeStyle = '#FF264B';
        ctx.lineWidth = 3;
        this.roundRectPath(x, y, barW, barH, 7);
        ctx.fill();
        ctx.stroke();

        ctx.font = '800 10px Orbitron, system-ui, sans-serif';
        ctx.fillStyle = '#FF6E88';
        ctx.textAlign = 'center';
        ctx.fillText('LOCKED!', highwayX + i * laneWidth + laneWidth / 2, y - 8);
      } else if (st.pressed || st.hitFlash > 0.08) {
        // Lit active catcher bar
        ctx.shadowColor = col.main;
        ctx.shadowBlur = 18 + st.hitFlash * 16;
        this.drawRoundedBar(x, y, barW, barH, 7, col.main, '#FFFFFF');
      } else {
        // Crisp outlined idle catcher bar slot
        ctx.fillStyle = 'rgba(18, 22, 38, 0.9)';
        ctx.strokeStyle = col.main;
        ctx.lineWidth = 2.6;
        this.roundRectPath(x, y, barW, barH, 7);
        ctx.fill();
        ctx.stroke();

        // Inner center bar slot indicator
        ctx.fillStyle = this.hexWithAlpha(col.main, 0.28);
        this.roundRectPath(x + 6, y + 6, barW - 12, barH - 12, 3);
        ctx.fill();
      }
      ctx.restore();

      // Keybind badge (D / F / J / K) right below each catcher bar
      const cx = highwayX + i * laneWidth + laneWidth / 2;
      const keyBoxY = receptorY + 20;
      ctx.save();
      ctx.fillStyle = st.pressed ? col.main : 'rgba(22, 26, 44, 0.92)';
      ctx.strokeStyle = jammed ? '#FF264B' : col.main;
      ctx.lineWidth = 1.8;
      this.roundRectPath(cx - 17, keyBoxY, 34, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 14px Orbitron, system-ui, sans-serif';
      ctx.fillStyle = st.pressed ? '#080912' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LANE_LABELS[i], cx, keyBoxY + 14.5);
      ctx.restore();
    }
  }

  private drawRoundedBar(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    mainHex: string,
    glowHex: string
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = mainHex;
    ctx.shadowBlur = 12;
    ctx.fillStyle = mainHex;
    this.roundRectPath(x, y, w, h, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Glossy inner core highlight bar
    ctx.fillStyle = glowHex;
    this.roundRectPath(x + 4, y + 4, Math.max(4, w - 8), Math.max(4, h * 0.42), Math.max(2, r - 3));
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(particles: HitParticle[]): void {
    const ctx = this.ctx;
    for (const p of particles) {
      const t = 1 - p.age / p.lifetime;
      if (t <= 0) continue;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.age * 8);
      const s = p.size * t;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  private drawPopups(popups: FloatingPopup[]): void {
    const ctx = this.ctx;
    for (const pop of popups) {
      const progress = pop.age / pop.lifetime;
      if (progress >= 1) continue;
      const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
      const popScale =
        progress < 0.12 ? 0.65 + (progress / 0.12) * 0.5 : Math.max(0.92, 1.15 - progress * 0.22);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, pop.y);
      ctx.scale(popScale * pop.scale, popScale * pop.scale);

      ctx.font = '900 28px Orbitron, Impact, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#070812';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);

      if (pop.subtext) {
        ctx.font = '700 13px Orbitron, system-ui, sans-serif';
        ctx.lineWidth = 3.5;
        ctx.strokeText(pop.subtext, 0, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(pop.subtext, 0, 20);
      }
      ctx.restore();
    }
  }

  private drawHud(state: RenderFrameState, highwayX: number, highwayWidth: number): void {
    const ctx = this.ctx;
    const { width, height, stats, difficulty, mode, songTime, totalDurationSec } = state;

    // 1. Top Song Progress Bar
    const topBarW = Math.min(460, width - 40);
    const topBarX = (width - topBarW) / 2;
    ctx.fillStyle = 'rgba(14, 18, 34, 0.88)';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    this.roundRectPath(topBarX, 12, topBarW, 14, 7);
    ctx.fill();
    ctx.stroke();

    const pct =
      mode === 'endless'
        ? (songTime % 30) / 30
        : Math.max(0, Math.min(1, songTime / Math.max(1, totalDurationSec)));
    ctx.fillStyle = difficulty.accentColor;
    this.roundRectPath(topBarX + 2, 14, Math.max(8, (topBarW - 4) * pct), 10, 5);
    ctx.fill();

    ctx.font = '700 11px Orbitron, system-ui, sans-serif';
    ctx.fillStyle = '#E8F0FF';
    ctx.textAlign = 'center';
    const timeLabel =
      mode === 'endless'
        ? `${difficulty.name} • ENDLESS (${Math.round(state.currentBpm)} BPM) • ${this.formatTime(songTime)}`
        : `${difficulty.name} — ${difficulty.subtitle.toUpperCase()} • ${this.formatTime(
            Math.max(0, totalDurationSec - songTime)
          )}`;
    ctx.fillText(timeLabel, width / 2, 41);

    // 2. Score / Combo / Accuracy Readout + Anti-Spam Heat Meter
    if (stats.combo >= 3) {
      const comboX = highwayX + highwayWidth / 2;
      ctx.save();
      ctx.font = '900 36px Orbitron, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#070914';
      ctx.lineWidth = 6;
      ctx.strokeText(`${stats.combo}x`, comboX, 118);
      ctx.fillStyle = stats.combo >= 25 ? '#FFE066' : '#FFFFFF';
      ctx.fillText(`${stats.combo}x`, comboX, 118);
      ctx.font = '700 11px Orbitron, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('COMBO', comboX, 134);
      ctx.restore();
    }

    // Anti-Spam Stability Gauge (top-right)
    const meterW = 160;
    const meterX = width - meterW - 22;
    const meterY = 16;
    ctx.fillStyle = 'rgba(12, 15, 28, 0.86)';
    ctx.strokeStyle = state.spamHeat > 0.65 ? '#FF264B' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    this.roundRectPath(meterX, meterY, meterW, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 10px Orbitron, system-ui, sans-serif';
    ctx.fillStyle = state.spamHeat > 0.65 ? '#FF5C7A' : '#9EB0CC';
    ctx.textAlign = 'left';
    ctx.fillText('ANTI-SPAM METER', meterX + 10, meterY + 16);

    ctx.fillStyle = '#1B2038';
    this.roundRectPath(meterX + 10, meterY + 24, meterW - 20, 10, 5);
    ctx.fill();

    const heatW = (meterW - 20) * Math.min(1, state.spamHeat);
    if (heatW > 1) {
      ctx.fillStyle = state.spamHeat > 0.66 ? '#FF264B' : state.spamHeat > 0.34 ? '#FFB800' : '#00E5FF';
      this.roundRectPath(meterX + 10, meterY + 24, heatW, 10, 5);
      ctx.fill();
    }

    // 3. Bottom Friday Night Funkin' Tug-of-War Health Bar + Live Stats Strip
    const hbWidth = Math.min(580, width - 44);
    const hbHeight = 16;
    const hbX = (width - hbWidth) / 2;
    const hbY = height - 38;

    ctx.fillStyle = '#090B14';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    this.roundRectPath(hbX - 2, hbY - 2, hbWidth + 4, hbHeight + 4, 9);
    ctx.fill();
    ctx.stroke();

    // FNF convention: Rival (Red/Magenta) on Left pushing right; Player (Neon Lime/Cyan) on Right pushing left!
    const playerRatio = Math.max(0, Math.min(1, stats.hp / 100));
    const splitX = hbX + hbWidth * (1 - playerRatio);

    // Rival fill (left)
    ctx.fillStyle = '#FF2654';
    ctx.fillRect(hbX, hbY, splitX - hbX, hbHeight);

    // Player fill (right)
    ctx.fillStyle = stats.hp > 25 ? '#2BFF88' : '#FFB800';
    ctx.fillRect(splitX, hbY, hbX + hbWidth - splitX, hbHeight);

    // Rival vs Player head icons clashing at splitX!
    ctx.save();
    ctx.translate(splitX, hbY + hbHeight / 2);
    // Rival mini-icon
    ctx.fillStyle = '#B84DFF';
    ctx.strokeStyle = '#090B14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-13, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Player mini-icon
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.arc(13, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Bottom stats readout above health bar
    ctx.font = '700 12px Orbitron, system-ui, sans-serif';
    ctx.fillStyle = '#EAF2FF';
    ctx.textAlign = 'center';
    const summary = `SCORE: ${stats.score.toLocaleString()}   |   MISSES: ${
      stats.counts.MISS + stats.counts.SPAM
    }   |   ACCURACY: ${state.accuracy.toFixed(1)}% (${state.grade})`;
    ctx.fillText(summary, width / 2, hbY - 9);
  }

  private drawCountdownBanner(
    width: number,
    height: number,
    text: string,
    kickPulse: number
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(width / 2, height * 0.44);
    const s = 1 + kickPulse * 0.12;
    ctx.scale(s, s);
    ctx.font = '900 68px Orbitron, Impact, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#070812';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = text.includes('FUNK') || text.includes('GO') ? '#2BFF88' : '#00E5FF';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private hexWithAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  }
}
