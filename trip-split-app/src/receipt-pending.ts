import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='togetrip-pending-receipt-analysis-v1';
export type PendingAnalysis={requestId:string;userId:string;uri:string};
export async function pendingAnalysis():Promise<PendingAnalysis|null>{const value=await AsyncStorage.getItem(KEY);if(!value)return null;const data=JSON.parse(value);if(!/^receipt-[0-9a-f-]{36}$/i.test(data?.requestId)||typeof data.userId!=='string'||typeof data.uri!=='string')throw new Error('분석 확인 정보를 읽지 못했어요.');return data;}
export const savePendingAnalysis=(pending:PendingAnalysis)=>AsyncStorage.setItem(KEY,JSON.stringify(pending));
export const clearPendingAnalysis=()=>AsyncStorage.removeItem(KEY);
// This is a deduplication ID, not an authentication secret.
export function newAnalysisId(){return 'receipt-'+ 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});}
