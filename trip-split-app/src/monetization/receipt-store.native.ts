import {validReceiptPack,type ReceiptPackConfig,type ReceiptStoreProduct} from './receipt-pack';
let initializing:Promise<void>|null=null;
let configuredKey:string|null=null;
// Store identity must match the signed receipt session; never switch/merge accounts implicitly.
async function store(config:ReceiptPackConfig,userId:string) {
 const sdk=(await import('react-native-purchases')).default;
 if(!config.enabled||!config.apiKey||!config.productId)throw new Error('Receipt sales unavailable');
 if(configuredKey&&configuredKey!==config.apiKey)throw new Error('Billing configuration mismatch');
 if(!initializing)initializing=(async()=>{
  if(!await sdk.isConfigured())sdk.configure({apiKey:config.apiKey,appUserID:userId,diagnosticsEnabled:false,automaticDeviceIdentifierCollectionEnabled:false});
  if(await sdk.getAppUserID()!==userId)throw new Error('Billing identity mismatch');
  configuredKey=config.apiKey;
 })().catch(error=>{initializing=null;throw error;});
 await initializing;
 if(await sdk.getAppUserID()!==userId)throw new Error('Billing identity mismatch');
 const products=await sdk.getProducts([config.productId],sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
 const product=products.find(p=>validReceiptPack(p,config));
 if(!product)throw new Error('Receipt product unavailable');
 return {sdk,product};
}
export async function loadReceiptStore(config:ReceiptPackConfig,userId:string):Promise<ReceiptStoreProduct> {return (await store(config,userId)).product;}
export async function purchaseReceiptStore(config:ReceiptPackConfig,userId:string,expected:ReceiptStoreProduct):Promise<string> {
 let prepared:Awaited<ReturnType<typeof store>>;
 try {
  prepared=await store(config,userId);
  const p=prepared.product;
  if(p.identifier!==expected.identifier||p.price!==expected.price||p.currencyCode!==expected.currencyCode||p.priceString!==expected.priceString)throw new Error('Store price changed');
 }catch(error){throw Object.assign(error as Error,{beforePurchase:true});}
 const {sdk,product}=prepared;
 const result=await sdk.purchaseStoreProduct(product);
 return result.transaction.transactionIdentifier;
 // Do not award local credits. Only the server's authenticated webhook can grant them.
}

export async function findReceiptTransaction(config:ReceiptPackConfig,userId:string,since:number,beforeIds:string[]):Promise<string|null> {
 const {sdk}=await store(config,userId);
 const info=await sdk.getCustomerInfo();
 const matches=info.nonSubscriptionTransactions.filter(t=>t.productIdentifier===config.productId&&!beforeIds.includes(t.transactionIdentifier)&&Date.parse(t.purchaseDate)>=since-1000);
 return matches.length===1?matches[0].transactionIdentifier:null;
}

export async function captureReceiptTransactions(config:ReceiptPackConfig,userId:string):Promise<string[]> {const {sdk}=await store(config,userId);return (await sdk.getCustomerInfo()).nonSubscriptionTransactions.filter(t=>t.productIdentifier===config.productId).map(t=>t.transactionIdentifier);}
