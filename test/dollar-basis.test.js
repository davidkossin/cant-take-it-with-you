import test from 'node:test';
import assert from 'node:assert/strict';
import { Dialog, formatMoneyInput, parseMoneyInput } from '../js/render/Dialog.js';
import { captureMoneyContext, setMoneyContext, toDisplayMoney, fromDisplayMoney, formatMoneyDisplay } from '../js/finance/DollarBasis.js';
import { editPlanningInputs, editInflationSettings } from '../js/scenes/PlanningInputs.js';
import { projectOneYear } from '../js/finance/Engine.js';
import { monthlyBenefit } from '../js/finance/Retirement.js';
import { projectJourney } from '../js/finance/Journey.js';
import { financialEventMessages } from '../js/render/FinancialMessages.js';
import { buildEventAuras } from '../js/scenes/HallwayScene.js';
import { household } from './fixtures.js';

const future = (adjusted=true) => ({year:2050,dollarBaseYear:2026,priceIndex:2,childCostInflator:3,inflationAdjusted:adjusted});

test('buying-power conversions use the original setup index; nominal display stays nominal',()=>{
  assert.equal(toDisplayMoney(40000,future()),20000);
  assert.equal(fromDisplayMoney(20000,future()),40000);
  assert.equal(toDisplayMoney(40000,future(false)),40000);
  assert.equal(fromDisplayMoney(20000,future(false)),20000);
  assert.equal(formatMoneyDisplay(-40000,future()),'-$20,000');
  assert.equal(formatMoneyDisplay(20000,future(),{alreadyDisplay:true}),'$20,000');
});

test('transaction prompt returns nominal currency and retains its opening-year units',async()=>{
  setMoneyContext(future());
  const dialog=new Dialog(), result=dialog.prompt('Transfer to Cash',{type:'money',defaultValue:40000});
  assert.equal(dialog.promptValue,'20,000.00');
  assert.match(dialog.subtitle,/2026 buying power/);
  dialog.promptValue='15,000';
  setMoneyContext({...future(),priceIndex:4,year:2070});
  dialog._activateSelected();
  assert.equal(await result,30000);
  setMoneyContext(null);
});

test('untouched monetary fields preserve their exact balances despite display rounding',async()=>{
  const portfolio={...future(),priceIndex:1.93247},dialog=new Dialog();
  const result=dialog.form('Correct basis',[{key:'basis',type:'money',defaultValue:12345.67}],{portfolio});
  dialog._activateSelected();
  assert.deepEqual(await result,{basis:12345.67});
  assert.equal(captureMoneyContext(portfolio).priceIndex,1.93247);
});

test('form onFieldChange keeps a linked $ amount and % amount in sync, typed from either side',async()=>{
  const total=2000;
  const dialog=new Dialog();
  const result=dialog.form('Sell',[
    {key:'dollars',type:'money',defaultValue:'1000'},
    {key:'percent',type:'percent',defaultValue:'50'},
  ],{onFieldChange:(fields,i)=>{
    if (i===0) fields[1].value=((parseMoneyInput(fields[0].value)/total)*100).toFixed(1);
    else fields[0].value=formatMoneyInput(String(total*(parseFloat(fields[1].value)||0)/100));
  }});
  dialog.setFieldValue(0,'1,500');
  assert.equal(dialog.fields[1].value,'75.0');
  dialog.setFieldValue(1,'25');
  assert.equal(dialog.fields[0].value,'500');
  dialog._activateSelected();
  assert.deepEqual(await result,{dollars:500,percent:25});
});

test('money fields convert baseline benefits and education separately from CPI',async()=>{
  for (const adjusted of [true,false]) {
    const dialog=new Dialog(),p=future(adjusted);
    const result=dialog.form('Budget',[
      {key:'salary',type:'money',defaultValue:60000},
      {key:'ss',type:'money',defaultValue:2000,amountScale:2},
      {key:'college',type:'money',defaultValue:10000,amountScale:3},
      {key:'age',type:'number',defaultValue:65}],{portfolio:p});
    assert.deepEqual(dialog.fields.map(f=>f.value),adjusted
      ? ['30,000.00','2,000.00','15,000.00','65']
      : ['60,000.00','4,000.00','30,000.00','65']);
    dialog.fields[2].value='18,000';
    dialog._activateSelected();
    assert.deepEqual(await result,{salary:60000,ss:2000,college:adjusted?12000:6000,age:65});
  }
});

test('education-base fractions retain the exact cents of an entered nominal cost',async()=>{
  const dialog=new Dialog(),scale=3.1421;
  const result=dialog.form('College',[
    {key:'college',type:'money',defaultValue:10000,amountScale:scale}],{portfolio:future(false)});
  dialog.fields[0].value='18,000.01';
  dialog._activateSelected();
  assert.ok(Math.abs((await result).college*scale-18000.01)<1e-8);
});

