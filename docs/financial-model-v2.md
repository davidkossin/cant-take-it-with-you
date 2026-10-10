# Financial model v2 — existing JavaScript game

Game development version: **0.7.5**. Engine version: **2.3.0** (funding rule **cash-only**). Assumptions: **planning-2026-3**. Federal rule set: **irs-2026-1**. Original rule review October 4, 2026; cash-only funding and median-first-wall Hallway selection October 7, 2026; standing stock-sale plan added October 10, 2026. See [the planning update](planning-update.md) for household ownership, currency units, gross-up, timelines and persistence.

This corrects the existing game’s financial system; it does not recreate the game. Room/teller decisions, the hallway, timeline forks, saves, profiles and ending remain in the root JavaScript application.

The engine supports household planning scenarios within the coverage below. It does not claim feature parity with a commercial planner or comprehensive tax-return software. Every Monte Carlo path uses the same monthly accounting engine as gameplay. Unsupported cases are described in **Planning inputs → Model coverage** and **Charts → Coverage**.

## Corrections relative to the original model

| Original behavior | Corrected behavior |
|---|---|
| Stock sales edited aggregate caches; later valuation restored holdings | Lots hold value, shares, basis and dates; every liquidation updates them. Valuation is read-only. |
| Unfunded down payments created property equity | Purchases are atomic and paid from Cash only (down payment and closing costs). Short Cash rejects them with “Not enough cash — sell or transfer first.” Nothing is sold to cover them. |
| Deficits became unlimited interest-free unsecured debt | Funding stops at Cash. Required unpaid costs fail the path (glass wall); legal debt/tax obligations remain liabilities. |
| The engine drained savings, sold stocks and withdrew 401(k)/Roth money to pay bills | **Cash-only funding:** only Cash pays bills. Moving savings, selling assets, borrowing and retirement withdrawals are player decisions made in a Decision Room. Only RMDs and the player's own standing instructions (a retirement withdrawal plan, a stock-sale plan, a Savings↔Cash transfer plan) move money automatically. |
| Mortgage interest/principal approximated annually; terminal balance cleared | Twelve monthly amortization payments, zero-APR support, fixed scheduled payment and actual final/balloon payment. Unpaid interest capitalizes. |
| Income taxes could enter household spending and be charged again | Living costs are separate from housing, property costs, child/college costs, taxes and contributions. |
| Uniform growth ± volatility; Standard could not lose money | Lognormal total-return draws match configured arithmetic mean and standard deviation and can have negative years. |
| Each wrapper drew its own unrelated market return; seed restarted annually | Shared equity/bond factors across taxable/retirement accounts, calendar-year/path-index keys and stable ticker-specific shocks. |
| Recent stock history became future growth automatically | A quote sets only today's price. When price history is available, its annualized mean/volatility are shown as a labeled reference only ("past performance is not predictive, especially for individual stocks"); the growth/volatility fields the player confirms always default to the planning assumption, never to that history. |
| Social Security approximated from peak salary at retirement | User-supplied SSA benefit at claim age, separate claiming age, COLA and a core annual earnings test. No statement means $0. |
| Roth contributions unlimited and withdrawals assumed qualified | Compensation/MAGI caps, contribution-basis access, five-year qualification clock; unknown earnings are unavailable. |
| Checking balance ≤ $0 implied insolvency | A shortfall in a modeled monthly obligation fails the path. Zero cash with funded costs is valid. |
| Charts skipped elapsed years; ending used an earlier portfolio | Elapsed-year results attach to the destination timeline node; age-100 state is committed once. |

## Accounting and cash-flow timing

A state is **January 1** at its displayed age/year. Integer ages imply a January 1 birthday; month-specific birthdays are not implemented. Projection processes that calendar year, then returns the next January 1 state. A hallway door labeled 2027 contains the results of calendar year 2026.

Within each month:

