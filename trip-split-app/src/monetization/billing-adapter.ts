import type {BillingAdapter} from './ad-removal';
export function createBillingAdapter():BillingAdapter {
  const unsupported=async()=>{throw new Error('Native store billing only');};
  return {initialize:unsupported,customer:unsupported,packages:unsupported,purchase:unsupported,restore:unsupported};
}
