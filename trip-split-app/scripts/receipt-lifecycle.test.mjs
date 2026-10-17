import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptStateWriter,receiptUris,isManagedReceiptUri} from '../src/receipt-lifecycle.ts';
const root='file:///app/documents/togetrip-receipts';
const uri=n=>`${root}/receipt-${n}.jpg`;
const state=(...photos)=>({profile:{id:'a',name:'a'},activeTripId:'t',trips:[{id:'t',name:'t',start:'',end:'',budget:0,baseCurrency:'KRW',people:[{id:'a',name:'a'}],expenses:photos.map((photo,i)=>({id:String(i),title:'test',category:'food',date:'2026-10-17',amount:100,currency:'KRW',rate:1,krwAmount:100,payerId:'a',participantIds:['a'],receiptUri:photo})),checklist:[]}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('only direct, generated receipt paths are owned',()=>{assert.ok(isManagedReceiptUri(uri('123-abc'),root));for(const x of ['file:///gallery/receipt-123.jpg',root+'/../photo.jpg',root+'/receipt-a.jpg/../outside',root+'/receipt-%2e%2e.jpg',root+'/other.jpg',root+'-other/receipt-a.jpg',root+'/receipt-a.jpg?x=1'])assert.equal(isManagedReceiptUri(x,root),false);});
test('metadata is saved before a released copy is removed',async()=>{const events=[];const w=createReceiptStateWriter(async()=>{events.push('write');},u=>events.push(u));w.baseline(state(uri('a')));await w.save(state());assert.deepEqual(events,['write',uri('a')]);});
test('failed metadata write never deletes prior receipt',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{throw Error('disk full');},u=>deleted.push(u));w.baseline(state(uri('a')));await assert.rejects(w.save(state()));assert.deepEqual(deleted,[]);});
test('concurrent writes remain ordered',async()=>{const gate=deferred();const writes=[];const w=createReceiptStateWriter(async s=>{writes.push(s.activeTripId);if(writes.length===1)await gate.promise;},()=>{});const a=state(),b=state();a.activeTripId='first';b.activeTripId='second';const p=w.save(a),q=w.save(b);await Promise.resolve();assert.deepEqual(writes,['first']);gate.resolve();await Promise.all([p,q]);assert.deepEqual(writes,['first','second']);});
test('later queued state protects a receipt from early cleanup',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>deleted.push(u));w.baseline(state(uri('a')));await Promise.all([w.save(state()),w.save(state(uri('a')))]);assert.deepEqual(deleted,[]);});
test('editing draft protects an old copy until the draft closes',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>deleted.push(u));w.baseline(state(uri('a')));await w.setDraft(uri('a'));await w.save(state());assert.deepEqual(deleted,[]);await w.setDraft(null);assert.deepEqual(deleted,[uri('a')]);});
test('saved photo remains after clearing draft',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>deleted.push(u));await w.setDraft(uri('new'));await w.save(state(uri('new')));await w.setDraft(null);assert.deepEqual(deleted,[]);});
test('discarded unsaved managed draft can be cleaned',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>deleted.push(u));await w.setDraft(uri('new'));await w.setDraft(null);assert.deepEqual(deleted,[uri('new')]);});
test('failed write recovers without losing new receipt',async()=>{let fail=true;const deleted=[];const w=createReceiptStateWriter(async()=>{if(fail)throw Error('disk full');},u=>deleted.push(u));w.baseline(state(uri('old')));await w.setDraft(uri('new'));await assert.rejects(w.save(state(uri('new'))));await w.setDraft(null);assert.deepEqual(deleted,[]);fail=false;await w.save(state(uri('new')));assert.deepEqual(deleted,[uri('old')]);});
test('cleanup failure is reported and can be retried after a successful save',async()=>{let fail=true;const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>{if(fail)throw Error('busy');deleted.push(u);});w.baseline(state(uri('old')));assert.equal((await w.save(state())).photoCleanupPending,true);fail=false;assert.equal((await w.save(state())).photoCleanupPending,false);assert.deepEqual(deleted,[uri('old')]);});
test('a photo shared by expenses is retained until its final reference disappears',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>deleted.push(u));w.baseline(state(uri('a'),uri('a')));await w.save(state(uri('a')));assert.deepEqual(deleted,[]);await w.save(state());assert.deepEqual(deleted,[uri('a')]);});
test('originals outside the managed folder are never deleted by ownership guard',async()=>{const deleted=[];const w=createReceiptStateWriter(async()=>{},u=>{if(isManagedReceiptUri(u,root))deleted.push(u);});w.baseline(state('file:///gallery/original.jpg'));await w.save(state());assert.deepEqual(deleted,[]);});
test('receipt reference extraction tolerates old malformed storage',()=>{assert.equal(receiptUris({trips:[null,{}, {expenses:[null,{}, {receiptUri:uri('a')}]}]}).size,1);assert.equal(receiptUris({}).size,0);});

test('corrupt storage fails closed instead of silently resetting',async()=>{
 const {decodeStoredState}=await import('../src/receipt-lifecycle.ts');
 assert.equal(decodeStoredState(null),null);
 for(const raw of ['', '{broken', 'null', '42', '[]'])assert.throws(()=>decodeStoredState(raw));
 const saved=state(uri('a'));assert.deepEqual(decodeStoredState(JSON.stringify(saved)),saved);
});
