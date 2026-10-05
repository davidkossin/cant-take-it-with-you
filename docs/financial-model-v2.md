# Financial model v2 — existing JavaScript game

Game version: **0.6.4**. Engine version: **2.0.1**. Assumptions: **planning-2026-1**. Federal rule set: **irs-2026-1**. Original rule review October 4, 2026 (America/Phoenix); Hallway integration updated October 5, 2026.

This corrects the existing game’s financial system; it does not recreate the game. Room/teller decisions, the hallway, timeline forks, saves, profiles and ending remain in the root JavaScript application. The compiled Godot `v2/` export is separate and is not changed.

The engine supports household planning scenarios within the coverage below. It does not claim feature parity with a commercial planner or comprehensive tax-return software. Every Monte Carlo path uses the same monthly accounting engine as gameplay. Unsupported cases are described in **Planning inputs → Model coverage** and **Charts → Coverage**.

## Corrections relative to the original model

| Original behavior | Corrected behavior |
|---|---|
| Stock sales edited aggregate caches; later valuation restored holdings | Lots hold value, shares, basis and dates; every liquidation updates them. Valuation is read-only. |
| Unfunded down payments created property equity | Purchases are atomic and must fund the down payment, closing costs and estimated asset-sale tax. |
| Deficits became unlimited interest-free unsecured debt | Funding stops at available assets and permitted withdrawals. Required unpaid costs fail the path; legal debt/tax obligations remain liabilities. |
| Mortgage interest/principal approximated annually; terminal balance cleared | Twelve monthly amortization payments, zero-APR support, fixed scheduled payment and actual final/balloon payment. Unpaid interest capitalizes. |
| Income taxes could enter household spending and be charged again | Living costs are separate from housing, property costs, child/college costs, taxes and contributions. |
| Uniform growth ± volatility; Standard could not lose money | Lognormal total-return draws match configured arithmetic mean and standard deviation and can have negative years. |
| Each wrapper drew its own unrelated market return; seed restarted annually | Shared equity/bond factors across taxable/retirement accounts, calendar-year/path-index keys and stable ticker-specific shocks. |
| Recent stock history became future growth automatically | Quotes set current price only. Planning assumptions and explicit user overrides determine future returns. |
| Social Security approximated from peak salary at retirement | User-supplied SSA benefit at claim age, separate claiming age, COLA and a core annual earnings test. No statement means $0. |
| Roth contributions unlimited and withdrawals assumed qualified | Compensation/MAGI caps, contribution-basis access, five-year qualification clock; unknown earnings are unavailable. |
| Checking balance ≤ $0 implied insolvency | A shortfall in a modeled monthly obligation fails the path. Zero cash with funded costs is valid. |
| Charts skipped elapsed years; ending used an earlier portfolio | Elapsed-year results attach to the destination timeline node; age-100 state is committed once. |

## Accounting and cash-flow timing

A state is **January 1** at its displayed age/year. Integer ages imply a January 1 birthday; month-specific birthdays are not implemented. Projection processes that calendar year, then returns the next January 1 state. A hallway door labeled 2027 contains the results of calendar year 2026.

Within each month:

1. Apply retirement timing; receive each owner’s wages, employee deferrals, employer match, benefits and pension payments. W-2 income tax is prepaid monthly using an annual estimate; final tax credits those payments.
2. Apply month-end market/savings/property growth. An annual economic draw is converted to twelve equal monthly gross factors. This captures cash-flow ordering against annual market regimes; it is not independently calibrated monthly market noise.
3. Receive rental revenue after vacancy, and pay property tax, operating costs and scheduled debt payments.
4. Fund living costs, residence rent, incremental healthcare, child/college costs and any scheduled shock. Restore pledged-stock maintenance LTV.
5. At year-end, satisfy required distributions, fund eligible Roth contributions from available cash/savings, and reconcile actual annual taxes. Funding taxes can create further taxable gains/withdrawals, so the engine recomputes until cents are settled or resources are exhausted.
6. Advance age/year and inflate future living, rent, property-cost overrides and education/healthcare inputs. A mortgage’s fixed scheduled payment does not inflate.

Balances use cents; annual amounts are allocated across months with cent residuals so twelve payments total the entered annual amount. Debt principal, employee contributions, investments and withdrawals are transfers, not household investment profits. Employer match is external compensation. Loan proceeds increase assets and liabilities equally.

`lastStatement` records actual income, required/paid expenses, contributions, investment growth, funding shortfalls, tax liability/prepayments, beginning/ending worth and a reconciliation difference. Transaction detail is bounded to 600 entries; forecasts suppress detail. Historical elapsed-year snapshots omit transaction arrays.

Net worth includes cash, savings, taxable holdings, traditional 401(k), Roth, property value, and all modeled debt/income-tax/property-tax liabilities. “Available liquid” excludes retirement accounts, real estate and holdings marked illiquid. Home equity is not automatically sold to make a forecast succeed.

