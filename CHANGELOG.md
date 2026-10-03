# Changelog

All notable changes to *You Can't Take It With You* are listed here.

Format: newest first. Versions match `GAME_VERSION` in `js/config.js` (shown bottom-right on the canvas).

Unpublished work stays under **[Unreleased]** until David says to publish.

---

## [Unreleased]

- Published the Godot V2 HTML5 rebuild at `/v2/` (Starman standard portfolio, Hallway of Time, six tellers). V1 at the site root is unchanged.

## [0.5.12] — 2026-10-03

### Changed
- Playfield scales with the browser window. The world stays a crisp 320×280 pixel grid, and the on-screen box fills the space under the top bar (aspect preserved). Whole-pixel snapping only happens when it stays within about 4% of that fit, so a large monitor is no longer stuck in a small frame. Relayout runs on resize and orientation change. On a tall phone the touch pad sits below the playfield; on a short landscape screen the pad still overlays the bottom so the world does not collapse.
- Text and HUD labels are rasterized at the display resolution instead of blowing up an 8px bitmap. Chart strokes stay about a CSS pixel thick so lines stay sharp when the window is large.
- Cache-bust / `GAME_VERSION` bumped to **0.5.12**

## [0.5.11] — 2026-10-01

### Added
- Custom setup now asks whether to save the completed answers as a reusable profile before starting the game

### Fixed
- Creating a custom profile now confirms before returning to the main menu from the initial name prompt; choosing No keeps the prompt open

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.11**

## [0.5.10] — 2026-09-29

### Added
- Title **Changelog**: open release notes from the startup menu (near How to Play); fetches `CHANGELOG.md` at runtime, lists versions newest-first, and pages through each section in LTTP dialogs
- Decision Rooms entered after a Hallway of Time gain a **west-wall center door** that returns to that prior Hallway timeline node (same instance / year stretch), mirroring the hallway south-return-to-Decision-Room pattern; the root/start Decision Room has no west return door
- Hallway of Time **mortgage paid-off milestone**: when a home’s mortgage clears during year projection, a one-shot aura portal / banner fires per home (e.g. “Mortgage paid off: Primary Residence”)

### Fixed
- Returning from a post-first Decision Room no longer requires inventing a new hallway — `jumpToHallwayNode` re-enters the existing hallway node recorded by `commitHallwayNode`
- Mortgage amortization final year now clears residual principal (same pattern as other loans), so payoff events actually fire instead of leaving `mortgageOwed` crumbs with `remainingTerm` at 0
- After mortgage payoff, baked-in `spendingBreakdown.mortgage` is removed from `annualSpending` so later years / Spend HUD no longer charge P&I (property tax unchanged); default path that bills via live `mortgagePaid` already stopped charging once term ended

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.10**

## [0.5.9] — 2026-09-29

### Added
- Title **Create a Profile**: run the full setup questionnaire and save answers as a reusable player profile in localStorage (`ycitwy_profiles_v1`, separate from game saves)
- Title **Use Profile**: pick a saved profile and start a new Decision Room game without re-answering the questionnaire
- Title **Manage Profiles**: list and delete profiles with Cancel-default confirm (mirrors Manage Saves); profile menu options refresh when the last profile is removed

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.9**

## [0.5.8] — 2026-09-28

### Fixed
- Timeline Map **you** marker tracks live portfolio year/age (no longer stuck at hallway entry year)
- Map lane tips on abandoned parent spines keep the pre-fork hallway so ←/→ timeline jump still works
- Decision Room entry after the start room now draws a **Y fork** on the Timeline Map (not only a second sibling spawn-off)

### Changed
- Timeline Map d-pad: **←/→** select timeline, **↑/↓** select a hallway jump point (and **Compare** when 2+ explored tips); Enter jumps or opens Map Compare
- Compare is an on-map selectable button (C shortcut kept); jump list replaced by status line + graph highlight
- A/C markers inset; legend includes DR visit dots; selected timeline spine is brighter

### Added
- Map shows Decision Room visit markers on a timeline spine even when that visit is the fork hub

## [0.5.7] — 2026-09-28

### Added
- **New Game** submenu: **Standard portfolio** (skip setup; tuned average US household starter that hits the Hallway glass wall around year index ~6 on Standard with no Decision Room changes) vs **Custom setup** (existing full SetupScene)
- Pause **Map Compare**: select two timelines, choose a calendar year, and view side-by-side Cash, savings, stocks, 401(k), homes/equity, loans, salary/retired, age, and net worth snapshots

### Changed
- Pause **Timeline Map** keeps the A/B/C timeline **TREE** semantics but now flows upward (past/start at bottom → future/age 100 at top); Decision Room forks still spawn right and render as Y-shaped up-right branches; jump-to-hallway unchanged
- Decision Room entry from a parent that already has children is marked as a **fork** (`isFork`); duplicate begin nodes no longer appended when `enterYearRoom` / `createGame` already recorded the room
- Pause **Charts** now stays focused on single-path net worth; timeline-pair comparison lives on **Map Compare**
- Cache-bust / `GAME_VERSION` bumped to **0.5.7**

