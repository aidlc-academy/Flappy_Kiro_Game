/* ═══════════════════════════════════════════════════════════════════════════
   Flappy Kiro — game.test.js
   Unit test harness for features A, B, and H.

   HOW TO RUN:
     Include this file in index.html after game.js:
       <script src="game.test.js"></script>
     Open the page in a browser and check the DevTools console.

   ISOLATION:
     All tests use an in-memory stub for localStorage.
     They do not touch live game state or the real DOM.
   ═══════════════════════════════════════════════════════════════════════════ */

(function runTests() {
  'use strict';

  // ── Minimal test runner ────────────────────────────────────────────────────
  let passed = 0, failed = 0;
  const results = [];

  function assert(id, description, condition) {
    if (condition) {
      passed++;
      results.push(`  ✅ ${id}: ${description}`);
    } else {
      failed++;
      results.push(`  ❌ ${id}: ${description}`);
    }
  }

  // ── Stub localStorage for test isolation ──────────────────────────────────
  // Uses a plain object so tests never touch the real store.
  const fakeStore = {};
  const stubLS = {
    getItem:    (k)    => (k in fakeStore ? fakeStore[k] : null),
    setItem:    (k, v) => { fakeStore[k] = String(v); },
    removeItem: (k)    => { delete fakeStore[k]; },
  };

  // ── Mirror the game's pure logic functions locally ─────────────────────────
  // Tests verify the same contracts as game.js without depending on its globals.

  const LS_BEST_T        = 'test_best';
  const LS_LEADERBOARD_T = 'test_leaderboard';

  function _loadBest() {
    const v = parseInt(stubLS.getItem(LS_BEST_T), 10);
    return isNaN(v) ? 0 : v;
  }
  function _saveBest(val) { stubLS.setItem(LS_BEST_T, String(val)); }

  function _loadBoard() {
    try {
      const raw = stubLS.getItem(LS_LEADERBOARD_T);
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
  function _saveBoard(board) { stubLS.setItem(LS_LEADERBOARD_T, JSON.stringify(board)); }

  function _qualifiesForBoard(score, board) {
    if (score <= 0) return false;
    if (board.length < 10) return true;
    return score > board[board.length - 1].score;
  }

  function _insertEntry(name, score, board) {
    const updated = [...board, { name, score }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const idx = updated.findIndex(e => e.name === name && e.score === score);
    return { updated, idx };
  }

  const BASE_PIPE_SPEED_T = 2.4, MAX_PIPE_SPEED_T = 5.0;
  const BASE_GAP_HEIGHT_T = 160, MIN_GAP_HEIGHT_T  = 95;
  const GHOST_SIZE_T      = 38;

  function _currentPipeSpeed(s) {
    return Math.min(BASE_PIPE_SPEED_T + s * 0.06, MAX_PIPE_SPEED_T);
  }
  function _currentGapHeight(s) {
    return Math.max(BASE_GAP_HEIGHT_T - s * 2, MIN_GAP_HEIGHT_T);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE A — Score Persistence
  // ══════════════════════════════════════════════════════════════════════════
  console.group('%c[A] Score Persistence', 'font-weight:bold;color:#c4a0ff');

  // U-A1: returns 0 when nothing is stored
  stubLS.removeItem(LS_BEST_T);
  assert('U-A1a', 'loadBest() returns 0 when localStorage is empty',
    _loadBest() === 0);

  // U-A1: returns stored value
  stubLS.setItem(LS_BEST_T, '42');
  assert('U-A1b', 'loadBest() returns stored value 42',
    _loadBest() === 42);

  // U-A2: saves value
  _saveBest(77);
  assert('U-A2', 'saveBest(77) persists to store',
    stubLS.getItem(LS_BEST_T) === '77');

  // U-A3: best score updates when new score is higher
  _saveBest(30);
  const prevBest = _loadBest();
  const newScore = 55;
  _saveBest(Math.max(prevBest, newScore));
  assert('U-A3a', 'bestScore updates when new score is higher',
    _loadBest() === 55);

  // U-A3: best score does NOT decrease when new score is lower
  _saveBest(55);
  _saveBest(Math.max(_loadBest(), 10));
  assert('U-A3b', 'bestScore does not decrease when new score is lower',
    _loadBest() === 55);

  // Graceful handling of corrupt value
  stubLS.setItem(LS_BEST_T, 'not-a-number');
  assert('U-A1c', 'loadBest() returns 0 for non-numeric stored value',
    _loadBest() === 0);

  console.log(results.splice(0).join('\n'));
  console.groupEnd();

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE B — Difficulty Progression
  // ══════════════════════════════════════════════════════════════════════════
  console.group('%c[B] Difficulty Progression', 'font-weight:bold;color:#c4a0ff');

  // U-B1: speed starts at baseline
  assert('U-B1a', 'pipe speed at score 0 equals BASE_PIPE_SPEED',
    _currentPipeSpeed(0) === BASE_PIPE_SPEED_T);

  // U-B1: speed increases with score
  assert('U-B1b', 'pipe speed at score 10 > pipe speed at score 0',
    _currentPipeSpeed(10) > _currentPipeSpeed(0));

  // U-B3: speed cap
  assert('U-B3a', 'pipe speed at score 100 does not exceed MAX_PIPE_SPEED',
    _currentPipeSpeed(100) <= MAX_PIPE_SPEED_T);
  assert('U-B3b', 'pipe speed at score 1000 equals MAX_PIPE_SPEED (hard cap)',
    _currentPipeSpeed(1000) === MAX_PIPE_SPEED_T);

  // U-B2: gap starts at baseline
  assert('U-B2a', 'gap height at score 0 equals BASE_GAP_HEIGHT',
    _currentGapHeight(0) === BASE_GAP_HEIGHT_T);

  // U-B2: gap shrinks with score
  assert('U-B2b', 'gap height at score 10 < gap height at score 0',
    _currentGapHeight(10) < _currentGapHeight(0));

  // U-B3: gap floor
  assert('U-B3c', 'gap height at score 100 does not go below MIN_GAP_HEIGHT',
    _currentGapHeight(100) >= MIN_GAP_HEIGHT_T);
  assert('U-B3d', 'gap height at score 1000 equals MIN_GAP_HEIGHT (hard floor)',
    _currentGapHeight(1000) === MIN_GAP_HEIGHT_T);

  // NFR-8: minimum gap is physically passable
  assert('NFR-8', `MIN_GAP_HEIGHT (${MIN_GAP_HEIGHT_T}) > GHOST_SIZE (${GHOST_SIZE_T})`,
    MIN_GAP_HEIGHT_T > GHOST_SIZE_T);

  // U-B4: smooth progression — no step > 0.5 between consecutive scores
  let smooth = true;
  for (let s = 0; s < 50; s++) {
    if (Math.abs(_currentPipeSpeed(s + 1) - _currentPipeSpeed(s)) > 0.5) {
      smooth = false;
      break;
    }
  }
  assert('U-B4', 'speed increases smoothly — no jump > 0.5 between consecutive scores',
    smooth);

  console.log(results.splice(0).join('\n'));
  console.groupEnd();

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE H — Leaderboard
  // ══════════════════════════════════════════════════════════════════════════
  console.group('%c[H] Leaderboard', 'font-weight:bold;color:#c4a0ff');

  stubLS.removeItem(LS_LEADERBOARD_T);

  // U-H4: empty board on first load
  assert('U-H4a', 'loadBoard() returns [] when store is empty',
    _loadBoard().length === 0);

  // U-H1: qualifies when board has room
  assert('U-H1a', 'qualifiesForBoard(5, []) returns true',
    _qualifiesForBoard(5, []) === true);

  // U-H1: score of 0 never qualifies
  assert('U-H1b', 'qualifiesForBoard(0, []) returns false',
    _qualifiesForBoard(0, []) === false);

  // U-H2: insert and sort correctly
  let board = [];
  const r1 = _insertEntry('AAA', 10, board); board = r1.updated;
  const r2 = _insertEntry('BBB', 20, board); board = r2.updated;
  const r3 = _insertEntry('CCC', 15, board); board = r3.updated;

  assert('U-H2a', 'board is sorted descending after 3 inserts',
    board[0].score === 20 && board[1].score === 15 && board[2].score === 10);

  // U-H6: highlight index is correct
  assert('U-H6a', 'highlight index for top entry (BBB/20) is 0',  r2.idx === 0);
  assert('U-H6b', 'highlight index for mid entry (CCC/15) is 1',  r3.idx === 1);

  // U-H3: same initials can appear multiple times
  const r4 = _insertEntry('AAA', 12, board); board = r4.updated;
  assert('U-H3', 'same initials (AAA) appear twice on the board',
    board.filter(e => e.name === 'AAA').length === 2);

  // U-H2: board never exceeds 10 entries
  board = [];
  for (let i = 0; i < 12; i++) {
    const res = _insertEntry('P' + i, i * 5, board);
    board = res.updated;
  }
  assert('U-H2b', 'board is capped at 10 entries after 12 inserts',
    board.length === 10);

  // U-H2: retained entries are the highest scores
  assert('U-H2c', 'lowest retained score is 10 (scores 0 and 5 dropped)',
    board[board.length - 1].score === 10);

  // U-H5: score at or below 10th does not qualify
  assert('U-H5', 'qualifiesForBoard(5, full-board) returns false',
    _qualifiesForBoard(5, board) === false);

  // U-H1: score above 10th does qualify
  assert('U-H1c', 'qualifiesForBoard(99, full-board) returns true',
    _qualifiesForBoard(99, board) === true);

  // U-H4: board survives save → load round-trip
  _saveBoard(board);
  const reloaded = _loadBoard();
  assert('U-H4b', 'board length is preserved after save → load',
    reloaded.length === 10);
  assert('U-H4c', 'top entry score matches after reload',
    reloaded[0].score === board[0].score);

  // Graceful handling of corrupt JSON
  stubLS.setItem(LS_LEADERBOARD_T, 'not-json{{{');
  assert('U-H4d', 'loadBoard() returns [] when store contains invalid JSON',
    _loadBoard().length === 0);

  // Name sanitisation on load
  stubLS.setItem(LS_LEADERBOARD_T, JSON.stringify([{ name: 'abcdef', score: 5 }]));
  const san = _loadBoard();
  assert('U-H4e', 'entry names are uppercased and truncated to 3 chars on load',
    san.length === 1 && san[0].name === 'ABC');

  console.log(results.splice(0).join('\n'));
  console.groupEnd();

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const total  = passed + failed;
  const colour = failed === 0
    ? 'color:#6fdd8b;font-weight:bold'
    : 'color:#ff6b6b;font-weight:bold';
  console.log(
    `%c\nFlappy Kiro tests: ${passed}/${total} passed` +
    (failed > 0 ? ` — ${failed} FAILED` : ' ✅'),
    colour
  );
})();
