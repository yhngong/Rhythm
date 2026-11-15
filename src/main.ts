import './style.css';
import { DIFFICULTIES, DIFFICULTY_ORDER, LANE_LABELS } from './difficulties';
import { RhythmGame } from './game';
import { GameRenderer } from './renderer';
import {
  DEFAULT_SETTINGS,
  NOTE_PALETTE_ORDER,
  NOTE_PALETTES,
  NOTE_SHAPE_OPTIONS,
  NoteShape,
  ThemeMode,
} from './settings';
import { DifficultyId, GameMode, ScreenState } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuScreen = document.getElementById('menu-screen') as HTMLDivElement;
const pauseScreen = document.getElementById('pause-screen') as HTMLDivElement;
const resultsScreen = document.getElementById('results-screen') as HTMLDivElement;
const settingsScreen = document.getElementById('settings-screen') as HTMLDivElement;
const diffGrid = document.getElementById('difficulty-grid') as HTMLDivElement;
const menuDemoLanes = document.getElementById('menu-demo-lanes') as HTMLDivElement;

const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnMute = document.getElementById('btn-mute') as HTMLButtonElement;
const btnSettingsTop = document.getElementById('btn-settings-top') as HTMLButtonElement;
const iconSoundOn = document.querySelector('#icon-sound-on')!;
const iconSoundOff = document.querySelector('#icon-sound-off')!;

const btnSettingsMenu = document.getElementById('btn-settings-menu') as HTMLButtonElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;

const btnSettingsPause = document.getElementById('btn-settings-pause') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnRestartPause = document.getElementById('btn-restart-pause') as HTMLButtonElement;
const btnMenuPause = document.getElementById('btn-menu-pause') as HTMLButtonElement;

const btnGearResults = document.getElementById('btn-gear-results') as HTMLButtonElement;
const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;
const btnMenuResults = document.getElementById('btn-menu-results') as HTMLButtonElement;

// Settings Modal Elements
const previewCanvas = document.getElementById('settings-preview-canvas') as HTMLCanvasElement;
const previewSummaryTag = document.getElementById('preview-summary-tag') as HTMLSpanElement;
const shapeGrid = document.getElementById('shape-grid') as HTMLDivElement;
const paletteGrid = document.getElementById('palette-grid') as HTMLDivElement;
const sliderMaster = document.getElementById('slider-master') as HTMLInputElement;
const sliderMusic = document.getElementById('slider-music') as HTMLInputElement;
const sliderSfx = document.getElementById('slider-sfx') as HTMLInputElement;
const valMaster = document.getElementById('val-master') as HTMLSpanElement;
const valMusic = document.getElementById('val-music') as HTMLSpanElement;
const valSfx = document.getElementById('val-sfx') as HTMLSpanElement;
const btnResetSettings = document.getElementById('btn-reset-settings') as HTMLButtonElement;
const btnDoneSettings = document.getElementById('btn-done-settings') as HTMLButtonElement;
const btnXSettings = document.getElementById('btn-x-settings') as HTMLButtonElement;

const DIFF_THEME_CLASS: Record<DifficultyId, string> = {
  easy: 'theme-green',
  normal: 'theme-cyan',
  hard: 'theme-gold',
  insane: 'theme-berry',
};

const SHAPE_ICONS: Record<NoteShape, string> = {
  bar: '▬',
  circle: '●',
  diamond: '◆',
  arrow: '◀▼▲▶',
};

const ARROW_DEMO_GLYPHS = ['◀', '▼', '▲', '▶'] as const;

let selectedDiff: DifficultyId = 'normal';
let selectedMode: GameMode = 'stage';

const game = new RhythmGame(canvas, {
  onStateChange: handleScreenStateChange,
});

function resizeCanvas(): void {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(320, window.innerHeight);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function applyThemeToDom(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}

function updateMuteUi(muted: boolean): void {
  iconSoundOn.classList.toggle('hidden', muted);
  iconSoundOff.classList.toggle('hidden', !muted);
  btnMute.classList.toggle('theme-green', !muted);
  btnMute.classList.toggle('theme-slate', muted);
}

function renderMenuDemoLanes(): void {
  const { noteShape, notePalette } = game.settings;
  const lanes = (NOTE_PALETTES[notePalette] ?? NOTE_PALETTES.candy).lanes;
  menuDemoLanes.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const col = lanes[i];
    const vars = `--c-top:${col.top};--c-mid:${col.main};--c-bot:${col.bottom};--c-lip:${col.lip};`;
    const arrowChar = noteShape === 'arrow' ? ARROW_DEMO_GLYPHS[i] : '';
    const shineHtml =
      noteShape === 'bar' || noteShape === 'circle' ? '<span class="shine-dots mini"></span>' : '';

    const laneEl = document.createElement('div');
    laneEl.className = 'demo-lane';
    laneEl.innerHTML = `
      <div class="demo-bar shape-${noteShape}" style="${vars}">${shineHtml}${arrowChar}</div>
      <kbd style="${vars}">${LANE_LABELS[i]}</kbd>
    `;
    menuDemoLanes.appendChild(laneEl);
  }
}