Missed consumption is recorded as unmet spending rather than invented credit. Unpaid income/property tax remains payable. Unpaid loan principal remains owed and unfunded interest capitalizes. A failed path continues in the percentile distribution and stays failed even if its wealth later recovers.

## Investments and borrowing

All taxable sales use lot basis and acquisition dates, including automatic deficit funding and margin calls. Default disposition is proportional across liquid lots; the engine also supports one selected lot. More than one year is required for long-term treatment. Missing legacy dates use provisional long-term treatment with a warning; missing basis is flagged and voluntary sales require verification. Forecasts use the stored provisional basis until corrected.

Dividends are paid into cash and taxed; they are not automatically reinvested. The configured equity return is a **total-return** assumption, so dividend yield is removed from price growth to avoid adding dividends twice. Bonds’ ordinary cash yield follows the same decomposition. Fees reduce investment value. Retirement accounts receive their shared allocation return without separately taxable dividends.

A purchase creates a new investment lot. Buying the default MARKET holding represents a broad equity investment; it does not invent a live ticker quote.

Mortgage/home and consumer-loan payments use the standard monthly payment formula. HELOC/securities loans retain the game’s explicit collateral limits and amortizing-loan assumptions; they are not lender approvals or revolving-line simulations. A margin sale accounts for the collateral sold: at maintenance fraction `m`, stock sale required is `(debt - m × collateral) / (1 - m)`, after eligible cash repayment. Resulting gain taxes are settled through the same annual record.

Home purchase closing costs default to 2%; selling costs to 6%, both explicit modeling assumptions. Property basis must be verified for a sale. Primary-home gain exclusion requires an explicit ownership/use eligibility confirmation. Rental depreciation recapture requires a verified external estimate when depreciation has been recorded. Passive loss carryovers, depreciation computation, section 1231 treatment and detailed tax recapture are not automated.

Rental revenue is independent of whether the owner rents their own residence. Defaults include 5% vacancy, maintenance at 1% of market value and insurance at 0.3% unless explicit annual amounts are entered. Property tax uses an explicit annual amount or assessed value × rate. Annual property-tax dollar overrides grow at entered/default inflation. State-specific assessment caps are not modeled.

Child cost bands are illustrative allowances inherited from gameplay, not a personalized family budget. College defaults to an illustrative **$28,000 per child per year at ages 18–21**, separate from living costs. Extra healthcare and college costs are editable; scholarships, 529 accounts, insurance benefit schedules and long-term-care events are not modeled automatically.

## Tax coverage

| Area | Implementation / limits |
|---|---|
| Filing | Single and married filing jointly. Separate owner wages for payroll caps. Other statuses unsupported. |
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

Traditional withdrawals use age 59½ access independently of whether employment continues; early withdrawal requires explicit policy input and defaults to a 10% modeled penalty absent an exception. Plan-specific in-service access and rule-of-55 eligibility are not inferred.

Roth regular contributions are made at year-end after compensation and modeled MAGI eligibility are known. They are optional savings goals, not a required-spending failure. Verified contribution basis is accessible first. Qualified earnings require age 59½ and a supplied opening year satisfying the five-year clock. Unknown earnings are blocked; conversion ordering/recapture is unsupported.

RMDs use the prior December 31 traditional balance, cohort start age and Uniform Lifetime divisors through the age-100 horizon. Ordinary pension income does not satisfy a 401(k) RMD. The still-working exception requires an explicit election and absence of the modeled 5% ownership flag. Inherited accounts, younger-spouse tables and multiple retirement owners/accounts are unsupported.

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
| Home real-return mean / annual volatility | 0.5% / 6% |
| Equity/bond log-shock correlation | 0.10 |

Optimistic uses 8% equity mean, 16% volatility and 2% CPI. Grim uses 4.5%, 22% and 3.5%. Overrides are stored with the portfolio. Specific stocks use a common equity factor plus stable ticker-specific risk, with 35% default volatility and no automatically inferred permanent alpha. Multiple lots of the same ticker receive the same return. Other correlations and tax-sensitive asset-location optimization are not calibrated.

For arithmetic simple-return mean `a` and standard deviation `v`, the lognormal parameters are:

```text
s² = ln(1 + v² / (1+a)²)
m = ln(1+a) - s²/2
return = exp(m + s×z) - 1, z ~ Normal(0,1)
```

This matches the configured simple-return moments. The Hallway now follows **one actual, complete Monte Carlo trajectory**, replacing the old zero-shock reference projection. On its first entry, a worker simulates 1,000 paths from the committed room baseline through age 100. The path whose terminal nominal net worth is closest to that ensemble's median becomes the Hallway scenario. Failed paths remain eligible; ties use the lowest simulation index. The selected path is replayed through the shared monthly accounting engine to populate the HUD, year doors, event auras, funding wall and age-100 ending. It contains simulated gains, losses, inflation and life events rather than a fixed annual growth rate.

