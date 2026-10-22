export type BillingConfig = {enabled:boolean;platform:string;apiKey:string;productId:string;offeringId:string;entitlementId:string};
export type CustomerSnapshot = {entitlements?:{verification?:string;active?:Record<string,{isActive?:boolean;verification?:string;productIdentifier?:string;expirationDate?:string|null}>}};
export type SalePackage = {identifier:string;packageType:string;product:{identifier:string;productCategory?:string|null;productType?:string;subscriptionPeriod?:string|null;price:number;priceString:string;currencyCode:string}};
export type BillingAdapter = {
  initialize(config:BillingConfig):Promise<void>;
  customer():Promise<CustomerSnapshot>;
  packages(offeringId:string):Promise<SalePackage[]>;
  purchase(pkg:SalePackage):Promise<CustomerSnapshot>;
  restore():Promise<CustomerSnapshot>;
};
export type BillingState={status:'disabled'|'checking'|'ready'|'error';busy:boolean;adFree:boolean;product:SalePackage|null;notice:'none'|'error'|'pending'|'restored'|'not-found'};
export function readBillingConfig(raw:Record<string,unknown>|undefined,platform:string):BillingConfig {
  const value=(key:string)=>typeof raw?.[key]==='string' ? String(raw[key]).trim() : '';
  const config={enabled:false,platform,apiKey:value(platform==='ios'?'iosPublicKey':'androidPublicKey'),productId:value(platform==='ios'?'iosProductId':'androidProductId'),offeringId:value('offeringId'),entitlementId:value('entitlementId')};
  const publicKey=platform==='ios'?/^appl_[A-Za-z0-9]+$/:/^goog_[A-Za-z0-9]+$/;
  config.enabled=raw?.adRemovalReleaseApproved===true && ['ios','android'].includes(platform) &&
    publicKey.test(config.apiKey) && Boolean(config.productId&&config.offeringId&&config.entitlementId);
  return config;
}
const verified=(value:unknown)=>value==='VERIFIED'||value==='VERIFIED_ON_DEVICE';
export function verifiedAdFree(info:CustomerSnapshot,config:BillingConfig):boolean {
  if(!verified(info.entitlements?.verification)) throw new Error('Unverified billing response');
  const entitlement=info.entitlements?.active?.[config.entitlementId];
  if(!entitlement) return false;
  if(!verified(entitlement.verification)||entitlement.productIdentifier!==config.productId||entitlement.expirationDate!==null) throw new Error('Unexpected ad-removal entitlement');
  return entitlement.isActive===true;
}
export function adRemovalPackage(packages:SalePackage[],config:BillingConfig):SalePackage|null {
  const matches=packages.filter(pkg=>pkg.product.identifier===config.productId);
  if(matches.length!==1) return null;
  const pkg=matches[0], p=pkg.product;
  const oneTimeType=config.platform==='ios' ? p.productType==='NON_CONSUMABLE' : p.productType==='NON_CONSUMABLE'||p.productType==='UNKNOWN';
  return pkg.packageType==='LIFETIME' && p.productCategory==='NON_SUBSCRIPTION' &&
    p.subscriptionPeriod===null && oneTimeType && Number.isFinite(p.price) && p.price>0 &&
    p.priceString.trim() && /^[A-Z]{3}$/.test(p.currencyCode) ? pkg : null;
}
export const shouldRenderAds=(state:BillingState)=>state.status==='disabled'||(state.status==='ready'&&!state.adFree);

// No local purchase flag is read or trusted. The adapter is never called while disabled.
export function createAdRemovalController(config:BillingConfig,adapter:BillingAdapter) {
  let state:BillingState={status:config.enabled?'checking':'disabled',busy:false,adFree:false,product:null,notice:'none'};
  let initialized=false;
  const listeners=new Set<(state:BillingState)=>void>();
  const publish=(patch:Partial<BillingState>)=>{state={...state,...patch};listeners.forEach(listener=>listener(state));};
  async function initialize(){if(!initialized){await adapter.initialize(config);initialized=true;}}
  async function run(action:'refresh'|'purchase'|'restore') {
    if(!config.enabled||state.busy) return 'blocked';
    if(action==='purchase'&&(state.status!=='ready'||!state.product||state.adFree||state.notice==='pending')) return 'blocked';
    const wasPending=state.notice==='pending';
    publish({busy:true,notice:wasPending?'pending':'none'});
    try {
      await initialize();
      if(action==='purchase') {
        // The exact package shown to the user is passed to the native store sheet.
        const info=await adapter.purchase(state.product!);
        const adFree=verifiedAdFree(info,config);
        publish({status:'ready',adFree,notice:adFree?'none':'pending'});
        return adFree?'success':'pending';
      }
      const info=action==='restore'?await adapter.restore():await adapter.customer();
      const adFree=verifiedAdFree(info,config);
      publish({status:'ready',adFree,notice:adFree?(action==='restore'?'restored':'none'):wasPending?'pending':action==='restore'?'not-found':'none'});
      if(action==='refresh') {
        try { publish({product:adRemovalPackage(await adapter.packages(config.offeringId),config)}); }
        catch { publish({product:null}); }
      }
      return 'success';
    } catch(error) {
      if(action==='purchase' && (error as {userCancelled?:boolean})?.userCancelled===true) return 'cancelled';
      // Keep a previously verified right, but never grant one on an error.
      publish({status:'error',notice:'error'});
      return 'error';
    } finally { publish({busy:false}); }
  }
  return {getState:()=>state,subscribe(listener:(state:BillingState)=>void){listeners.add(listener);listener(state);return()=>{listeners.delete(listener);};},refresh:()=>run('refresh'),purchase:()=>run('purchase'),restore:()=>run('restore')};
}