function renderDifficultyCards(): void {
  diffGrid.innerHTML = '';
  for (const id of DIFFICULTY_ORDER) {
    const cfg = DIFFICULTIES[id];
    const best = game.getHighScore(id, selectedMode);
    const isSelected = id === selectedDiff;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `diff-card ${DIFF_THEME_CLASS[id]}${isSelected ? ' selected' : ''}`;

    const bestLine = best
      ? `Best: ${best.bestScore.toLocaleString()} • ${best.bestAccuracy.toFixed(1)}% (${best.bestGrade})`
      : 'No record yet — randomized chart!';

    card.innerHTML = `
      ${isSelected ? '<span class="shine-dots"></span>' : ''}
      <div class="diff-top">
        <span class="diff-name">${cfg.name}</span>
        <span class="diff-badge">${cfg.badgeText}</span>
      </div>
      <p class="diff-desc">${cfg.description}</p>
      <div class="diff-best">${bestLine}</div>
    `;

    card.addEventListener('click', () => {
      selectedDiff = id;
      game.audio.playUiSelect();
      renderDifficultyCards();
    });

    card.addEventListener('dblclick', () => {
      selectedDiff = id;
      game.startRun(selectedDiff, selectedMode);
    });

    diffGrid.appendChild(card);
  }
}

function syncSettingsUi(): void {
  const s = game.settings;
  applyThemeToDom(s.themeMode);
  renderMenuDemoLanes();

  // Theme buttons
  document.querySelectorAll<HTMLButtonElement>('.theme-mode-btn').forEach((btn) => {
    const isActive = btn.dataset.themeMode === s.themeMode;
    btn.classList.toggle('theme-green', isActive);
    btn.classList.toggle('theme-slate', !isActive);
  });

  // Shape grid
  shapeGrid.innerHTML = '';
  for (const opt of NOTE_SHAPE_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `shape-option-btn${s.noteShape === opt.id ? ' active' : ''}`;
    btn.innerHTML = `
      <span class="shape-icon">${SHAPE_ICONS[opt.id]}</span>
      <span class="shape-title">${opt.name}</span>
      <span class="shape-sub">${opt.badge}</span>
    `;
    btn.addEventListener('click', () => {
      game.updateSettings({ noteShape: opt.id });
      game.audio.playUiSelect();
      syncSettingsUi();
    });
    shapeGrid.appendChild(btn);
  }

  // Palette grid
  paletteGrid.innerHTML = '';
  for (const palId of NOTE_PALETTE_ORDER) {
    const pal = NOTE_PALETTES[palId];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `palette-option-btn${s.notePalette === palId ? ' active' : ''}`;
    const dotsHtml = pal.lanes
      .map((c) => `<span class="swatch-dot" style="background:${c.main}"></span>`)
      .join('');
    btn.innerHTML = `
      <span>${pal.name}</span>
      <span class="swatch-dots">${dotsHtml}</span>
    `;
    btn.addEventListener('click', () => {
      game.updateSettings({ notePalette: palId });
      game.audio.playUiSelect();
      syncSettingsUi();
    });
    paletteGrid.appendChild(btn);
  }

  // Preview summary label
  const shapeObj = NOTE_SHAPE_OPTIONS.find((o) => o.id === s.noteShape);
  const palObj = NOTE_PALETTES[s.notePalette];
  previewSummaryTag.textContent = `${shapeObj?.name ?? 'Glossy Bar'} • ${palObj?.name ?? 'Candy Classic'}`;

  // Volume sliders
  const masterPct = Math.round(s.masterVolume * 100);
  const musicPct = Math.round(s.musicVolume * 100);
  const sfxPct = Math.round(s.sfxVolume * 100);
  sliderMaster.value = String(masterPct);
  sliderMusic.value = String(musicPct);
  sliderSfx.value = String(sfxPct);
  valMaster.textContent = `${masterPct}%`;
  valMusic.textContent = `${musicPct}%`;
  valSfx.textContent = `${sfxPct}%`;
}

