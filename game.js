/* ═══════════════════════════════════════════════════════════════════════════
   Flappy Kiro — game.js
   Game logic for features:
     A. Score persistence  (localStorage best score)
     B. Difficulty progression  (speed + gap scale with score)
     H. Local top-10 leaderboard  (localStorage, initials entry)
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W      = canvas.width;
const H      = canvas.height;

// ─── UI elements ─────────────────────────────────────────────────────────────
const startScreen     = document.getElementById('start-screen');
const gameoverScreen  = document.getElementById('gameover-screen');
const scoreDisplay    = document.getElementById('score-display');
const finalScoreEl    = document.getElementById('final-score');
const bestScoreEl     = document.getElementById('best-score');
const initialsSection = document.getElementById('initials-section');
const initialsInput   = document.getElementById('initials-input');
const initialsSubmit  = document.getElementById('initials-submit');
const leaderboardSect = document.getElementById('leaderboard-section');
const leaderboardList = document.getElementById('leaderboard-list');
const retryHint       = document.getElementById('retry-hint');

// ─── Game constants ───────────────────────────────────────────────────────────
const GRAVITY         = 0.38;
const FLAP_STRENGTH   = -7.2;
const PIPE_WIDTH      = 60;
const PIPE_INTERVAL   = 1700;  // ms between new pipes
const GROUND_H        = 60;
const GHOST_SIZE      = 38;
const GHOST_X         = 90;

// B: Difficulty baseline and caps
const BASE_PIPE_SPEED = 2.4;
const MAX_PIPE_SPEED  = 5.0;
const BASE_GAP_HEIGHT = 160;
const MIN_GAP_HEIGHT  = 95;

// ─── A: localStorage keys ────────────────────────────────────────────────────
const LS_BEST        = 'flappyKiro_best';
const LS_LEADERBOARD = 'flappyKiro_leaderboard';

// ─── Star field ──────────────────────────────────────────────────────────────
const STAR_COUNT = 80;
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x:           Math.random() * W,
  y:           Math.random() * (H - GROUND_H),
  r:           Math.random() * 1.6 + 0.3,
  alpha:       Math.random() * 0.6 + 0.3,
  twinkleSpeed: Math.random() * 0.02 + 0.005,
  twinkleDir:  Math.random() > 0.5 ? 1 : -1,
}));

// ─── A: Persist best score ────────────────────────────────────────────────────
function loadBest() {
  try {
    const v = parseInt(localStorage.getItem(LS_BEST), 10);
    return isNaN(v) ? 0 : v;
  } catch (_) { return 0; }
}

function saveBest(val) {
  try { localStorage.setItem(LS_BEST, String(val)); } catch (_) {}
}

// ─── H: Leaderboard helpers ───────────────────────────────────────────────────
// Board entry: { name: string (1–3 chars, uppercase), score: number }

function loadBoard() {
  try {
    const raw = localStorage.getItem(LS_LEADERBOARD);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e && typeof e.name === 'string' && typeof e.score === 'number')
      .map(e => ({ name: e.name.slice(0, 3).toUpperCase(), score: e.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (_) { return []; }
}

function saveBoard(board) {
  try { localStorage.setItem(LS_LEADERBOARD, JSON.stringify(board)); } catch (_) {}
}

/**
 * Returns true if score qualifies for the leaderboard:
 * board has fewer than 10 entries, or score beats the lowest entry.
 */
function qualifiesForBoard(score, board) {
  if (score <= 0) return false;
  if (board.length < 10) return true;
  return score > board[board.length - 1].score;
}

/**
 * Insert a new entry, re-sort descending, keep top 10.
 * Returns { updated: LeaderboardEntry[], idx: number } where idx is the
 * position of the new entry in the updated board (-1 if not found).
 */
function insertEntry(name, score, board) {
  const updated = [...board, { name, score }]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const idx = updated.findIndex(e => e.name === name && e.score === score);
  return { updated, idx };
}

