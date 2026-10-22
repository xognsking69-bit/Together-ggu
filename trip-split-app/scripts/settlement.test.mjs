import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances, minimalTransfers } from '../src/settlement.ts';
const people = ['a','b','c'].map(id=>({id,name:id}));
const expense = (x={})=>({id:'e',title:'test',category:'food',date:'2026-10-16',amount:100,currency:'KRW',rate:1,krwAmount:100,payerId:'a',participantIds:['a','b'],...x});
const settle = x=>computeBalances(people,[expense(x)]);
function conserved(b) {
 assert.equal(Object.values(b).reduce((s,x)=>s+x.net,0),0);
 const residual=Object.fromEntries(Object.entries(b).map(([id,x])=>[id,x.net]));
 for(const t of minimalTransfers(b)){residual[t.from]+=t.amount;residual[t.to]-=t.amount;}
 assert.ok(Object.values(residual).every(x=>x===0));
}
test('80/20 custom shares produce a 20 won transfer, not 50',()=>{
 const b=settle({customShares:{a:80,b:20}});
 assert.equal(b.a.owed,80); assert.equal(b.b.owed,20);
 assert.deepEqual(minimalTransfers(b),[{from:'b',to:'a',amount:20}]);
});
test('equal split preserves integer remainder',()=>{const b=settle({krwAmount:101});assert.equal(b.a.owed,51);assert.equal(b.b.owed,50);conserved(b);});
test('converted custom amounts conserve rounded total',()=>{const b=settle({krwAmount:123.45,customShares:{a:82.3,b:41.15}});assert.equal(b.a.owed,82);assert.equal(b.b.owed,41);conserved(b);});
test('largest fraction receives remaining won',()=>{const b=settle({krwAmount:10.8,customShares:{a:5.2,b:5.6}});assert.equal(b.a.owed,5);assert.equal(b.b.owed,6);conserved(b);});
test('rounding ties use participant order',()=>{const b=settle({krwAmount:1,customShares:{b:.5,a:.5}});assert.equal(b.a.owed,1);assert.equal(b.b.owed,0);});
test('payer can be outside participants',()=>{const b=settle({participantIds:['b','c'],customShares:{b:80,c:20}});assert.equal(b.a.net,100);conserved(b);});
test('omitted custom participant gets zero',()=>{const b=settle({customShares:{b:100}});assert.equal(b.a.owed,0);assert.equal(b.b.owed,100);conserved(b);});
test('duplicate participant IDs cannot lose a share',()=>{const b=settle({participantIds:['a','b','b']});assert.equal(b.a.owed,50);conserved(b);});
for(const [name,x] of [
 ['total mismatch',{customShares:{a:80,b:10}}],['negative share',{customShares:{a:110,b:-10}}],
 ['nonfinite share',{customShares:{a:NaN,b:100}}],['unknown recipient',{customShares:{a:80,c:20}}],
 ['deleted participant',{participantIds:['a','deleted']}],['deleted payer',{payerId:'deleted'}],
 ['empty participants',{participantIds:[]}],['nonfinite total',{krwAmount:Infinity}],['negative total',{krwAmount:-100}]
]) test(`invalid ${name} blocks settlement`,()=>assert.throws(()=>settle(x)));
test('mixed expenses conserve balances and settle completely',()=>{const b=computeBalances(people,[expense({customShares:{a:80,b:20}}),expense({id:'f',payerId:'c',krwAmount:101,participantIds:['a','b','c']}),expense({id:'g',payerId:'b',krwAmount:33.7,customShares:{a:16.85,b:16.85}})]);conserved(b);});
test('calculation does not mutate stored expense',()=>{const e=expense({customShares:{a:80,b:20}});const before=structuredClone(e);computeBalances(people,[e]);assert.deepEqual(e,before);});
