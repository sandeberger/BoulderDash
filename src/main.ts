import { Engine } from './game/Engine';
import { Renderer } from './game/Renderer';
import { TouchControls } from './controls/TouchControls';
import { SoundManager } from './audio/SoundManager';
import { Direction } from './game/types';
import { registerServiceWorker, setupInstallPrompt } from './pwa/register';
import { LEVELS } from './game/levels';

// ── DOM elements ──
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuScreen = document.getElementById('menu-screen') as HTMLElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const hudEl = document.getElementById('hud') as HTMLElement;
const hudDiamonds = document.getElementById('hud-diamonds') as HTMLElement;
const hudTime = document.getElementById('hud-time') as HTMLElement;
const hudScore = document.getElementById('hud-score') as HTMLElement;
const hudLives = document.getElementById('hud-lives') as HTMLElement;
const levelAnnounce = document.getElementById('level-announce') as HTMLElement;
const levelAnnounceText = document.getElementById('level-announce-text') as HTMLElement;
const levelAnnounceSub = document.getElementById('level-announce-sub') as HTMLElement;
const gameOverScreen = document.getElementById('game-over-screen') as HTMLElement;
const gameOverTitle = document.getElementById('gameover-title') as HTMLElement;
const gameOverScore = document.getElementById('gameover-score') as HTMLElement;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement;
const dpadContainer = document.getElementById('dpad-container') as HTMLElement;
const throwBtn = document.getElementById('throw-btn') as HTMLButtonElement;
const shurikenCount = document.getElementById('shuriken-count') as HTMLElement;

// ── Game state ──
type AppState = 'menu' | 'playing' | 'level-announce' | 'dead' | 'gameover' | 'level-complete';
let appState: AppState = 'menu';
let engine: Engine;
let renderer: Renderer;
let controls: TouchControls;
let sound: SoundManager;
let lastTime = 0;
let announceTimer = 0;
let deadTimer = 0;
let levelCompleteTimer = 0;
let prevExitOpen = false;
let prevDiamonds = 0;

// Track previous tile states for sound effects
let prevPlayerPos = { row: 0, col: 0 };

// ── Init ──
function init() {
  engine = new Engine();
  renderer = new Renderer(canvas);
  sound = new SoundManager();

  controls = new TouchControls(dpadContainer, (dir: Direction) => {
    engine.setInput(dir);
  });

  window.addEventListener('resize', () => {
    renderer.resize();
    controls.resize();
  });

  // Menu
  btnStart.addEventListener('click', () => {
    sound.init();
    startGame();
  });
  btnStart.addEventListener('touchend', (e) => {
    e.preventDefault();
    sound.init();
    startGame();
  });

  btnRestart.addEventListener('click', () => {
    gameOverScreen.style.display = 'none';
    engine = new Engine();
    startGame();
  });

  // Throw button
  const doThrow = () => {
    if (appState === 'playing' && engine.state.shurikens > 0) {
      engine.throwShuriken();
      sound.playThrow();
    }
  };
  throwBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doThrow();
    throwBtn.classList.add('active');
  });
  throwBtn.addEventListener('touchend', () => {
    throwBtn.classList.remove('active');
  });
  throwBtn.addEventListener('mousedown', doThrow);
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'KeyF') && appState === 'playing') {
      e.preventDefault();
      doThrow();
    }
  });

  // Konami code: ↑↑↓↓←→←→BA → skip to next level
  const konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
  let konamiIdx = 0;
  let konamiTimer = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === konamiSeq[konamiIdx]) {
      konamiIdx++;
      konamiTimer = Date.now();
      if (konamiIdx === konamiSeq.length) {
        konamiIdx = 0;
        activateKonami();
      }
    } else {
      konamiIdx = e.code === konamiSeq[0] ? 1 : 0;
    }
  });
  // Reset if too slow (3s timeout)
  setInterval(() => {
    if (konamiIdx > 0 && Date.now() - konamiTimer > 3000) konamiIdx = 0;
  }, 500);

  // PWA
  registerServiceWorker();
  setupInstallPrompt();

  // Start background animation
  requestAnimationFrame(loop);
}

function activateKonami() {
  if (appState !== 'playing' && appState !== 'level-announce') return;
  // Flash effect
  const s = engine.state;
  engine.spawnParticles(s.playerCol, s.playerRow, '#ffff00', 30);
  engine.spawnParticles(s.playerCol, s.playerRow, '#ff00ff', 20);
  s.screenShake = 5;
  sound.playLevelComplete();
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

  // Skip to next level after short delay
  setTimeout(() => {
    engine.nextLevel();
    prevExitOpen = false;
    prevDiamonds = 0;
    prevPlayerPos = { row: engine.state.playerRow, col: engine.state.playerCol };
    appState = 'level-announce';
    announceTimer = 2000;
    showLevelAnnounce();
  }, 500);
}