## [0.5.6] — 2026-09-28

### Changed
- Title subtitle: **An existential interactive financial planner** (was “A 16-bit life ledger”); wrapped to two lines on the title screen
- Pause **Timeline Map** redrawn vertically: time flows **down** (past → future); forks/branches spawn to the **right**; jump-to-hallway still works on the 320-wide canvas
- Cache-bust / `GAME_VERSION` bumped to **0.5.6**

### Added
- Pause menu **Portfolio Overview** with Cash, savings/rate, taxable stocks/cost basis, 401(k), homes/mortgages, loans, net worth, and current life details
- Pause **Charts** timeline compare: when the tree has multiple branch tips (spawn-off after Map jump), overlay Net Worth or Cash across Timeline A/B/… on a shared year axis (legend labels; current tip marked `*`)
- Pause **Charts** year snapshot: Enter a calendar year (Dialog.prompt — mobile HTML input supported) to see **side-by-side** portfolio columns per timeline (Cash, savings, stocks, 401(k), homes/equity, loans, salary/retired, age, net worth); missing span shows Before branch / After end / n/a; ←/→ cycles chart modes, ↑/↓ picks which pair when 3+ tips

## [0.5.5] — 2026-09-28

### Added
- **Manage Saves** on the title screen: browse the newest saved games and delete an individual save with an explicit, Cancel-default confirmation; the save-dependent title options refresh after the last save is removed.

### Fixed
- Retirement shortfall no longer **inflates Cash** via 401(k): withdrawals were deposited into Cash after savings/stocks/Cash were already drained, without applying proceeds to the unpaid bills — Cash oscillated upward (e.g. ~$12k→~$89k) while net stayed deeply negative and the glass wall never appeared. Drain order is now **savings → taxable stocks → 401(k) → Cash**; 401(k) proceeds cover the remaining shortfall (prior Cash cushion kept when the draw is enough). Glass still triggers when Cash ≤ $0 after those buffers.

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.5**

## [0.5.4] — 2026-09-28

### Added
- Mobile OS keyboard for `Dialog.prompt` fields: tap the on-screen value box to focus a real HTML input (`inputmode` text/decimal) so phones can type names, salaries, money, and percents; desktop canvas keyboard entry unchanged when the overlay is not focused

### Fixed
- Prompt typing no longer double-applies Backspace/characters when the mobile HTML input is focused (canvas `handleKeyDown` skips native-input key events; Accept/Back via virtual pad A/B still work)

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.4**

---

## [0.5.3] — 2026-09-28

### Fixed
- Ending finances now remain `---` for the You Can't Take It With You theme; the ending charts still plot the real net-worth and Cash history.

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.5.3**

---

## [0.5.2] — 2026-09-27

### Added
- Hallway of Time **south-wall door**: return to the previous Decision Room (leave-year baseline / portfolio when the hallway was entered); same confirm + interact as year doors; touch-friendly

### Fixed
- Yearly **shortfall** now draws **savings → taxable stocks → Cash** (was Cash first). A deficit no longer zeroes Cash—and places the glass wall immediately—while savings/brokerage remain
- Debug export always includes a **hallwayStash** (baseline + projected cash/savings/salary + glass year), even if debug was turned on mid-hallway
- Glass wall **Out of Cash** bump message: detection used the wrong edge (player bottom vs glass top) so it almost never fired; now queues when a northward step is blocked by the glass (or while abutting from the south and pressing up), with step-away debounce so it does not spam
- Debug mode visibility: larger cyan/magenta DEBUG ON panel + top border strip; brief on-canvas **DEBUG ON / DEBUG OFF** toast on toggle; overlay always drawn so OFF toast is visible

### Changed
- Glass / insolvency placement documented as **salary-inclusive**: `projectOneYear` applies salary into Cash before the snapshot; `findBankInsolvencyIndex` / `buildGlassWall` use those post-salary snapshots only (comment + debug `glass_wall_place` with cash at last safe door vs insolvent year)
- Cache-bust / `GAME_VERSION` bumped to **0.5.2**

---

## [0.5.1] — 2026-09-27

