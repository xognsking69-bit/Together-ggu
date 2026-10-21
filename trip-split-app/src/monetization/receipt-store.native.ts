import {validReceiptPack,type ReceiptPackConfig,type ReceiptStoreProduct} from './receipt-pack';
// Store identity must match the signed receipt session; never switch/merge accounts implicitly.
async function store(config:ReceiptPackConfig,userId:string) {
 const sdk=(await import('react-native-purchases')).default;
 if(!config.enabled||!config.apiKey||!config.productId)throw new Error('Receipt sales unavailable');
 if(await sdk.isConfigured()) {
  if(await sdk.getAppUserID()!==userId)throw new Error('Billing identity mismatch');
 } else sdk.configure({apiKey:config.apiKey,appUserID:userId,diagnosticsEnabled:false,automaticDeviceIdentifierCollectionEnabled:false});
 const products=await sdk.getProducts([config.productId],sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
 const product=products.find(p=>validReceiptPack(p,config));
 if(!product)throw new Error('Receipt product unavailable');
 return {sdk,product};
}
export async function loadReceiptStore(config:ReceiptPackConfig,userId:string):Promise<ReceiptStoreProduct> {return (await store(config,userId)).product;}
export async function purchaseReceiptStore(config:ReceiptPackConfig,userId:string):Promise<void> {
 const {sdk,product}=await store(config,userId);
 await sdk.purchaseStoreProduct(product);
 // Do not award local credits. Only the server's authenticated webhook can grant them.
}