function startGame() {
  menuScreen.style.display = 'none';
  hudEl.style.display = 'flex';
  appState = 'level-announce';
  announceTimer = 2000;
  showLevelAnnounce();
  prevExitOpen = false;
  prevDiamonds = 0;
  prevPlayerPos = { row: engine.state.playerRow, col: engine.state.playerCol };
}

function showLevelAnnounce() {
  const level = LEVELS[engine.state.level];
  levelAnnounceText.textContent = `LEVEL ${level.id}`;
  levelAnnounceSub.textContent = `Collect ${level.diamonds} diamonds`;
  levelAnnounce.classList.add('show');
}

function hideLevelAnnounce() {
  levelAnnounce.classList.remove('show');
}

// ── Main loop ──
function loop(timestamp: number) {
  const dt = lastTime ? Math.min(timestamp - lastTime, 50) : 16;
  lastTime = timestamp;

  switch (appState) {
    case 'menu':
      // Just render a nice background
      break;

    case 'level-announce':
      announceTimer -= dt;
      if (announceTimer <= 0) {
        hideLevelAnnounce();
        appState = 'playing';
      }
      renderer.render(engine.state, dt);
      break;

    case 'playing': {
      engine.update(dt);
      const s = engine.state;

      // Sound effects
      if (s.playerRow !== prevPlayerPos.row || s.playerCol !== prevPlayerPos.col) {
        sound.playMove();
        prevPlayerPos = { row: s.playerRow, col: s.playerCol };
      }

      if (s.diamondsCollected > prevDiamonds) {
        sound.playDiamond();
        prevDiamonds = s.diamondsCollected;
      }

      if (s.exitOpen && !prevExitOpen) {
        sound.playExitOpen();
        prevExitOpen = true;
      }

      if (!s.alive) {
        sound.playDeath();
        appState = 'dead';
        deadTimer = s.deathType === 'crush' ? 2000 : 1500;
      }

      if (s.won) {
        sound.playLevelComplete();
        appState = 'level-complete';
        levelCompleteTimer = 2000;
      }

      renderer.render(s, dt);
      updateHUD(s);
      break;
    }

    case 'dead':
      deadTimer -= dt;
      engine.update(dt); // Let particles continue
      renderer.render(engine.state, dt);
      if (deadTimer <= 0) {
        if (engine.state.lives <= 0) {
          appState = 'gameover';
          showGameOver(false);
        } else {
          engine.restartLevel();
          prevExitOpen = false;
          prevDiamonds = 0;
          prevPlayerPos = { row: engine.state.playerRow, col: engine.state.playerCol };
          appState = 'level-announce';
          announceTimer = 1500;
          showLevelAnnounce();
        }
      }
      break;

    case 'level-complete':
      levelCompleteTimer -= dt;
      engine.update(dt);
      renderer.render(engine.state, dt);
      if (levelCompleteTimer <= 0) {
        if (engine.state.level + 1 >= LEVELS.length) {
          showGameOver(true);
          appState = 'gameover';
        } else {
          engine.nextLevel();
          prevExitOpen = false;
          prevDiamonds = 0;
          prevPlayerPos = { row: engine.state.playerRow, col: engine.state.playerCol };
          appState = 'level-announce';
          announceTimer = 2000;
          showLevelAnnounce();
        }
      }
      break;

    case 'gameover':
      // Static
      break;
  }

  requestAnimationFrame(loop);
}

function updateHUD(s: typeof engine.state) {
  hudDiamonds.textContent = `${s.diamondsCollected}/${s.diamondsNeeded}`;
  const secs = Math.ceil(s.timeLeft / 1000);
  const mins = Math.floor(secs / 60);
  const sec = secs % 60;
  hudTime.textContent = `${mins}:${sec.toString().padStart(2, '0')}`;
  hudScore.textContent = `${s.score}`;
  hudLives.textContent = `${s.lives}`;

  // Flash diamond count when exit opens
  if (s.exitOpen) {
    hudDiamonds.style.color = '#00ff88';
  } else {
    hudDiamonds.style.color = '';
  }

  // Shuriken count
  shurikenCount.textContent = `${s.shurikens}`;
  throwBtn.classList.toggle('empty', s.shurikens <= 0);
}

function showGameOver(won: boolean) {
  gameOverScreen.style.display = 'flex';
  gameOverTitle.textContent = won ? 'YOU WIN!' : 'GAME OVER';
  gameOverTitle.style.color = won ? '#00ff88' : '#f12711';
  gameOverScore.textContent = `Score: ${engine.state.score}`;
}

// ── Boot ──
init();
