import { getLaneLabels } from './difficulties';
import {
  DEFAULT_SETTINGS,
  GameSettings,
  getPaletteLanes,
  LaneColorSpec,
  NoteShape,
  ThemeMode,
} from './settings';
import {
  DifficultyConfig,
  FloatingPopup,
  GameMode,
  HitParticle,
  LaneCount,
  LaneIndex,
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
  lane: -1 | LaneIndex;
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
  settings: GameSettings;
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

const DARK_IDLE_PALETTE: JellyPalette = {
  top: '#434C5E',
  main: '#323947',
  bottom: '#262C37',
  lip: '#151920',
};

const LIGHT_IDLE_PALETTE: JellyPalette = {
  top: '#FFFFFF',
  main: '#EBF1FA',
  bottom: '#D5E0F0',
  lip: '#97ABC9',
};

// 4K Arrow angles: D = Left, F = Down, J = Up, K = Right
const ARROW_ANGLES_4: readonly number[] = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];

// 6K Arrow angles: S = Left, D = Down-Left, F = Down, J = Up, K = Up-Right, L = Right
const ARROW_ANGLES_6: readonly number[] = [
  Math.PI,
  (3 * Math.PI) / 4,
  Math.PI / 2,
  -Math.PI / 2,
  -Math.PI / 4,
  0,
];