function openSettings(): void {
  btnSettingsTop.blur();
  if (game.state === 'playing') {
    game.pauseRun();
  }
  game.isSettingsOpen = true;
  syncSettingsUi();
  settingsScreen.classList.remove('hidden');
  game.audio.playUiSelect();
}

function closeSettings(): void {
  if (!game.isSettingsOpen) return;
  game.isSettingsOpen = false;
  settingsScreen.classList.add('hidden');
  game.audio.playUiSelect();
}

// Theme toggle buttons
document.querySelectorAll<HTMLButtonElement>('.theme-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.themeMode === 'light' ? 'light' : 'dark';
    game.updateSettings({ themeMode: mode });
    game.audio.playUiSelect();
    syncSettingsUi();
  });
});

// Volume slider listeners
sliderMaster.addEventListener('input', () => {
  const v = Number(sliderMaster.value) / 100;
  valMaster.textContent = `${Math.round(v * 100)}%`;
  if (v > 0 && game.audio.getMuted()) {
    updateMuteUi(game.audio.setMuted(false));
  }
  game.updateSettings({ masterVolume: v });
});

sliderMusic.addEventListener('input', () => {
  const v = Number(sliderMusic.value) / 100;
  valMusic.textContent = `${Math.round(v * 100)}%`;
  game.updateSettings({ musicVolume: v });
});

let lastSfxSampleTime = 0;
sliderSfx.addEventListener('input', () => {
  const v = Number(sliderSfx.value) / 100;
  valSfx.textContent = `${Math.round(v * 100)}%`;
  game.updateSettings({ sfxVolume: v });
  const now = performance.now();
  if (now - lastSfxSampleTime > 90) {
    lastSfxSampleTime = now;
    game.audio.playPlayerHit(true);
  }
});

btnResetSettings.addEventListener('click', () => {
  game.updateSettings({ ...DEFAULT_SETTINGS });
  if (game.audio.getMuted()) {
    updateMuteUi(game.audio.setMuted(false));
  }
  game.audio.playUiSelect();
  syncSettingsUi();
});

btnSettingsTop.addEventListener('click', () => {
  if (game.isSettingsOpen) closeSettings();
  else openSettings();
});
btnSettingsMenu.addEventListener('click', openSettings);
btnSettingsPause.addEventListener('click', openSettings);
btnGearResults.addEventListener('click', openSettings);

btnDoneSettings.addEventListener('click', closeSettings);
btnXSettings.addEventListener('click', closeSettings);
settingsScreen.addEventListener('click', (e) => {
  if (e.target === settingsScreen) {
    closeSettings();
  }
});

// Mode switcher pills
document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((b) => {
      b.classList.remove('active', 'theme-green');
      b.classList.add('theme-slate');
    });
    btn.classList.remove('theme-slate');
    btn.classList.add('active', 'theme-green');
    selectedMode = (btn.dataset.mode as GameMode) || 'stage';
    game.audio.playUiSelect();
    renderDifficultyCards();
  });
});

btnStart.addEventListener('click', () => {
  game.startRun(selectedDiff, selectedMode);
});

btnPause.addEventListener('click', () => {
  btnPause.blur();
  if (game.isSettingsOpen) {
    closeSettings();
    return;
  }
  if (game.state === 'playing') game.pauseRun();
  else if (game.state === 'paused') game.resumeRun();
});

btnMute.addEventListener('click', () => {
  btnMute.blur();
  updateMuteUi(game.audio.toggleMute());
});

btnResume.addEventListener('click', () => game.resumeRun());
btnRestartPause.addEventListener('click', () => game.startRun(selectedDiff, selectedMode));
btnMenuPause.addEventListener('click', () => game.returnToMenu());

btnRetry.addEventListener('click', () => game.startRun(selectedDiff, selectedMode));
btnMenuResults.addEventListener('click', () => game.returnToMenu());

