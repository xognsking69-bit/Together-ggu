import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, parseLocalDate, calendarDayDiff } from '../src/dates.ts';
import { personHasExpenses, removeUnusedPerson } from '../src/people.ts';
import { portableBackupState } from '../src/backup.ts';
import { computeBalances, parseCustomShareInputs } from '../src/settlement.ts';
function inZone(tz,fn){const old=process.env.TZ;process.env.TZ=tz;try{fn();}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}}
for(const [zone,iso,expected] of [
 ['Asia/Seoul','2026-10-16T15:30:00Z','2026-10-17'],
 ['Asia/Seoul','2026-12-31T15:00:00Z','2027-01-01'],
 ['America/Los_Angeles','2026-10-17T02:00:00Z','2026-10-16'],
 ['UTC','2026-10-17T00:00:00Z','2026-10-17']
]) test(`calendar date uses ${zone} at ${iso}`,()=>inZone(zone,()=>assert.equal(localDateKey(new Date(iso)),expected)));
for(const [from,to] of [['2026-03-07','2026-03-09'],['2026-10-31','2026-11-02']])
 test(`calendar duration survives DST ${from}`,()=>inZone('America/New_York',()=>assert.equal(calendarDayDiff(parseLocalDate(from),parseLocalDate(to)),2)));
test('valid leap date parses, impossible dates do not roll over',()=>{assert.ok(parseLocalDate('2028-02-29'));for(const x of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','2026-10-32','not-a-date'])assert.equal(parseLocalDate(x),null);});
const trip=(expenses=[])=>({id:'t',name:'t',start:'',end:'',budget:0,baseCurrency:'KRW',people:[{id:'a',name:'a'},{id:'b',name:'b'},{id:'c',name:'c'}],expenses,checklist:[]});
const expense=(x={})=>({id:'e',title:'food',category:'food',date:'2026-10-17',amount:100,currency:'KRW',rate:1,krwAmount:100,payerId:'a',participantIds:['a','b'],customShares:{a:80,b:20},...x});
for(const [name,id,e] of [['payer','b',expense({payerId:'b'})],['participant','b',expense()],['custom allocation','c',expense({customShares:{a:80,b:20,c:0}})]])
 test(`cannot remove historical ${name}`,()=>{const t=trip([e]);const before=structuredClone(t);assert.equal(personHasExpenses(t,id),true);assert.equal(removeUnusedPerson(t,id,'a'),t);assert.deepEqual(t,before);});
test('unused person removal preserves expenses and balances',()=>{const t=trip([expense()]);const result=removeUnusedPerson(t,'c','a');assert.deepEqual(result.people.map(p=>p.id),['a','b']);assert.equal(result.expenses,t.expenses);const before=computeBalances(t.people,t.expenses),after=computeBalances(result.people,result.expenses);assert.deepEqual(after.a,before.a);assert.deepEqual(after.b,before.b);});
test('owner is never removed',()=>{const t=trip();assert.equal(removeUnusedPerson(t,'a','a'),t);});
test('newly referenced person remains protected on later snapshot',()=>{const initial=trip();assert.equal(personHasExpenses(initial,'b'),false);const latest=trip([expense()]);assert.equal(removeUnusedPerson(latest,'b','a'),latest);});
test('custom input converts selected currency only once',()=>{const shares=parseCustomShareInputs({a:'80',b:'20'},1.2345);const b=computeBalances(trip().people,[expense({krwAmount:123.45,customShares:shares})]);assert.equal(b.a.owed,99);assert.equal(b.b.owed,24);});
for(const value of ['', '  ', '-1', 'NaN', 'Infinity']) test(`reject invalid custom input ${JSON.stringify(value)}`,()=>assert.throws(()=>parseCustomShareInputs({a:value},1)));
test('explicit zero is a valid allocation',()=>assert.deepEqual(parseCustomShareInputs({a:'0',b:'100'},1),{a:0,b:100}));
test('portable backup omits device photo paths without changing source or amounts',()=>{const t=trip([expense({receiptUri:'file:///private/receipt.jpg',receiptAnalysis:{merchant:'shop',amount:100}})]);const state={profile:{id:'a',name:'a'},activeTripId:'t',trips:[t]};const before=structuredClone(state);const backup=portableBackupState(state);assert.equal('receiptUri' in backup.trips[0].expenses[0],false);assert.deepEqual(backup.trips[0].expenses[0].customShares,{a:80,b:20});assert.deepEqual(backup.trips[0].expenses[0].receiptAnalysis,{merchant:'shop',amount:100});assert.deepEqual(state,before);assert.deepEqual(computeBalances(t.people,t.expenses),computeBalances(t.people,backup.trips[0].expenses));});
