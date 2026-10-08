import { normalizePortfolio } from '../finance/Schema.js';
import { ensureHoldings, syncBook, post } from '../finance/Books.js';
import { estimateAnnualTax } from '../finance/Tax.js';
import { MODEL_SCOPE } from '../finance/Forecast.js';
import { claimFactor } from '../finance/Retirement.js';
import { ownerKey, ownerState } from '../finance/Household.js';
import { formatMoneyDisplay, setMoneyContext } from '../finance/DollarBasis.js';
import { editFamilyIncome, editRetirementAges, editRetirementAccounts, editSpouseIdentity, personName } from './FamilyInputs.js';
export { setMoneyContext, moneyUnitSubtitle, inflationToggleLabel } from '../finance/DollarBasis.js';
const dollars=(key,label,value,amountScale=1)=>({key,label,type:'money',prefix:'$',defaultValue:String(value ?? 0),amountScale});
const number=(key,label,value)=>({key,label,type:'number',defaultValue:String(value ?? 0)});
const percent=(key,label,value)=>({key,label,type:'percent',defaultValue:String((value ?? 0)*100)});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

/** Display preference only: the engine always retains nominal inflation and balances. */
export async function editInflationSettings(p, dialog) {
  const choice = await dialog.menu('Inflation Adjustment changes display and input units.', [
    {label:'On: starting-year buying power',value:true,subtext:'Amounts use the original setup year\'s buying power.'},
    {label:'Off: displayed-year dollars',value:false,subtext:'Amounts use actual dollars for the year you are viewing.'},
    {label:'Back',value:null},
  ], {title:'Inflation Adjustment',subtitle:'Inflation stays in every financial projection.',selected:p.inflationAdjusted===false?1:0});
  if (choice == null) return false;
  const changed = p.inflationAdjusted !== choice;
  p.inflationAdjusted = choice;
  setMoneyContext(p);
  return changed;
}

async function editBenefits(p, dialog, owner='primary') {
  const view=ownerState(p,owner), key=name=>ownerKey(name,owner), priceIndex=p.priceIndex || 1;
  const factor=view.socialSecurityMonthlyAtFRA != null
    ? claimFactor(view.socialSecurityClaimAge ?? 67,view.birthYear ?? p.year-Math.floor(view.age ?? 0)) : 1;
  const originalBenefit=(view.socialSecurityMonthlyAtFRA ?? view.socialSecurityMonthly ?? 0)*factor
    /(view.socialSecurityInFutureDollars ? view.socialSecurityClaimPriceIndex ?? priceIndex : view.socialSecurityInputPriceIndex ?? 1);
  const pensionNominal=(view.annualPension || 0)*(view.pensionCOLA?priceIndex/(view.pensionInputPriceIndex ?? 1):1);
  const r=await dialog.form('Use your SSA statement benefit at the selected claim age.',[
    dollars('ss','SSA monthly benefit at claim age',originalBenefit,priceIndex),
    number('claim','Social Security claim age (62–70)',view.socialSecurityClaimAge ?? 67),
    dollars('pension','Annual pension when payments begin',pensionNominal),
    number('start','Pension starting age',view.pensionStartAge ?? view.retirementAge ?? 65),
    number('cola','Pension inflation indexed: 1 yes / 0 no',view.pensionCOLA?1:0),
  ],{title:personName(p,owner)+' benefits',portfolio:p});
  if (!r) return;
  p[key('socialSecurityMonthly')]=Math.max(0,r.ss);
  if (r.ss>0) p[key('socialSecurityEligible')]=true;
  delete p[key('socialSecurityMonthlyAtFRA')];
  delete p[key('socialSecurityInputPriceIndex')];
  delete p[key('socialSecurityClaimPriceIndex')];
  p[key('socialSecurityInFutureDollars')]=false;
  p[key('socialSecurityClaimAge')]=clamp(r.claim,62,70);
  p[key('annualPension')]=Math.max(0,r.pension);
  p[key('pensionStartAge')]=clamp(r.start,18,100);
  p[key('pensionCOLA')]=r.cola>=.5;
  p[key('pensionInputPriceIndex')]=priceIndex;
}

