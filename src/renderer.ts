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
  hitFlash: number;
  whiffFlash: number;
  jamRemainingSec: number;
}

export interface CharacterPose {
  lane: -1 | 0 | 1 | 2 | 3;
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
  trackTitle: string;
  trackArtist: string;
  currentBpm: number;
  kickPulse: number;
  notes: NoteBar[];
  lanes: LaneVisualState[];
  stats: RunStats;
  accuracy: number;
  grade: string;
  spamHeat: number;
  popups: FloatingPopup[];
  particles: HitParticle[];
  playerPose: CharacterPose;
  rivalPose: CharacterPose;
  countdownText: string | null;
}

interface JellyPalette {
  top: string;
  main: string;
  bottom: string;
  lip: string;
}

const BERRY_JAM_PALETTE: JellyPalette = {
  top: '#FF7597',
  main: '#FF2E5B',
  bottom: '#C90E39',
  lip: '#7D0622',
};

const SLATE_IDLE_PALETTE: JellyPalette = {
  top: '#434C5E',
  main: '#323947',
  bottom: '#262C37',
  lip: '#151920',
};

const BUBBLE_FONT = "'Fredoka', 'Nunito', 'Arial Rounded MT Bold', system-ui, sans-serif";

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
    const laneWidth = Math.min(98, Math.max(68, Math.floor(width * 0.088)));
    const highwayWidth = laneWidth * 4;
    const highwayX = Math.floor((width - highwayWidth) / 2);
    const receptorY = height - 130;
    return { laneWidth, highwayWidth, highwayX, receptorY };
  }

  public renderMenuBackground(width: number, height: number, timeSec: number): void {
    const ctx = this.ctx;

    // Exact matte dark slate-charcoal backdrop matching ui1.png (#252A34 -> #1D2129)
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#282E3A');
    bg.addColorStop(0.55, '#232832');
    bg.addColorStop(1, '#1B1F27');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Floating glossy 3D candy bars gently scrolling downward in the background
    const cols = 8;
    const colW = width / cols;
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 16; i++) {
      const laneIdx = i % 4;
      const x = ((i * 3) % cols) * colW + colW * 0.16;
      const w = Math.min(96, colW * 0.68);
      const speed = 110 + (i % 5) * 35;
      const y = ((timeSec * speed + i * 145) % (height + 90)) - 45;
      this.drawJellyPill(x, y, w, 24, 11, LANE_COLORS[laneIdx], 4, true);
    }
    ctx.restore();
  }

  public renderGameplay(state: RenderFrameState): void {
    const { width, height, songTime, difficulty, kickPulse } = state;
    const ctx = this.ctx;
    const { laneWidth, highwayWidth, highwayX, receptorY } = this.getHighwayGeometry(width, height);

    ctx.save();
    const zoom = 1 + kickPulse * 0.01;
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    // 1. Matte Slate Stage Backdrop (ui1.png palette)
    this.drawStageBackdrop(width, height, songTime, kickPulse);

    // 2. Flanking Glossy Cartoon Speakers & FNF Stage Characters
    if (width >= 820) {
      const leftStageX = highwayX * 0.5;
      const rightStageX = highwayX + highwayWidth + (width - (highwayX + highwayWidth)) * 0.5;
      const stageFloorY = height - 160;

      this.drawSpeakerStack(leftStageX, stageFloorY - 96, kickPulse, LANE_COLORS[3]);
      this.drawSpeakerStack(rightStageX, stageFloorY - 96, kickPulse, LANE_COLORS[0]);

      this.drawRivalCharacter(leftStageX, stageFloorY, songTime, state.currentBpm, state.rivalPose);
      this.drawPlayerCharacter(rightStageX, stageFloorY, songTime, state.currentBpm, state.playerPose);
    }

    // 3. Rounded 3D Slate Highway Track
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

    // 4. Glossy 3D Candy Falling Bars & Sustain Ribbons
    this.drawFallingNoteBars(
      state.notes,
      highwayX,
      laneWidth,
      height,
      receptorY,
      songTime,
      difficulty.scrollSpeed
    );

    // 5. Glossy 3D Catcher Bars + Squircle D F J K Keycap Buttons
    this.drawReceptorBars(highwayX, laneWidth, receptorY, state.lanes);

    // 6. Hit Particles & Chunky Outlined Bubble Popups
    this.drawParticles(state.particles);
    this.drawPopups(state.popups);

    ctx.restore();

    // 7. Glossy Capsule HUD, Anti-Spam Meter & FNF Tug-of-War Health Bar
    this.drawHud(state, highwayX, highwayWidth);

    // 8. Countdown Banner
    if (state.countdownText) {
      this.drawCountdownBanner(width, height, state.countdownText, kickPulse);
    }
  }

  /**
   * Core ui1.png 3D Glossy Jelly Pill / Squircle Renderer with:
   *  - Extruded 3D bottom lip + soft shadow
   *  - Rich 3-stop vertical gradient + dark stroke
   *  - Inner white top bevel highlight
   *  - Twin angled white specular shine droplets in the top-right corner!
   */
  private drawJellyPill(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    pal: JellyPalette,
    lipHeight = 5,
    showShineDots = true
  ): void {
    const ctx = this.ctx;
    const r = Math.min(radius, w / 2, h / 2);

    ctx.save();

    // Soft drop shadow + 3D bottom lip
    if (lipHeight > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      this.roundRectPath(x, y + lipHeight + 3, w, h, r);
      ctx.fill();

      ctx.fillStyle = pal.lip;
      this.roundRectPath(x, y + lipHeight, w, h, r);
      ctx.fill();
    }

    // Main glossy candy body
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.5, pal.main);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    this.roundRectPath(x, y, w, h, r);
    ctx.fill();

    // Continuous translucent inner glossy bevel ring matching ui1.png!
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.lineWidth = 4;
    this.roundRectPath(x + 1, y + 1, w - 2, h - 2, Math.max(2, r - 1));
    ctx.stroke();
    ctx.restore();

    // Twin angled white specular droplets in top-right corner (signature of ui1.png!)
    if (showShineDots && w >= 28 && h >= 16) {
      const scale = Math.min(1, h / 28);
      const rightAnchorX = x + w - Math.max(8, r * 0.65);
      const topAnchorY = y + Math.max(5, h * 0.24);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';

      // Small upper-left droplet
      ctx.save();
      ctx.translate(rightAnchorX - 8 * scale, topAnchorY - 1.5 * scale);
      ctx.rotate((24 * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.8 * scale, 1.7 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Larger lower-right droplet
      ctx.save();
      ctx.translate(rightAnchorX - 1.5 * scale, topAnchorY + 2 * scale);
      ctx.rotate((32 * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.0 * scale, 2.4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawOutlinedText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fill = '#FFFFFF',
    stroke = '#161A22',
    strokeWidth = 5,
    align: CanvasTextAlign = 'center'
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${fontSize}px ${BUBBLE_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    // 3D bottom shadow stroke
    ctx.fillStyle = stroke;
    ctx.fillText(text, x, y + Math.max(2, fontSize * 0.09));

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);

    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawStageBackdrop(
    width: number,
    height: number,
    songTime: number,
    kickPulse: number
  ): void {
    const ctx = this.ctx;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#282E3A');
    bg.addColorStop(0.68, '#222731');
    bg.addColorStop(1, '#1A1E26');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Soft rounded stage floor platform
    const horizonY = height - 146;
    ctx.fillStyle = '#1B2029';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    ctx.strokeStyle = '#363F4F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.stroke();

    // Soft candy stage spotlights
    for (let i = 0; i < 4; i++) {
      const col = LANE_COLORS[i].main;
      const bx = width * (0.14 + i * 0.24);
      const sway = Math.sin(songTime * 1.4 + i * 1.5) * 80;
      ctx.save();
      ctx.globalAlpha = 0.05 + kickPulse * 0.045;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + sway - 125, horizonY);
      ctx.lineTo(bx + sway + 125, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSpeakerStack(
    cx: number,
    cy: number,
    kickPulse: number,
    pal: JellyPalette
  ): void {
    const ctx = this.ctx;
    const bump = 1 + kickPulse * 0.065;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bump, bump);

    this.drawJellyPill(-58, -68, 116, 136, 24, SLATE_IDLE_PALETTE, 7, false);

    for (const wy of [-28, 30]) {
      ctx.beginPath();
      ctx.arc(0, wy, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#171B22';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = pal.main;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, wy, 9 + kickPulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = pal.top;
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
    const pal: JellyPalette = pose.lane !== -1 ? LANE_COLORS[pose.lane] : LANE_COLORS[3];
    const leanX = pose.lane === 0 ? -10 : pose.lane === 3 ? 10 : 0;
    const stretchY = pose.lane === 2 ? -10 : pose.lane === 1 ? 6 : 0;

    ctx.save();
    ctx.translate(x + leanX, floorY);

    const headY = -108 + beatBounce + stretchY;

    // Glossy 3D torso
    this.drawJellyPill(-30, -76 + beatBounce * 0.5, 60, 64, 18, pal, 5, true);

    // Glossy 3D head
    this.drawJellyPill(-28, headY - 26, 56, 50, 18, SLATE_IDLE_PALETTE, 5, true);

    // Glowing candy visor bar
    this.drawJellyPill(-19, headY - 10, 38, 15, 7, pal, 2, false);

    this.drawOutlinedText('Rival', 0, 22, 14, '#DCE5F5', '#151920', 4);
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
    const pal: JellyPalette = isMiss
      ? BERRY_JAM_PALETTE
      : pose.lane !== -1
      ? LANE_COLORS[pose.lane]
      : LANE_COLORS[0];

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

    const headY = -106 + beatBounce + stretchY;

    // Glossy 3D hoodie torso
    this.drawJellyPill(-30, -74 + beatBounce * 0.5, 60, 62, 18, pal, 5, true);

    // Rounded head
    this.drawJellyPill(-27, headY - 25, 54, 48, 18, SLATE_IDLE_PALETTE, 5, false);

    // Backwards glossy cap
    this.drawJellyPill(-29, headY - 31, 58, 16, 8, LANE_COLORS[3], 3, true);
    this.drawJellyPill(15, headY - 25, 24, 10, 5, LANE_COLORS[3], 2, false);

    // Eyes
    if (isMiss) {
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#FF5C7A';
      for (const ex of [-10, 10]) {
        ctx.beginPath();
        ctx.moveTo(ex - 5, headY - 6);
        ctx.lineTo(ex + 5, headY + 4);
        ctx.moveTo(ex + 5, headY - 6);
        ctx.lineTo(ex - 5, headY + 4);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#FFFFFF';
      this.roundRectPath(-15, headY - 7, 10, 12, 5);
      ctx.fill();
      this.roundRectPath(5, headY - 7, 10, 12, 5);
      ctx.fill();
    }

    this.drawOutlinedText('You (DFJK)', 0, 22, 14, '#DCE5F5', '#151920', 4);
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
    const trackH = height - 52;

    // Recessed matte dark slate highway well
    ctx.fillStyle = '#181C23';
    ctx.fillRect(highwayX - 4, 0, highwayWidth + 8, trackH);

    ctx.fillStyle = '#1E232C';
    ctx.fillRect(highwayX, 0, highwayWidth, trackH);

    // Subtle alternating lane tint + active lane glow
    for (let i = 0; i < 4; i++) {
      const lx = highwayX + i * laneWidth;
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
        ctx.fillRect(lx, 0, laneWidth, trackH);
      }

      const st = lanes[i];
      const col = LANE_COLORS[i];

      if (st.jamRemainingSec > 0) {
        const grad = ctx.createLinearGradient(0, receptorY - 240, 0, receptorY + 25);
        grad.addColorStop(0, 'rgba(255, 46, 91, 0)');
        grad.addColorStop(1, 'rgba(255, 46, 91, 0.3)');
        ctx.fillStyle = grad;
        ctx.fillRect(lx, receptorY - 240, laneWidth, 265);
      } else if (st.pressed || st.hitFlash > 0.02) {
        const intensity = Math.max(st.pressed ? 0.14 : 0, st.hitFlash * 0.28);
        const grad = ctx.createLinearGradient(0, receptorY - 280, 0, receptorY + 20);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, this.hexWithAlpha(col.main, intensity));
        ctx.fillStyle = grad;
        ctx.fillRect(lx, receptorY - 280, laneWidth, 300);
      }

      if (st.whiffFlash > 0.02) {
        ctx.fillStyle = `rgba(255, 46, 91, ${st.whiffFlash * 0.25})`;
        ctx.fillRect(lx, receptorY - 140, laneWidth, 170);
      }
    }

    // Scrolling beat & measure horizontal lines
    const secPerBeat = 60 / bpm;
    const firstBeat = Math.floor((songTime - 0.3) / secPerBeat);
    const maxVisibleTime = songTime + (receptorY + 40) / scrollSpeed;
    const lastBeat = Math.ceil(maxVisibleTime / secPerBeat);

    for (let b = firstBeat; b <= lastBeat; b++) {
      const beatTime = b * secPerBeat;
      const y = receptorY - (beatTime - songTime) * scrollSpeed;
      if (y < -10 || y > trackH - 8) continue;

      const isMeasure = b % 4 === 0;
      ctx.strokeStyle = isMeasure ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = isMeasure ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(highwayX + 4, y);
      ctx.lineTo(highwayX + highwayWidth - 4, y);
      ctx.stroke();
    }

    // Soft lane dividers & chunky 3D highway side rails
    for (let i = 1; i < 4; i++) {
      const x = highwayX + i * laneWidth;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, trackH);
      ctx.stroke();
    }

    ctx.strokeStyle = '#384152';
    ctx.lineWidth = 4;
    ctx.strokeRect(highwayX - 2, -4, highwayWidth + 4, trackH + 4);
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
    const padX = 8;
    const barW = laneWidth - padX * 2;
    const barH = 24;

    for (const note of notes) {
      if (note.hit && (note.duration === 0 || note.holdCompleted)) continue;

      const headY = receptorY - (note.time - songTime) * scrollSpeed;
      const endTime = note.time + note.duration;
      const tailY = receptorY - (endTime - songTime) * scrollSpeed;

      const lowestY = Math.max(headY, tailY);
      const highestY = Math.min(headY, tailY);
      if (lowestY < -50 || highestY > height) continue;

      const pal = LANE_COLORS[note.lane];
      const lx = highwayX + note.lane * laneWidth + padX;

      // 1. Glossy vertical Hold Sustain Trail
      if (note.duration > 0) {
        const clampBottomY = note.holding ? receptorY : Math.min(headY, height);
        const topY = Math.max(-25, tailY);
        if (clampBottomY > topY) {
          const ribbonW = Math.max(22, Math.floor(barW * 0.44));
          const rx = highwayX + note.lane * laneWidth + (laneWidth - ribbonW) / 2;
          ctx.save();
          ctx.globalAlpha = note.missed || note.holdReleasedEarly ? 0.32 : 0.92;
          this.drawJellyPill(rx, topY, ribbonW, clampBottomY - topY, 10, pal, 3, false);
          ctx.restore();
        }
      }

      // 2. Glossy 3D Candy Horizontal Falling Bar (with twin top-right specular droplets!)
      if (!note.hit) {
        ctx.save();
        if (note.missed) {
          ctx.globalAlpha = 0.38;
        }
        this.drawJellyPill(lx, headY - barH / 2, barW, barH, 11, pal, 5, true);
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
    const padX = 6;
    const barW = laneWidth - padX * 2;
    const barH = 25;

    for (let i = 0; i < 4; i++) {
      const st = lanes[i];
      const col = LANE_COLORS[i];
      const jammed = st.jamRemainingSec > 0;
      const shakeX = jammed ? (Math.random() - 0.5) * 6 : 0;

      // Squish down onto the 3D lip when pressed — tactile ui1.png button feel!
      const pressY = st.pressed ? 3 : 0;
      const lipH = st.pressed ? 2 : 5;

      const x = highwayX + i * laneWidth + padX + shakeX;
      const y = receptorY - barH / 2 + pressY;

      if (jammed) {
        this.drawJellyPill(x, y, barW, barH, 12, BERRY_JAM_PALETTE, 5, true);
        this.drawOutlinedText(
          'LOCKED!',
          highwayX + i * laneWidth + laneWidth / 2,
          y - 12,
          12,
          '#FF8FA6',
          '#4F0417',
          4
        );
      } else if (st.pressed || st.hitFlash > 0.08) {
        this.drawJellyPill(x, y, barW, barH, 12, col, lipH, true);
      } else {
        // Idle 3D slate catcher bar slot with colored inner rim
        this.drawJellyPill(x, y, barW, barH, 12, SLATE_IDLE_PALETTE, 5, true);
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = col.main;
        ctx.lineWidth = 2.5;
        this.roundRectPath(x + 4, y + 4, barW - 8, barH - 8, 8);
        ctx.stroke();
        ctx.restore();
      }

      // Mini ui1.png Squircle Keycap Button (D / F / J / K) right below catcher bar!
      const cx = highwayX + i * laneWidth + laneWidth / 2;
      const keySize = 38;
      const keyPressY = st.pressed ? 3 : 0;
      const keyLip = st.pressed ? 2 : 5;
      const keyPal = jammed ? BERRY_JAM_PALETTE : st.pressed ? col : SLATE_IDLE_PALETTE;

      this.drawJellyPill(
        cx - keySize / 2,
        receptorY + 21 + keyPressY,
        keySize,
        keySize,
        12,
        keyPal,
        keyLip,
        true
      );
      this.drawOutlinedText(
        LANE_LABELS[i],
        cx,
        receptorY + 21 + keyPressY + keySize / 2,
        18,
        '#FFFFFF',
        keyPal.lip,
        4
      );
    }
  }

  private drawParticles(particles: HitParticle[]): void {
    const ctx = this.ctx;
    for (const p of particles) {
      const t = 1 - p.age / p.lifetime;
      if (t <= 0) continue;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#161A22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, (p.size * t) / 1.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
        progress < 0.14 ? 0.65 + (progress / 0.14) * 0.52 : Math.max(0.92, 1.17 - progress * 0.24);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, pop.y);
      ctx.scale(popScale * pop.scale, popScale * pop.scale);

      this.drawOutlinedText(pop.text, 0, 0, 32, pop.color, '#151920', 7);
      if (pop.subtext) {
        this.drawOutlinedText(pop.subtext, 0, 24, 14, '#FFFFFF', '#151920', 4.5);
      }
      ctx.restore();
    }
  }

  private drawHud(state: RenderFrameState, highwayX: number, highwayWidth: number): void {
    const { width, height, stats, difficulty, mode, songTime, totalDurationSec } = state;

    // 1. Top Glossy Progress Pill
    const topBarW = Math.min(440, width - 160);
    const topBarX = (width - topBarW) / 2;
    this.drawJellyPill(topBarX, 12, topBarW, 20, 10, SLATE_IDLE_PALETTE, 4, false);

    const clampedSongTime = Math.max(0, songTime);
    const pct =
      mode === 'endless'
        ? (clampedSongTime % 30) / 30
        : Math.max(0, Math.min(1, clampedSongTime / Math.max(1, totalDurationSec)));
    const fillW = Math.max(22, (topBarW - 6) * pct);
    this.drawJellyPill(topBarX + 3, 14, fillW, 16, 8, LANE_COLORS[0], 0, true);

    const timeLabel =
      mode === 'endless'
        ? `♪ ${state.trackArtist} — ${state.trackTitle} • ${difficulty.name} Endless • ${this.formatTime(
            clampedSongTime
          )}`
        : `♪ ${state.trackArtist} — ${state.trackTitle} • ${difficulty.name} • ${this.formatTime(
            Math.max(0, totalDurationSec - clampedSongTime)
          )}`;
    this.drawOutlinedText(timeLabel, width / 2, 46, 13.5, '#E8EFFC', '#151920', 4);

    // Opening "Now Playing — Music by Creo" banner during countdown & intro!
    if (songTime < 3.5) {
      const fadeAlpha = songTime < 2.5 ? 1 : Math.max(0, 1 - (songTime - 2.5));
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      const badgeW = 290;
      const badgeX = (width - badgeW) / 2;
      const badgeY = 64;
      this.drawJellyPill(badgeX, badgeY, badgeW, 34, 14, LANE_COLORS[1], 4, true);
      this.drawOutlinedText(
        `Now Playing: ${state.trackTitle} — Music by ${state.trackArtist}`,
        width / 2,
        badgeY + 17,
        13,
        '#FFFFFF',
        '#045388',
        3.5
      );
      ctx.restore();
    }

    // 2. Chunky Bubble Combo Counter
    if (stats.combo >= 3) {
      const comboX = highwayX + highwayWidth / 2;
      this.drawOutlinedText(
        `${stats.combo}x`,
        comboX,
        118,
        40,
        stats.combo >= 25 ? '#FFE44D' : '#FFFFFF',
        '#151920',
        7
      );
      this.drawOutlinedText('Combo!', comboX, 144, 14, '#72FF1D', '#151920', 4);
    }

    // 3. Anti-Spam Stability Capsule (Top-Right)
    const meterW = 166;
    const meterX = width - meterW - 18;
    const meterY = 14;
    this.drawJellyPill(meterX, meterY, meterW, 48, 16, SLATE_IDLE_PALETTE, 5, false);

    this.drawOutlinedText(
      'No-Spam Guard',
      meterX + meterW / 2,
      meterY + 15,
      12,
      state.spamHeat > 0.65 ? '#FF7597' : '#FFFFFF',
      '#151920',
      3.5
    );

    const trackInW = meterW - 22;
    const ctx = this.ctx;
    ctx.fillStyle = '#161A22';
    this.roundRectPath(meterX + 11, meterY + 27, trackInW, 12, 6);
    ctx.fill();

    const heatW = Math.max(0, trackInW * Math.min(1, state.spamHeat));
    if (heatW > 4) {
      const heatPal =
        state.spamHeat > 0.65
          ? BERRY_JAM_PALETTE
          : state.spamHeat > 0.34
          ? LANE_COLORS[2]
          : LANE_COLORS[1];
      this.drawJellyPill(meterX + 11, meterY + 27, Math.max(12, heatW), 12, 6, heatPal, 0, false);
    }

    // 4. Bottom FNF Tug-of-War Glossy Health Capsule
    const hbWidth = Math.min(560, width - 44);
    const hbHeight = 22;
    const hbX = (width - hbWidth) / 2;
    const hbY = height - 36;

    // Rival Berry-Red base capsule
    this.drawJellyPill(hbX, hbY, hbWidth, hbHeight, 11, BERRY_JAM_PALETTE, 4, false);

    // Player Signature ui1.png Green fill pushing from right to left!
    const playerRatio = Math.max(0, Math.min(1, stats.hp / 100));
    const splitX = hbX + hbWidth * (1 - playerRatio);
    const playerW = hbX + hbWidth - splitX;
    if (playerW > 12) {
      this.drawJellyPill(
        splitX,
        hbY,
        playerW,
        hbHeight,
        11,
        stats.hp > 25 ? LANE_COLORS[0] : LANE_COLORS[2],
        0,
        true
      );
    }

    // Clashing glossy mini character badges at splitX
    this.drawJellyPill(splitX - 24, hbY - 4, 24, 28, 12, BERRY_JAM_PALETTE, 3, true);
    this.drawJellyPill(splitX + 2, hbY - 4, 24, 28, 12, LANE_COLORS[0], 3, true);

    const summary = `Score: ${stats.score.toLocaleString()}   •   Misses: ${
      stats.counts.MISS + stats.counts.SPAM
    }   •   Accuracy: ${state.accuracy.toFixed(1)}% (${state.grade})`;
    this.drawOutlinedText(summary, width / 2, hbY - 13, 14, '#FFFFFF', '#151920', 4.5);
  }

  private drawCountdownBanner(
    width: number,
    height: number,
    text: string,
    kickPulse: number
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(width / 2, height * 0.43);
    const s = 1 + kickPulse * 0.12;
    ctx.scale(s, s);
    const label = text === 'FUNK!' ? 'Funk!' : text;
    const col = label === 'Funk!' ? '#72FF1D' : '#FFFFFF';
    this.drawOutlinedText(label, 0, 0, 74, col, '#146B04', 11);
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
