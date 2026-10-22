import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{ReceiptUsageStore} from './receipt-ai-worker.js';
import {ReceiptCreditLedger} from './receipt-credit-ledger.js';
import {hashCode,sealResult,openResult,ledgerCall} from './receipt-paid.js';
class Storage {
 values=new Map();queue=Promise.resolve();alarmAt=null;
 async get(k){return structuredClone(this.values.get(k));}async put(k,v){this.values.set(k,structuredClone(v));}async setAlarm(n){this.alarmAt=n;}
 async deleteAll(){this.values.clear();}
 transaction(fn){const job=this.queue.then(async()=>{const copy=new Map(structuredClone([...this.values]));const out=await fn({get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>copy.set(k,structuredClone(v))});this.values=copy;return out;});this.queue=job.catch(()=>{});return job;}
}
function fixture(){
 const usage=new Map();const storage=new Storage();const ledger=new ReceiptCreditLedger({storage});let aiCalls=0;
 const env={GUEST_TOKEN_SECRET:'test-secret-'.repeat(4),RECEIPT_RESULT_KEY:'ab'.repeat(32),RECEIPT_CREDITS_ENABLED:'true',RECEIPT_PAID_ANALYSIS_ENABLED:'true',RECEIPT_CREDITS_ENVIRONMENT:'SANDBOX',RECEIPT_SALES_SANDBOX_VERIFIED:'false',RECEIPT_SANDBOX_CHECKOUT_ENABLED:'true',RECEIPT_IOS_PACK10_ID:'pack10',RECEIPT_ANDROID_PACK10_ID:'pack10android',RECEIPT_RC_IOS_APP_ID:'app1',RECEIPT_RC_WEBHOOK_SECRET:'s'.repeat(32),RECEIPT_AI_PROVIDER:'cloudflare',AI:{run:async()=>{aiCalls++;return {answer:JSON.stringify({merchant:'Private shop',amount:9000,currency:'KRW',date:'2026-10-22',category:'식비'})};}},RECEIPT_CREDIT_LEDGER:{idFromName:n=>n,get:()=>({fetch:(url,init)=>ledger.fetch(new Request(url,init))})},RECEIPT_USAGE:{idFromName:n=>n,get:id=>{if(!usage.has(id))usage.set(id,new ReceiptUsageStore({storage:new Storage()}));return {fetch:(url,init)=>usage.get(id).fetch(new Request(url,init))};}}};
 const request=(path,session,options={})=>worker.fetch(new Request('https://test'+path,{...options,headers:{...(session?{Authorization:`Bearer ${session.token}`} :{}),...options.headers}}),env);
 const session=async()=>{const r=await request('/receipt/guest/session',null,{method:'POST'});assert.equal(r.status,200);return r.json();};
 const grant=async(s,tx='tx1')=>{const r=await request('/receipt/credits/webhook',null,{method:'POST',headers:{Authorization:'Bearer '+env.RECEIPT_RC_WEBHOOK_SECRET},body:JSON.stringify({api_version:'1.0',event:{type:'NON_RENEWING_PURCHASE',store:'APP_STORE',app_id:'app1',product_id:'pack10',transaction_id:tx,app_user_id:'receipt:'+s.guestId,environment:'SANDBOX'}})});assert.equal(r.status,200);};
 const analyze=(s,id=crypto.randomUUID(),bytes='jpeg')=>{const form=new FormData();form.append('receipt',new Blob([bytes],{type:'image/jpeg'}),'r.jpg');return request('/receipt/analyze',s,{method:'POST',headers:{'X-Receipt-Request-ID':'receipt-'+id,'X-Receipt-Use-Paid':'true'},body:form});};
 return {env,request,session,grant,analyze,storage,ledger,aiCalls:()=>aiCalls};
}
test('paid analysis debits once, replay returns same result without new AI call',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);
 for(let i=0;i<5;i++)assert.equal((await f.analyze(s)).status,200);
 const id=crypto.randomUUID();const r=await f.analyze(s,id);assert.equal(r.status,200);const first=await r.json();assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);
 assert.deepEqual(await(await f.analyze(s,id)).json(),first);assert.equal(f.aiCalls(),6);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);
 const stored=JSON.stringify([...f.storage.values]);assert.equal(stored.includes('Private shop'),false);
 assert.deepEqual(await(await f.request('/receipt/analysis/result?id=receipt-'+id,s)).json(),first);
 const changed=await f.analyze(s,id,'other');assert.notEqual(changed.status,200);assert.equal(f.aiCalls(),6);
});
test('unreadable paid analysis restores credit and does not issue reusable free success',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);
 f.env.AI.run=async()=>({answer:'{"amount":null,"currency":null}'});
 const id=crypto.randomUUID();assert.equal((await f.analyze(s,id)).status,422);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
 assert.equal((await f.analyze(s,id)).status,409);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
});
test('AI provider failure returns paid credit; free core and disabled sales remain available',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);
 f.env.AI.run=async()=>{throw Error('offline');};assert.equal((await f.analyze(s)).status,502);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
 f.env.RECEIPT_PAID_ANALYSIS_ENABLED='false';assert.equal((await f.analyze(s)).status,402);assert.equal((await f.request('/receipt/recovery/create',s,{method:'POST'})).status,503);
});
test('recovery code restores exact paid identity; raw secret is never stored; unknown code rejected',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);
 const response=await f.request('/receipt/recovery/create',s,{method:'POST'});assert.equal(response.status,200);const {code}=await response.json();assert.match(code,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify([...f.storage.values]).includes(code),false);
 assert.equal((await f.request('/receipt/recovery/confirm',s,{method:'POST'})).status,200);
 const ready=await(await f.request('/receipt/credits',s)).json();assert.equal(ready.recoveryReady,true);assert.equal(ready.salesReady,true);assert.equal(ready.balance,10);
 const restored=await(await f.request('/receipt/recovery/restore',null,{method:'POST',body:JSON.stringify({code})})).json();assert.equal(restored.guestId,s.guestId);assert.equal((await(await f.request('/receipt/credits',restored)).json()).balance,10);
 assert.equal((await f.request('/receipt/recovery/restore',null,{method:'POST',body:JSON.stringify({code:'0'.repeat(64)})})).status,400);
 assert.notEqual(await hashCode(code),code);
});
test('transaction confirmation is user-bound and does not infer payment from local flags',async()=>{
 const f=fixture(),s=await f.session(),other=await f.session();await f.grant(s);
 assert.equal((await(await f.request('/receipt/credits/transaction?store=APP_STORE&id=tx1',s)).json()).status,'confirmed');
 assert.equal((await f.request('/receipt/credits/transaction?store=APP_STORE&id=tx1',other)).status,409);
 assert.equal((await(await f.request('/receipt/credits/transaction?store=APP_STORE&id=missing',s)).json()).status,'pending');
});
test('result encryption is bound to user and request, cleanup retains paid credit and tombstones',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);const requestId='receipt-'+crypto.randomUUID();const sealed=await sealResult(f.env,s.guestId,requestId,{merchant:'secret'});
 await assert.rejects(()=>openResult(f.env,'other',requestId,sealed));await assert.rejects(()=>openResult(f.env,s.guestId,'other',sealed));
 await ledgerCall(f.env,'/reserve',{userId:s.guestId,requestId,imageHash:'a'.repeat(64)});await ledgerCall(f.env,'/complete',{userId:s.guestId,requestId,sealedResult:sealed});assert.ok(f.storage.alarmAt);
 const now=Date.now;Date.now=()=>now()+86400001;try{await f.ledger.alarm();}finally{Date.now=now;}
 assert.equal((await ledgerCall(f.env,'/status',{userId:s.guestId,requestId})).sealedResult,undefined);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);await f.grant(s);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);
});
test('another identity cannot retrieve receipt result; readiness fails closed before validation',async()=>{
 const f=fixture(),s=await f.session(),other=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);const id=crypto.randomUUID();await f.analyze(s,id);
 assert.equal((await f.request('/receipt/analysis/result?id=receipt-'+id,other)).status,404);
 f.env.RECEIPT_SANDBOX_CHECKOUT_ENABLED='false';assert.equal((await(await f.request('/receipt/credits',s)).json()).salesReady,false);
});