### Added
- **Debug mode** for playtest troubleshooting: `?debug=1` or `` ` `` / `F2` toggles (persists in localStorage); DEBUG badge + recent lines on canvas; structured year/hallway/door/glass/sell logs; `Shift+D` downloads `ycitwy-debug-*.json` (attach in chat), `Shift+C` copies JSON; `window.__ycitwyDebug` helpers in console

### Fixed
- Hallway **glass wall** placement: barrier now sits **past** the last enterable year-door (Cash still > $0 after that year's cashflow, including salary), in hallway space — not overlapping that door's collider — so the player can walk in cleanly; wall blocks further progress toward the first year that would leave Cash ≤ $0

### Changed
- Glass / projection model clarified: each hallway door is **Jan 1** of that year; `projectOneYear` already applies that year's **salary** in the snapshot used for insolvency (salary paid while walking between doors, before the next door)
- Glass wall bump dialog: explicit **Out of Cash** copy — beyond the wall Cash runs out; player must enter an earlier year door → Decision Room to refill Cash before continuing
- Sell Stock: realized-gains prompt shows read-only **Sale amount: $X** (comma-formatted proceeds); **Years held** replaced with **Short-term (< 1 year)** / **Long-term (≥ 1 year)** choice (same CGT short vs long flag)
- Cache-bust / `GAME_VERSION` bumped to **0.5.1**

---

## [0.5.0] — 2026-09-27

### Added
- Setup: traditional **401(k)** — starting balance, employee contribution (% of salary, annual cap `K401_EMPLOYEE_LIMIT` = $23,500 TY 2025), employer match (match % of deferrals on first X% of salary)
- Engine: while employed, 401(k) deferral from paycheck + employer match; balance grows with difficulty equity return; included in Portfolio / net worth (illiquid for Decision Room spending)
- Retirement: when `retired`, auto **401(k) withdrawal → Cash** to cover year shortfalls (taxable ordinary income via Tax.js); ledger: `401(k) withdrawal → Cash: $X (tax $Y)`
- Decision Room **Borrow** window (6th teller, east wall with Job — layout W2/S2/E2):
  - **HELOC** — CLTV 80% of home value minus mortgage and existing HELOCs; amortizing; proceeds → Cash; lien paid off on home sale
  - **Loan against shares** — 50% LTV on taxable brokerage only (not 401(k)); amortizing; margin call sells stock if over LTV
  - APRs shown clearly in prompts and confirm (defaults: HELOC 8.5%, securities 7.0%; player adjustable within mid-2020s bands)
- Hallway of Time **glass wall**: deterministic projection finds the first year Cash would be ≤ $0; translucent cyan barrier blocks walking past that door, with a message to enter an earlier year and rebuild Cash

### Changed
- Player-facing rename: **The Bank / Bank → Cash** (HUD, setup, dialogs, surplus events, glass wall, charts, ending). Internal field remains `cash`
- Annual surplus → **Cash** (`cash`) instead of savings
- Borrow / other loans: full amortizing P&I is an annual cash-flow expense (interest called out in year events for HELOC and share-backed loans)
- Cache-bust / `GAME_VERSION` bumped to **0.5.0**

---

## [0.4.0] — 2026-09-27

### Added
- Smartphone virtual pad (D-pad + A / B / Menu); auto-shows on coarse pointer, touch, or width ≤900px
- Hint text for phone controls

### Changed
- Responsive canvas fit: scale to available viewport (topbar, hint, `visualViewport`), with fractional scale and integer snap when waste is small
- Layout CSS for phone browsers (`100dvh`, frame max-width, smaller chrome, `touch-action: none`, `viewport-fit=cover`)
- Cache-bust query bumped to `?v=0.4.0`

### Notes
- Sizing-only commit `ab91795` can be reverted alone with `git revert ab91795` while keeping touch controls

---

## [0.3.1] — 2026-09-27

### Added
- Named large purchases: purchase name flows into Hallway portals (“Purchased {name}”, “Paid off: {name}”)

### Changed
- Brighter, more visible life-event aura portals (bloom, cyan/violet band, wall streaks, clearer text plate)

---

## [0.3.0] — 2026-09-27

### Added
- On-canvas build version label (bottom-right) for cache confirmation
- Asset / module cache-bust `?v=` tied to `GAME_VERSION`

---

## [0.2.x] — 2026-09-27 (pre-version-label batch)

Shipped before the visible version badge; grouped for history.

### Added
- Financed large purchases (down payment, interest rate, term) with amortizing `otherLoans`
- Hallway life-event auras + bottom banners (mortgage/loan payoff, retirement, “{child} goes to college”, named purchases)
- National average college tuition as annual expense at college age
- Decision Room tellers evenly on east / south / west; north wall is Hallway doorway only
- Icon-only wall signs (full names still on `[E]` prompt)
- Hallway: red lanterns on timeline wall; blue-flame torches every five years on the door side
- Floating HUD strip above the playfield (Age + kids, Year, Bank, Portfolio, Salary)

### Fixed
- Sticky movement keys after typing in dialogs (e.g. kid name containing “d”)

### Changed
- Setup UX: Back on steps, comma-formatted money, rates as %, household gross salary wording, kid names (no tickers), difficulty descriptions with Standard default
- Hallway doors start at leave year + 1; narrower void; walk animation polish

---

## [0.1.0] — 2026-09-27

### Added
- Initial playable vertical slice on GitHub Pages at `/cant-take-it/`
- Title / Setup / Decision Room / Hallway of Time / Ending
- Finance engine (projection, tax, difficulty, events)
- Pause Map + Charts; localStorage saves (`ycitwy_saves_v2`)
