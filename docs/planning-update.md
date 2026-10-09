# Planning update (unpublished)

This updates the root JavaScript application.

## Apply the patch

The patch is based on upstream commit `53f88b7b85b4eb4ca8d62607f5ececfd82f58f3b`. In a clean checkout of that commit:

```sh
git apply --check /path/to/cant-take-it-update.patch
git apply /path/to/cant-take-it-update.patch
npm test
npm run check
```

Serve the repository using a static HTTP server. Module workers and IndexedDB need a supported browser/origin. The patch neither publishes the game nor changes remote Git history.

## Financial behavior

- Each person owns wages, age, retirement timing, pension, SSA inputs, traditional 401(k) and Roth accounts. Cash, Savings, taxable brokerage and property totals are household inputs. Separate payroll and contribution limits use the owner's data; joint income taxes use both people. Missing legacy salary ownership is flagged for explicit splitting or confirmation, never guessed.
- Inflation Adjustment is presentation/input conversion: On = original setup-year buying power; Off = nominal displayed-year dollars. Balances stay nominal internally. SSA and education inputs retain their separate recorded bases. Changing the preference cannot alter a forecast.
- One monthly income schedule drives projections and incremental sale/withdrawal tax estimates. Previews assume deterministic expected asset growth; the realized path can differ. Employment, contributions, benefits, pension, standing withdrawals and account depletion are included. Unsupported tax cases still need external verification.
- A gross withdrawal asks for an account reduction; a net Cash target solves for the gross amount whose proceeds after incremental estimated tax/penalties meet the target. The solver is bounded by accessible assets. Net-target withholding is credited against final annual tax once. Gross mode can defer tax until year-end; its preview shows the estimated tax.
- Checking pays expenses. The engine never automatically draws Savings, sells investments/property or borrows. RMDs and player-chosen standing withdrawals are the exceptions. A funding wall reports insufficient checking under those decisions, even if substantial other wealth exists. It is not a prediction of insolvency or proof that retirement is unaffordable.
- Explicit scenario shocks are separate from random variation and reach exposed taxable/retirement assets. Custom holdings use configured exposure, expected return and volatility; disabling randomness preserves explicit stress.
- Nanny/daycare costs have an entered annual amount and an exclusive ending year. They inflate from their entry-year index and add to the separate baseline child costs. The player should enter only additional care costs not already included in their budget.

## Timeline and storage behavior

Entering a Decision Room adds a lettered point to its parent timeline. Leaving north starts a new numbered timeline and fresh Monte Carlo run. Both use the same calendar-year/path-index seed ensemble. Each completed original forecast, its exact baseline/assumptions and selected played path remain saved. Comparison displays two original forecasts and a shared overlay in matching units. A point jump reuses saved results; playable movement cannot bypass a Cash wall.

Old saves retain their recorded nodes/snapshots. An original forecast absent from a legacy file cannot be reconstructed faithfully; the map marks it unavailable rather than inventing it. Current results are not overwritten when a chart is rerun at a larger path count.

IndexedDB stores atomic checkpoints with content-deduplicated immutable records. Existing localStorage entries are preserved during migration. Quota/unavailable storage failures are visible, the session continues, and JSON export/retry remain available. Exports include exact input snapshots, model versions, assumptions, seed/scenario, timeline history and forecasts. Forecast JSON also contains CSV data and both nominal and real-dollar metrics. Preliminary bands cannot be exported as a completed result.

## Performance and checks

Movement and animation update at a fixed 60 Hz regardless of display refresh rate; catch-up work is capped after stalls and focus changes clear held input. Forecasts run in module workers with progressive preliminary bands and compact state/typed samples. Static world layers use bounded chunks rather than a giant canvas for the entire lifetime; animated lighting remains live. Only visible hallway year ticks are rendered.

Automated checks exercise tax/accounting, personal income/retirement, gross-up and reconciliation, currency input/output, household/family dialogs, explicit stress, timeline preservation/comparison/jumps, forecast worker/caching/progress, backup validation and storage failures, refresh-rate movement/collisions, and rendering caches. Module syntax and dependency linking are also checked.

For this patch, 151 behavioral cases in 18 test files passed, and all 56 production modules passed syntax/dependency checks. In the same cloud Node environment, the Standard 1,000-path × 70-year benchmark took 6.644 seconds with about 126 MiB peak memory; the exact original took 4.827 seconds with about 139 MiB. The expanded financial model uses more CPU despite lower memory. A warm hallway Canvas-mock benchmark reduced image draws from 1,134 to 17 per frame and visible year labels from 69 to 3; these are dispatch counts, not measured browser/GPU performance.

Interactive browser validation could not run in the execution sandbox: Chromium startup was blocked by socket permissions. Before publishing, run a browser/device playthrough: custom married setup; advanced-year money inputs in both toggle positions; gross/net Bank actions; child care duration; two new north-door timelines; mouse and keyboard comparison/jumps; save/reload/import/export; touch controls and background-tab return. Automated Canvas tests do not replace this playthrough.

## Remaining model limits

Market assumptions are illustrative annual lognormal regimes, not calibrated probabilities of future economic outcomes. There is no fat-tail/regime-switching model, independent monthly market calibration or automatic optimized drawdown strategy. Benefits require entered statement amounts; spousal/survivor/disability SSA and later earnings-test adjustments are not modeled. State-tax approximations, unsupported filing statuses, retirement conversions, inherited accounts, comprehensive rental recapture/passive-loss treatment, insurance/529/long-term-care and estate planning remain outside coverage. Future tax law and user decisions can change outcomes. See [the detailed model coverage](financial-model-v2.md).
