# Flappy Kiro Game 👻

A browser-based Flappy Bird clone featuring **Ghosty** — a ghost character navigating a neon-purple space world. Built as part of the **AWS AI-DLC Workshop** using Kiro AI.

---

## Features

### A — Score Persistence
Best score is saved to `localStorage` and survives page reloads. Your all-time best is always shown on the game-over screen.

### B — Difficulty Progression
The game gets gradually harder as your score increases:
- Pipe speed scales from **2.4 → 5.0** (capped)
- Gap between pipes shrinks from **160px → 95px** (floored)

Both changes are smooth and continuous — no sudden jumps.

### H — Local Top-10 Leaderboard
- On a qualifying score, enter up to 3 initials
- Your entry is highlighted in the leaderboard
- Leaderboard persists in `localStorage` across sessions
- Same initials can appear multiple times

---

## Project Structure

```
flappy-kiro/
├── index.html       # HTML shell
├── style.css        # All styles
├── game.js          # Game logic (features A, B, H)
└── game.test.js     # Unit test harness (runs in browser console)
```

---

## How to Play

1. Open `index.html` in any modern browser — no server needed
2. Press **Space**, click, or tap to start and flap
3. Avoid the pipes and the ground
4. Beat your best score and claim a spot on the leaderboard

**Supported browsers:** Chrome, Edge, Firefox, Safari (modern versions)

---

## Running Tests

Open `index.html` in a browser, then open **DevTools → Console**.  
The test harness (`game.test.js`) runs automatically on page load and reports 25 assertions covering features A, B, and H.

---

## Workshop Context

This project was built during the **AWS Kiro AI-DLC Workshop** using the following phases:

| Phase | Output |
|---|---|
| Ideation | Scope defined: A + B + H |
| Inception | Requirements, units, user stories, NFRs, risks |
| Construction | Domain model, implementation, tests, verification |

---

## Author

**25cs001ansh** — [25cs001@charusat.edu.in](mailto:25cs001@charusat.edu.in)