function getArrowAngle(laneIdx: LaneIndex, laneCount: LaneCount): number {
  const table = laneCount === 6 ? ARROW_ANGLES_6 : ARROW_ANGLES_4;
  return table[laneIdx % table.length] ?? 0;
}

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

  private getIdlePalette(theme: ThemeMode): JellyPalette {
    return theme === 'light' ? LIGHT_IDLE_PALETTE : DARK_IDLE_PALETTE;
  }

  private getLaneColors(settings: GameSettings, laneCount: LaneCount): readonly LaneColorSpec[] {
    return getPaletteLanes(settings.notePalette, laneCount);
  }

  public getHighwayGeometry(width: number, height: number, laneCount: LaneCount = 4) {
    const maxTotalW = Math.max(240, width - 32);
    const idealLaneW =
      laneCount === 6
        ? Math.min(84, Math.max(46, Math.floor(width * 0.068)))
        : Math.min(98, Math.max(64, Math.floor(width * 0.088)));
    const laneWidth = Math.min(idealLaneW, Math.floor(maxTotalW / laneCount));
    const highwayWidth = laneWidth * laneCount;
    const highwayX = Math.floor((width - highwayWidth) / 2);
    const receptorY = height - 140;
    return { laneWidth, highwayWidth, highwayX, receptorY };
  }

  public renderMenuBackground(
    width: number,
    height: number,
    timeSec: number,
    settings: GameSettings = DEFAULT_SETTINGS,
    laneCount: LaneCount = 4
  ): void {
    if (width <= 0 || height <= 0) return;
    const ctx = this.ctx;
    const isLight = settings.themeMode === 'light';
    const laneColors = this.getLaneColors(settings, laneCount);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    if (isLight) {
      bg.addColorStop(0, '#F3F7FD');
      bg.addColorStop(0.55, '#E7EFFA');
      bg.addColorStop(1, '#DAE5F5');
    } else {
      bg.addColorStop(0, '#282E3A');
      bg.addColorStop(0.55, '#232832');
      bg.addColorStop(1, '#1B1F27');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Floating glossy 3D custom notes gently scrolling downward in the background
    const cols = 8;
    const colW = width / cols;
    ctx.save();
    ctx.globalAlpha = isLight ? 0.34 : 0.28;
    for (let i = 0; i < 18; i++) {
      const laneIdx = (i % laneCount) as LaneIndex;
      const cx = ((i * 3) % cols) * colW + colW * 0.5;
      const w = Math.min(92, colW * 0.72);
      const speed = 110 + (i % 5) * 35;
      const cy = ((timeSec * speed + i * 135) % (height + 90)) - 45;
      this.drawNoteUnit(
        cx,
        cy,
        w,
        laneIdx,
        laneCount,
        settings.noteShape,
        laneColors[laneIdx],
        4,
        true
      );
    }
    ctx.restore();
  }

  /**
   * Renders a live animated 4-lane or 6-lane preview strip inside the Settings modal!
   */
  public static renderSettingsPreview(
    previewCanvas: HTMLCanvasElement,
    settings: GameSettings,
    timeSec: number,
    laneCount: LaneCount = 4
  ): void {
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;
    const width = previewCanvas.width;
    const height = previewCanvas.height;
    if (width <= 0 || height <= 0) return;

    const helper = new GameRenderer(previewCanvas);
    const isLight = settings.themeMode === 'light';
    const laneColors = helper.getLaneColors(settings, laneCount);
    const idlePal = helper.getIdlePalette(settings.themeMode);

    // Mini highway background
    pCtx.fillStyle = isLight ? '#E2EBF8' : '#1B2029';
    pCtx.fillRect(0, 0, width, height);

    const laneW = width / laneCount;
    const receptorY = height - 30;

    for (let i = 0; i < laneCount; i++) {
      if (i % 2 === 1) {
        pCtx.fillStyle = isLight ? 'rgba(30, 50, 85, 0.04)' : 'rgba(255, 255, 255, 0.025)';
        pCtx.fillRect(i * laneW, 0, laneW, height);
      }
      if (i > 0) {
        pCtx.strokeStyle = isLight ? 'rgba(30, 50, 85, 0.1)' : 'rgba(255, 255, 255, 0.08)';
        pCtx.lineWidth = 1.5;
        pCtx.beginPath();
        pCtx.moveTo(i * laneW, 0);
        pCtx.lineTo(i * laneW, height);
        pCtx.stroke();
      }
    }

    // Animated falling notes + receptors across the 4 or 6 lanes
    for (let i = 0; i < laneCount; i++) {
      const laneIdx = i as LaneIndex;
      const cx = i * laneW + laneW / 2;
      const col = laneColors[laneIdx];
      const cycle = (((timeSec * 0.95 + i * (1 / laneCount)) % 1) + 1) % 1;
      const noteY = -18 + cycle * (receptorY + 18);
      const justHit = Math.abs(noteY - receptorY) < 11;

      if (justHit) {
        helper.drawNoteUnit(
          cx,
          receptorY + 2,
          laneW * 0.88,
          laneIdx,
          laneCount,
          settings.noteShape,
          col,
          2,
          true
        );
      } else {
        helper.drawReceptorSlot(
          cx,
          receptorY,
          laneW * 0.88,
          laneIdx,
          laneCount,
          settings.noteShape,
          idlePal,
          col.main
        );
      }

      if (noteY < receptorY - 6) {
        helper.drawNoteUnit(
          cx,
          noteY,
          laneW * 0.88,
          laneIdx,
          laneCount,
          settings.noteShape,
          col,
          4,
          true
        );
      }
    }
  }

  public renderGameplay(state: RenderFrameState): void {
    const { width, height, songTime, difficulty, settings, kickPulse } = state;
    if (width <= 0 || height <= 0) return;
    const ctx = this.ctx;
    const laneCount = difficulty.laneCount;
    const laneColors = this.getLaneColors(settings, laneCount);
    const { laneWidth, highwayWidth, highwayX, receptorY } = this.getHighwayGeometry(
      width,
      height,
      laneCount
    );

    ctx.save();
    try {
      const zoom = 1 + kickPulse * 0.01;
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-width / 2, -height / 2);

      // 1. Matte Slate or Daylight Cloud Stage Backdrop
      this.drawStageBackdrop(width, height, songTime, kickPulse, settings.themeMode, laneColors);

      // 2. Flanking Glossy Cartoon Speakers & FNF Stage Characters
      if (width >= highwayWidth + 320) {
        const leftStageX = highwayX * 0.5;
        const rightStageX = highwayX + highwayWidth + (width - (highwayX + highwayWidth)) * 0.5;
        const stageFloorY = height - 160;
        const idlePal = this.getIdlePalette(settings.themeMode);

        this.drawSpeakerStack(
          leftStageX,
          stageFloorY - 96,
          kickPulse,
          laneColors[laneColors.length - 1],
          idlePal
        );
        this.drawSpeakerStack(rightStageX, stageFloorY - 96, kickPulse, laneColors[0], idlePal);

        this.drawRivalCharacter(
          leftStageX,
          stageFloorY,
          songTime,
          state.currentBpm,
          state.rivalPose,
          laneCount,
          laneColors,
          idlePal
        );
        this.drawPlayerCharacter(
          rightStageX,
          stageFloorY,
          songTime,
          state.currentBpm,
          state.playerPose,
          laneCount,
          laneColors,
          idlePal
        );
      }

      // 3. Rounded 3D Highway Track
      this.drawHighwayTrack(
        highwayX,
        highwayWidth,
        laneWidth,
        laneCount,
        height,
        receptorY,
        songTime,
        state.currentBpm,
        difficulty.scrollSpeed,
        state.lanes,
        settings.themeMode,
        laneColors
      );

      // 4. Glossy 3D Custom Falling Notes & Sustain Ribbons
      this.drawFallingNoteBars(
        state.notes,
        highwayX,
        laneWidth,
        laneCount,
        height,
        receptorY,
        songTime,
        difficulty.scrollSpeed,
        settings.noteShape,
        laneColors
      );

      // 5. Glossy 3D Catcher Receptors + Squircle Keycap Buttons (DFJK or SDFJKL)
      this.drawReceptorBars(
        highwayX,
        laneWidth,
        laneCount,
        receptorY,
        state.lanes,
        settings.noteShape,
        settings.themeMode,
        laneColors
      );

      // 6. Hit Particles & Chunky Outlined Bubble Popups
      this.drawParticles(state.particles);
      this.drawPopups(state.popups);
    } finally {
      ctx.restore();
    }

    // 7. Glossy Capsule HUD, Anti-Spam Meter & FNF Tug-of-War Health Bar
    this.drawHud(state, highwayX, highwayWidth, laneColors);

    // 8. Countdown Banner
    if (state.countdownText) {
      this.drawCountdownBanner(width, height, state.countdownText, kickPulse);
    }
  }

  private drawNoteUnit(
    cx: number,
    cy: number,
    laneWidth: number,
    laneIdx: LaneIndex,
    laneCount: LaneCount,
    shape: NoteShape,
    pal: JellyPalette,
    lipHeight = 5,
    showShineDots = true
  ): void {
    if (shape === 'circle') {
      const r = Math.min(24, Math.max(11, laneWidth * 0.31));
      this.drawJellyOrb(cx, cy, r, pal, lipHeight, showShineDots);
    } else if (shape === 'diamond') {
      const rx = Math.min(28, Math.max(12, laneWidth * 0.35));
      const ry = Math.min(23, Math.max(10, laneWidth * 0.29));
      this.drawJellyDiamond(cx, cy, rx, ry, pal, lipHeight, showShineDots);
    } else if (shape === 'arrow') {
      const r = Math.min(24, Math.max(12, laneWidth * 0.31));
      this.drawJellyArrow(cx, cy, r, getArrowAngle(laneIdx, laneCount), pal, lipHeight);
    } else {
      const barW = Math.max(18, laneWidth - 14);
      const barH = 24;
      this.drawJellyPill(
        cx - barW / 2,
        cy - barH / 2,
        barW,
        barH,
        11,
        pal,
        lipHeight,
        showShineDots
      );
    }
  }

  private drawReceptorSlot(
    cx: number,
    cy: number,
    laneWidth: number,
    laneIdx: LaneIndex,
    laneCount: LaneCount,
    shape: NoteShape,
    idlePal: JellyPalette,
    accentMain: string
  ): void {
    const ctx = this.ctx;
    if (shape === 'circle') {
      const r = Math.min(24, Math.max(11, laneWidth * 0.31));
      this.drawJellyOrb(cx, cy, r, idlePal, 5, true);
      if (r > 7) {
        ctx.save();
        ctx.strokeStyle = accentMain;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (shape === 'diamond') {
      const rx = Math.min(28, Math.max(12, laneWidth * 0.35));
      const ry = Math.min(23, Math.max(10, laneWidth * 0.29));
      this.drawJellyDiamond(cx, cy, rx, ry, idlePal, 5, true);
      if (rx > 8 && ry > 8) {
        ctx.save();
        ctx.strokeStyle = accentMain;
        ctx.lineWidth = 2.5;
        this.diamondPath(cx, cy, rx - 5.5, ry - 5);
        ctx.stroke();
        ctx.restore();
      }
    } else if (shape === 'arrow') {
      const r = Math.min(24, Math.max(12, laneWidth * 0.31));
      this.drawJellyArrow(
        cx,
        cy,
        r,
        getArrowAngle(laneIdx, laneCount),
        idlePal,
        5,
        accentMain
      );
    } else {
      const barW = Math.max(18, laneWidth - 10);
      const barH = 25;
      const x = cx - barW / 2;
      const y = cy - barH / 2;
      this.drawJellyPill(x, y, barW, barH, 12, idlePal, 5, true);
      ctx.save();
      ctx.strokeStyle = accentMain;
      ctx.lineWidth = 2.5;
      this.roundRectPath(x + 4, y + 4, barW - 8, barH - 8, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

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
    if (w < 1 || h < 1 || !Number.isFinite(x + y + w + h + radius)) return;
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));

    ctx.save();

    if (lipHeight > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      this.roundRectPath(x, y + lipHeight + 3, w, h, r);
      ctx.fill();

      ctx.fillStyle = pal.lip;
      this.roundRectPath(x, y + lipHeight, w, h, r);
      ctx.fill();
    }

    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.5, pal.main);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    this.roundRectPath(x, y, w, h, r);
    ctx.fill();

    if (w > 6 && h > 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.lineWidth = 2.4;
      this.roundRectPath(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(0, r - 1.5));
      ctx.stroke();
    }

    if (showShineDots && w >= 28 && h >= 16) {
      const scale = Math.min(1, h / 28);
      const rightAnchorX = x + w - Math.max(8, r * 0.65);
      const topAnchorY = y + Math.max(5, h * 0.24);
      this.drawShineDroplets(rightAnchorX, topAnchorY, scale);
    }

    ctx.restore();
  }

  private drawJellyOrb(
    cx: number,
    cy: number,
    radius: number,
    pal: JellyPalette,
    lipHeight = 5,
    showShineDots = true
  ): void {
    if (radius < 2 || !Number.isFinite(cx + cy + radius)) return;
    const ctx = this.ctx;

    ctx.save();

    if (lipHeight > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.beginPath();
      ctx.arc(cx, cy + lipHeight + 3, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = pal.lip;
      ctx.beginPath();
      ctx.arc(cx, cy + lipHeight, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const grad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.52, pal.main);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    if (radius > 5) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (showShineDots && radius >= 11) {
      const scale = Math.min(1, radius / 20);
      this.drawShineDroplets(cx + radius * 0.48, cy - radius * 0.46, scale);
    }

    ctx.restore();
  }

  private drawJellyDiamond(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    pal: JellyPalette,
    lipHeight = 5,
    showShineDots = true
  ): void {
    if (rx < 3 || ry < 3 || !Number.isFinite(cx + cy + rx + ry)) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.lineJoin = 'round';

    if (lipHeight > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      this.diamondPath(cx, cy + lipHeight + 3, rx, ry);
      ctx.fill();

      ctx.fillStyle = pal.lip;
      this.diamondPath(cx, cy + lipHeight, rx, ry);
      ctx.fill();
    }

    const grad = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.5, pal.main);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    this.diamondPath(cx, cy, rx, ry);
    ctx.fill();

    if (rx > 6 && ry > 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.lineWidth = 2.2;
      this.diamondPath(cx, cy, rx - 2.5, ry - 2.2);
      ctx.stroke();
    }

    if (showShineDots && rx >= 13) {
      const scale = Math.min(1, ry / 20);
      this.drawShineDroplets(cx + rx * 0.36, cy - ry * 0.38, scale);
    }

    ctx.restore();
  }

  private diamondPath(cx: number, cy: number, rx: number, ry: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (rx <= 0 || ry <= 0) return;
    const k = 0.16;
    ctx.moveTo(cx - rx * k, cy - ry * (1 - k));
    ctx.quadraticCurveTo(cx, cy - ry, cx + rx * k, cy - ry * (1 - k));
    ctx.lineTo(cx + rx * (1 - k), cy - ry * k);
    ctx.quadraticCurveTo(cx + rx, cy, cx + rx * (1 - k), cy + ry * k);
    ctx.lineTo(cx + rx * k, cy + ry * (1 - k));
    ctx.quadraticCurveTo(cx, cy + ry, cx - rx * k, cy + ry * (1 - k));
    ctx.lineTo(cx - rx * (1 - k), cy + ry * k);
    ctx.quadraticCurveTo(cx - rx, cy, cx - rx * (1 - k), cy - ry * k);
    ctx.closePath();
  }

  private drawJellyArrow(
    cx: number,
    cy: number,
    radius: number,
    angleRad: number,
    pal: JellyPalette,
    lipHeight = 5,
    innerAccentStroke?: string
  ): void {
    if (radius < 4 || !Number.isFinite(cx + cy + radius)) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (lipHeight > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.lineWidth = 5;
      this.arrowPolygonPath(cx, cy + lipHeight + 3, radius * 0.86, angleRad);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.lip;
      ctx.strokeStyle = pal.lip;
      ctx.lineWidth = 5;
      this.arrowPolygonPath(cx, cy + lipHeight, radius * 0.86, angleRad);
      ctx.fill();
      ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.52, pal.main);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 5;
    this.arrowPolygonPath(cx, cy, radius * 0.86, angleRad);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = innerAccentStroke ?? 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = innerAccentStroke ? 2.4 : 2.0;
    this.arrowPolygonPath(cx, cy, radius * 0.68, angleRad);
    ctx.stroke();

    ctx.restore();
  }

  private arrowPolygonPath(cx: number, cy: number, r: number, angleRad: number): void {
    const ctx = this.ctx;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const pts: readonly [number, number][] = [
      [0.92 * r, 0],
      [0.04 * r, -0.86 * r],
      [0.04 * r, -0.35 * r],
      [-0.84 * r, -0.35 * r],
      [-0.84 * r, 0.35 * r],
      [0.04 * r, 0.35 * r],
      [0.04 * r, 0.86 * r],
    ];
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [ lx, ly ] = pts[i];
      const rx = cx + lx * cos - ly * sin;
      const ry = cy + lx * sin + ly * cos;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
  }

  private drawShineDroplets(rightAnchorX: number, topAnchorY: number, scale: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';

    ctx.save();
    ctx.translate(rightAnchorX - 8 * scale, topAnchorY - 1.5 * scale);
    ctx.rotate((24 * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(0.8, 2.8 * scale), Math.max(0.5, 1.7 * scale), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(rightAnchorX - 1.5 * scale, topAnchorY + 2 * scale);
    ctx.rotate((32 * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1.2, 5.0 * scale), Math.max(0.8, 2.4 * scale), 0, 0, Math.PI * 2);
    ctx.fill();
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
    kickPulse: number,
    theme: ThemeMode,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const ctx = this.ctx;
    const isLight = theme === 'light';
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    if (isLight) {
      bg.addColorStop(0, '#F5F8FD');
      bg.addColorStop(0.68, '#E8F0FB');
      bg.addColorStop(1, '#DAE5F5');
    } else {
      bg.addColorStop(0, '#282E3A');
      bg.addColorStop(0.68, '#222731');
      bg.addColorStop(1, '#1A1E26');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const horizonY = height - 146;
    ctx.fillStyle = isLight ? '#D4E0F3' : '#1B2029';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    ctx.strokeStyle = isLight ? '#B3C4E0' : '#363F4F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.stroke();

    const lightCount = laneColors.length;
    for (let i = 0; i < lightCount; i++) {
      const col = laneColors[i].main;
      const bx = width * (0.1 + (i / Math.max(1, lightCount - 1)) * 0.8);
      const sway = Math.sin(songTime * 1.4 + i * 1.3) * 80;
      ctx.save();
      ctx.globalAlpha = (isLight ? 0.075 : 0.048) + kickPulse * 0.042;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + sway - 115, horizonY);
      ctx.lineTo(bx + sway + 115, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSpeakerStack(
    cx: number,
    cy: number,
    kickPulse: number,
    pal: JellyPalette,
    cabinetPal: JellyPalette
  ): void {
    const ctx = this.ctx;
    const bump = 1 + kickPulse * 0.065;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bump, bump);

    this.drawJellyPill(-58, -68, 116, 136, 24, cabinetPal, 7, false);

    for (const wy of [-28, 30]) {
      ctx.beginPath();
      ctx.arc(0, wy, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#1E2430';
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
    pose: CharacterPose,
    laneCount: LaneCount,
    laneColors: readonly LaneColorSpec[],
    headPal: JellyPalette
  ): void {
    const ctx = this.ctx;
    const beatBounce = Math.abs(Math.sin(songTime * Math.PI * (bpm / 60))) * 8;
    const lastIdx = laneColors.length - 1;
    const pal: JellyPalette =
      pose.lane !== -1 && laneColors[pose.lane] ? laneColors[pose.lane] : laneColors[lastIdx];
    const leanX = pose.lane === 0 ? -10 : pose.lane === laneCount - 1 ? 10 : 0;
    const stretchY =
      pose.lane === Math.floor(laneCount / 2)
        ? -10
        : pose.lane === Math.floor(laneCount / 2) - 1
        ? 6
        : 0;

    ctx.save();
    ctx.translate(x + leanX, floorY);

    const headY = -108 + beatBounce + stretchY;

    this.drawJellyPill(-30, -76 + beatBounce * 0.5, 60, 64, 18, pal, 5, true);
    this.drawJellyPill(-28, headY - 26, 56, 50, 18, headPal, 5, true);
    this.drawJellyPill(-19, headY - 10, 38, 15, 7, pal, 2, false);

    this.drawOutlinedText('Rival', 0, 22, 14, '#FFFFFF', '#18202E', 4.5);
    ctx.restore();
  }

  private drawPlayerCharacter(
    x: number,
    floorY: number,
    songTime: number,
    bpm: number,
    pose: CharacterPose,
    laneCount: LaneCount,
    laneColors: readonly LaneColorSpec[],
    headPal: JellyPalette
  ): void {
    const ctx = this.ctx;
    const beatBounce = Math.abs(Math.sin(songTime * Math.PI * (bpm / 60))) * 8;
    const isMiss = pose.missTimer > 0;
    const lastIdx = laneColors.length - 1;
    const pal: JellyPalette = isMiss
      ? BERRY_JAM_PALETTE
      : pose.lane !== -1 && laneColors[pose.lane]
      ? laneColors[pose.lane]
      : laneColors[0];

    const leanX = isMiss
      ? (Math.random() - 0.5) * 8
      : pose.lane === 0
      ? -12
      : pose.lane === laneCount - 1
      ? 12
      : 0;
    const stretchY =
      pose.lane === Math.floor(laneCount / 2)
        ? -12
        : pose.lane === Math.floor(laneCount / 2) - 1
        ? 6
        : 0;

    ctx.save();
    ctx.translate(x + leanX, floorY);

    const headY = -106 + beatBounce + stretchY;

    this.drawJellyPill(-30, -74 + beatBounce * 0.5, 60, 62, 18, pal, 5, true);
    this.drawJellyPill(-27, headY - 25, 54, 48, 18, headPal, 5, false);

    this.drawJellyPill(-29, headY - 31, 58, 16, 8, laneColors[lastIdx], 3, true);
    this.drawJellyPill(15, headY - 25, 24, 10, 5, laneColors[lastIdx], 2, false);

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
      ctx.fillStyle = headPal === LIGHT_IDLE_PALETTE ? '#1E2636' : '#FFFFFF';
      this.roundRectPath(-15, headY - 7, 10, 12, 5);
      ctx.fill();
      this.roundRectPath(5, headY - 7, 10, 12, 5);
      ctx.fill();
    }

    const keysTag = laneCount === 6 ? 'You (SDFJKL)' : 'You (DFJK)';
    this.drawOutlinedText(keysTag, 0, 22, 14, '#FFFFFF', '#18202E', 4.5);
    ctx.restore();
  }

  private drawHighwayTrack(
    highwayX: number,
    highwayWidth: number,
    laneWidth: number,
    laneCount: LaneCount,
    height: number,
    receptorY: number,
    songTime: number,
    bpm: number,
    scrollSpeed: number,
    lanes: LaneVisualState[],
    theme: ThemeMode,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const ctx = this.ctx;
    const isLight = theme === 'light';
    const trackH = height - 52;

    ctx.fillStyle = isLight ? '#C7D5EA' : '#181C23';
    ctx.fillRect(highwayX - 4, 0, highwayWidth + 8, trackH);

    ctx.fillStyle = isLight ? '#E2EBF8' : '#1E232C';
    ctx.fillRect(highwayX, 0, highwayWidth, trackH);

    for (let i = 0; i < laneCount; i++) {
      const lx = highwayX + i * laneWidth;
      if (i % 2 === 1) {
        ctx.fillStyle = isLight ? 'rgba(25, 45, 80, 0.035)' : 'rgba(255, 255, 255, 0.018)';
        ctx.fillRect(lx, 0, laneWidth, trackH);
      }

      const st = lanes[i];
      const col = laneColors[i] ?? laneColors[0];
      if (!st) continue;

      if (st.jamRemainingSec > 0) {
        const grad = ctx.createLinearGradient(0, receptorY - 240, 0, receptorY + 25);
        grad.addColorStop(0, 'rgba(255, 46, 91, 0)');
        grad.addColorStop(1, 'rgba(255, 46, 91, 0.3)');
        ctx.fillStyle = grad;
        ctx.fillRect(lx, receptorY - 240, laneWidth, 265);
      } else if (st.pressed || st.hitFlash > 0.02) {
        const intensity = Math.max(st.pressed ? 0.16 : 0, st.hitFlash * 0.3);
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

    const secPerBeat = 60 / bpm;
    const firstBeat = Math.floor((songTime - 0.3) / secPerBeat);
    const maxVisibleTime = songTime + (receptorY + 40) / scrollSpeed;
    const lastBeat = Math.ceil(maxVisibleTime / secPerBeat);

    for (let b = firstBeat; b <= lastBeat; b++) {
      const beatTime = b * secPerBeat;
      const y = receptorY - (beatTime - songTime) * scrollSpeed;
      if (y < -10 || y > trackH - 8) continue;

      const isMeasure = b % 4 === 0;
      ctx.strokeStyle = isLight
        ? isMeasure
          ? 'rgba(30, 50, 85, 0.18)'
          : 'rgba(30, 50, 85, 0.07)'
        : isMeasure
        ? 'rgba(255, 255, 255, 0.14)'
        : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = isMeasure ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(highwayX + 4, y);
      ctx.lineTo(highwayX + highwayWidth - 4, y);
      ctx.stroke();
    }

    for (let i = 1; i < laneCount; i++) {
      const x = highwayX + i * laneWidth;
      const isCenterSplit = i === laneCount / 2;
      ctx.strokeStyle = isLight
        ? isCenterSplit
          ? 'rgba(30, 50, 85, 0.22)'
          : 'rgba(30, 50, 85, 0.1)'
        : isCenterSplit
        ? 'rgba(255, 255, 255, 0.18)'
        : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = isCenterSplit ? 2.8 : 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, trackH);
      ctx.stroke();
    }

    ctx.strokeStyle = isLight ? '#AEBED9' : '#384152';
    ctx.lineWidth = 4;
    ctx.strokeRect(highwayX - 2, -4, highwayWidth + 4, trackH + 4);
  }

  private drawFallingNoteBars(
    notes: NoteBar[],
    highwayX: number,
    laneWidth: number,
    laneCount: LaneCount,
    height: number,
    receptorY: number,
    songTime: number,
    scrollSpeed: number,
    noteShape: NoteShape,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const ctx = this.ctx;
    const barW = laneWidth - 14;
    const maxFutureSec = (receptorY + 60) / scrollSpeed;

    for (const note of notes) {
      if (note.time - songTime > maxFutureSec) break;
      if (note.hit && (note.duration === 0 || note.holdCompleted)) continue;

      const headY = receptorY - (note.time - songTime) * scrollSpeed;
      const endTime = note.time + note.duration;
      const tailY = receptorY - (endTime - songTime) * scrollSpeed;

      const lowestY = Math.max(headY, tailY);
      const highestY = Math.min(headY, tailY);
      if (lowestY < -50 || highestY > height) continue;

      const pal = laneColors[note.lane] ?? laneColors[0];
      const cx = highwayX + note.lane * laneWidth + laneWidth / 2;

      // 1. Glossy vertical Hold Sustain Trail
      if (note.duration > 0) {
        const clampBottomY = note.holding ? receptorY : Math.min(headY, height);
        const topY = Math.max(-25, tailY);
        const trailH = clampBottomY - topY;
        if (trailH >= 4) {
          const ribbonW = Math.max(18, Math.floor(barW * 0.42));
          const rx = cx - ribbonW / 2;
          ctx.save();
          ctx.globalAlpha = note.missed || note.holdReleasedEarly ? 0.32 : 0.92;
          this.drawJellyPill(rx, topY, ribbonW, trailH, 10, pal, 3, false);
          ctx.restore();
        }
      }

      // 2. Glossy 3D Falling Note in User's Chosen Shape & Palette!
      if (!note.hit) {
        ctx.save();
        if (note.missed) {
          ctx.globalAlpha = 0.38;
        }
        this.drawNoteUnit(cx, headY, laneWidth, note.lane, laneCount, noteShape, pal, 5, true);
        ctx.restore();
      }
    }
  }

  private drawReceptorBars(
    highwayX: number,
    laneWidth: number,
    laneCount: LaneCount,
    receptorY: number,
    lanes: LaneVisualState[],
    noteShape: NoteShape,
    theme: ThemeMode,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const idlePal = this.getIdlePalette(theme);
    const labels = getLaneLabels(laneCount);
    const keyBaseOffset = noteShape === 'bar' ? 22 : 32;
    const keySize = Math.min(36, Math.max(28, laneWidth - 12));

    for (let i = 0; i < laneCount; i++) {
      const laneIdx = i as LaneIndex;
      const st = lanes[i];
      if (!st) continue;
      const col = laneColors[i] ?? laneColors[0];
      const jammed = st.jamRemainingSec > 0;
      const shakeX = jammed ? (Math.random() - 0.5) * 6 : 0;

      const pressY = st.pressed ? 3 : 0;
      const lipH = st.pressed ? 2 : 5;

      const cx = highwayX + i * laneWidth + laneWidth / 2;
      const rx = cx + shakeX;
      const ry = receptorY + pressY;

      if (jammed) {
        this.drawNoteUnit(
          rx,
          ry,
          laneWidth,
          laneIdx,
          laneCount,
          noteShape,
          BERRY_JAM_PALETTE,
          5,
          true
        );
        this.drawOutlinedText('LOCKED!', cx, ry - 26, 11, '#FF8FA6', '#4F0417', 4);
      } else if (st.pressed || st.hitFlash > 0.08) {
        this.drawNoteUnit(rx, ry, laneWidth, laneIdx, laneCount, noteShape, col, lipH, true);
      } else {
        this.drawReceptorSlot(rx, ry, laneWidth, laneIdx, laneCount, noteShape, idlePal, col.main);
      }

      // Mini ui1.png Squircle Keycap Button (DFJK or SDFJKL) below catcher receptor!
      const keyPressY = st.pressed ? 3 : 0;
      const keyLip = st.pressed ? 2 : 5;
      const keyPal = jammed ? BERRY_JAM_PALETTE : st.pressed ? col : idlePal;

      this.drawJellyPill(
        cx - keySize / 2,
        receptorY + keyBaseOffset + keyPressY,
        keySize,
        keySize,
        11,
        keyPal,
        keyLip,
        true
      );
      this.drawOutlinedText(
        labels[i] ?? '',
        cx,
        receptorY + keyBaseOffset + keyPressY + keySize / 2,
        16,
        '#FFFFFF',
        theme === 'light' && !st.pressed && !jammed ? '#24324A' : keyPal.lip,
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

  private drawHud(
    state: RenderFrameState,
    highwayX: number,
    highwayWidth: number,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const { width, height, stats, difficulty, mode, songTime, totalDurationSec, settings } = state;
    const idlePal = this.getIdlePalette(settings.themeMode);
    const isLight = settings.themeMode === 'light';

    // 1. Top Glossy Progress Pill
    const playerHudPal = difficulty.laneCount === 6 ? laneColors[1] ?? laneColors[0] : laneColors[0];
    const topBarW = Math.max(80, Math.min(440, width - 220));
    const topBarX = (width - topBarW) / 2;
    this.drawJellyPill(topBarX, 12, topBarW, 20, 10, idlePal, 4, false);

    const clampedSongTime = Math.max(0, songTime);
    const pct =
      mode === 'endless'
        ? (clampedSongTime % 30) / 30
        : Math.max(0, Math.min(1, clampedSongTime / Math.max(1, totalDurationSec)));
    const fillW = Math.max(22, (topBarW - 6) * pct);
    this.drawJellyPill(topBarX + 3, 14, fillW, 16, 8, playerHudPal, 0, true);

    const timeLabel =
      mode === 'endless'
        ? `♪ ${state.trackArtist} — ${state.trackTitle} • ${difficulty.name} Endless • ${this.formatTime(
            clampedSongTime
          )}`
        : `♪ ${state.trackArtist} — ${state.trackTitle} • ${difficulty.name} • ${this.formatTime(
            Math.max(0, totalDurationSec - clampedSongTime)
          )}`;
    this.drawOutlinedText(timeLabel, width / 2, 46, 13.5, '#FFFFFF', '#18202E', 4.5);

    // Opening "Now Playing — Music by Creo" banner during countdown & intro!
    if (songTime < 3.5) {
      const fadeAlpha = songTime < 2.5 ? 1 : Math.max(0, 1 - (songTime - 2.5));
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      const badgeW = 290;
      const badgeX = (width - badgeW) / 2;
      const badgeY = 64;
      this.drawJellyPill(badgeX, badgeY, badgeW, 34, 14, laneColors[1], 4, true);
      this.drawOutlinedText(
        `Now Playing: ${state.trackTitle} — Music by ${state.trackArtist}`,
        width / 2,
        badgeY + 17,
        13,
        '#FFFFFF',
        laneColors[1].lip,
        3.8
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
      this.drawOutlinedText('Combo!', comboX, 144, 14, laneColors[0].top, '#151920', 4.5);
    }

    // 3. Anti-Spam Stability Capsule (Top-Right)
    const meterW = 166;
    const meterX = width - meterW - 18;
    const meterY = 14;
    this.drawJellyPill(meterX, meterY, meterW, 48, 16, idlePal, 5, false);

    this.drawOutlinedText(
      'No-Spam Guard',
      meterX + meterW / 2,
      meterY + 15,
      12,
      state.spamHeat > 0.65 ? '#FF7597' : '#FFFFFF',
      '#18202E',
      3.8
    );

    const trackInW = meterW - 22;
    const ctx = this.ctx;
    ctx.fillStyle = isLight ? '#C7D5EA' : '#161A22';
    this.roundRectPath(meterX + 11, meterY + 27, trackInW, 12, 6);
    ctx.fill();

    const heatW = Math.max(0, trackInW * Math.min(1, state.spamHeat));
    if (heatW > 4) {
      const heatPal =
        state.spamHeat > 0.65
          ? BERRY_JAM_PALETTE
          : state.spamHeat > 0.34
          ? laneColors[2]
          : laneColors[1];
      this.drawJellyPill(meterX + 11, meterY + 27, Math.max(12, heatW), 12, 6, heatPal, 0, false);
    }

    // 4. Bottom FNF Tug-of-War Glossy Health Capsule
    const hbWidth = Math.max(120, Math.min(560, width - 44));
    const hbHeight = 22;
    const hbX = (width - hbWidth) / 2;
    const hbY = height - 34;

    this.drawJellyPill(hbX, hbY, hbWidth, hbHeight, 11, BERRY_JAM_PALETTE, 4, false);

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
        stats.hp > 25 ? playerHudPal : laneColors[2],
        0,
        true
      );
    }

    this.drawJellyPill(splitX - 24, hbY - 4, 24, 28, 12, BERRY_JAM_PALETTE, 3, true);
    this.drawJellyPill(splitX + 2, hbY - 4, 24, 28, 12, playerHudPal, 3, true);

    const summary = `Score: ${stats.score.toLocaleString()}   •   Misses: ${
      stats.counts.MISS + stats.counts.SPAM
    }   •   Accuracy: ${state.accuracy.toFixed(1)}% (${state.grade})`;
    this.drawOutlinedText(summary, width / 2, hbY - 13, 14, '#FFFFFF', '#18202E', 4.8);
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
    const isLoading = text === 'Loading...';
    const label = text === 'FUNK!' ? 'Funk!' : text;
    const col = label === 'Funk!' ? '#72FF1D' : '#FFFFFF';
    this.drawOutlinedText(label, 0, 0, isLoading ? 38 : 74, col, '#146B04', isLoading ? 7 : 11);
    ctx.restore();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (w <= 0 || h <= 0 || !Number.isFinite(x + y + w + h + r)) {
      return;
    }
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
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
