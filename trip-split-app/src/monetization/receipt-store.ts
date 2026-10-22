import type {ReceiptPackConfig,ReceiptStoreProduct} from './receipt-pack';
export async function loadReceiptStore(_config:ReceiptPackConfig,_userId:string):Promise<ReceiptStoreProduct>{throw new Error('Native store only');}
export async function purchaseReceiptStore(_config:ReceiptPackConfig,_userId:string,_expected:ReceiptStoreProduct):Promise<string>{throw new Error('Native store only');}

export async function findReceiptTransaction(_config:ReceiptPackConfig,_userId:string,_since:number,_beforeIds:string[]):Promise<string|null>{return null;}

export async function captureReceiptTransactions(_config:ReceiptPackConfig,_userId:string):Promise<string[]>{throw new Error("Native store only");}
