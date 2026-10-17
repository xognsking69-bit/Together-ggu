/** Permanent paid-credit ledger. Single coordinator guarantees transaction uniqueness.
 * No alarms/TTL: purchased credit and transaction tombstones must never expire.
 * Only internal bindings may call this object; public access is gated by the worker.
 */
export class ReceiptCreditLedger {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    if (request.method !== 'POST') return reply({error:'METHOD'},405);
    let input; try { input=await request.json(); } catch { return reply({error:'JSON'},400); }
    try {
      const data=await this.storage.transaction(tx=>apply(tx,new URL(request.url).pathname,input));
      return reply(data);
    } catch(e) { return reply({error:e.code||'LEDGER_UNAVAILABLE'},e.status||503); }
  }
}
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,200}$/.test(value);
const key=(kind,...parts)=>[kind,...parts.map(encodeURIComponent)].join('/');
async function apply(tx,path,input) {
  if(!id(input.userId)) fail('USER',400);
  const balanceKey=key('balance',input.userId);
  const balance=await tx.get(balanceKey)||0;
  if(path==='/balance') return {balance:Math.max(0,balance),debt:Math.max(0,-balance)};
  if(path==='/grant'||path==='/refund') {
    if(!id(input.store)||!id(input.transactionId)||!id(input.productId)) fail('TRANSACTION',400);
    const transactionKey=key('transaction',input.store,input.transactionId);
    const previous=await tx.get(transactionKey);
    if(previous&&(previous.userId!==input.userId||previous.productId!==input.productId)) fail('TRANSACTION_OWNER');
    if(path==='/grant') {
      // Quantity is fixed server-side. Never accept a client supplied quantity.
      if(previous) return {duplicate:true,refunded:previous.refunded,balance:Math.max(0,balance)};
      await tx.put(transactionKey,{userId:input.userId,productId:input.productId,refunded:false});
      await tx.put(balanceKey,balance+10);
      return {granted:10,balance:Math.max(0,balance+10)};
    }
    if(previous?.refunded) return {duplicate:true,balance:Math.max(0,balance)};
    // Refund before grant creates a tombstone: late purchase delivery cannot regrant.
    await tx.put(transactionKey,{userId:input.userId,productId:input.productId,refunded:true});
    const next=previous ? balance-10 : balance;
    await tx.put(balanceKey,next);
    return {refunded:previous?10:0,balance:Math.max(0,next),debt:Math.max(0,-next)};
  }
  if(!id(input.requestId)) fail('REQUEST',400);
  const jobKey=key('job',input.userId,input.requestId);
  const job=await tx.get(jobKey);
  if(path==='/reserve') {
    if(typeof input.imageHash!=='string'||!/^[0-9a-f]{64}$/.test(input.imageHash)) fail('IMAGE_HASH',400);
    if(job) {
      if(job.imageHash!==input.imageHash) fail('REQUEST_REUSED');
      return {status:job.status,duplicate:true};
    }
    if(balance<1) fail('CREDITS_REQUIRED',402);
    await tx.put(balanceKey,balance-1);
    await tx.put(jobKey,{imageHash:input.imageHash,status:'reserved'});
    return {status:'reserved',duplicate:false};
  }
  if(path==='/status') {
    if(!job) fail('JOB_NOT_FOUND',404);
    return {status:job.status};
  }
  if(!job) fail('JOB_NOT_FOUND',404);
  if(path==='/complete') {
    if(job.status!=='reserved') return {status:job.status,duplicate:true};
    // Recognition result is not persisted here: no receipt text/photo enters the ledger.
    await tx.put(jobKey,{...job,status:'completed'});
    return {status:'completed'};
  }
  if(path==='/release') {
    if(job.status!=='reserved') return {status:job.status,duplicate:true};
    await tx.put(jobKey,{...job,status:'released'});
    await tx.put(balanceKey,balance+1);
    return {status:'released'};
  }
  fail('NOT_FOUND',404);
}
function reply(body,status=200) {return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
