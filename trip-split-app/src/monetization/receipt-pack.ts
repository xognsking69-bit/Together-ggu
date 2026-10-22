// A 10-use consumable only. Store billing cannot be opened until server readiness
// (including paid analysis and recoverable identity) has been verified.
export type ReceiptPackConfig={enabled:boolean;apiKey:string;productId:string;platform:string;environment:"SANDBOX"|"PRODUCTION"};
export type ReceiptStoreProduct={identifier:string;productCategory?:string|null;productType:string;subscriptionPeriod:string|null;price:number;priceString:string;currencyCode:string};
export type ReceiptSalesReadiness={salesReady?:boolean;paidAnalysisReady?:boolean;recoveryReady?:boolean;creditsPerPurchase?:number;appUserId?:string;environment?:string};
export function receiptPackReady(config:ReceiptPackConfig,server:ReceiptSalesReadiness,userId:string) {
 return config.enabled && ['SANDBOX','PRODUCTION'].includes(config.environment) && server.environment===config.environment && ['ios','android'].includes(config.platform) && Boolean(config.apiKey&&config.productId) &&
  /^receipt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) &&
  server.appUserId===userId && server.salesReady===true && server.paidAnalysisReady===true && server.recoveryReady===true && server.creditsPerPurchase===10;
}
export function validReceiptPack(product:ReceiptStoreProduct,config:ReceiptPackConfig) {
 return product.identifier===config.productId && product.productCategory==='NON_SUBSCRIPTION' &&
  (product.productType==='CONSUMABLE'||(config.platform==='android'&&product.productType==='UNKNOWN')) &&
  product.subscriptionPeriod===null && Number.isFinite(product.price)&&product.price>0 && Boolean(product.priceString.trim())&&/^[A-Z]{3}$/.test(product.currencyCode);
}