// ─── H: Render leaderboard into the DOM ──────────────────────────────────────
function renderLeaderboard(board, highlightIdx = -1) {
  leaderboardList.innerHTML = '';

  if (board.length === 0) {
    const li = document.createElement('li');
    li.style.justifyContent = 'center';
    li.style.color = '#6040a0';
    li.textContent = 'No entries yet';
    leaderboardList.appendChild(li);
    return;
  }

  board.forEach((entry, i) => {
    const li   = document.createElement('li');
    if (i === highlightIdx) li.classList.add('highlight');

    const rank = document.createElement('span');
    rank.className   = 'lb-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className   = 'lb-name';
    name.textContent = entry.name || '???';

    const sc   = document.createElement('span');
    sc.className   = 'lb-score';
    sc.textContent = entry.score;

    li.append(rank, name, sc);
    leaderboardList.appendChild(li);
  });
}

// ─── Game state ──────────────────────────────────────────────────────────────
// state: 'start' | 'playing' | 'dead' | 'initials'
let state     = 'start';
let score     = 0;
let bestScore = loadBest();  // A: loaded from localStorage on boot
let ghosty, pipes, lastPipeTime, animFrame;
let deathTimer = 0;

// ─── B: Difficulty derived from current score ─────────────────────────────────
/**
 * Pipe speed increases smoothly from BASE_PIPE_SPEED to MAX_PIPE_SPEED.
 * Reaches cap at score ≈ 43.
 */
function currentPipeSpeed(s) {
  return Math.min(BASE_PIPE_SPEED + s * 0.06, MAX_PIPE_SPEED);
}

/**
 * Gap shrinks smoothly from BASE_GAP_HEIGHT to MIN_GAP_HEIGHT.
 * Reaches floor at score ≈ 32.
 */
function currentGapHeight(s) {
  return Math.max(BASE_GAP_HEIGHT - s * 2, MIN_GAP_HEIGHT);
}

// ─── Ghost object ─────────────────────────────────────────────────────────────
function createGhost() {
  return {
    x: GHOST_X,
    y: H / 2 - GHOST_SIZE / 2,
    vy: 0,
    wobble: 0,      // horizontal wobble offset for idle animation
    flapFrame: 0,   // counts down after a flap for squish animation
    dead: false,
  };
}

// ─── Pipe object ─────────────────────────────────────────────────────────────
function createPipe() {
  const gap    = currentGapHeight(score);  // B: gap based on current score
  const minTop = 60;
  const maxTop = H - GROUND_H - gap - minTop;
  const topH   = Math.floor(Math.random() * (maxTop - minTop) + minTop);
  return {
    x:      W + 10,
    topH,
    botY:   topH + gap,
    scored: false,
  };
}

// ─── Init / reset ─────────────────────────────────────────────────────────────
function initGame() {
  ghosty       = createGhost();
  pipes        = [];
  score        = 0;
  lastPipeTime = performance.now();
  deathTimer   = 0;
  scoreDisplay.textContent = '0';
}

// ─── Screen management ────────────────────────────────────────────────────────
function showScreen(name) {
  startScreen.style.display    = 'none';
  gameoverScreen.style.display = 'none';
  scoreDisplay.style.display   = 'none';

  startScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');

  if (name === 'start') {
    startScreen.style.display = 'flex';
    startScreen.classList.add('active');

  } else if (name === 'playing') {
    scoreDisplay.style.display = 'block';

  } else if (name === 'gameover') {
    gameoverScreen.style.display = 'flex';
    gameoverScreen.classList.add('active');
    finalScoreEl.textContent = score;
    bestScoreEl.textContent  = bestScore;  // A: always shows persisted best

    // Reset sub-sections; shown conditionally below
    initialsSection.classList.remove('visible');
    leaderboardSect.classList.remove('visible');
    retryHint.style.display = 'none';
    initialsInput.value     = '';

    const board = loadBoard();

    if (qualifiesForBoard(score, board)) {
      // H: prompt for initials before showing leaderboard
      state = 'initials';
      initialsSection.classList.add('visible');
      setTimeout(() => initialsInput.focus(), 50);
    } else {
      // H: score didn't qualify — show board directly
      renderLeaderboard(board);
      leaderboardSect.classList.add('visible');
      retryHint.style.display = 'block';
    }
  }
}

