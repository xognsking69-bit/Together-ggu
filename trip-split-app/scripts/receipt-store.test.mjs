import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const policy=url(js('../src/monetization/receipt-pack.ts'));
async function fixture(){
 const fakeUrl=url(`export const fake={tag:'${crypto.randomUUID()}',configured:false,user:'',configureCalls:0,purchaseCalls:0,transactions:[],product:{identifier:'pack10',productCategory:'NON_SUBSCRIPTION',productType:'CONSUMABLE',subscriptionPeriod:null,price:1900,priceString:'₩1,900',currencyCode:'KRW'},PRODUCT_CATEGORY:{NON_SUBSCRIPTION:'NON_SUBSCRIPTION'},isConfigured:async()=>fake.configured,configure:c=>{fake.configured=true;fake.user=c.appUserID;fake.configureCalls++;},getAppUserID:async()=>fake.user,getProducts:async()=>[fake.product],purchaseStoreProduct:async()=>{fake.purchaseCalls++;if(fake.error)throw fake.error;return {transaction:{transactionIdentifier:'tx1'}};},getCustomerInfo:async()=>({nonSubscriptionTransactions:fake.transactions})};export default fake;`);
 const source=js('../src/monetization/receipt-store.native.ts').replace(/(['"])\.\/receipt-pack\1/g,JSON.stringify(policy)).replace(/(['"])react-native-purchases\1/g,JSON.stringify(fakeUrl));
 const sdk=await import(fakeUrl);const adapter=await import(url(source));
 return {fake:sdk.fake,adapter,config:{enabled:true,apiKey:'test-public',productId:'pack10',platform:'ios',environment:'SANDBOX'},user:'receipt:12345678-1234-1234-1234-123456789abc'};
}
test('native receipt SDK is initialized once under concurrent product queries',async()=>{
 const {fake,adapter,config,user}=await fixture();await Promise.all([adapter.loadReceiptStore(config,user),adapter.loadReceiptStore(config,user)]);assert.equal(fake.configureCalls,1);assert.equal(fake.purchaseCalls,0);
});
test('native purchase checks signed identity and cannot silently merge another account',async()=>{
 const {fake,adapter,config,user}=await fixture();await adapter.loadReceiptStore(config,user);await assert.rejects(()=>adapter.loadReceiptStore(config,'receipt:other'),/identity/);assert.equal(fake.purchaseCalls,0);
});
test('store price changed after display prevents charge with a pre-purchase error',async()=>{
 const {fake,adapter,config,user}=await fixture();const expected={...await adapter.loadReceiptStore(config,user)};fake.product={...fake.product,price:9900,priceString:'₩9,900'};
 await assert.rejects(()=>adapter.purchaseReceiptStore(config,user,expected),e=>e.beforePurchase===true);assert.equal(fake.purchaseCalls,0);
});
test('store error after purchase begins is not misclassified as safely uncharged',async()=>{
 const {fake,adapter,config,user}=await fixture();const expected={...await adapter.loadReceiptStore(config,user)};fake.error=Object.assign(new Error('lost response'),{code:'NETWORK'});
 await assert.rejects(()=>adapter.purchaseReceiptStore(config,user,expected),e=>!e.beforePurchase);assert.equal(fake.purchaseCalls,1);
});
test('purchase returns store transaction only; reconciliation excludes older transactions',async()=>{
 const {fake,adapter,config,user}=await fixture();const expected={...await adapter.loadReceiptStore(config,user)};
 assert.equal(await adapter.purchaseReceiptStore(config,user,expected),'tx1');
 const now=Date.now();fake.transactions=[{transactionIdentifier:'old',productIdentifier:'pack10',purchaseDate:new Date(now).toISOString()}];assert.equal(await adapter.findReceiptTransaction(config,user,now,['old']),null);
 fake.transactions.push({transactionIdentifier:'new',productIdentifier:'pack10',purchaseDate:new Date(now).toISOString()});assert.equal(await adapter.findReceiptTransaction(config,user,now,['old']),'new');
 fake.transactions.push({transactionIdentifier:'ambiguous',productIdentifier:'pack10',purchaseDate:new Date(now).toISOString()});assert.equal(await adapter.findReceiptTransaction(config,user,now,['old']),null);
});
