import { MusicVisualFrame } from './audio';
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

export interface RenderFrameState {
  width: number;
  height: number;
  songTime: number;
  beatOffsetSec: number;
  totalDurationSec: number;
  mode: GameMode;
  difficulty: DifficultyConfig;
  settings: GameSettings;
  trackTitle: string;
  trackArtist: string;
  currentBpm: number;
  kickPulse: number;
  visuals: MusicVisualFrame;
  notes: NoteBar[];
  lanes: LaneVisualState[];
  stats: RunStats;
  accuracy: number;
  grade: string;
  spamHeat: number;
  popups: FloatingPopup[];
  particles: HitParticle[];
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

    const colorCycle = (timeSec * 0.35) % laneColors.length;
    const idxA = Math.floor(colorCycle) % laneColors.length;
    const idxB = (idxA + 1) % laneColors.length;
    const frac = colorCycle - Math.floor(colorCycle);
    const tintTop = this.lerpHex(laneColors[idxA].main, laneColors[idxB].main, frac);
    const tintBot = this.lerpHex(
      laneColors[(idxA + 2) % laneColors.length].main,
      laneColors[(idxB + 2) % laneColors.length].main,
      frac
    );

    const bg = ctx.createLinearGradient(0, 0, width, height);
    if (isLight) {
      bg.addColorStop(0, this.mixHex('#F3F7FD', tintTop, 0.16));
      bg.addColorStop(0.55, '#E9F0FB');
      bg.addColorStop(1, this.mixHex('#DCE6F6', tintBot, 0.2));
    } else {
      bg.addColorStop(0, this.mixHex('#252B37', tintTop, 0.2));
      bg.addColorStop(0.55, '#202530');
      bg.addColorStop(1, this.mixHex('#191D26', tintBot, 0.24));
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient expanding polygon rings on the menu
    ctx.save();
    for (let r = 0; r < 5; r++) {
      const p = ((timeSec * 0.22 + r * 0.2) % 1 + 1) % 1;
      const rad = 80 + p * Math.hypot(width, height) * 0.55;
      ctx.strokeStyle = this.hexWithAlpha(
        laneColors[r % laneColors.length].main,
        (1 - p) * (isLight ? 0.18 : 0.15)
      );
      ctx.lineWidth = 3;
      this.regularPolygonPath(width / 2, height / 2, rad, 6, timeSec * 0.18 + r * 0.2);
      ctx.stroke();
    }
    ctx.restore();

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

      // 1. Music-Synced Color-Changing & Pattern-Shifting Visualizer Background!
      this.drawMusicSyncedBackdrop(
        width,
        height,
        highwayX,
        highwayWidth,
        songTime,
        state.beatOffsetSec,
        state.currentBpm,
        state.visuals,
        settings.themeMode,
        laneColors
      );

      // 2. Rounded 3D Highway Track
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

  /**
   * Full-screen music-reactive background that shifts colors on every beat/measure
   * and morphs between 4 distinct geometric visualizer patterns on Creo's phrase changes!
   */
  private drawMusicSyncedBackdrop(
    width: number,
    height: number,
    highwayX: number,
    highwayWidth: number,
    songTime: number,
    beatOffsetSec: number,
    bpm: number,
    visuals: MusicVisualFrame,
    theme: ThemeMode,
    laneColors: readonly LaneColorSpec[]
  ): void {
    const ctx = this.ctx;
    const isLight = theme === 'light';
    const { kickPulse, midPulse, spectrum } = visuals;

    const secPerBeat = 60 / Math.max(60, bpm);
    const exactBeat = (songTime - beatOffsetSec) / secPerBeat;
    const beatFloor = Math.floor(exactBeat);
    const beatFrac = ((exactBeat % 1) + 1) % 1;
    const beatSnap = Math.pow(1 - beatFrac, 2.2);

    const measureIdx = Math.floor(exactBeat / 4);
    const nCols = laneColors.length;

    // Smoothly shift primary & secondary colors across the palette on every measure + beat!
    const idxA = ((measureIdx + Math.floor(beatFloor / 2)) % nCols + nCols) % nCols;
    const idxB = (idxA + 1) % nCols;
    const idxC = (idxA + 2) % nCols;
    const smoothT = (((exactBeat / 2) % 1) + 1) % 1;

    const colA = this.lerpHex(laneColors[idxA].main, laneColors[idxB].main, smoothT);
    const colB = this.lerpHex(laneColors[idxB].main, laneColors[idxC].main, smoothT);
    const colC = laneColors[((beatFloor % nCols) + nCols) % nCols].top;

    // 1. Dynamic Beat-Pulsing Color Gradient Sky
    const baseTop = isLight ? '#F2F6FD' : '#1D222E';
    const baseMid = isLight ? '#E6EFFB' : '#181C26';
    const baseBot = isLight ? '#D8E5F7' : '#131720';
    const colorIntensity = Math.min(
      0.48,
      (isLight ? 0.16 : 0.2) + kickPulse * 0.2 + midPulse * 0.12 + beatSnap * 0.07
    );

    const gradAngle = songTime * 0.35;
    const gx = Math.cos(gradAngle) * width * 0.35;
    const bg = ctx.createLinearGradient(width / 2 - gx, 0, width / 2 + gx, height);
    bg.addColorStop(0, this.mixHex(baseTop, colA, colorIntensity));
    bg.addColorStop(0.5, this.mixHex(baseMid, colB, colorIntensity * 0.72));
    bg.addColorStop(1, this.mixHex(baseBot, colC, colorIntensity * 0.95));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 2. Central Bass-Breathing Radial Aura
    const maxRadius = Math.max(80, Math.hypot(width, height) * (0.38 + kickPulse * 0.18));
    const aura = ctx.createRadialGradient(
      width / 2,
      height * 0.5,
      20,
      width / 2,
      height * 0.5,
      maxRadius
    );
    aura.addColorStop(0, this.hexWithAlpha(colA, (isLight ? 0.22 : 0.28) * (0.45 + kickPulse)));
    aura.addColorStop(0.55, this.hexWithAlpha(colB, (isLight ? 0.1 : 0.14) * (0.4 + midPulse)));
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, width, height);

    // 3. Switch Geometric Visualizer Pattern every 4 measures (16 beats = 1 musical phrase)
    //    with a smooth 1-beat crossfade between pattern modes!
    const phrasePos = exactBeat / 16;
    const modeIdx = ((Math.floor(phrasePos) % 4) + 4) % 4;
    const nextModeIdx = (modeIdx + 1) % 4;
    const phraseFrac = ((phrasePos % 1) + 1) % 1;
    const crossfade = phraseFrac > 0.92 ? (phraseFrac - 0.92) / 0.08 : 0;

    this.drawPatternLayer(
      modeIdx,
      1 - crossfade,
      width,
      height,
      highwayX,
      highwayWidth,
      exactBeat,
      beatSnap,
      visuals,
      isLight,
      colA,
      colB,
      colC,
      laneColors
    );
    if (crossfade > 0.01) {
      this.drawPatternLayer(
        nextModeIdx,
        crossfade,
        width,
        height,
        highwayX,
        highwayWidth,
        exactBeat,
        beatSnap,
        visuals,
        isLight,
        colA,
        colB,
        colC,
        laneColors
      );
    }

    // 4. Always-On Live 16-Band Spectrum Equalizer Wings Hugging the Highway!
    this.drawHighwayEdgeSpectrum(
      width,
      height,
      highwayX,
      highwayWidth,
      spectrum,
      kickPulse,
      isLight,
      colA,
      colB
    );
  }