// ─── H: Submit initials ───────────────────────────────────────────────────────
function submitInitials() {
  const raw  = initialsInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const name = raw.slice(0, 3) || 'AAA';

  const board            = loadBoard();
  const { updated, idx } = insertEntry(name, score, board);
  saveBoard(updated);

  initialsSection.classList.remove('visible');
  renderLeaderboard(updated, idx);
  leaderboardSect.classList.add('visible');
  retryHint.style.display = 'block';
  state = 'dead';
}

initialsSubmit.addEventListener('click', submitInitials);

initialsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    submitInitials();
  }
});

// ─── Input ────────────────────────────────────────────────────────────────────
function handleInput() {
  // Block game restart while the player is typing initials
  if (state === 'initials') return;

  if (state === 'start') {
    state = 'playing';
    initGame();
    showScreen('playing');
    ghosty.vy = FLAP_STRENGTH;
    ghosty.flapFrame = 8;
    return;
  }
  if (state === 'playing' && !ghosty.dead) {
    ghosty.vy = FLAP_STRENGTH;
    ghosty.flapFrame = 8;
  }
  if (state === 'dead') {
    state = 'playing';
    initGame();
    showScreen('playing');
    ghosty.vy = FLAP_STRENGTH;
    ghosty.flapFrame = 8;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleInput();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleInput();
});

// ─── Cross-browser rounded rect (NFR-4) ──────────────────────────────────────
// roundRect is unavailable in Safari < 15.4 and Firefox < 112.
// Falls back to plain rect so pipe caps render on all supported browsers.
function roundRectPath(cx, x, y, w, h, radii) {
  if (typeof cx.roundRect === 'function') {
    cx.roundRect(x, y, w, h, radii);
  } else {
    cx.rect(x, y, w, h);
  }
}

// ─── Collision helper ─────────────────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(now) {
  // Twinkle stars regardless of game state
  for (const s of stars) {
    s.alpha += s.twinkleSpeed * s.twinkleDir;
    if (s.alpha >= 0.9 || s.alpha <= 0.2) s.twinkleDir *= -1;
  }

  if (state !== 'playing') return;

  // Death animation
  if (ghosty.dead) {
    deathTimer--;
    ghosty.vy += GRAVITY * 1.5;
    ghosty.y  += ghosty.vy;
    if (deathTimer <= 0) {
      // A: persist best score before showing game-over screen
      bestScore = Math.max(bestScore, score);
      saveBest(bestScore);
      state = 'dead';  // showScreen may override to 'initials'
      showScreen('gameover');
    }
    return;
  }

  // Ghost physics
  ghosty.vy    += GRAVITY;
  ghosty.y     += ghosty.vy;
  ghosty.wobble = Math.sin(now * 0.003) * 2;
  if (ghosty.flapFrame > 0) ghosty.flapFrame--;

  // Spawn pipes
  if (now - lastPipeTime > PIPE_INTERVAL) {
    pipes.push(createPipe());
    lastPipeTime = now;
  }

  // B: move pipes using score-based speed
  const speed = currentPipeSpeed(score);
  for (const p of pipes) {
    p.x -= speed;
    if (!p.scored && p.x + PIPE_WIDTH < GHOST_X) {
      p.scored = true;
      score++;
      scoreDisplay.textContent = score;
    }
  }

  pipes = pipes.filter(p => p.x + PIPE_WIDTH > 0);

  // Collision: ceiling / ground
  const ghostBottom = ghosty.y + GHOST_SIZE;
  const groundY     = H - GROUND_H;
  if (ghosty.y < 0 || ghostBottom >= groundY) {
    triggerDeath();
    return;
  }

  // Collision: pipes (shrink hitbox slightly for fairness)
  const margin = 5;
  for (const p of pipes) {
    const hitTop = rectsOverlap(
      GHOST_X + margin, ghosty.y + margin,
      GHOST_SIZE - margin * 2, GHOST_SIZE - margin * 2,
      p.x, 0, PIPE_WIDTH, p.topH
    );
    const hitBot = rectsOverlap(
      GHOST_X + margin, ghosty.y + margin,
      GHOST_SIZE - margin * 2, GHOST_SIZE - margin * 2,
      p.x, p.botY, PIPE_WIDTH, H - p.botY
    );
    if (hitTop || hitBot) {
      triggerDeath();
      return;
    }
  }
}

