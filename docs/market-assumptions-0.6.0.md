# Market assumptions (v0.6.0)

See header comment in `js/finance/marketAssumptions.js` for full citations.

## Window
Calendar years **2016–2025** (10 fully sourced years).

## Researched averages (Standard)
| Series | Value | Notes |
|--------|------:|-------|
| Equity growth | 15.91% | S&P 500 **total return** arithmetic mean |
| Equity volatility | 15.73% | Sample stdev of those annual total returns |
| Inflation (CPI-U) | 3.11% | BLS annual-average YoY mean |
| Savings APY | 0.20% | Bankrate / FDIC national average savings |
| 30-yr mortgage | 4.77% | Freddie Mac / Rocket / Wealthvieu averages |

## Difficulty deltas vs Standard
- **Optimistic:** inflation −0.50pp; mortgage −0.75pp; savings −0.05pp; equity growth +1.50pp; equity vol −2.00pp; softer expense/tax/shocks.
- **Grim:** inflation +1.00pp; mortgage +1.25pp; savings +0.10pp; equity growth −2.50pp; equity vol +3.00pp; harder expense/tax/shocks.

Player may override any numeric default in setup or the Portfolio teller (`rateOverrides`).

## Stock quotes
Primary Yahoo Finance chart JSON; fallbacks stockprices.dev then Stooq CSV. Loading after 0.5s; overall ~10s timeout; never invents prices.