// Menu & Settings keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

  if (game.isSettingsOpen) {
    if (key === 'escape' || key === 'enter') {
      e.preventDefault();
      closeSettings();
    }
    return;
  }

  if (key === 'm') {
    updateMuteUi(game.audio.toggleMute());
    return;
  }

  if (game.state !== 'menu') return;

  if (key === '1' || key === '2' || key === '3' || key === '4') {
    selectedDiff = DIFFICULTY_ORDER[Number(key) - 1];
    game.audio.playUiSelect();
    renderDifficultyCards();
  } else if (key === 'arrowright' || key === 'arrowdown') {
    const idx = (DIFFICULTY_ORDER.indexOf(selectedDiff) + 1) % DIFFICULTY_ORDER.length;
    selectedDiff = DIFFICULTY_ORDER[idx];
    game.audio.playUiSelect();
    renderDifficultyCards();
  } else if (key === 'arrowleft' || key === 'arrowup') {
    const idx =
      (DIFFICULTY_ORDER.indexOf(selectedDiff) - 1 + DIFFICULTY_ORDER.length) %
      DIFFICULTY_ORDER.length;
    selectedDiff = DIFFICULTY_ORDER[idx];
    game.audio.playUiSelect();
    renderDifficultyCards();
  } else if (key === 'enter' || key === ' ') {
    e.preventDefault();
    game.startRun(selectedDiff, selectedMode);
  }
});

function handleScreenStateChange(state: ScreenState): void {
  menuScreen.classList.toggle('hidden', state !== 'menu');
  pauseScreen.classList.toggle('hidden', state !== 'paused');
  resultsScreen.classList.toggle('hidden', state !== 'results' && state !== 'gameover');
  btnPause.classList.toggle('hidden', state !== 'playing' && state !== 'paused');

  if (state === 'menu') {
    renderDifficultyCards();
  } else if (state === 'paused') {
    const t = game.currentTrack;
    const pauseCredit = document.getElementById('pause-track-credit') as HTMLElement;
    pauseCredit.innerHTML = `♪ Playing: <strong>${t.title}</strong> &mdash; Music by <a href="${t.url}" target="_blank" rel="noopener noreferrer">Creo</a>`;
  } else if (state === 'results' || state === 'gameover') {
    populateResultsModal(state === 'results');
  }
}

function populateResultsModal(cleared: boolean): void {
  const badge = document.getElementById('res-badge') as HTMLDivElement;
  const title = document.getElementById('res-title') as HTMLHeadingElement;
  const gradeOrb = document.getElementById('res-grade') as HTMLDivElement;
  const gradeText = document.getElementById('res-grade-text') as HTMLSpanElement;

  const cfg = DIFFICULTIES[game.selectedDifficulty];
  const t = game.currentTrack;
  const resCredit = document.getElementById('res-track-credit') as HTMLElement;
  resCredit.innerHTML = `♪ Song: <strong>${t.title}</strong> &bull; Music by <a href="${t.url}" target="_blank" rel="noopener noreferrer">Creo</a>`;
  gradeOrb.className = 'grade-orb';

  if (cleared) {
    badge.textContent = `${cfg.name.toUpperCase()} COMPLETE`;
    title.textContent = 'Track Cleared!';
    const g = game.getGrade();
    gradeText.textContent = g;
    gradeOrb.classList.add(
      g.startsWith('S') ? 'theme-cyan' : g === 'A' ? 'theme-green' : 'theme-gold'
    );
  } else {
    badge.textContent = `${cfg.name.toUpperCase()} • HEALTH OUT`;
    title.textContent = 'Knocked Out!';
    gradeText.textContent = 'KO';
    gradeOrb.classList.add('theme-berry');
  }

  (document.getElementById('res-score') as HTMLElement).textContent =
    game.stats.score.toLocaleString();
  (document.getElementById('res-acc') as HTMLElement).textContent = `${game
    .getAccuracy()
    .toFixed(1)}%`;
  (document.getElementById('res-combo') as HTMLElement).textContent = `${game.stats.maxCombo}x`;

  (document.getElementById('bd-sick') as HTMLElement).textContent = String(game.stats.counts.SICK);
  (document.getElementById('bd-good') as HTMLElement).textContent = String(game.stats.counts.GOOD);
  (document.getElementById('bd-bad') as HTMLElement).textContent = String(game.stats.counts.BAD);
  (document.getElementById('bd-shit') as HTMLElement).textContent = String(game.stats.counts.SHIT);
  (document.getElementById('bd-miss') as HTMLElement).textContent = String(game.stats.counts.MISS);
  (document.getElementById('bd-spam') as HTMLElement).textContent = String(game.stats.counts.SPAM);
}

// Initialize theme, menu demo bars, and difficulty cards from persisted settings!
syncSettingsUi();
renderDifficultyCards();

function loop(now: number): void {
  requestAnimationFrame(loop);
  try {
    game.tick(now);
    if (game.isSettingsOpen) {
      GameRenderer.renderSettingsPreview(previewCanvas, game.settings, now / 1000);
    }
  } catch (err) {
    console.error('Frame tick error:', err);
  }
}
requestAnimationFrame(loop);