test('abandoned analysis releases its reservation after fifteen minutes exactly once',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);const requestId='receipt-'+crypto.randomUUID();
 await ledgerCall(f.env,'/reserve',{userId:s.guestId,requestId,imageHash:'a'.repeat(64)});assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);
 const now=Date.now;Date.now=()=>now()+900001;
 try{const r=await f.request('/receipt/analysis/result?id='+requestId,s);assert.equal(r.status,409);assert.equal((await r.json()).status,'released');}finally{Date.now=now;}
 assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
 await f.request('/receipt/analysis/result?id='+requestId,s);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
 assert.equal((await ledgerCall(f.env,'/complete',{userId:s.guestId,requestId})).status,'released');
});
test('paid daily cap returns reserved credit without invoking the provider',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);
 f.env.MAX_ANALYSES_PER_GUEST_PER_DAY='5';assert.equal((await f.analyze(s)).status,429);assert.equal(f.aiCalls(),5);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
});
test('two concurrent identical paid analyses charge once and invoke AI once',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);
 const id=crypto.randomUUID();const responses=await Promise.all([f.analyze(s,id),f.analyze(s,id)]);
 assert.ok(responses.some(r=>r.status===200));assert.equal(f.aiCalls(),6);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,9);
});
test('recovery restore is bounded and rate limited without granting a new balance',async()=>{
 const f=fixture();
 const big=await f.request('/receipt/recovery/restore',null,{method:'POST',body:'x'.repeat(2048)});assert.equal(big.status,400);
 for(let i=0;i<9;i++)assert.equal((await f.request('/receipt/recovery/restore',null,{method:'POST',body:JSON.stringify({code:'0'.repeat(64)})})).status,400);
 assert.equal((await f.request('/receipt/recovery/restore',null,{method:'POST',body:'{}'})).status,429);
});
test('production checkout cannot be enabled by sandbox checkout flag',async()=>{
 const f=fixture(),s=await f.session();f.env.RECEIPT_CREDITS_ENVIRONMENT='PRODUCTION';f.env.RECEIPT_SALES_SANDBOX_VERIFIED='false';
 assert.equal((await(await f.request('/receipt/credits',s)).json()).salesReady,false);
});

