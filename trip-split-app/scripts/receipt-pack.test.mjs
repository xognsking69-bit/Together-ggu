import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(fs.readFileSync(new URL('../src/monetization/receipt-pack.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}});
const {receiptPackReady,validReceiptPack}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const user='receipt:12345678-1234-1234-1234-123456789abc';
const config={enabled:true,apiKey:'public-test-key',productId:'receipt10',platform:'ios',environment:'SANDBOX'};
const server={environment:'SANDBOX',salesReady:true,paidAnalysisReady:true,recoveryReady:true,creditsPerPurchase:10,appUserId:user};
const product={identifier:'receipt10',productCategory:'NON_SUBSCRIPTION',productType:'CONSUMABLE',subscriptionPeriod:null,price:1900,priceString:'₩1,900',currencyCode:'KRW'};
test('receipt checkout stays blocked unless all paid services and recovery are ready',()=>{
 assert.equal(receiptPackReady(config,server,user),true);
 for(const flag of ['salesReady','paidAnalysisReady','recoveryReady'])assert.equal(receiptPackReady(config,{...server,[flag]:false},user),false);
 for(const flag of ['salesReady','paidAnalysisReady','recoveryReady'])assert.equal(receiptPackReady(config,{...server,[flag]:undefined},user),false);
 assert.equal(receiptPackReady(config,{},user),false);
});
test('disabled, unconfigured or unsupported billing cannot open receipt checkout',()=>{
 for(const patch of [{enabled:false},{apiKey:''},{productId:''},{platform:'web'}])assert.equal(receiptPackReady({...config,...patch},server,user),false);
});
test('receipt checkout rejects another identity and any pack count except ten',()=>{
 assert.equal(receiptPackReady(config,{...server,appUserId:'another'},user),false);
 assert.equal(receiptPackReady(config,server,'$RCAnonymousID:123'),false);
 for(const creditsPerPurchase of [0,1,5,20,'10',null])assert.equal(receiptPackReady(config,{...server,creditsPerPurchase},user),false);
});
test('receipt checkout accepts only exact consumable with a genuine store price',()=>{
 assert.equal(validReceiptPack(product,config),true);
 for(const patch of [{identifier:'other'},{productCategory:'SUBSCRIPTION'},{productType:'NON_CONSUMABLE'},{subscriptionPeriod:'P1M'},{price:0},{price:NaN},{priceString:''},{currencyCode:'bad'}])assert.equal(validReceiptPack({...product,...patch},config),false);
});
test('Android unknown product type still requires exact configured non-subscription product',()=>{
 const android={...config,platform:'android'};
 assert.equal(validReceiptPack({...product,productType:'UNKNOWN'},android),true);
 assert.equal(validReceiptPack({...product,productType:'UNKNOWN'},config),false);
 assert.equal(validReceiptPack({...product,productType:'UNKNOWN',identifier:'other'},android),false);
});

test('sandbox checkout cannot use production credit ledger',()=>{assert.equal(receiptPackReady(config,{...server,environment:'PRODUCTION'},user),false);assert.equal(receiptPackReady({...config,environment:'PRODUCTION'},server,user),false);});