1. Apply retirement timing; receive each owner’s wages, employee deferrals, employer match, benefits and pension payments, plus one month of the player's standing retirement withdrawal, if set. W-2 income tax is prepaid monthly from that month's Cash using an annual estimate; final tax credits those payments.
2. Apply month-end market/savings/property growth. An annual economic draw is converted to twelve equal monthly gross factors. This captures cash-flow ordering against annual market regimes; it is not independently calibrated monthly market noise.
3. Receive rental revenue after vacancy, and pay property tax, operating costs and scheduled debt payments.
4. Pay living costs, residence rent, incremental healthcare, child/college costs and any scheduled shock from Cash. Repay a margin call from Cash; there is no forced sale.
5. At year-end, take required distributions into Cash, fund eligible Roth contributions from Cash left after reserving tax due, and pay actual annual taxes from Cash. Unpaid tax stays payable and fails the year.
6. Advance age/year and inflate future living, rent, property-cost overrides and education/healthcare inputs. A mortgage’s fixed scheduled payment does not inflate.

**Cash-only funding.** Every payment above comes from Cash alone. The engine never moves Savings, sells holdings or homes, or withdraws 401(k)/Roth money on the player's behalf. The exceptions are required minimum distributions and the player's own standing instructions: a standing retirement withdrawal, a standing stock-sale plan (sold proportionally across liquid holdings, or from one chosen holding), and/or a standing Savings↔Cash transfer plan, each an instruction the player chose and can cancel. A stock-sale plan's realized gains are taxed through the normal year-end capital-gains settlement, the same as a manual sale; a Savings↔Cash transfer plan quietly caps at whatever the source side has that month rather than failing the year, since it is not a required cost. If Cash cannot cover a required cost, the shortfall is recorded, the year is unfunded and the Hallway shows a glass wall. Snapshot `k` is the first January 1 after an unfunded year Y−1; the last door the player can enter is January 1 of Y−1. There the player raises Cash with Decision Room actions: the **Bank** teller (Savings ↔ Cash, one-time 401(k)/Roth withdrawal, standing yearly withdrawal), **Stock Broker** (including a standing stock-sale plan), **Manage Property**, **Borrow / Loan**, **Career**, or lower spending in Portfolio. During play the Portfolio teller edits income, spending, contributions and setup inputs; balances are locked there and change only through these actions.

Balances use cents; annual amounts are allocated across months with cent residuals so twelve payments total the entered annual amount. Debt principal, employee contributions, investments and withdrawals are transfers, not household investment profits. Employer match is external compensation. Loan proceeds increase assets and liabilities equally.

`lastStatement` records actual income, required/paid expenses, contributions, investment growth, funding shortfalls, tax liability/prepayments, beginning/ending worth and a reconciliation difference. Transaction detail is bounded to 600 entries; forecasts suppress detail. Historical elapsed-year snapshots omit transaction arrays.

Net worth includes cash, savings, taxable holdings, traditional 401(k), Roth, property value, and all modeled debt/income-tax/property-tax liabilities. “Available liquid” excludes retirement accounts, real estate and holdings marked illiquid; it is a reporting measure, not money the engine spends. No asset is sold automatically to make a forecast succeed.

Missed consumption is recorded as unmet spending rather than invented credit. Unpaid income/property tax remains payable. Unpaid loan principal remains owed and unfunded interest capitalizes. A failed path continues in the percentile distribution and stays failed even if its wealth later recovers.

## Investments and borrowing

All taxable sales are player sales (Stock Broker, Manage Property) and use lot basis and acquisition dates; the engine makes no deficit-funding or margin sales. Default disposition is proportional across liquid lots; the engine also supports one selected lot, at either the engine's tracked price or a player-entered override -- an override rescales only the cash and gain credited, never the fraction of shares/basis the lot gives up, so the gain and tax stay consistent with whatever price the player actually sold at. More than one year is required for long-term treatment. Missing legacy dates use provisional long-term treatment with a warning; missing basis is flagged and voluntary sales require verification. Forecasts use the stored provisional basis until corrected.

