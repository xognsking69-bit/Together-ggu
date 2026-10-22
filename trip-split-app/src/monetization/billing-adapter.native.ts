import type {BillingAdapter} from './ad-removal';
import type {PurchasesPackage} from 'react-native-purchases';
export function createBillingAdapter():BillingAdapter {
  let sdk:typeof import('react-native-purchases').default;
  const nativePackages=new Map<string,PurchasesPackage>();
  return {
    async initialize(config){
      sdk=(await import('react-native-purchases')).default;
      if(await sdk.isConfigured()) throw new Error('Billing was already configured elsewhere');
      sdk.configure({apiKey:config.apiKey,entitlementVerificationMode:sdk.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,diagnosticsEnabled:false,automaticDeviceIdentifierCollectionEnabled:false});
      // Anonymous SDK identity only. No profile name, trip, photo or expense is supplied.
    },
    customer:()=>sdk.getCustomerInfo(),
    async packages(offeringId){
      const offerings=await sdk.getOfferings();
      const packages=offerings.all[offeringId]?.availablePackages || [];
      nativePackages.clear();
      packages.forEach(pkg=>nativePackages.set(pkg.identifier,pkg));
      return packages;
    },
    async purchase(pkg){
      const native=nativePackages.get(pkg.identifier);
      if(!native||native.product.identifier!==pkg.product.identifier) throw new Error('Product changed');
      return (await sdk.purchasePackage(native)).customerInfo;
    },
    restore:()=>sdk.restorePurchases(),
  };
}