class EditingDialog extends Dialog {
  constructor(choices,edit) {super();this.choices=choices;this.edit=edit;}
  menu() {return Promise.resolve(this.choices.shift() ?? null);}
  form(text,fields,options) {
    const result=super.form(text,fields,options);
    this.edit(this.fields,text);
    this._activateSelected();
    return result;
  }
}

test('advanced-year planning edits produce the requested current benefit and college cost',async()=>{
  for (const adjusted of [true,false]) {
    const p=household({...future(adjusted),age:67,socialSecurityMonthly:1000,annualCollegeCost:10000});
    await editPlanningInputs(p,new EditingDialog(['income','primary',null,null],fields=>{
      fields.find(f=>f.key==='ss').value='2,000';
    }));
    assert.equal(monthlyBenefit(p,67,p.priceIndex),adjusted?4000:2000);
    await editPlanningInputs(p,new EditingDialog(['costs',null],fields=>{
      fields.find(f=>f.key==='college').value='15,000';
    }));
    assert.equal(p.annualCollegeCost*p.childCostInflator,adjusted?30000:15000);
  }
  setMoneyContext(null);
});

test('Roth basis correction preserves verified contributions above a diminished market balance',async()=>{
  const p=household({rothBalance:8000,rothContributionBasis:0,rothOpenedYear:2020});
  await editPlanningInputs(p,new EditingDialog(['retirement','basis',null,null],fields=>{
    fields.find(f=>f.key==='basis').value='10,000';
  }),{lockBalances:true});
  assert.equal(p.rothBalance,8000);
  assert.equal(p.rothContributionBasis,10000);
  setMoneyContext(null);
});

test('Compact playable paths preserve life events and source-year money metadata',()=>{
  const p=household({year:2040,age:65,priceIndex:2,cash:100000,salary:100000,
    married:true,spouseAge:65,spouseSalary:50000,kids:[{name:'Alex',age:18}],annualCollegeCost:0});
  const path=projectJourney(p,{version:1,seed:123,simulationIndex:0,originYear:2040},{
    years:1,compact:true,shockAmount:10000,economy:{equity:0,bond:0,inflation:0,home:0,salary:0}});
  assert.ok(path[1].events.includes('Retired'));
  assert.ok(path[1].events.some(event=>/retired$/.test(event)));
  assert.ok(path[1].events.includes('Alex goes to college'));
  assert.deepEqual(path[1].statement.eventDetails.find(event=>event.kind==='unexpected-expense'),{
    index:path[1].events.findIndex(event=>event.startsWith('Unexpected expense')),
    kind:'unexpected-expense',amount:10000,priceIndex:2,year:2040,
  });
  const before=structuredClone(path);
  const auras=buildEventAuras({rows:100,foyer:5,segment:3},path,2040);
  assert.equal(auras.length,1);
  const context={priceIndex:4,inflationAdjusted:true};
  assert.deepEqual(financialEventMessages(auras[0].eventDetails,context),['Unexpected expense (2040): $5,000']);
  assert.deepEqual(financialEventMessages(auras[0].eventDetails,{...context,inflationAdjusted:false}),
    ['Unexpected expense (2040): $10,000']);
  assert.deepEqual(path,before);
});

test('Margin captions add actual repayments and retain the largest unpaid gap',()=>{
  const events=[{kind:'margin-call',paid:2000,unpaid:6000,priceIndex:2,year:2040},
    {kind:'margin-call',paid:1000,unpaid:5000,priceIndex:2,year:2040}];
  assert.deepEqual(financialEventMessages(events,{priceIndex:4,inflationAdjusted:true}),
    ['Margin calls (2040): repaid $1,500; Cash shortfall up to $3,000']);
});

test('Inflation Adjustment changes presentation without altering financial projections',async()=>{
  const p=household({...future(),age:50,cash:100000,salary:90000,annualSpending:40000,
    rateOverrides:{inflation:.03,equityReturn:0,equityVolatility:0,bondReturn:0,bondVolatility:0,
      inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0}});
  const before=projectOneYear(p,'standard',{deterministic:true});
  const balances={cash:p.cash,savings:p.savings,salary:p.salary,annualSpending:p.annualSpending};
  await editInflationSettings(p,{menu:async()=>false});
  const after=projectOneYear(p,'standard',{deterministic:true});
  assert.deepEqual({cash:p.cash,savings:p.savings,salary:p.salary,annualSpending:p.annualSpending},balances);
  assert.deepEqual(after.worth,before.worth);
  assert.deepEqual(after.statement,before.statement);
  assert.equal(after.state.priceIndex,2.06);
  setMoneyContext(null);
});