A **standing stock-sale plan** (Stock Broker / Career) is the one case where a sale happens without a fresh decision each year: the player sets a yearly amount (today's dollars, grows with inflation) that is sold proportionally across liquid holdings, or from one chosen holding, in equal monthly parts and paid into Cash. It is rejected at setup from a holding with unverified basis, the same guard as a manual sale. It is still the player's own instruction, cancellable at any time by setting the amount to 0 — not the engine deciding to sell.

Dividends are paid into cash and taxed; they are not automatically reinvested. The configured equity return is a **total-return** assumption, so dividend yield is removed from price growth to avoid adding dividends twice. Bonds’ ordinary cash yield follows the same decomposition. Fees reduce investment value. Retirement accounts receive their shared allocation return without separately taxable dividends.

A purchase creates a new investment lot. Buying the default MARKET holding represents a broad equity investment; it does not invent a live ticker quote.

Mortgage/home and consumer-loan payments use the standard monthly payment formula. Manage Property's Refinance a Mortgage is rate-and-term only: it replaces a home's rate/term at the same principal owed and charges closing costs (2% of the balance) from Cash; it is not a cash-out refinance and does not change how much is owed. HELOC/securities loans retain the game’s explicit collateral limits and amortizing-loan assumptions; they are not lender approvals or revolving-line simulations. A margin call (loan above `m × collateral` at maintenance fraction `m`) is repaid from Cash only, down to that limit. No savings move and no shares are force-sold. Any excess Cash cannot repay fails the year (glass wall), and the monthly re-check does not count the same excess twice. The player can then sell shares, add Cash or repay in a Decision Room.

Home purchase closing costs default to 2%; selling costs to 6%, both explicit modeling assumptions. Property basis must be verified for a sale. Primary-home gain exclusion requires an explicit ownership/use eligibility confirmation. Rental depreciation recapture requires a verified external estimate when depreciation has been recorded. Passive loss carryovers, depreciation computation, section 1231 treatment and detailed tax recapture are not automated.

Rental revenue is independent of whether the owner rents their own residence. Defaults include 5% vacancy, maintenance at 1% of market value and insurance at 0.3% unless explicit annual amounts are entered. Property tax uses an explicit annual amount or assessed value × rate. Annual property-tax dollar overrides grow at entered/default inflation. State-specific assessment caps are not modeled.

Child costs at ages 0–17 are a flat state average annual cost of raising a child, chosen from the player's ZIP (`js/data/stateChildCosts.js`; 50-state average of $23,673 when the ZIP is blank, invalid, DC, a territory or military) and inflated with the price index; they are not a personalized family budget. College defaults to an illustrative **$28,000 per child per year at ages 18–21**, separate from living costs. Extra healthcare and college costs are editable; scholarships, 529 accounts, insurance benefit schedules and long-term-care events are not modeled automatically.

## Tax coverage

| Area | Implementation / limits |
|---|---|
| Filing | Single and married filing jointly. Separate owner wages for payroll caps. Other statuses unsupported. Family Planning's divorce resets filing status to single and the departing spouse's separately-owned wages/accounts stop being processed from that point on; joint Cash, Savings and investments split by a player-chosen percentage are a non-taxable transfer (no gain/loss recorded), matching the tax treatment of a property settlement incident to divorce. |
| Federal ordinary income | Published 2025/2026 progressive thresholds and standard deductions; additional age-65 deduction; eligible senior enhancement sunsets after 2028. |
| Capital gains | Short-/long-term netting, annual $3,000 net-loss deduction and character-preserving carryover; 0/15/20% preferred-income stacking. |
| Income sources | W-2 compensation, savings interest, qualified/ordinary dividends, realized gains, traditional withdrawals/pensions, taxable benefit portion and positive rental profit. |
| Payroll | Employee Social Security wage cap per owner, Medicare and Additional Medicare. Employer payroll cost and self-employment tax not modeled. |
| Investment tax | NIIT and core AMT for implemented income categories. ISO preferences/AMT adjustments need verified manual inputs. |
| Credits/deductions | Nonrefundable child credit and verified manual itemized deduction input. Refundable credits/EITC, QBI, tips/overtime deductions and complex deduction limits are excluded. |
| States | No-income-tax states have zero core income tax. AZ uses core 2.5%/deduction approximation; CA projects published 2025 brackets/deductions. Other states use an explicit labeled flat-rate approximation. WA capital-gains tax/local taxes are excluded. |
| Property taxes | Separate cash expense/liability; never added again to federal/state income-tax total. |
| Future/historical years | Years beyond 2026 use indexed thresholds and caps, not enacted future law. Before 2025 uses a projected 2025 base and is labeled. Nonindexed SSA taxation/NIIT thresholds remain fixed. |

Itemized input is a verified **total deduction**, not a second copy of housing cash outflow. The engine does not infer SALT limits, mortgage-interest eligibility, charity restrictions or all state adjustments. Senior enhancements use core AGI phaseout; foreign income and other MAGI adjustments are outside scope.

## Retirement and benefits

Employee deferrals use age/year contribution limits and do not reduce payroll wages. Employer match is constrained by plan assumptions and combined limits. High earners subject to mandatory Roth 401(k) catch-up are limited to the regular pre-tax cap until a separate Roth 401(k) implementation exists; the warning is explicit. If prior-year wages are missing, current salary is used for this conservative gate.

Traditional withdrawals happen only when the player makes them at the Bank teller: a one-time gross amount/net Cash target, or a standing yearly amount. Input units follow Inflation Adjustment; the stored standing amount grows with inflation and is paid into Cash monthly. Withdrawals are taxable income. Net-target mode prepays incremental estimated tax and credits it once at year-end; gross mode can defer tax until then. Access starts at age 59½ for each owner. Earlier withdrawal requires the player's acceptance of the modeled 10% penalty, absent an exception; a standing plan without early access waits until 59½. Plan-specific in-service access and rule-of-55 eligibility are not inferred.

Roth regular contributions are made at year-end, after compensation and modeled MAGI eligibility are known, from Cash left after reserving tax due. Savings are never moved to fund them. They are optional savings goals, skipped quietly when Cash is short and never a required-spending failure. Roth withdrawals are player actions; verified contribution basis is accessible first. Qualified earnings require age 59½ and a supplied opening year satisfying the five-year clock. Unknown earnings are blocked; conversion ordering/recapture is unsupported.

RMDs remain automatic and are paid into Cash; each owner's traditional withdrawals count toward that owner's RMD. They use the prior December 31 balance, cohort start age and Uniform Lifetime divisors through the age-100 horizon. Ordinary pension income does not satisfy a 401(k) RMD. The still-working exception requires an explicit election and absence of the modeled 5% ownership flag. Each person has one modeled traditional and one Roth account; inherited accounts, younger-spouse tables and multiple same-owner retirement accounts remain unsupported.

SSA inputs are statement benefits at the selected claim age in today’s dollars; the engine can also accept a full-retirement-age statement amount and apply the claim-age adjustment. Benefits can begin at 62 and are independent of retiring from work. COLA follows simulated inflation; entered future-dollar claim amounts receive COLA after claim. Core annual earnings limits are included. First-year monthly tests, withheld-benefit credit recomputation, spousal/survivor/disability benefits and older-cohort delayed credits require external verification.

## Market and Monte Carlo assumptions

Defaults are **illustrative long-horizon inputs**, not forecasts fitted to the unusually strong 2016–2025 decade. Scenario names change economic inputs, not tax law or hidden expense multipliers.

| Standard input | Value |
|---|---:|
| Arithmetic annual equity total-return mean | 6.5% |
| Annual equity simple-return standard deviation | 18% |
| Arithmetic bond total-return mean / standard deviation | 3.5% / 6% |
| Inflation mean / standard deviation | 2.5% / 1% |
| Salary growth | 3% |
| Savings APY | 2.5% (entered account rate overrides) |
| Annual investment fee | 0.2% |
| Equity dividend yield | 1.5% |
| Home real-return mean / annual volatility | 1.25% / 5% |
| Equity/bond log-shock correlation | 0.10 |

Optimistic uses 8% equity mean, 16% volatility and 2% CPI. Grim uses 4.5%, 22% and 3.5%. Overrides are stored with the portfolio. Specific stocks use a common equity factor plus stable ticker-specific risk, with 35% default volatility and no automatically inferred permanent alpha. Multiple lots of the same ticker receive the same return. Other correlations and tax-sensitive asset-location optimization are not calibrated.

The home mean is calibrated to ~50 years (1975-2025) of FHFA All-Transactions HPI and S&P/Case-Shiller U.S. National Home Price Index history: nominal CAGR ~4.9-5.0%, real (CPI-deflated) ~1.0-1.5%; this model uses 1.25% real. Unlike an individual stock's recent-history prefill (deliberately avoided elsewhere in this document), a 50-year national index is a long-horizon calibration consistent with this model's own stated philosophy, not a recency-biased fit — though the headline CAGR is still start-year sensitive (anchoring right after the 2006-2012 bust trough versus a pre-bust year can swing it several points). The national index's annual volatility has no single clean long-run citation; 5% is a labeled analyst estimate, not a sourced figure like the mean.

For arithmetic simple-return mean `a` and standard deviation `v`, the lognormal parameters are:

```text
s² = ln(1 + v² / (1+a)²)
m = ln(1+a) - s²/2
return = exp(m + s×z) - 1, z ~ Normal(0,1)
```

This matches the configured simple-return moments. The Hallway now follows **one actual, complete Monte Carlo trajectory**, replacing the old zero-shock reference projection. On its first entry, a worker simulates 1,000 paths from the committed room baseline through age 100. Each path's **first glass wall** is its first unfunded year; a path with no wall counts as never (infinity). The Hallway scenario is a path whose first wall equals the median (nearest-rank, an actual path's value) of those 1,000 years. Among paths sharing that year, it takes the one whose terminal nominal net worth is closest to their median; equal distances use the lowest simulation index. The scenario records `selection: median-first-wall` and `fundingRule: cash-only`. The selected path is replayed through the shared monthly accounting engine to populate the HUD, year doors, event auras, funding wall and age-100 ending. It contains simulated gains, losses, inflation and life events rather than a fixed annual growth rate.

