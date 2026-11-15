import './style.css';
import { DIFFICULTIES, DIFFICULTY_ORDER } from './difficulties';
import { RhythmGame } from './game';
import { DifficultyId, GameMode, ScreenState } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuScreen = document.getElementById('menu-screen') as HTMLDivElement;
const pauseScreen = document.getElementById('pause-screen') as HTMLDivElement;
const resultsScreen = document.getElementById('results-screen') as HTMLDivElement;
const diffGrid = document.getElementById('difficulty-grid') as HTMLDivElement;

const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnMute = document.getElementById('btn-mute') as HTMLButtonElement;
const iconSoundOn = document.querySelector('#icon-sound-on')!;
const iconSoundOff = document.querySelector('#icon-sound-off')!;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnRestartPause = document.getElementById('btn-restart-pause') as HTMLButtonElement;
const btnMenuPause = document.getElementById('btn-menu-pause') as HTMLButtonElement;

const btnGearResults = document.getElementById('btn-gear-results') as HTMLButtonElement;
const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;
const btnMenuResults = document.getElementById('btn-menu-results') as HTMLButtonElement;

const DIFF_THEME_CLASS: Record<DifficultyId, string> = {
  easy: 'theme-green',
  normal: 'theme-cyan',
  hard: 'theme-gold',
  insane: 'theme-berry',
};

let selectedDiff: DifficultyId = 'normal';
let selectedMode: GameMode = 'stage';

const game = new RhythmGame(canvas, {
  onStateChange: handleScreenStateChange,
});

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function updateMuteUi(muted: boolean): void {
  iconSoundOn.classList.toggle('hidden', muted);
  iconSoundOff.classList.toggle('hidden', !muted);
  btnMute.classList.toggle('theme-green', !muted);
  btnMute.classList.toggle('theme-slate', muted);
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
  if (game.state === 'playing') game.pauseRun();
  else if (game.state === 'paused') game.resumeRun();
});

btnMute.addEventListener('click', () => {
  updateMuteUi(game.audio.toggleMute());
});

btnResume.addEventListener('click', () => game.resumeRun());
btnRestartPause.addEventListener('click', () => game.startRun(selectedDiff, selectedMode));
btnMenuPause.addEventListener('click', () => game.returnToMenu());

btnGearResults.addEventListener('click', () => game.returnToMenu());
btnRetry.addEventListener('click', () => game.startRun(selectedDiff, selectedMode));
btnMenuResults.addEventListener('click', () => game.returnToMenu());

// Menu keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

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

renderDifficultyCards();

function loop(now: number): void {
  game.tick(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