function triggerDeath() {
  ghosty.dead = true;
  deathTimer  = 40;  // ~40 frames of death animation before game-over screen
  ghosty.vy   = -4;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw(now) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  sky.addColorStop(0,   '#0d0520');
  sky.addColorStop(0.6, '#1a0a38');
  sky.addColorStop(1,   '#2a0f50');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - GROUND_H);

  // Stars
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 200, 255, ${s.alpha})`;
    ctx.fill();
  }

  for (const p of pipes) drawPipe(p);
  drawGhost(now);
  drawGround();

  // Vignette overlay
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawPipe(p) {
  const groundY = H - GROUND_H;

  const pipeGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
  pipeGrad.addColorStop(0,   '#3a1a6e');
  pipeGrad.addColorStop(0.4, '#5c2fa0');
  pipeGrad.addColorStop(0.7, '#7a44c8');
  pipeGrad.addColorStop(1,   '#3a1a6e');

  // Top pipe body
  ctx.fillStyle = pipeGrad;
  ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH - 12);

  // Top pipe cap
  const capW = PIPE_WIDTH + 10;
  const capX = p.x - 5;
  ctx.fillStyle = '#8855d8';
  ctx.beginPath();
  roundRectPath(ctx, capX, p.topH - 18, capW, 18, [0, 0, 6, 6]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(capX + 4, p.topH - 15, capW * 0.3, 10);

  // Bottom pipe body
  ctx.fillStyle = pipeGrad;
  ctx.fillRect(p.x, p.botY + 12, PIPE_WIDTH, groundY - p.botY - 12);

  // Bottom pipe cap
  ctx.fillStyle = '#8855d8';
  ctx.beginPath();
  roundRectPath(ctx, capX, p.botY, capW, 18, [6, 6, 0, 0]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(capX + 4, p.botY + 4, capW * 0.3, 10);

  // Glow
  ctx.shadowColor  = 'rgba(150, 80, 255, 0.4)';
  ctx.shadowBlur   = 12;
  ctx.strokeStyle  = 'rgba(180, 120, 255, 0.4)';
  ctx.lineWidth    = 1;
  ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.topH - 12);
  ctx.strokeRect(p.x, p.botY + 12, PIPE_WIDTH, groundY - p.botY - 12);
  ctx.shadowBlur   = 0;
}

function drawGhost(now) {
  const gx = GHOST_X + ghosty.wobble;
  const gy = ghosty.y;
  const sz = GHOST_SIZE;

  ctx.save();
  ctx.translate(gx + sz / 2, gy + sz / 2);

  // Squish/stretch on flap
  const scaleY = ghosty.flapFrame > 0 ? 0.82 + (ghosty.flapFrame / 8) * 0.18 : 1;
  const scaleX = ghosty.flapFrame > 0 ? 1.15 - (ghosty.flapFrame / 8) * 0.1  : 1;
  // Tilt based on velocity
  const tilt = Math.max(-28, Math.min(28, ghosty.vy * 3));
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);

  // Death flash
  if (ghosty.dead && Math.floor(now / 80) % 2 === 0) ctx.globalAlpha = 0.5;

  const r  = sz / 2;

  // Glow aura
  const aura = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.5);
  aura.addColorStop(0,   'rgba(200, 150, 255, 0.35)');
  aura.addColorStop(0.6, 'rgba(150, 80, 255, 0.15)');
  aura.addColorStop(1,   'rgba(100, 50, 200, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Ghost body
  const bodyGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r);
  bodyGrad.addColorStop(0,   'rgba(255, 255, 255, 0.98)');
  bodyGrad.addColorStop(0.5, 'rgba(220, 200, 255, 0.95)');
  bodyGrad.addColorStop(1,   'rgba(170, 130, 255, 0.9)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r, Math.PI, 0);
  ctx.lineTo(r, r * 0.6);

  // Wavy bottom — 3 bumps
  const bumpCount = 3;
  const bumpW = (r * 2) / bumpCount;
  for (let i = bumpCount - 1; i >= 0; i--) {
    const bx1  = -r + i * bumpW + bumpW;
    const bx0  = -r + i * bumpW;
    const midX = (bx0 + bx1) / 2;
    ctx.quadraticCurveTo(midX, r * 0.9, bx0, r * 0.6);
  }
  ctx.closePath();
  ctx.fill();

  // Inner shadow at bottom
  const innerShadow = ctx.createLinearGradient(0, -r, 0, r);
  innerShadow.addColorStop(0,   'rgba(0,0,0,0)');
  innerShadow.addColorStop(0.7, 'rgba(0,0,0,0)');
  innerShadow.addColorStop(1,   'rgba(80, 40, 120, 0.2)');
  ctx.fillStyle = innerShadow;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r, Math.PI, 0);
  ctx.lineTo(r, r * 0.6);
  for (let i = bumpCount - 1; i >= 0; i--) {
    const bx1  = -r + i * bumpW + bumpW;
    const bx0  = -r + i * bumpW;
    const midX = (bx0 + bx1) / 2;
    ctx.quadraticCurveTo(midX, r * 0.9, bx0, r * 0.6);
  }
  ctx.closePath();
  ctx.fill();

  // Eyes
  const eyeY   = -r * 0.05;
  const eyeR   = r * 0.18;
  const eyeOff = r * 0.28;

  ctx.fillStyle = '#1a0a2e';
  ctx.beginPath();
  ctx.ellipse(-eyeOff, eyeY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-eyeOff - eyeR * 0.2, eyeY - eyeR * 0.3, eyeR * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a0a2e';
  ctx.beginPath();
  ctx.ellipse(eyeOff, eyeY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(eyeOff - eyeR * 0.2, eyeY - eyeR * 0.3, eyeR * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // Mouth — 'o' when flapping, smile otherwise
  ctx.strokeStyle = '#1a0a2e';
  ctx.lineWidth   = 1.8;
  ctx.lineCap     = 'round';
  if (ghosty.flapFrame > 3) {
    ctx.beginPath();
    ctx.arc(0, r * 0.32, r * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.22, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGround() {
  const groundY = H - GROUND_H;

  const gGrad = ctx.createLinearGradient(0, groundY, 0, H);
  gGrad.addColorStop(0,   '#2a0f50');
  gGrad.addColorStop(0.3, '#1e0a3e');
  gGrad.addColorStop(1,   '#120630');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, groundY, W, GROUND_H);

  // Top edge glow
  ctx.strokeStyle = 'rgba(150, 80, 255, 0.6)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  // Decorative dots
  ctx.fillStyle = 'rgba(180, 120, 255, 0.25)';
  for (let x = 20; x < W; x += 40) {
    ctx.beginPath();
    ctx.arc(x, groundY + 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function loop(now) {
  update(now);
  draw(now);
  animFrame = requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function boot() {
  showScreen('start');
  initGame();
  animFrame = requestAnimationFrame(loop);
}

boot();