Each timeline stores its seed, simulation index, original forecast and selected actual path. Saves/reloads and revisiting its Hallway retain those results. Entering a Decision Room and leaving north creates a new timeline, runs a new ensemble with the same calendar-year/path-index economic samples, and selects its own median-first-wall played path. Different decisions can change that selected index; comparison uses the complete forecasts rather than treating two differently selected paths as identical economic cases. Changing asset exposures changes financial outcomes while seeded ticker/year shocks remain reproducible. Original forecasts absent from older saves are marked unavailable; recorded historical balances are retained.

Selecting by the median first wall does not make this path the median at every age, a guaranteed future, or a path guaranteed to fund the plan. It can pass outside the chart's percentile bands or encounter a funding wall. While initial simulations run, movement and doors wait, progress is shown, and Menu remains available. A worker failure leaves the baseline intact and supports A / Enter to retry; there is no silent fallback to deterministic growth.

Forecasts use 1,000 paths initially; 5,000 and 10,000 are available. Before a Hallway scenario is committed, larger chart ensembles use their first 1,000 paths for the same Hallway preview selection. After commitment, every chart ensemble overlays the saved scenario even if its simulation index lies outside the requested chart sample count. RNG keys contain the master seed, simulation index, calendar year and shock namespace. Branch alternatives therefore reuse economic shocks for the same year/path. Worker requests are canceled/replaced on changed inputs, with a bounded cache keyed by model inputs, the Hallway scenario, engine/assumption/tax versions, the funding rule and the selection rule. Canceled workers cannot replace a newer request's result.

