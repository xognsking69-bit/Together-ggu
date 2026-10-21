import type {ReceiptPackConfig,ReceiptStoreProduct} from './receipt-pack';
export async function loadReceiptStore(_config:ReceiptPackConfig,_userId:string):Promise<ReceiptStoreProduct>{throw new Error('Native store only');}
export async function purchaseReceiptStore(_config:ReceiptPackConfig,_userId:string):Promise<void>{throw new Error('Native store only');}
