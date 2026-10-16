/**
 * Text for Title menu → "Create User Profile with AI".
 *
 * The player copies AI_PROFILE_PROMPT into an AI assistant, which writes a character-profile
 * file. The title menu's "Load from File" reads it (a `cant-take-it-profiles` file, see
 * js/state/PlanExport.js importSaveFile); the profile is then started with "Use Profile".
 * The template below holds placeholder values only. Edit freely, but keep the field names in
 * sync with createDefaultSetup() in js/state/GameState.js.
 */

export const AI_PROFILE_INTRO =
  'Copy the prompt below into an AI platform of your choosing to generate a player profile automatically.\n\n' +
  'Your agent will need to be aware of your finances in order to accurately create a character';

/** Example values only; the AI replaces every value with the user's real figures. */
export const AI_PROFILE_TEMPLATE = {
  format: 'cant-take-it-profiles',
  formatVersion: 1,
  profiles: [
    {
      label: 'Example Household',
      setup: {
        playerName: 'Alex',
        year: 2026,
        age: 40,
        zip: '85001',
        difficulty: 'standard',
        married: true,
        filingStatus: 'married',
        spouseName: 'Sam',
        spouseAge: 38,
        retirementAge: 65,
        spouseRetirementAge: 65,
        salary: 100000,
        spouseSalary: 60000,
        employed: true,
        spouseEmployed: true,
        householdVersion: 1,
        salaryOwnership: 'individual',
        salaryOwnershipConfirmed: true,
        cash: 20000,
        savings: 40000,
        savingsRate: 0.04,
        annualSpending: 70000,
        kids: [{ name: 'Jo', age: 6 }],
        housing: 'own',
        monthlyRent: 0,
        homes: [
          { type: 'primary', label: 'Home', value: 500000, mortgageOwed: 300000, rate: 0.065, remainingTerm: 25,
            annualPropertyTax: 4000, propertyTaxRate: 0.008, monthlyRevenue: 0 },
        ],
        stocksMode: 'specific',
        stocksHoldings: [
          { ticker: 'VTI', price: 300, shares: 100, value: 30000, purchasePrice: 200, costBasis: 20000,
            acquiredDate: '2021-03-15', basisKnown: true, growth: 0.065, volatility: 0.18 },
        ],
        stocksTotal: 30000,
        stocksCostBasis: 20000,
        has401k: true,
        k401Balance: 150000,
        k401ContribRate: 0.06,
        k401MatchRate: 0.5,
        k401MatchOnFirst: 0.06,
        hasRoth: true,
        rothBalance: 25000,
        rothAnnualContribution: 7000,
        rothContributionBasis: 20000,
        rothOpenedYear: 2015,
        spouseHas401k: false,
        spouseHasRoth: false,
        otherLoans: [{ label: 'Car loan', principal: 12000, rate: 0.06, remainingTerm: 3 }],
        socialSecurityMonthly: 0,
        socialSecurityClaimAge: 67,
      },
    },
  ],
};

export const AI_PROFILE_PROMPT = `You are helping me create a character for the browser game "You Can't Take It With You", a retirement-planning simulation. The character should use MY REAL finances. Your output is ONE JSON file that I load from the game's start menu with "Load from File" (it adds the profile to my browser; I then pick "Use Profile" to play it).

STEP 1 - Gather facts. Use what you already know about my finances. Do NOT guess: ask me for anything missing, then wait for my answers. Needed:
- Names and current ages (the game stores ages, not birthdays), ZIP code (drives state taxes and costs), filing status (single or married filing jointly), spouse details, kids (name, age; up to 4).
- Each person's annual salary before tax; planned retirement ages (default 65).
- Annual living costs EXCLUDING housing (rent or mortgage, property tax) and income tax: the game computes those itself.
- Cash in checking; savings balance and interest rate.
- Brokerage holdings, one line per lot: ticker, shares, current price, cost basis (total or per share), acquired date (YYYY-MM-DD, or leave out if unknown).
- 401(k), Roth IRA and IRA balances for each person; contribution rates, employer match (match rate and the share of salary it applies to).
- Home: market value, mortgage balance, rate, years remaining, annual property tax; or monthly rent if renting.
- Other debts (principal, rate, years left), Social Security estimate and claim age, and difficulty: "optimistic", "standard" or "grim".

STEP 2 - Things the game cannot model (RSUs, ESPP, stock options, credit cards with changing balances, and so on): do not fake them. Tell me what you left out. Options: count a regular RSU vest as part of salary, or enter vested shares as holdings and add one-off loans to "otherLoans" only if I agree. Entries in "otherLoans" are amortizing loans with principal, rate and remainingTerm in years.

STEP 3 - Write the file. Start from this template, keep every key, and change only the values to mine. Remove the spouse fields and set "married": false, "filingStatus": "single" for a single person. Add more objects to "homes", "stocksHoldings" or "kids" as needed (an empty list is fine). Use real JSON numbers, never strings. Rates are decimals (6.5% is 0.065). Dates are "YYYY-MM-DD". "year" is the current year. "stocksTotal" must equal the sum of the holdings' "value" (shares x price) and "stocksCostBasis" the sum of their "costBasis". Keep "format" and "formatVersion" exactly as shown. The game derives everything else.

${JSON.stringify(AI_PROFILE_TEMPLATE, null, 2)}

STEP 4 - Check and deliver. Validate that the JSON parses and every number is a number. Give me only the JSON as a downloadable file named my-profile.json (or, if you cannot make files, one code block containing only the JSON). Then tell me to open the game's start menu, choose "Load from File", pick the file, and then choose "Use Profile". Remind me to keep real financial data out of public places. This is an education and simulation tool, not financial advice.`;