Charts show pointwise P10/P25/P50/P75/P90 net worth or available liquid assets, with the complete Hallway path drawn separately in cyan. Real values divide each path by its simulated price index in the **original setup-year** dollar base. Pointwise percentile lines are not individual attainable paths. Failed paths remain included. The Charts headline is the **first glass wall**: the median year/age across paths with P10–P90 years (“none” = no wall through age 100). The wall-free rate is a secondary line. Its 95% Wilson interval covers Monte Carlo sampling error only, not economic-model uncertainty. Lognormal annual shocks are not a calibrated fat-tail/regime model and do not cover every future outcome. Return assumptions and explicit stock-growth overrides are unchanged; Monte Carlo does not correct an unrealistic input assumption by itself.

Wall-free (success) means Cash paid every modeled monthly obligation through age 100 with only the player's chosen instructions and RMDs moving money into Cash. Nothing is sold or withdrawn automatically unless the player set up a standing retirement withdrawal or stock-sale plan, so most plans hit a wall unless the player sets one of those up or keeps Cash funded. Optional Roth contributions are treated separately. Stress examples apply an early -40%/-15% equity sequence or 7% inflation for five years; those are scenarios, not probabilities.

Forecast export is one JSON download containing CSV text with nominal/real percentiles, the structured forecast and Hallway path, exact input/assumption snapshots, seed/scenario, wall-free and first-wall metrics, model versions and the plan backup. In-game coverage notes remain necessary context when sharing results.

