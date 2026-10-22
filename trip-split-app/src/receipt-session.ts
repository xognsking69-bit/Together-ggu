import {fetch as expoFetch} from "expo/fetch";
import {Platform} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
export type GuestSession = { guestId: string; token: string; expiresAt: number };
const GUEST_SESSION_KEY = "togetrip-receipt-guest-session-v1";
let guestSessionPromise: Promise<GuestSession> | null = null;

async function readGuestSession() {
  return Platform.OS === "web"
    ? AsyncStorage.getItem(GUEST_SESSION_KEY)
    : SecureStore.getItemAsync(GUEST_SESSION_KEY);
}
export async function writeGuestSession(value: string) {
  if (Platform.OS === "web") await AsyncStorage.setItem(GUEST_SESSION_KEY, value);
  else await SecureStore.setItemAsync(GUEST_SESSION_KEY, value);
}
export async function removeGuestSession() {
  if (Platform.OS === "web") await AsyncStorage.removeItem(GUEST_SESSION_KEY);
  else await SecureStore.deleteItemAsync(GUEST_SESSION_KEY);
}

export async function getGuestSession(endpoint: string, request: typeof fetch): Promise<GuestSession> {
  if (guestSessionPromise) return guestSessionPromise;
  guestSessionPromise = (async () => {
    let cached: GuestSession | null = null;
    try {
      const saved = await readGuestSession();
      if (saved) cached = JSON.parse(saved) as GuestSession;
    } catch {}
    const now = Math.floor(Date.now() / 1000);
    if (cached?.guestId && cached.token && cached.expiresAt > now + 30 * 24 * 60 * 60) return cached;

    const sessionUrl = endpoint.replace(/\/receipt\/analyze\/?$/i, "/receipt/guest/session");
    const response = await request(sessionUrl, {
      method: "POST",
      headers: cached?.token && cached.expiresAt > now ? { Authorization: `Bearer ${cached.token}` } : undefined,
    });
    if (!response.ok) throw new Error(response.status === 429
      ? "게스트 이용 준비 한도에 도달했어요. 내일 다시 시도해주세요."
      : "영수증 AI 연결을 준비하지 못했어요. 잠시 후 다시 시도해주세요.");
    const session = await response.json() as GuestSession;
    if (!session?.guestId || !session?.token || !Number.isFinite(session.expiresAt)) {
      throw new Error("게스트 연결 정보가 올바르지 않아요.");
    }
    await writeGuestSession(JSON.stringify(session));
    return session;
  })();
  try { return await guestSessionPromise; }
  finally { guestSessionPromise = null; }
}


// Bounded requests keep unavailable services from leaving the receipt UI busy forever.
export const receiptFetch:typeof fetch=async(input,init)=>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
 try{return await (Platform.OS==='web'?fetch:expoFetch)(input,{...init,signal:controller.signal});}
 finally{clearTimeout(timeout);}
};
