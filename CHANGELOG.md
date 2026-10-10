# Changelog

All notable changes to *You Can't Take It With You* are listed here.

Format: newest first. Versions match `GAME_VERSION` in `js/config.js` (shown bottom-right on the canvas).

Unpublished work stays under **[Unreleased]** until David says to publish.

---

## [Unreleased]

### Added
- `dialog.confirm(..., { distinctCancel: true })`: Escape/B now resolves to a value distinct from either Yes or No, so a Decision Room flow can tell "the player chose No" apart from "the player wants to go back" (previously both resolved to `false`, indistinguishable). Existing callers are unaffected (defaults to the old behavior).
- Make a Large Purchase (renamed from "Make Large Purchase") is rebuilt on a step index, so Back at any question returns to the previous one instead of exiting the whole flow; first prompt reworded to "What is your Purchase?" and "($)" dropped from the amount question.
- A standing stock-sale plan: a yearly amount (today's dollars, grows with inflation) sold proportionally across liquid holdings or from one chosen holding, in equal monthly parts paid into Cash, taxed as capital gains through the normal year-end settlement. Like the existing standing retirement withdrawal, this is the player's own instruction (set up at the Stock Broker or Career teller, cancellable at any time) — not the engine deciding on its own to sell; it's rejected at setup from a holding with unverified basis, the same guard a manual sale already has. Engine version bumped to 2.3.0.
- Dialog boxes support inline `**bold**`/`_italic_` markup in authored text (body copy, option labels/subtext, form field labels), replacing the single flat font weight/style used everywhere.
- SetupScene's home details form now asks for a property name, stored as its label everywhere homes are listed.

### Changed
- Custom Setup's online stock lookup now shows a ticker's own price history (annualized mean/sample stdev, when at least 2 years is available) as a labeled reference note alongside the price. It is reference only: the "Expected return model" growth/volatility fields still default to the difficulty's equity assumption, never to that history, since a stock's trailing return — especially after a strong decade like 2016–2025 — is a poor predictor of its future return, and a prefilled default is sticky even when editable.
- Home value appreciation (`homeRealGrowth`/`homeVolatility` in every difficulty) is now calibrated to ~50 years (1975–2025) of FHFA/Case-Shiller national home price history — 1.25% real appreciation, 5% annual volatility — replacing an uncited 0.5%/6% placeholder. Assumption version bumped to `planning-2026-3`.

## [0.7.5] — 2026-10-09

### Removed
- Removed unused `js/config.js` constants (`NATIONAL_AVG_COLLEGE_COST`, `COLLEGE_AGE_MIN`/`COLLEGE_AGE_MAX`, `K401_EMPLOYEE_LIMIT`, `LTCG_FEDERAL_RATE`, `RETIREMENT_AGE`) left over from before college cost, contribution limits and capital-gains rates were computed dynamically in `js/finance`. Noted that `HOME_TYPES.taxRate` is informational only; `buyHome` always defaults new homes to 1.2% regardless of type.

### Changed
- Marked `docs/market-assumptions-0.6.0.md` as superseded/historical: it documented equity assumptions fit to actual 2016–2025 returns, since replaced by the illustrative long-horizon baseline in `docs/financial-model-v2.md`.

### Fixed
- A persistence test checked a storage-failure message against outdated wording ("JSON backup"); updated it to match the current message ("Use Save to File to keep a copy").

## [0.7.4] — 2026-10-08

### Removed
- Removed the V2 link from the top bar and other references to the Godot V2 prototype.

### Changed
- Starman now starts with random hair and shirt colors and short hair; his spouse gets random colors and long hair.
- Child costs before college now use the state average annual cost of raising a child, based on the player's zip code (50-state average of $23,673/year if unknown).

### Fixed
- ZIP-to-state lookup corrected and shared by taxes and child costs: one table, built from GeoNames and Census ZIP data and the USPS 3-digit prefix list, now decides your state everywhere. Fixes ZIPs that were placed in the wrong state or none at all. For example, 005 is now New York, 055 Massachusetts, 201 Virginia, 398–399 Georgia, 733 and 885 Texas, 008 the U.S. Virgin Islands, 340 and 090–099/962–966 military, and 969 Guam. ZIP+4 is accepted for taxes, and prefixes that have no ZIP codes now count as unknown (national averages) instead of a neighboring state.

## [0.7.3] — 2026-10-08

### Added
- The first east door in the Hallway of Time is now the current year: the year of the Decision Room you just left, at your current age, with no time passed. It opens a Decision Room for that same year with your finances exactly as you left them, so you can change a decision without a year going by. As with any year door, a new numbered timeline is made only when you leave that room through its north door; that room's west door leads back to the Hallway. Every later door moved up one place and still matches its year in the forecast. A glass wall in the current year sits just past this first door, so it can always be used to raise Cash.

### Changed
- The Hallway's south door now erases the timeline. It first asks **Are you sure?** (Yes / No, with No selected), warning that going back will erase this timeline and every timeline that branches from it. On Yes, the timeline's Hallway, the rooms and hallways reached from it, its forecast and its chosen path are deleted, along with all of its branch timelines, and you return to the Decision Room it was opened from, standing just below its north door, with your finances as they were when you left that room. That room works exactly as before you left it (its west door, if it had one, still leads to its own Hallway), and the parent timeline becomes the current one on the Pause Map. In Timeline 1's Hallway, Timeline 1 itself is kept but reset to how it was before you first entered the Hallway. Checkpoints saved earlier still contain the erased timelines. This replaces the old south door, which went back to the room without erasing anything; changing a decision in the current year is now done through the first east door.
- The purple lanterns beside the Hallway's end door and the green lanterns beside its south door now flicker on the same beat as the Hallway's other lanterns and torches: a four-frame flame stepping at the same rate, and a glow that pulses with the same timing and strength.

## [0.7.2] — 2026-10-08

### Added
- **Save to File / Load from File:** keep your game and your character profiles on your own disk, so clearing browser data no longer loses them. Pause → Settings → **Save to File** (was "Export complete plan") writes one JSON file with the current game and all character profiles; desktop Chrome/Edge let you choose the folder and name (default `cant-take-it-<name>-<year>.json`), other browsers download it. **Load from File** (Pause → Settings, after a Yes/No check that defaults to No, and on the title menu) imports a file, adds its profiles and starts its game. Title → Manage Saves adds **Save Profiles to File** for a profiles-only backup. Imported profiles never replace existing ones: duplicates are skipped and an id clash keeps both. Older plan files without profiles still load.

### Changed
- Controls: Space is now run only and no longer interacts with doors, windows or tellers or confirms menus. Enter is the interact key (the on-screen A button sends Enter); the action prompt reads `[Enter]` and the desktop hint says "Interact with Enter".
- Walking through an east (year) door in the Hallway of Time now places you in the new Decision Room just east of its west doorway, facing east, as if you'd just stepped through that door. Going back through a timeline's south door now places you just below the Decision Room's north (Hallway of Time) door, facing south. A new game still starts at the room's original center spawn, and loading a save is unchanged.
- The spouse in the Decision Room walks at 65% of the player's walking speed (derived from the player's speed, so it follows future changes). Their walk animation advances at the same reduced rate, so each frame covers the same distance as the player's and their feet don't slide.
- The Hallway of Time now ends in a solid stone south wall, drawn as a bevelled band seen from above: its inner edge meets the floor and its face slopes down and outward toward the bottom of the screen, in the corridor's stone with brick courses running along it, darkest at the floor edge and catching light at the outer rim. Diagonal miter seams join it to the side walls. The wall's face looks back toward the room, so what is mounted on it is drawn rotated 180° and foreshortened along the slope. The south door (back to the Decision Room) is the end door recolored, with the same panels, thin gold trim, gold bar hinges and ring handle, and a warm ivory body with darker beige panel shading instead of black. It is drawn rotated, as a trapezoid that widens toward the rim, in a recessed opening with angled jambs, a worn threshold at the floor edge and a stone lintel on the rim side. Two green wall lanterns hang on the sloped face either side of it, also rotated, with their plates toward the rim, and slanted to match the door's jambs. They keep the end wall's spacing, glow and flicker, and cast a soft shadow on the slope toward the floor edge. The wall is solid, so you can't walk into the corners beside the door; the door still opens from the corridor exactly as before.

