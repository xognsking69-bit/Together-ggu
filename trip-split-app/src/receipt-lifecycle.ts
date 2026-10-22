import type { AppState } from './types';

export function receiptUris(state: AppState | null): Set<string> {
  const uris=new Set<string>();
  if(!state || !Array.isArray(state.trips)) return uris;
  for(const trip of state.trips) {
    if(!trip || !Array.isArray(trip.expenses)) continue;
    for(const expense of trip.expenses) {
      const uri=(expense as typeof expense & {receiptUri?:string})?.receiptUri;
      if(typeof uri === 'string' && uri) uris.add(uri);
    }
  }
  return uris;
}

export function isManagedReceiptUri(uri: string, root: string): boolean {
  const prefix=root.replace(/\/$/,'')+'/';
  if (!uri.startsWith(prefix)) return false;
  return /^receipt-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|heic|heif|img)$/.test(uri.slice(prefix.length));
}

export function decodeStoredState(raw: string | null): AppState | null {
  if(raw === null) return null;
  const state=JSON.parse(raw);
  if(!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid stored travel state');
  return state;
}

// Writes and cleanup share one queue. Failed writes never release old files.
export function createReceiptStateWriter(
  write: (state: AppState)=>Promise<void>,
  removeOwnedCopy: (uri: string)=>void,
) {
  let saved: AppState | null=null;
  let latestQueued: AppState | null=null;
  let draft: string | null=null;
  let tail=Promise.resolve();
  const pending=new Set<string>();
  const failures=new Set<string>();
  function collect() {
    const referenced=new Set([...receiptUris(saved),...receiptUris(latestQueued)]);
    if(draft) referenced.add(draft);
    for(const uri of pending) {
      if(referenced.has(uri)) { failures.delete(uri); continue; }
      try { removeOwnedCopy(uri); pending.delete(uri); failures.delete(uri); }
      catch { failures.add(uri); }
    }
    return {photoCleanupPending:failures.size>0};
  }
  return {
    baseline(state: AppState | null) { saved=state; },
    setDraft(uri: string | null) {
      draft=uri;
      if(uri) pending.add(uri);
      const result=tail.then(collect);
      tail=result.then(()=>{},()=>{});
      return result;
    },
    save(state: AppState) {
      latestQueued=state;
      const result=tail.then(async()=>{
        const previous=receiptUris(saved);
        await write(state);
        saved=state;
        for(const uri of previous) if(!receiptUris(state).has(uri)) pending.add(uri);
        return collect();
      });
      tail=result.then(()=>{},()=>{});
      return result;
    },
  };
}