## Migration and validation

Loading clones and migrates a save/profile without overwriting the original localStorage entry. Re-saving creates a migrated version through the existing save flow. Migration normalizes legacy expense breakdowns, retains legal zeros, creates loan schedules and flags missing basis/benefit data. When legacy lots disagree with saved aggregate balances, lots are proportionally reconciled to those stored totals and flagged for verification. Trades already erased by legacy saves cannot be reconstructed from absent records.

Previously recorded worth rows and timeline nodes are marked legacy; their historic financial outcomes are not recomputed. Real-dollar historic values for legacy rows with no price index are not fabricated. New elapsed-year results are stored on the selected destination node, with exact-year comparison and one terminal commit.

Validation commands: `npm test`, `npm run check`, `node scripts/benchmark.mjs 1000`. Automated checks cover regression defects, known-answer tax/payroll fixtures, contributions, loans, cash-only funding (no automatic savings moves, sales or withdrawals; Cash-only purchases, margin calls, taxes and Roth contributions), Bank teller transfers/withdrawals/standing withdrawals, a standing stock-sale plan's monthly timing/tax/inflation growth/basis guard and its isolation across Monte Carlo paths, a standing Savings↔Cash transfer plan's monthly timing/cap/inflation growth, a manual stock sale's price-override keeping the removed share/basis fraction tied to the chosen $/% rather than the override price, full Decision Room teller flows end to end (Back/Escape re-asking the previous question rather than exiting, scripted exactly as a player would answer), the Portfolio balance lock, funding/shortfalls, Roth/SSA/RMD rules, migration, history, market moments/correlation, reproducibility, percentiles and sequence risk. Additional Hallway checks verify median-first-wall complete-path selection, stale-scenario migration, gains/losses, failed-path inclusion, year-room continuity, changed-decision shock continuity, chart sample-count independence, loading/retry behavior, save/reload/rewind persistence, worker replay and stale-worker rejection. Financial fixtures use injected/zero-volatility paths where appropriate. Canvas rendering checks inspect the room, loading Hallway, completed Hallway and forecast layout; these do not substitute for an interactive browser/device play test.

## Primary rule references

- [IRS 2026 inflation adjustments, Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB)
- [IRS 2025 adjustments, Rev. Proc. 2024-40](https://www.irs.gov/irb/2024-45_IRB), with 2025 standard deduction/child-credit updates described in the 2026 bulletin above
- [IRS 2026 retirement limits and Roth phaseouts](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500)
- [IRS Uniform Lifetime / distribution guidance, Publication 590-B](https://www.irs.gov/publications/p590b)
- [IRS enhanced senior deduction](https://www.irs.gov/newsroom/check-your-eligibility-for-the-new-enhanced-deduction-for-seniors)
- [SSA contribution and benefit bases](https://www.ssa.gov/oact/cola/cbb.html)
- [SSA receiving benefits while working](https://www.ssa.gov/benefits/retirement/planner/whileworking.html)
- [California FTB 2025 rate schedules](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) and [deductions](https://www.ftb.ca.gov/file/personal/deductions/index.html)
- [FHFA All-Transactions House Price Index, USA (FRED series USSTHPI)](https://fred.stlouisfed.org/series/USSTHPI)
- [S&P/Case-Shiller U.S. National Home Price Index (FRED series CSUSHPINSA)](https://fred.stlouisfed.org/series/CSUSHPINSA)

These sources establish core rule constants. They do not validate illustrative market moments, unimplemented tax cases or the accuracy of future projections.