async function editIncome(p,dialog) {
  while (true) {
    const choice=await dialog.menu('Income belongs to each person; Cash and Savings are shared.',[
      {label:'Annual salaries / ownership',value:'wages'},
      {label:personName(p)+' benefits / pension',value:'primary'},
      ...(p.married?[{label:personName(p,'spouse')+' benefits / pension',value:'spouse'},
        {label:'Spouse identity / current age',value:'identity'}]:[]),
      {label:'Done',value:null}],{title:'Income / benefits'});
    if (!choice) return;
    if (choice==='wages') await editFamilyIncome(p,dialog,{title:'Annual salaries'});
    else if (choice==='identity') await editSpouseIdentity(p,dialog);
    else await editBenefits(p,dialog,choice);
  }
}

async function editRetirement(p,dialog,lockBalances) {
  while (true) {
    const choice=await dialog.menu('Each person owns their retirement accounts.',[
      {label:'Retirement ages',value:'ages'},
      {label:personName(p)+' accounts / contributions',value:'primary'},
      ...(p.married?[{label:personName(p,'spouse')+' accounts / contributions',value:'spouse'}]:[]),
      {label:'Roth basis / opening dates',value:'basis'},
      {label:'Annual investment fee',value:'fee'},
      {label:'Done',value:null}],{title:'Retirement inputs'});
    if (!choice) return;
    if (choice==='ages') await editRetirementAges(p,dialog);
    else if (choice==='primary' || choice==='spouse') await editRetirementAccounts(p,dialog,{owner:choice,lockBalances});
    else if (choice==='fee') {
      const r=await dialog.prompt('Annual investment fee %',{type:'percent',defaultValue:String((p.investmentFee ?? .002)*100),title:'Investment fee'});
      if (r!=null) p.investmentFee=clamp(r/100,0,.1);
    } else {
      const owner=p.married?await dialog.menu('Choose Roth owner',[
        {label:personName(p),value:'primary'},{label:personName(p,'spouse'),value:'spouse'},{label:'Back',value:null}],{title:'Roth basis'}):'primary';
      if (!owner) continue;
      const key=name=>ownerKey(name,owner);
      const r=await dialog.form('Use verified contribution basis and account opening year.',[
        dollars('basis','Remaining Roth contribution basis',p[key('rothContributionBasis')]),
        number('opened','Roth opening year (0 = unknown)',p[key('rothOpenedYear')])],{title:personName(p,owner)+' Roth',portfolio:p});
      // A market loss can leave contribution basis above the current balance.
      // Access checks cap spendable cash without destroying verified tax basis.
      if (r) {p[key('rothContributionBasis')]=Math.max(0,Number(r.basis)||0);
        p[key('rothOpenedYear')]=r.opened>1900?Math.min(p.year,Math.round(r.opened)):null;}
    }
  }
}
/** lockBalances (Decision Room play): lot market values are read-only; Setup leaves them editable. */
export async function editPlanningInputs(p,dialog,{lockBalances=false}={}) {
  setMoneyContext(p);
  while (true) {
    const choice=await dialog.menu('Benefits, budget and forecast inputs',[
      {label:'Income / Social Security',value:'income'},
      {label:'Retirement allocation / Roth',value:'retirement'},
      {label:'Living / healthcare / college',value:'costs'},
      {label:'Holding basis / dates',value:'holdings'},
      {label:'Property basis / costs',value:'homes'},
      {label:'Tax state / deductions',value:'tax'},
      {label:'Model coverage / warnings',value:'scope'},
      {label:'Done',value:null}],{title:'Planning inputs'});
    if (!choice) return;
    if (choice==='income') {
      await editIncome(p,dialog);
    } else if (choice==='retirement') {
      await editRetirement(p,dialog,lockBalances);
    } else if (choice==='costs') {
      const r=await dialog.form('Living excludes rent, loans, taxes, children and contributions',[
        dollars('living','Annual living costs',p.annualSpending),dollars('health','Extra annual healthcare',p.annualHealthcare),
        dollars('college','Annual college per child (ages 18–21)',p.annualCollegeCost ?? 28000,p.childCostInflator || 1),
        dollars('rent','Monthly rent (when renting)',p.monthlyRent),
        percent('education','College / child cost inflation %',p.educationInflation ?? .025)],{title:'Budget',portfolio:p});
      if (r) {
        p.annualSpending=Math.max(0,r.living);p.spendingBreakdown={other:p.annualSpending};p.annualHealthcare=Math.max(0,r.health);
        p.annualCollegeCost=Math.max(0,r.college);p.monthlyRent=Math.max(0,r.rent);p.educationInflation=clamp(r.education/100,0,.2);
      }
    } else if (choice==='holdings') {
      ensureHoldings(p);
      const index=await dialog.menu('Choose a tax lot to correct',[
        ...p.stocksHoldings.map((h,i)=>({label:(h.ticker || 'Holding')+' · '+formatMoneyDisplay(h.value,p),value:i})),
        {label:'Cancel',value:null}],{title:'Investment basis'});
      if (index==null) continue;
      const h=p.stocksHoldings[index];
      const r=await dialog.form(lockBalances?'Basis/date correction; market value '+formatMoneyDisplay(h.value,p)+' is locked during play'
        :'Data correction; obtain basis/date from brokerage records',[
        ...(lockBalances?[]:[dollars('value','Current market value',h.value)]),dollars('basis','Verified total cost basis',h.costBasis),
        {key:'date',label:'Acquired YYYY-MM-DD (blank = unknown)',type:'text',defaultValue:h.acquiredDate || ''}],{title:h.ticker || 'Holding',portfolio:p});
      if (r) {
        const date=String(r.date || '').trim();
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) {
          await dialog.show('Use a valid YYYY-MM-DD acquisition date.',{title:'Investment basis'});continue;
        }
        if (!lockBalances) h.value=Math.max(0,r.value);
        h.costBasis=Math.max(0,r.basis);h.basisKnown=true;h.acquiredDate=date || null;
        h.shares=h.value/(h.price || 100);syncBook(p);post(p,'data-correction',{holdingId:h.id});
      }
    } else if (choice==='homes') {
      const index=await dialog.menu('Choose property to correct',[
        ...(p.homes || []).map((h,i)=>({label:h.label || 'Home '+(i+1),value:i})),{label:'Cancel',value:null}],{title:'Property inputs'});
      if (index==null) continue;
      const h=p.homes[index];
      const r=await dialog.form('Explicit annual costs; depreciation not inferred',[
        dollars('basis','Verified tax basis',h.costBasis),dollars('maintenance','Annual maintenance',h.annualMaintenance ?? h.value*.01),
        dollars('insurance','Annual insurance / HOA', (h.annualInsurance ?? h.value*.003)+(h.annualHOA || 0)),
        dollars('rent','Monthly rental revenue',h.monthlyRevenue),
        percent('vacancy','Rental vacancy %',h.vacancyRate ?? .05)],{title:'Property inputs',portfolio:p});
      if (r) {
        h.costBasis=Math.max(0,r.basis);h.basisKnown=true;h.annualMaintenance=Math.max(0,r.maintenance);
        h.annualInsurance=Math.max(0,r.insurance);h.annualHOA=0;h.monthlyRevenue=Math.max(0,r.rent);h.vacancyRate=clamp(r.vacancy/100,0,1);
      }
    } else if (choice==='tax') {
      const r=await dialog.form('Core federal rules; verify state approximation',[
        {key:'state',label:'Tax state (two letters; blank = ZIP)',type:'text',defaultValue:p.taxState || ''},
        dollars('itemized','Verified annual itemized deductions',p.itemizedDeduction),
        percent('stateRate','Approx. state rate % (other states)',p.stateTaxRateOverride ?? .05),
        percent('index','Future tax threshold index %',p.taxInflation ?? .025)],{title:'Tax inputs',portfolio:p});
      if (r) { p.taxState=String(r.state || '').trim().toUpperCase();p.itemizedDeduction=Math.max(0,r.itemized);
        p.stateTaxRateOverride=clamp(r.stateRate/100,0,.2);p.taxInflation=clamp(r.index/100,0,.1); }
    } else if (choice==='scope') {
      const warnings=[...normalizePortfolio(p, { legacy: false }).modelWarnings,...estimateAnnualTax(p).meta.warnings];
      for (const text of [...MODEL_SCOPE,...warnings]) await dialog.show(text,{title:'Model coverage'});
    }
  }
}
