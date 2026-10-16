import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { isManagedReceiptUri } from './receipt-lifecycle';

const directory = () => new Directory(Paths.document,'togetrip-receipts');
export function removeOwnedReceiptCopy(uri: string) {
  if(Platform.OS === 'web' || !isManagedReceiptUri(uri,directory().uri)) return;
  const file=new File(uri);
  if(file.exists) file.delete();
}

// Only new picks are copied; original gallery files are never moved/deleted.
export async function prepareReceiptPhoto(uri: string): Promise<{uri:string;created:boolean}> {
  if(Platform.OS === 'web') return {uri,created:false};
  const source=new File(uri);
  if(!source.exists) throw new Error('Receipt photo unavailable');
  const folder=directory();
  if(isManagedReceiptUri(uri,folder.uri)) return {uri,created:false};
  folder.create({idempotent:true,intermediates:true});
  const extension=/^\.(?:jpg|jpeg|png|webp|heic|heif)$/i.test(source.extension) ? source.extension.toLowerCase() : '.img';
  const destination=new File(folder,`receipt-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  try {
    await source.copy(destination);
    if(!destination.exists) throw new Error('Receipt copy unavailable');
    return {uri:destination.uri,created:true};
  } catch(error) {
    try { removeOwnedReceiptCopy(destination.uri); } catch {}
    throw error;
  }
}