test('a stale free-only client cannot spend paid credits when another device used its free scans',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);for(let i=0;i<5;i++)await f.analyze(s);
 const form=new FormData();form.append('receipt',new Blob(['jpeg'],{type:'image/jpeg'}),'r.jpg');
 const r=await f.request('/receipt/analyze',s,{method:'POST',headers:{'X-Receipt-Request-ID':'receipt-'+crypto.randomUUID(),'X-Receipt-Use-Paid':'false'},body:form});
 assert.equal(r.status,402);assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);
});
test('alarm refunds abandoned paid work even when the app was uninstalled',async()=>{
 const f=fixture(),s=await f.session();await f.grant(s);const requestId='receipt-'+crypto.randomUUID();await ledgerCall(f.env,'/reserve',{userId:s.guestId,requestId,imageHash:'a'.repeat(64)});
 const now=Date.now;Date.now=()=>now()+900001;try{await f.ledger.alarm();await f.ledger.alarm();}finally{Date.now=now;}
 assert.equal((await ledgerCall(f.env,'/balance',{userId:s.guestId})).balance,10);assert.equal((await ledgerCall(f.env,'/status',{userId:s.guestId,requestId})).status,'released');
});
test('lost recovery issuance can retry before confirmation; confirmed code cannot be silently rotated',async()=>{
 const f=fixture(),s=await f.session();
 const first=await(await f.request('/receipt/recovery/create',s,{method:'POST'})).json();const second=await(await f.request('/receipt/recovery/create',s,{method:'POST'})).json();assert.notEqual(first.code,second.code);
 assert.equal((await f.request('/receipt/recovery/restore',null,{method:'POST',body:JSON.stringify(first)})).status,400);
 assert.equal((await f.request('/receipt/recovery/confirm',s,{method:'POST'})).status,200);
 assert.equal((await f.request('/receipt/recovery/create',s,{method:'POST'})).status,503);
 assert.equal((await f.request('/receipt/recovery/restore',null,{method:'POST',body:JSON.stringify(second)})).status,200);
});
