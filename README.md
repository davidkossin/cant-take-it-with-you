# You Can't Take It With You

A 16-bit, top-down life & finance RPG (A Link to the Past vibe) playable in the browser.

**Live:** [https://davidkossin.github.io/cant-take-it-with-you/](https://davidkossin.github.io/cant-take-it-with-you/) · [https://dkossin.com/cant-take-it/](https://dkossin.com/cant-take-it/)

## How to play

1. **Title** — New Game (Standard portfolio or Custom setup), Load Game, or Manage Saves (browser checkpoints and JSON backups).
2. **Setup** — Custom prompts collect Difficulty, Family, Inflation Adjustment, joint Cash/Savings, separate salaries and retirement inputs, household taxable investments/property, living spending and ZIP. Married players enter the spouse's identity, age and separate account/benefit inputs. **Back** revisits answers.
3. **Decision Room** — Walk with WASD / arrows. Wall-embedded teller windows (`Enter` / `Z` / `E`), layout W2 / S2 / E2:
   - Buy / Sell Home
   - Buy / Sell Stock (capital gains tax on sell)
   - **Family** — Have a kid, Get married, and nanny/daycare costs for a chosen number of years
   - Large Purchase
   - Job / Retire
   - **Borrow** — HELOC or loan against shares (asset-backed only; APRs shown)
4. **North door** — “Hallway of Time.” Confirm leaving the year.
5. **Hallway** — Narrow corridor through a dark purple stippled void. First east door = **the leave year** (no time passes; it opens that year's Decision Room with your finances as you left them). The south door asks "Are you sure?" and erases the timeline and its branches, returning to the Decision Room it came from. HUD and year doors follow one complete Monte Carlo path selected near the terminal median of 1,000 simulations. Gains, losses and life-event shocks are saved and reused across year rooms and timeline branches. A **glass wall** blocks this path at its first unfunded obligation; zero checking cash alone is not a failure. Pause → Charts shows the Hallway path alongside the uncertainty bands. Lanterns flicker beside doors.
6. **Esc** — Pause: **Portfolio**, **Map**, **Charts**, and **Settings**. Map numbers timelines and letters their origin/decision/age-100 points. Jump using a selected point, or choose **Compare** and select two timelines with clicks or arrows/Enter. Comparison shows their original Monte Carlo bands separately and overlaid. A Cash barrier still limits playable years; later years remain inspectable in Charts.
7. **Age 100** — “End of the Line.” Ending → See your charts / New Game.
8. **Saves** — Browser IndexedDB checkpoints on entering a year's room and the hallway, with legacy localStorage migration. Pause → Settings → **Save to File** writes one portable JSON save file with the current game and every character profile (desktop Chrome/Edge show a Save dialog; other browsers download it); **Load from File** (Settings or the title menu) imports it, merges its profiles without overwriting and starts its game. Manage Saves can save a checkpoint or just the profiles to a file, and imports save files. A visible warning explains storage failures; the current session can continue and save to a file.

## Controls

| Action | Keys |
|--------|------|
| Move | WASD / Arrow keys |
| Interact | Enter (A on touch) |
| Confirm menus | Enter, Z, E |
| Run | Hold Space |
| Cancel / Pause | Escape, X |
| Pause tabs | Tab |

## Architecture

```
cant-take-it-with-you/
  index.html          # canvas shell, ES module entry
  css/game.css
  README.md
  js/
    main.js           # scene loop, input, pause, transitions
    config.js         # palette, difficulty presets, constants
    state/
      GameState.js    # setup → game, timeline graph + snapshots
      SaveSystem.js   # IndexedDB checkpoints + legacy migration
      TimelineSystem.js # immutable numbered timeline inputs/results
      PlanExport.js   # validated JSON backup + forecast export
      SaveFile.js     # Save to File / Load from File (game + character profiles)
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
      stateChildCosts.js  # state child costs (ages 0–17) by ZIP
```

Vanilla ES modules + Canvas. No build step. GitHub Pages serves the folder as static files.

## Financial model v2

The root JavaScript game uses the corrected monthly engine and Monte Carlo forecasts. See [the model specification and coverage](docs/financial-model-v2.md) for timing, assumptions, source rules and remaining limitations.

In **Pause → Charts**, the default view is a 1,000-path forecast. **Enter / mobile A** opens options for history, real dollars, liquid assets, 5,000 or 10,000 paths, coverage notes and CSV export. Left/right selects a year. Keyboard shortcuts: F history, R real dollars, L liquid assets, P path count, C coverage, E export.

The **Portfolio teller → Planning inputs / benefits** edits separate owner benefits, account allocation, costs and verified basis data. Living spending excludes housing, taxes, child/college costs and contributions; those are modeled separately. SSA benefits remain $0 until a statement amount is entered. Initial dollar amounts in the Standard profile are preserved; corrected taxes/costs may reveal an early funding shortfall.

**Cash means checking.** Only checking pays bills; Savings and asset sales are player decisions. Bank can transfer Savings, withdraw a gross retirement amount or solve for a net Cash target. Only required minimum distributions and the player's chosen standing withdrawals run automatically. The wall-free percentage measures this Cash funding plan, not whether total wealth could fund an alternative withdrawal strategy.

**Inflation Adjustment:** On displays amounts in the original setup year's buying power; Off displays nominal dollars for the year being viewed. Transaction fields follow the same units. Economic inflation always runs. A new timeline's forecast reuses the same seeded economic samples for meaningful comparisons, while its selected played path may differ because decisions alter which path has the median first wall.

See [the update and validation notes](docs/planning-update.md) for patch application, saved timeline behavior and manual browser checks.

## Development and validation

Serve the folder with any static HTTP server. No production build or runtime dependencies are required. A modern browser with module-worker support runs the forecast off the render thread.

```sh
python -m http.server 8080
npm test
npm run check
node scripts/benchmark.mjs 1000
```

Tests cover accounting regressions, published 2026 tax fixtures, loan amortization, retirement rules, migration, terminal history, return moments/correlation, reproducibility, percentile order, funding outcomes and sequence-of-returns risk.
