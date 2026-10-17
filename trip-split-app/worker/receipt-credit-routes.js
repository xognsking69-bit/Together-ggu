/** Purchase grants only come from an authenticated RevenueCat server webhook.
 * This does not expose an analysis or client-controlled grant endpoint.
 */
export async function receiptCreditRoute(request,env,authenticate) {
  const path=new URL(request.url).pathname;
  if(!['/receipt/credits','/receipt/credits/webhook'].includes(path)) return null;
  if(env.RECEIPT_CREDITS_ENABLED!=='true'||!env.RECEIPT_CREDIT_LEDGER) return json({error:'PAID_RECEIPTS_DISABLED'},503);
  const environment=env.RECEIPT_CREDITS_ENVIRONMENT;
  if(!['SANDBOX','PRODUCTION'].includes(environment)) return json({error:'BILLING_ENVIRONMENT'},503);
  const stub=env.RECEIPT_CREDIT_LEDGER.get(env.RECEIPT_CREDIT_LEDGER.idFromName(`receipt-credits:${environment}`));
  if(path==='/receipt/credits') {
    if(request.method!=='GET') return json({error:'METHOD'},405);
    const user=await authenticate(request,env);
    if(!user) return json({error:'SESSION_REQUIRED'},401);
    return stub.fetch('https://ledger/balance',{method:'POST',body:JSON.stringify({userId:user.sub})});
  }
  if(request.method!=='POST') return json({error:'METHOD'},405);
  const secret=env.RECEIPT_RC_WEBHOOK_SECRET;
  if(typeof secret!=='string'||secret.length<32) return json({error:'WEBHOOK_NOT_CONFIGURED'},503);
  if(!equal(request.headers.get('Authorization')||'',`Bearer ${secret}`)) return json({error:'UNAUTHORIZED'},401);
  // Read at most 64KB even for a chunked body.
  let data; try {
    const reader=request.body?.getReader(); if(!reader) throw Error();
    const decoder=new TextDecoder();let body='',size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return json({error:'TOO_LARGE'},413);}body+=decoder.decode(value,{stream:true});}
    data=JSON.parse(body+decoder.decode());
  }catch{return json({error:'JSON'},400);}
  const e=data?.event;
  if(data?.api_version!=='1.0'||!e||e.environment!==environment) return json({error:'EVENT_ENVIRONMENT'},400);
  const product=e.store==='APP_STORE'?env.RECEIPT_IOS_PACK10_ID:e.store==='PLAY_STORE'?env.RECEIPT_ANDROID_PACK10_ID:null;
  const appId=e.store==='APP_STORE'?env.RECEIPT_RC_IOS_APP_ID:env.RECEIPT_RC_ANDROID_APP_ID;
  if(!product||!appId) return json({error:'PRODUCT_NOT_CONFIGURED'},503);
  if(e.app_id!==appId||e.product_id!==product||e.is_family_share===true) return json({ignored:true});
  if(!['NON_RENEWING_PURCHASE','CANCELLATION'].includes(e.type)) return json({ignored:true});
  // CANCELLATION reasons other than a refunded one-time purchase require review.
  if(e.type==='CANCELLATION'&&e.cancel_reason!=='CUSTOMER_SUPPORT') return json({error:'REFUND_REVIEW_REQUIRED'},409);
  if(typeof e.app_user_id!=='string'||!/^receipt:[0-9a-f-]{36}$/i.test(e.app_user_id)) return json({error:'UNMAPPED_USER'},409);
  if(!e.transaction_id||typeof e.transaction_id!=='string') return json({error:'TRANSACTION'},400);
  return stub.fetch(`https://ledger/${e.type==='NON_RENEWING_PURCHASE'?'grant':'refund'}`,{method:'POST',body:JSON.stringify({userId:e.app_user_id.slice(8),store:e.store,transactionId:e.transaction_id,productId:product})});
}
function equal(a,b){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});}