The scenario's seed, simulation index and origin year are stored on the game, outside portfolio/timeline snapshots. Saves and reloads retain it. Moving to another room, returning to an earlier Hallway or changing a decision recalculates cash flows with the same calendar-year shocks; it does not select a more favorable path. The initial terminal-median selection is not repeated after decisions. Changing asset exposures changes their financial outcomes, while ticker/year shocks stay reproducible. Existing saves receive a scenario on their next Hallway entry; already recorded historical balances remain as recorded.

Selecting near the **terminal** median does not make this path the median at every age, a guaranteed future, or a path guaranteed to fund the plan. It can pass outside the chart's percentile bands or encounter a funding wall. While initial simulations run, movement and doors wait, progress is shown, and Menu remains available. A worker failure leaves the baseline intact and supports A / Enter to retry; there is no silent fallback to deterministic growth.

Forecasts use 1,000 paths initially; 5,000 and 10,000 are available. Before a Hallway scenario is committed, larger chart ensembles use their first 1,000 paths for the same Hallway preview selection. After commitment, every chart ensemble overlays the saved scenario even if its simulation index lies outside the requested chart sample count. RNG keys contain the master seed, simulation index, calendar year and shock namespace. Branch alternatives therefore reuse economic shocks for the same year/path. Worker requests are canceled/replaced on changed inputs, with a bounded cache keyed by model inputs, the Hallway scenario and engine/assumption/tax versions. Canceled workers cannot replace a newer request's result.

Charts show pointwise P10/P25/P50/P75/P90 net worth or available liquid assets, with the complete Hallway path drawn separately in cyan. Real values divide each path by its simulated price index in the **original setup-year** dollar base. Pointwise percentile lines are not individual attainable paths. Failed paths remain included. The 95% Wilson success interval covers Monte Carlo sampling error only, not economic-model uncertainty. Lognormal annual shocks are not a calibrated fat-tail/regime model and do not cover every future outcome. Return assumptions and explicit stock-growth overrides are unchanged; Monte Carlo does not correct an unrealistic input assumption by itself.

Success means every modeled monthly obligation is funded through age 100. It excludes automatic home sales and treats optional Roth contributions separately. Stress examples apply an early -40%/-15% equity sequence or 7% inflation for five years; those are scenarios, not probabilities.

CSV export includes year/age, nominal wealth/liquid percentiles, real median wealth, the Hallway's nominal/real wealth and liquid values, its simulation index/selection count/origin year, chart path count, success rate, seed and model versions. In-game coverage notes remain necessary context when sharing the export.

## Migration and validation

Loading clones and migrates a save/profile without overwriting the original localStorage entry. Re-saving creates a migrated version through the existing save flow. Migration normalizes legacy expense breakdowns, retains legal zeros, creates loan schedules and flags missing basis/benefit data. When legacy lots disagree with saved aggregate balances, lots are proportionally reconciled to those stored totals and flagged for verification. Trades already erased by legacy saves cannot be reconstructed from absent records.

Previously recorded worth rows and timeline nodes are marked legacy; their historic financial outcomes are not recomputed. Real-dollar historic values for legacy rows with no price index are not fabricated. New elapsed-year results are stored on the selected destination node, with exact-year comparison and one terminal commit.

Validation commands: `npm test`, `npm run check`, `node scripts/benchmark.mjs 1000`. Automated checks cover regression defects, known-answer tax/payroll fixtures, contributions, loans, funding/shortfalls, Roth/SSA/RMD rules, migration, history, market moments/correlation, reproducibility, percentiles and sequence risk. Additional Hallway checks verify complete-path selection, gains/losses, failed-path inclusion, year-room continuity, changed-decision shock continuity, chart sample-count independence, loading/retry behavior, save/reload/rewind persistence, worker replay and stale-worker rejection. Financial fixtures use injected/zero-volatility paths where appropriate. Canvas rendering checks inspect the room, loading Hallway, completed Hallway and forecast layout; these do not substitute for an interactive browser/device play test.

## Primary rule references

- [IRS 2026 inflation adjustments, Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB)
- [IRS 2025 adjustments, Rev. Proc. 2024-40](https://www.irs.gov/irb/2024-45_IRB), with 2025 standard deduction/child-credit updates described in the 2026 bulletin above
- [IRS 2026 retirement limits and Roth phaseouts](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500)
- [IRS Uniform Lifetime / distribution guidance, Publication 590-B](https://www.irs.gov/publications/p590b)
- [IRS enhanced senior deduction](https://www.irs.gov/newsroom/check-your-eligibility-for-the-new-enhanced-deduction-for-seniors)
- [SSA contribution and benefit bases](https://www.ssa.gov/oact/cola/cbb.html)
- [SSA receiving benefits while working](https://www.ssa.gov/benefits/retirement/planner/whileworking.html)
- [California FTB 2025 rate schedules](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) and [deductions](https://www.ftb.ca.gov/file/personal/deductions/index.html)

These sources establish core rule constants. They do not validate illustrative market moments, unimplemented tax cases or the accuracy of future projections.