  private drawPatternLayer(
    mode: number,
    layerAlpha: number,
    width: number,
    height: number,
    highwayX: number,
    highwayWidth: number,
    exactBeat: number,
    beatSnap: number,
    visuals: MusicVisualFrame,
    isLight: boolean,
    colA: string,
    colB: string,
    colC: string,
    laneColors: readonly LaneColorSpec[]
  ): void {
    if (layerAlpha <= 0.01) return;
    const ctx = this.ctx;
    const { kickPulse, midPulse, highPulse, spectrum } = visuals;
    const cx = width / 2;
    const cy = height * 0.48;

    ctx.save();

    if (mode === 0) {
      // PATTERN 0: Expanding Beat-Locked Polygon Tunnel & Shockwaves
      const ringCount = 7;
      const maxR = Math.hypot(width, height) * 0.62;
      const sides = Math.floor(exactBeat / 8) % 2 === 0 ? 6 : 8;
      for (let i = 0; i < ringCount; i++) {
        const p = (((exactBeat * 0.25 + i / ringCount) % 1) + 1) % 1;
        const r = 40 + p * maxR + kickPulse * 24;
        const alpha =
          layerAlpha *
          Math.sin(p * Math.PI) *
          ((isLight ? 0.28 : 0.34) + kickPulse * 0.22);
        const col = i % 2 === 0 ? colA : colB;
        ctx.strokeStyle = this.hexWithAlpha(col, alpha);
        ctx.lineWidth = 2.5 + kickPulse * 5 + beatSnap * 2.5;
        const rot = exactBeat * 0.14 * (i % 2 === 0 ? 1 : -1) + midPulse * 0.25;
        this.regularPolygonPath(cx, cy, r, sides, rot);
        ctx.stroke();
      }
    } else if (mode === 1) {
      // PATTERN 1: Concert Laser Beams & Symmetrical Horizontal Wing Equalizers
      const beamCount = 6;
      for (let i = 0; i < beamCount; i++) {
        const side = i < beamCount / 2 ? -1 : 1;
        const localIdx = i % (beamCount / 2);
        const anchorX =
          side < 0
            ? highwayX * ((localIdx + 0.5) / (beamCount / 2))
            : highwayX + highwayWidth + (width - (highwayX + highwayWidth)) * ((localIdx + 0.5) / (beamCount / 2));
        const sway = Math.sin(exactBeat * 0.85 + i * 1.2) * 140;
        const spread = 75 + kickPulse * 65 + (spectrum[i * 2] ?? 0) * 45;
        const beamCol = laneColors[i % laneColors.length].main;

        ctx.fillStyle = this.hexWithAlpha(
          beamCol,
          layerAlpha * ((isLight ? 0.13 : 0.14) + kickPulse * 0.12)
        );
        ctx.beginPath();
        ctx.moveTo(anchorX, -10);
        ctx.lineTo(anchorX + sway - spread, height + 10);
        ctx.lineTo(anchorX + sway + spread, height + 10);
        ctx.closePath();
        ctx.fill();
      }

      // Outer wing floating equalizer bars
      const wingMaxW = Math.max(0, highwayX - 36);
      if (wingMaxW > 40) {
        const rows = 12;
        const rowStep = (height - 140) / rows;
        for (let r = 0; r < rows; r++) {
          const band = spectrum[r % spectrum.length] ?? 0;
          const barLen = Math.max(12, wingMaxW * (0.14 + band * 0.74));
          const y = 76 + r * rowStep;
          const barCol = r % 2 === 0 ? colA : colB;
          ctx.fillStyle = this.hexWithAlpha(
            barCol,
            layerAlpha * ((isLight ? 0.24 : 0.28) + band * 0.25)
          );
          this.roundRectPath(18, y, barLen, Math.max(8, rowStep * 0.54), 6);
          ctx.fill();
          this.roundRectPath(width - 18 - barLen, y, barLen, Math.max(8, rowStep * 0.54), 6);
          ctx.fill();
        }
      }
    } else if (mode === 2) {
      // PATTERN 2: Kaleidoscope Prism / Diamond Wave Grid across both side wings
      const cell = 76;
      const cols = Math.ceil(width / cell) + 1;
      const rows = Math.ceil(height / cell) + 1;
      for (let gx = 0; gx < cols; gx++) {
        const x = gx * cell + (gx % 2 === 0 ? 0 : 0);
        // Keep central highway clean
        if (x > highwayX - 18 && x < highwayX + highwayWidth + 18) continue;
        for (let gy = 0; gy < rows; gy++) {
          const y = gy * cell;
          const dist = Math.hypot(x - cx, y - cy) / 140;
          const wave = 0.5 + 0.5 * Math.sin(exactBeat * Math.PI - dist * 1.35);
          const band = spectrum[(gx + gy) % spectrum.length] ?? 0;
          const size = 8 + wave * 16 + band * 12 + kickPulse * 6;
          const palCol = laneColors[(gx + gy + Math.floor(exactBeat)) % laneColors.length].main;
          const alpha = layerAlpha * ((isLight ? 0.16 : 0.2) + wave * 0.18);

          ctx.fillStyle = this.hexWithAlpha(palCol, alpha);
          ctx.strokeStyle = this.hexWithAlpha(colC, alpha * 0.9);
          ctx.lineWidth = 2;
          this.regularPolygonPath(x, y, size, 4, exactBeat * 0.35 + dist * 0.2);
          ctx.fill();
          ctx.stroke();
        }
      }
    } else {
      // PATTERN 3: Rotating Concert Sunburst Rays & Rising Beat Bokeh Orbs
      const rayCount = 16;
      const outerR = Math.hypot(width, height) * 0.75;
      const baseRot = exactBeat * 0.18;
      for (let i = 0; i < rayCount; i++) {
        if (i % 2 !== 0) continue;
        const a0 = baseRot + (i / rayCount) * Math.PI * 2;
        const a1 = baseRot + ((i + 0.55 + kickPulse * 0.25) / rayCount) * Math.PI * 2;
        const rayCol = i % 4 === 0 ? colA : colB;
        ctx.fillStyle = this.hexWithAlpha(
          rayCol,
          layerAlpha * ((isLight ? 0.11 : 0.13) + midPulse * 0.12 + beatSnap * 0.06)
        );
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * outerR, cy + Math.sin(a0) * outerR);
        ctx.lineTo(cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR);
        ctx.closePath();
        ctx.fill();
      }

      // Rising beat-pulsing neon rings on the left & right wings
      const orbCount = 18;
      for (let i = 0; i < orbCount; i++) {
        const isLeft = i % 2 === 0;
        const wingW = Math.max(40, highwayX - 30);
        const seed = (i * 0.6180339887) % 1;
        const ox = isLeft
          ? 20 + seed * wingW
          : highwayX + highwayWidth + 10 + seed * wingW;
        const speed = 75 + (i % 5) * 28;
        const oy = height + 40 - (((exactBeat * speed + i * 95) % (height + 80)) + height + 80) % (height + 80);
        const band = spectrum[i % spectrum.length] ?? 0;
        const r = Math.max(6, 12 + (i % 4) * 6 + band * 16 + highPulse * 8);
        const orbCol = laneColors[i % laneColors.length].main;

        ctx.fillStyle = this.hexWithAlpha(orbCol, layerAlpha * (isLight ? 0.2 : 0.24));
        ctx.strokeStyle = this.hexWithAlpha(orbCol, layerAlpha * 0.48);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Symmetrical 16-band spectrum equalizer bars hugging the left and right edges of the highway!
   */
  private drawHighwayEdgeSpectrum(
    width: number,
    height: number,
    highwayX: number,
    highwayWidth: number,
    spectrum: readonly number[],
    kickPulse: number,
    isLight: boolean,
    colA: string,
    colB: string
  ): void {
    const availWing = highwayX - 16;
    if (availWing < 24 || width < highwayWidth + 60) return;

    const ctx = this.ctx;
    const bandCount = spectrum.length;
    const topStart = 88;
    const bottomEnd = height - 92;
    const spanH = Math.max(120, bottomEnd - topStart);
    const slotH = spanH / bandCount;
    const barH = Math.max(6, slotH * 0.66);
    const maxBarW = Math.min(130, availWing * 0.52);

    ctx.save();
    for (let i = 0; i < bandCount; i++) {
      // Put punchy bass near the bottom receptor zone and sparkling highs near the top!
      const val = spectrum[bandCount - 1 - i] ?? 0;
      const w = Math.max(6, val * maxBarW + kickPulse * 10);
      const y = topStart + i * slotH;
      const t = i / Math.max(1, bandCount - 1);
      const col = this.lerpHex(colB, colA, t);
      const alpha = (isLight ? 0.34 : 0.42) * (0.35 + val * 0.65);

      ctx.fillStyle = this.hexWithAlpha(col, alpha);
      // Left highway wing (growing leftward from highwayX - 8)
      this.roundRectPath(highwayX - 8 - w, y, w, barH, barH / 2);
      ctx.fill();
      // Right highway wing (growing rightward from highwayX + highwayWidth + 8)
      this.roundRectPath(highwayX + highwayWidth + 8, y, w, barH, barH / 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private regularPolygonPath(
    cx: number,
    cy: number,
    radius: number,
    sides: number,
    rotationRad = 0
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (radius <= 0 || sides < 3) return;
    for (let i = 0; i < sides; i++) {
      const a = rotationRad + (i / sides) * Math.PI * 2;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
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
    const trackBottomY = height - 62;

    for (const note of notes) {
      if (note.time - songTime > maxFutureSec) break;
      if (note.hit && (note.duration === 0 || note.holdCompleted)) continue;

      const headY = receptorY - (note.time - songTime) * scrollSpeed;
      const endTime = note.time + note.duration;
      const tailY = receptorY - (endTime - songTime) * scrollSpeed;

      const lowestY = Math.max(headY, tailY);
      const highestY = Math.min(headY, tailY);
      if (lowestY < -50 || highestY > trackBottomY) continue;

      const pal = laneColors[note.lane] ?? laneColors[0];
      const cx = highwayX + note.lane * laneWidth + laneWidth / 2;

      // 1. Glossy vertical Hold Sustain Trail
      if (note.duration > 0) {
        const clampBottomY = note.holding ? receptorY : Math.min(headY, trackBottomY);
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
      if (!note.hit && headY <= trackBottomY) {
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

    this.drawJellyPill(splitX - 8, hbY - 4, 16, 28, 8, idlePal, 3, true);

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

  private parseHexRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }

  private lerpHex(hexA: string, hexB: string, t: number): string {
    const [r1, g1, b1] = this.parseHexRgb(hexA);
    const [r2, g2, b2] = this.parseHexRgb(hexB);
    const k = Math.max(0, Math.min(1, t));
    const r = Math.round(r1 + (r2 - r1) * k);
    const g = Math.round(g1 + (g2 - g1) * k);
    const b = Math.round(b1 + (b2 - b1) * k);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
      .toString(16)
      .padStart(2, '0')}`;
  }

  private mixHex(baseHex: string, tintHex: string, amount: number): string {
    return this.lerpHex(baseHex, tintHex, amount);
  }

  private hexWithAlpha(hex: string, alpha: number): string {
    const [r, g, b] = this.parseHexRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  private formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  }
}