### Fixed
- Mobile: dialog form fields (every Family teller form, including Spouse details' age, retirement ages and the Roth year) now open the on-screen keyboard. Previously only single-question prompts had the hidden keyboard input, so tapping a form field or pressing A never brought up the keyboard (A submitted the form instead). Tapping a field, or pressing A while a field or a prompt's text box is selected, now focuses the field on release of the tap, which iOS Safari and Android Chrome accept for opening the keyboard. Numeric fields get the number keyboard; Return moves to the next field and confirms on the last one; A or Return then confirms as before. The keyboard input uses a 16 px font so iOS no longer zooms the page when it opens.

## [0.7.1] — 2026-10-08

### Added
- Appearance page for the player (Custom Setup, after Age) and the spouse (Family): hair color and shirt color are chosen on one page, each from a labeled 2×8 grid of 16 swatches with a gold frame on the choice and the color's name beside the grid. A live sprite preview shows both colors with the chosen hair length. Arrows/D-pad move within a grid and between the grids, Continue and Back; Enter/A moves to the next question, then confirms; Esc/B goes back; the mouse previews a hovered swatch and a click or tap picks it.
- Hair colors: Black, Dark Brown, Brown, Chestnut, Auburn, Red, Copper, Strawberry Blonde, Blonde, Platinum, Gray, White, Blue, Green, Purple and Pink. Shirt colors: Blue, Sky Blue, Teal, Green, Forest, Olive, Mustard, Orange, Red, Maroon, Pink, Purple, Lavender, White, Gray and Black. The player sprite wears the chosen shirt in the Decision Room and Hallway. Existing saves keep their hair and the original blue shirt.
- A married household's spouse now appears in the Decision Room as a wandering NPC, wearing their chosen hair, hair length and shirt; their hair whitens with age the same way the player's does. They stay at least two sprite widths from every wall and, every 1–10 seconds, walk 1–10 steps (one sprite width each) in a random direction that keeps them in bounds, at the player's walking pace. The player walks through them and is always drawn on top. They hold still while a dialog or the pause menu is open.

### Fixed
- Custom Setup asks the player's hair color and hair length (Short, Long) again, right after Age; the answers set the player sprite in the Decision Room and Hallway. Back from Difficulty returns to hair length.

## [0.7.0] — 2026-10-08

### Added
- Separate spouse identity, age, wages, retirement timing, 401(k), Roth, Social Security and pension inputs. Family setup follows Difficulty; the HUD lists the spouse before children. Older household wage inputs require the player to split or confirm ownership.
- Family teller with marriage, children and scheduled nanny/daycare costs. Cash and Savings remain household checking/savings accounts.
- Inflation Adjustment in Setup and Pause → Settings: On shows original setup-year buying power; Off shows nominal dollars for the displayed year. Inputs convert back to the appropriate stored basis; inflation remains active in both modes.
- Bank withdrawal choices for a gross amount or a net spendable-Cash target, with bounded tax gross-up and year-end credit for prepaid tax.
- Numeric timelines, alphabetic decision points, year navigation, saved original forecasts and selected paths, and a three-chart comparison with a shared overlay and legend. A new north-door departure runs a fresh forecast using the same seeded calendar-year economic samples.
- IndexedDB checkpoints, visible save failures, portable JSON plan import/export, and forecast exports with CSV data, exact inputs and model assumptions.

### Fixed
- Shared income scheduling for the engine and tax previews, independent spouse retirement/benefit timing, separate contribution caps, and stored dollar bases for benefits/college inputs.
- Explicit market stress reaches custom holdings through their configured exposure even when random variation is disabled.
- Duplicate property-tax shortfalls, branch history restoration and Cash-only investment purchases.

### Changed
- Compact simulation state, typed forecast samples, progressive preliminary bands, bounded static-world rendering caches, visible-year timeline rendering and fixed 60 Hz movement independent of screen refresh rate.
- Game version 0.7.0; engine 2.2.0. Leaves the Godot export unchanged.

## [0.6.5] — 2026-10-07

### Fixed
- Pause → Charts no longer reruns the Monte Carlo simulation in the Hallway of Time. Forecast results and in-flight workers are now shared across the Hallway and Pause menu, keyed on the same model inputs, path count and seed/scenario. The Hallway's 1,000-path run is also cached under its selected (pinned) Hallway scenario, which reproduces the same forecast, so Charts reuse it and the cyan Hallway path stays the same. Opening Pause mid-run waits on the Hallway's worker instead of starting a second one, and closing Pause no longer cancels it. A rerun happens only when inputs change (e.g. a decision) or a different simulation count (5,000/10,000) is chosen; switching back to 1,000 reuses the cached run. Forecast math is unchanged.
- The character sprite is pixel-crisp again in the Decision Room and Hallway of Time. Door/decor drawing left image smoothing on, so the 16×24 sprite was bilinear-blurred when scaled 4×; it now always draws nearest-neighbor at an integer scale, snapped to whole frame pixels (movement stays smooth). Environment art is unchanged.
- Entering the Hallway of Time now shows a full-screen "Generating Your Future" splash (progress bar, Press Start 2P, title-safe) while the Monte Carlo run finishes, then fades into the Hallway; it replaces the old in-Hallway loading panel. Cached or saved paths skip the splash.

### Changed
- Removed the 'You Can't Take It With You' title text from the top bar next to the Objects In Space button.
- The Generating Your Future splash reads "Simulating 1,000 lifetimes" under the title and shows only the bar and percentage (a retry hint appears only on error); the panel is shorter to match.
- Removed the "Monte Carlo journey · gains and losses · Pause → Charts for the range" banner from the top of the Hallway of Time.
- Decision Room corner pieces are redrawn for the room's top-down 3/4 camera (tops and rims visible, short front face, upper-left light, soft contact shadow): stone column with a round capital top, leafy plant in a round pot seen from above, brass candle stand, and an armchair facing into the room in place of the old wall bracket.
- The End of the Line door no longer floats at the top of the Hallway of Time: a solid stone end wall now spans the corridor, and the door is set flush and centered in it, recolored black with gold trim, hinges and handle. The wall and door stop the player on the same line; the door works as before.
- Death's Door (internal name for the End of the Line door) now has a purple wall lantern on either side, mounted on the stone end wall with a soft violet wash and a gentle flicker.
- Pause menu accepts mouse and touch: hover highlights / moves the selection and a click activates exactly like Enter/A on menu rows (Portfolio, Map, Charts, Resume, Quit), the Tab next / Esc back links, Portfolio page links, Charts shortcuts (options, ← / → year, history, real, liquid, paths, coverage, export), Map timeline numbers, hallway jump points (tap selects, click on the selected one jumps), Compare and its side/year controls, and Chart options dialog rows. Clicks map from the scaled canvas to the 1920×1080 frame, use the same rects that are drawn, ignore empty space and on-screen pad taps, and show a pointer cursor over clickable items. Keyboard / D-pad navigation is unchanged.
- Pause menu: Quit is now the last item (after Resume) and asks "Are you sure you want to quit?" with the note "Your file saved the last time you passed through a doorway". No is highlighted by default; Yes quits to the title, No or Esc/B returns to the menu with Quit still selected. Works with keyboard, D-pad, mouse and touch, and the text is fitted to stay title-safe on phones.
- **Cash-only funding:** only Cash pays bills. The game no longer drains savings, sells stocks or withdraws 401(k)/Roth money on its own; those are now your decisions. Any bill Cash can't cover hits the glass wall ("Not enough Cash to pay [year]'s bills — enter a Decision Room to raise cash"). Taxes, margin calls (no forced sale) and Roth contributions (skipped quietly when short) use Cash only. Purchases are refused with "Not enough cash — sell or transfer first." Required minimum distributions stay automatic. Engine version 2.1.0.
- New **Bank: Move Money** teller on the Decision Room's north wall (left of the Hallway door): move Savings to Cash or Cash to Savings, make a one-time 401(k) or Roth withdrawal (an early 401(k) withdrawal asks you to accept the 10% penalty), or set a standing yearly withdrawal that is paid into Cash every month and grows with inflation.
- The Portfolio teller no longer edits balances (Cash, Savings, stocks, 401(k), Roth, lot market values) during play; it still edits salary, spending, contribution rates, savings rate, retirement age and setup inputs. New-game setup is unchanged.
- Starman (Standard portfolio) now starts with $155,000 Cash (was $15,000; everything else unchanged), so his first glass wall stays about 15 years out: 2040 at age 44 if nothing changes, 2039 at age 43 at the median across 1,000 simulated paths.
- The Hallway now follows the path whose first glass wall is the median year across 1,000 simulated paths (ties go to the ending net worth nearest the median). Pause → Charts leads with "First glass wall · median year (age) · P10–P90", with the wall-free rate as a second line. Saved Hallway paths from the previous rules are dropped on load and chosen again.

## [0.6.4] — 2026-10-05

### Changed
- Hallway of Time now follows one complete Monte Carlo path selected nearest the terminal net-worth median of 1,000 simulations, including failed paths. Simulated gains, losses, inflation and life events drive the HUD, year doors, funding wall and ending through the shared monthly engine.
- Persist the selected seed/path on the game across saves, year rooms, timeline rewinds and changed decisions; larger chart ensembles refine uncertainty bands without rerolling the Hallway.
- Charts overlay the Hallway path separately from the pointwise median; yearly costs and CSV export use that same path. Existing recorded journeys are preserved.
- Initial Hallway projections run in a worker with progress and blocked movement/doors until ready; Menu remains available, failed requests can be retried, and canceled workers cannot overwrite a newer result.
- Added regression checks for path selection, continuity, persistence, loading/retry and worker behavior. Game/module cache version **0.6.4**, engine **2.0.1**; the v0.6.3 mobile-control fixes and Godot `v2/` export are preserved.

## [0.6.3] — 2026-10-05

### Fixed
- Mobile fullscreen pause: on-screen **Menu** (synthetic Escape) no longer no-ops while OS fullscreen is active. Trusted Escape still exits fullscreen without opening pause; Menu and Escape still pause in the iOS viewport-fill fallback and on desktop.
- Hallway glass wall description: bump detection again fires when walking north with the **joystick** (not only ArrowUp / D-pad keys), and **A** / confirm while facing the glass opens the funding-shortfall dialog.

### Changed
- Starman Standard portfolio retuned for engine v2 funding walls (dollar inputs only; no engine math changes): salary $80k, spend $48k, Cash $15k, savings $35k, stocks $85k (basis $72,250); home / mortgage / 401(k) / ZIP / difficulty unchanged. Deterministic hallway smoke: glass year index ≈ **15**, starting Cash **$15,000**, starting net worth **$307,000**.
- Cache-bust / `GAME_VERSION` bumped to **0.6.3**; the Godot `v2/` export is unchanged.

## [0.6.2] — 2026-10-04

### Added
- Financial engine v2 with twelve monthly cash-flow periods, authoritative investment lots, tax-year records and annual reconciliation statements.
- Seeded correlated lognormal equity/bond returns; shared account exposures; 1,000 / 5,000 / 10,000-path Monte Carlo in a worker.
- Forecast percentile bands, funding success and sampling intervals, nominal/real dollars, liquid-asset view, stress cases, coverage warnings and CSV export. Enter / mobile A opens chart options.
- Planning inputs for SSA statement benefits, spouse wages, allocations, fees, Roth basis/opening year, living/healthcare/college costs, investment/property basis and tax assumptions.
- Node regression tests and documented model coverage in `docs/financial-model-v2.md`.

### Fixed
- Stock sales, automatic deficit funding and margin calls now reduce actual holdings, shares and tax basis.
- Down payments and discretionary purchases reject insufficient funding; automatic spending cannot create unlimited unsecured credit.
- Income and property taxes are separate from living costs; fixed mortgage payments use monthly amortization and retain unpaid balances.
- Payroll taxes, savings interest, realized gains/loss carryovers, benefit taxation, legal contribution caps and RMDs enter the annual tax record.
- Missing SSA and Roth data no longer produce invented benefits or assumed tax-free earnings.
- Funding walls test unpaid obligations instead of an empty checking account; elapsed-year records and the age-100 terminal state are committed to the selected timeline.
- Read-only, idempotent save/profile migration preserves zero inputs and reconciles legacy lot/aggregate conflicts; original stored entries remain untouched on load.

### Changed
- Illustrative long-horizon planning defaults replace automatic extrapolation of 2016–2025 stock-market averages. Quotes update valuation only.
- Cache-bust / `GAME_VERSION` bumped to **0.6.2**; the Godot `v2/` export is unchanged.
- State tax approximations and unsupported advanced tax/benefit cases are explicitly described in game and documentation.

## [0.6.1] — 2026-10-04

### Fixed
- Stock lookup no longer fails immediately in the browser. Yahoo chart does not send Access-Control-Allow-Origin (and returns HTTP 429 without a browser User-Agent), stockprices.dev is a Cloudflare DNS error, and Stooq's TLS handshake fails, so every ticker including listed Nasdaq SPCX died before the timeout. The quote now comes from CNBC's keyless JSON, which sends Access-Control-Allow-Origin: * for https://dkossin.com, with the CNBC chart as a fallback. Prices are still only what the feed returns.

### Changed
- Cache-bust / `GAME_VERSION` bumped to **0.6.1**

## [0.6.0] — 2026-10-04

### Added
- Researched USA market assumptions (2016–2025) drive Difficulty defaults: S&P 500 total-return growth/volatility, CPI inflation, national savings APY, 30-year mortgage rate. Optimistic / Standard / Grim packs with documented deltas (`js/finance/marketAssumptions.js`).
- Online stock quote lookup (Yahoo chart → stockprices.dev → Stooq) with ~0.5s Loading indicator, ~10s timeout, and clean fallback; per-ticker growth/volatility from up to 10y history when available.
- Character creation reorder: Name → Year → Age → Difficulty → ZIP → Finances (Cash checking, Savings+rate, Salary) → Retirement (age, 401(k), Roth) → Investments (total or specific stocks with volatility) → Homes (own/rent) → Family (marital status, children) → Expenses (prefilled) → Portfolio overview (“Enter The World”).
- Roth IRA balances/contributions with after-tax contribution and untaxed qualified withdrawals; traditional 401(k) tax treatment unchanged in spirit.
- Per-stock holdings with growth % and volatility %; yearly equity path uses growth ± volatility via existing seeded RNG.
- Blank ZIP uses national tax/property averages; ZIP sets state income + property tax defaults.
- New Decision Room **Portfolio** teller to edit portfolio parameters; pause menu **Quit** returns to main menu.
- Mouse/pointer can select dialog Accept / Back / menu options.

### Changed
- Player-facing liquid cash labeled **Cash (checking)** (internal keys may stay `bank` / `cash`).
- Difficulty options renamed Optimistic / Standard / Grim (legacy `easy`/`difficult` still resolve).
- Cache-bust / `GAME_VERSION` bumped to **0.6.0**

### Notes
- Do not invent stock prices; failed lookups fall back to manual entry + difficulty market averages.

## [0.5.19] — 2026-10-04

### Fixed
- Ending headline ("You can't take / it with you…") was hardcoded at 428px when the frame moved to 1920×1080 (it had been 9px on the old 320-wide canvas). Press Start 2P is one em per glyph, so that line was about 6000px wide: it clipped both sides of the gold frame and the two lines overlapped. The headline now caps at the title-screen size (64px) and shrinks until the widest line fits inside side margins (6% of the frame width, at least 96px). It stays centered. Stats, the New Game menu, and the "Your life ledger" heading use the same fit, with line spacing taken from the font size so nothing stacks on itself. Desktop and a portrait phone share this frame; the page only letterboxes it.

### Changed
- On-screen controls follow what you are doing. Walking the Decision Room or Hallway (no menu, and no dialog that needs up/down) keeps the joystick. A menu, the pause menu (Portfolio, Map, and Charts), the title menu, setup choices, the ending menu, and any dialog choice list (including Yes/No and prompt Accept/Back) hide the joystick and show a 4-way D-pad in the same corner. A D-pad tap sends one arrow key, the same step the keyboard uses, and does not confirm. Holding repeats after a short delay (about 140ms) and releasing stops. The joystick no longer nudges menu arrows. A and B stay. Run stays while walking and hides in menus. Opacity is unchanged.
- Cache-bust / `GAME_VERSION` bumped to **0.5.19**

## [0.5.18] — 2026-10-03

### Added
- On-screen **joystick** replaces the mobile d-pad (same lower-left corner). Touch the base or the stick and drag: the stick follows the finger and stays inside the base. Full deflection is full walk speed. Past a small deadzone (18% of travel), shorter deflection scales speed down to a stop. Releasing centers the stick and stops movement. A, B, and Run stay separate buttons. The joystick does not confirm dialogs or open the menu. Keyboard movement is unchanged.

### Changed
- On-screen controls are a bit more transparent and still readable: joystick base fill 0.58 (knob 0.70), Run 0.66, A 0.62, B and other buttons 0.58, Menu 0.78. Was about 0.70–0.80 (Menu 0.90).
- The bottom interact prompt sits higher in the 1920×1080 frame (chip bottom is 60px above the frame edge; it was about 18px). A slightly transparent black chip sits behind the text only, not a full-width bar.
- Cache-bust / `GAME_VERSION` bumped to **0.5.18**

### Fixed
- Door collision is the painted door slab, flush with the wall face. The north Decision Room door, Hallway south door, and End of the Line door no longer let the player walk into the art. Year doors and the west return door use the same slab; those already sat on wall tiles, so the walkable floor there does not shrink. Which doors can be used is unchanged.

## [0.5.17] — 2026-10-03

### Added
- **Full screen** button (top bar) and the F key. Desktop and mobile browsers that support the Fullscreen API enter fullscreen on the page. Where that API is missing (iOS Safari on a normal element), the button instead fills the viewport (`100dvh` / `100vw`) and hides the page chrome we control. That fallback is not operating-system fullscreen. The label switches to **Exit full screen** on `fullscreenchange` or when the fallback is on.
- Touch pad **Run** button. Hold it to move at 1.8× walk speed. Releasing it returns to a walk. It does not confirm dialogs or open menus.

### Changed
- Decision Room rug is deep blue, still with a gold border and medallion. The shadow ring around the rug is gone. Wall-to-floor shading is unchanged.
- Hair fades toward white from age 50 to age 100 on the shaded walk sprite (standing and all eight frames, four directions). The amount is the live age: `0` at 50 and below, `1` at 100. Skin and clothes are not tinted.
- Landscape (viewport wider than it is tall) uses a shorter top bar, no hint line, and tighter padding so the 16:9 frame fills more of the window without stretching. Portrait keeps the touch pad and the previous spacing.
- Decision Room teller windows are painted like the doors (shaded wall, wood planks, iron). Each window keeps its hit target and shows one icon: house (home), rising chart (stocks), child (kid), shopping bag (large purchase), paycheck and coin (job / retire), stack of coins with an arrow (borrow).
- Cache-bust / `GAME_VERSION` bumped to **0.5.17**

## [0.5.16] — 2026-10-03

### Changed
- Player walk is an eight-frame cycle in four directions, with a small body lift and a slight hair bounce. The sprite is shaded so the hair, face, shirt, and legs read as round, and the back view shows the back of the head, ears, and shoulders. Running uses the same cycle, faster.
- Decision Room floor is calm square tiles (not busy planks). Walls in the Decision Room and Hallway are shaded like raised walls: lighter along the top, darker where they meet the floor, with a soft shadow. Rug, doors, corner decor, and hallway stone are painted at higher resolution instead of blown-up 16px tiles. Doors stay flush in the wall.
- Center rug is burgundy with a gold border and medallion. Each corner has one piece of decor (pillar, plant, sconce, bracket). Doors are top-down, set in the wall, with iron hinges and a round handle. Hallway floor and walls are cool blue-gray stone, the walk is a little wider, and year doors sit farther apart. Four-digit years and a white January-plus-11-months spine sit in the left margin, not on the doors. Pause portfolio text uses a slightly smaller font and more line breaks.
- Hold Space while moving to run at 1.8× walk speed. A Space tap still confirms; holding Space does not repeat-confirm tellers or menus. Touch controls stay at walk speed.
- Cache-bust / `GAME_VERSION` bumped to **0.5.16**

## [0.5.15] — 2026-10-03

### Changed
- Internal frame is 1920×1080. The pixel world integer-scales (4×). HUD, text, charts, and menus are drawn at that resolution and use the full wide frame.
- Decision Room walkable floor is the original 20×14 tile room (about the old 320×240 playfield), centered in the wide frame. Left and right margins are the same non-walkable void as the Hallway of Time. The hallway stays a vertical corridor.
- Godot V2 HTML5 rebuild is at `/v2/` (Starman standard portfolio, Hallway of Time, six tellers).
- Cache-bust / `GAME_VERSION` bumped to **0.5.15**

## [0.5.14] — 2026-10-03

### Changed
- Standard starter is Starman, age 30, married, no children: salary $78,000, spend $50,000, primary home $380,000 with a $270,000 mortgage at 6.5% and 27 years left, Cash $5,500, savings $15,000 at 2%, stocks $41,500 (basis $35,275), 401(k) $62,000 (6% contribution, 100% match on the first 3% of salary), ZIP 85001, Standard difficulty. With no Decision Room edits, Cash first hits $0 at glass index 15; starting net worth is $234,000. Replaces the Alex age-40 / one-child starter (glass index ~6).
- Decision Room west door is tied to a year-door timeline split. Returning to the starter room through the Hallway south door restores that room and does not add a west door. After a later year door splits the hallway, that new room and the prior room both have a west door back to the hallway.
- Pause map rebuilt as a vertical tree: time goes up, columns numbered 1, 2, 3…, calendar years on the left. A is where a timeline begins, B is the parent branch in that same year, C is age 100 only after that timeline is played there. Forks are horizontal; the line below a child A is dashed. Compare still needs two timelines and does not invent years before a fork.
- Cache-bust / `GAME_VERSION` bumped to **0.5.14**

## [0.5.13] — 2026-10-03

### Changed
- Top-left back link label is **Objects In Space** (was Macinapp). The link still goes to the site homepage.
- Cache-bust / `GAME_VERSION` bumped to **0.5.13**

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
