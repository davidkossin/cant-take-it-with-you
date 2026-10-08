import { normalizePortfolio } from '../finance/Schema.js';
import { ensureHoldings, syncBook, post } from '../finance/Books.js';
import { estimateAnnualTax } from '../finance/Tax.js';
import { MODEL_SCOPE } from '../finance/Forecast.js';
const dollars=(key,label,value)=>({key,label,type:'money',prefix:'$',defaultValue:String(value ?? 0)});
const number=(key,label,value)=>({key,label,type:'number',defaultValue:String(value ?? 0)});
const percent=(key,label,value)=>({key,label,type:'percent',defaultValue:String((value ?? 0)*100)});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
/** lockBalances (Decision Room play): lot market values are read-only; Setup leaves them editable. */
export async function editPlanningInputs(p,dialog,{lockBalances=false}={}) {
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
      const r=await dialog.form('SSA benefit at selected claim age (today\'s dollars)',[
        dollars('salary','Your annual W-2 salary',p.salary),dollars('spouse','Spouse annual W-2 salary',p.spouseSalary),
        dollars('ss','Your SSA monthly benefit at claim age',p.socialSecurityMonthly),
        number('claim','Claim age (62–70)',p.socialSecurityClaimAge ?? 67),
        dollars('pension','Annual pension at retirement',p.annualPension)],{title:'Income / benefits'});
      if (r) {
        p.salary=Math.max(0,r.salary);p.spouseSalary=Math.max(0,r.spouse);p.employed=p.salary>0 && !p.retired;
        p.socialSecurityMonthly=Math.max(0,r.ss);delete p.socialSecurityMonthlyAtFRA;
        p.socialSecurityClaimAge=clamp(r.claim,62,70);p.socialSecurityInFutureDollars=false;
        p.annualPension=Math.max(0,r.pension);
      }
    } else if (choice==='retirement') {
      const r=await dialog.form('Roth uses contribution basis and its five-year clock',[
        percent('equity','Retirement equity allocation %',p.k401Allocation?.equity ?? 1),
        percent('fee','Annual investment fee %',p.investmentFee ?? .002),
        dollars('basis','Roth contribution basis remaining',p.rothContributionBasis),
        number('opened','Roth opening year (0 = unknown)',p.rothOpenedYear),
        number('retire','Your retirement age',p.retirementAge ?? 65)],{title:'Retirement inputs'});
      if (r) {
        p.k401Allocation={equity:clamp(r.equity/100,0,1)};p.rothAllocation={...p.k401Allocation};
        p.investmentFee=clamp(r.fee/100,0,.1);p.rothContributionBasis=clamp(r.basis,0,p.rothBalance ?? 0);
        p.rothOpenedYear=r.opened>1900?Math.round(r.opened):null;p.retirementAge=clamp(r.retire,40,100);
      }
    } else if (choice==='costs') {
      const r=await dialog.form('Living excludes rent, loans, taxes, children and contributions',[
        dollars('living','Annual living costs',p.annualSpending),dollars('health','Extra annual healthcare',p.annualHealthcare),
        dollars('college','Annual college per child (ages 18–21)',p.annualCollegeCost ?? 28000),
        dollars('rent','Monthly rent (when renting)',p.monthlyRent),
        percent('education','College / child cost inflation %',p.educationInflation ?? .025)],{title:'Budget'});
      if (r) {
        p.annualSpending=Math.max(0,r.living);p.spendingBreakdown={other:p.annualSpending};p.annualHealthcare=Math.max(0,r.health);
        p.annualCollegeCost=Math.max(0,r.college);p.monthlyRent=Math.max(0,r.rent);p.educationInflation=clamp(r.education/100,0,.2);
      }
    } else if (choice==='holdings') {
      ensureHoldings(p);
      const index=await dialog.menu('Choose a tax lot to correct',[
        ...p.stocksHoldings.map((h,i)=>({label:(h.ticker || 'Holding')+' · '+Math.round(h.value),value:i})),
        {label:'Cancel',value:null}],{title:'Investment basis'});
      if (index==null) continue;
      const h=p.stocksHoldings[index];
      const r=await dialog.form(lockBalances?'Basis/date correction; market value '+Math.round(h.value)+' is locked during play'
        :'Data correction; obtain basis/date from brokerage records',[
        ...(lockBalances?[]:[dollars('value','Current market value',h.value)]),dollars('basis','Verified total cost basis',h.costBasis),
        {key:'date',label:'Acquired YYYY-MM-DD (blank = unknown)',type:'text',defaultValue:h.acquiredDate || ''}],{title:h.ticker || 'Holding'});
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
        percent('vacancy','Rental vacancy %',h.vacancyRate ?? .05)],{title:'Property inputs'});
      if (r) {
        h.costBasis=Math.max(0,r.basis);h.basisKnown=true;h.annualMaintenance=Math.max(0,r.maintenance);
        h.annualInsurance=Math.max(0,r.insurance);h.annualHOA=0;h.monthlyRevenue=Math.max(0,r.rent);h.vacancyRate=clamp(r.vacancy/100,0,1);
      }
    } else if (choice==='tax') {
      const r=await dialog.form('Core federal rules; verify state approximation',[
        {key:'state',label:'Tax state (two letters; blank = ZIP)',type:'text',defaultValue:p.taxState || ''},
        dollars('itemized','Verified annual itemized deductions',p.itemizedDeduction),
        percent('stateRate','Approx. state rate % (other states)',p.stateTaxRateOverride ?? .05),
        percent('index','Future tax threshold index %',p.taxInflation ?? .025)],{title:'Tax inputs'});
      if (r) { p.taxState=String(r.state || '').trim().toUpperCase();p.itemizedDeduction=Math.max(0,r.itemized);
        p.stateTaxRateOverride=clamp(r.stateRate/100,0,.2);p.taxInflation=clamp(r.index/100,0,.1); }
    } else if (choice==='scope') {
      const warnings=[...normalizePortfolio(p, { legacy: false }).modelWarnings,...estimateAnnualTax(p).meta.warnings];
      for (const text of [...MODEL_SCOPE,...warnings]) await dialog.show(text,{title:'Model coverage'});
    }
  }
}
