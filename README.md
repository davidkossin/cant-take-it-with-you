# You Can't Take It With You

A 16-bit, top-down life & finance RPG (A Link to the Past vibe) playable in the browser.

**Live:** [https://davidkossin.github.io/cant-take-it/](https://davidkossin.github.io/cant-take-it/) · [https://dkossin.com/cant-take-it/](https://dkossin.com/cant-take-it/)

## How to play

1. **Title** — New Game (Standard portfolio or Custom setup), Load Game, or Manage Saves (localStorage).
2. **Setup** — Custom: LTTP-styled prompts with **Back** on every step: name, year, age, appearance, starting **Cash**, annual household gross salary, savings (+ interest %), **401(k)** (balance, contribution %, employer match), homes (rate as %), stocks (total only), family (kid **name** + age), spending, ZIP, difficulty.
3. **Decision Room** — Walk with WASD / arrows. Wall-embedded teller windows (`Enter` / `Z` / `E`), layout W2 / S2 / E2:
   - Buy / Sell Home
   - Buy / Sell Stock (capital gains tax on sell)
   - Have A Kid (name only → age 0)
   - Large Purchase
   - Job / Retire
   - **Borrow** — HELOC or loan against shares (asset-backed only; APRs shown)
4. **North door** — “Hallway of Time.” Confirm leaving the year.
5. **Hallway** — Narrow corridor through a dark purple stippled void. First door = **leave year + 1**. HUD age / year / Cash / portfolio project forward (deterministic). A **glass wall** blocks the reference path at its first unfunded obligation; zero checking cash alone is not a failure. Lanterns flicker beside doors.
6. **Esc** — Pause: **Portfolio** (holdings / net worth), **Map** (timeline tree — time ↑, forks ↗ right as Y branches; jump back to a Hallway node; **C Compare** selects two timelines and a year for side-by-side portfolio snapshots), and **Charts** (Monte Carlo forecasts and recorded history).
7. **Age 100** — “End of the Line.” Ending → See your charts / New Game.
8. **Saves** — Auto-save on entering a year’s room and when entering the hallway (`ycitwy_saves_v2`).

## Controls

| Action | Keys |
|--------|------|
| Move | WASD / Arrow keys |
| Confirm / Talk | Enter, Space, Z, E |
| Cancel / Pause | Escape, X |
| Pause tabs | Tab |

## Architecture

```
cant-take-it/
  index.html          # canvas shell, ES module entry
  css/game.css
  README.md
  js/
    main.js           # scene loop, input, pause, transitions
    config.js         # palette, difficulty presets, constants
    state/
      GameState.js    # setup → game, timeline graph + snapshots
      SaveSystem.js   # localStorage begin/end slots
    finance/          # pure JS — no DOM
      Engine.js       # projectOneYear, worth, decisions, CGT sells
      Tax.js          # federal brackets, ZIP→state, capital gains
      Difficulty.js
      Events.js       # compatibility wrappers; monthly events live in Engine
      rng.js          # seeded / deterministic PRNG
    scenes/
      TitleScene.js
      SetupScene.js
      RoomScene.js
      HallwayScene.js
      EndingScene.js
      PauseMenu.js    # Map + Charts
    render/
      Assets.js       # procedural pixel sprites (walk cycle, void, lamps)
      Dialog.js       # SNES-style boxes (money commas, %)
      Hud.js          # floating LTTP icon clusters
      Player.js       # 4-dir walk animation
      World.js        # tilemaps, wall windows, hallway void
      Charts.js       # net-worth line charts
    data/
      tax-brackets.js
      state-from-zip.js
```

Vanilla ES modules + Canvas. No build step. GitHub Pages serves the folder as static files.

## Financial model v2

The root JavaScript game uses the corrected monthly engine and Monte Carlo forecasts. See [the model specification and coverage](docs/financial-model-v2.md) for timing, assumptions, source rules and remaining limitations. The compiled Godot `v2/` export is a separate application.

In **Pause → Charts**, the default view is a 1,000-path forecast. **Enter / mobile A** opens options for history, real dollars, liquid assets, 5,000 or 10,000 paths, coverage notes and CSV export. Left/right selects a year. Keyboard shortcuts: F history, R real dollars, L liquid assets, P path count, C coverage, E export.

The **Portfolio teller → Planning inputs / benefits** edits benefits, account allocation, costs and verified basis data. Living spending excludes housing, taxes, child/college costs and contributions; those are modeled separately. SSA benefits remain $0 until a statement amount is entered. Initial dollar amounts in the Standard profile are preserved; corrected taxes/costs may reveal an early funding shortfall.

## Development and validation

Serve the folder with any static HTTP server. No production build or runtime dependencies are required. A modern browser with module-worker support runs the forecast off the render thread.

```sh
python -m http.server 8080
npm test
npm run check
node scripts/benchmark.mjs 1000
```

Tests cover accounting regressions, published 2026 tax fixtures, loan amortization, retirement rules, migration, terminal history, return moments/correlation, reproducibility, percentile order, funding outcomes and sequence-of-returns risk.
