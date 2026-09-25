import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

export type ReceiptResult = {
  merchant?: string;
  date?: string;
  amount?: number;
  currency?: "KRW" | "JPY" | "USD" | "EUR";
  category?: "식비" | "카페" | "교통" | "숙박" | "관광" | "쇼핑" | "기타";
  confidence?: number;
};

type Props = {
  accent?: string;
  accentSoft?: string;
  receiptUri: string | null;
  onReceiptUriChange: (uri: string | null) => void;
  onDetected: (result: ReceiptResult) => void;
};

const PAID_PRODUCT_ID = "receipt_ai_30";
const PAID_CURRENCY_CODE = "AI_SCAN";

type Usage = { freeRemaining: number; paidCredits: number; paidEnabled: boolean };
type GuestSession = { guestId: string; token: string; expiresAt: number };
const GUEST_SESSION_KEY = "togetrip-receipt-guest-session-v1";
let guestSessionPromise: Promise<GuestSession> | null = null;

async function readGuestSession() {
  return Platform.OS === "web"
    ? AsyncStorage.getItem(GUEST_SESSION_KEY)
    : SecureStore.getItemAsync(GUEST_SESSION_KEY);
}
async function writeGuestSession(value: string) {
  if (Platform.OS === "web") await AsyncStorage.setItem(GUEST_SESSION_KEY, value);
  else await SecureStore.setItemAsync(GUEST_SESSION_KEY, value);
}
async function removeGuestSession() {
  if (Platform.OS === "web") await AsyncStorage.removeItem(GUEST_SESSION_KEY);
  else await SecureStore.deleteItemAsync(GUEST_SESSION_KEY);
}

async function getGuestSession(endpoint: string, request: typeof fetch): Promise<GuestSession> {
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

function getStoreApiKey() {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim();
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim();
  return undefined;
}

async function configureBilling(appUserId: string) {
  const apiKey = getStoreApiKey();
  if (!apiKey || Platform.OS === "web") return false;
  if (!(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey, appUserID: appUserId });
  } else if ((await Purchases.getAppUserID()) !== appUserId) {
    await Purchases.logIn(appUserId);
  }
  return true;
}

const ALLOWED_CURRENCIES = ["KRW", "JPY", "USD", "EUR"] as const;
const ALLOWED_CATEGORIES = ["식비", "카페", "교통", "숙박", "관광", "쇼핑", "기타"] as const;

function normalizeResult(raw: any): ReceiptResult {
  const source = raw?.data && typeof raw.data === "object" ? raw.data : raw;

  const merchant =
    typeof source?.merchant === "string" && source.merchant.trim()
      ? source.merchant.trim()
      : undefined;

  const date =
    typeof source?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date)
      ? source.date
      : undefined;

  const amountNumber = Number(source?.amount);
  const amount =
    Number.isFinite(amountNumber) && amountNumber > 0
      ? amountNumber
      : undefined;

  const currency = ALLOWED_CURRENCIES.includes(source?.currency)
    ? source.currency
    : undefined;

  const category = ALLOWED_CATEGORIES.includes(source?.category)
    ? source.category
    : undefined;

  const confidenceNumber = Number(source?.confidence);
  const confidence =
    Number.isFinite(confidenceNumber)
      ? Math.max(0, Math.min(1, confidenceNumber))
      : undefined;

  return { merchant, date, amount, currency, category, confidence };
}

export default function ReceiptTools({
  accent = "#5C5CE2",
  accentSoft = "#EEEEFF",
  receiptUri,
  onReceiptUriChange,
  onDetected,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<ReceiptResult | null>(null);
  const [usage, setUsage] = useState<Usage>({ freeRemaining: -1, paidCredits: 0, paidEnabled: false });
  const [paidPackage, setPaidPackage] = useState<PurchasesPackage | null>(null);
  const [billingReady, setBillingReady] = useState(false);
  const [buying, setBuying] = useState(false);

  const refreshUsage = useCallback(async () => {
    const endpoint = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
    if (!endpoint) return;
    const request = Platform.OS === "web" ? fetch : expoFetch;
    const session = await getGuestSession(endpoint, request);
    const usageUrl = endpoint.replace(/\/receipt\/analyze\/?$/i, "/receipt/usage");
    const response = await request(usageUrl, { headers: { Authorization: `Bearer ${session.token}` } });
    if (response.status === 401) {
      await removeGuestSession();
      throw new Error("영수증 AI 연결이 만료됐어요. 다시 시도해주세요.");
    }
    if (response.ok) {
      const data = await response.json();
      setUsage({
        freeRemaining: Math.max(0, Number(data?.freeRemaining) || 0),
        paidCredits: Math.max(0, Number(data?.paidCredits) || 0),
        paidEnabled: data?.paidEnabled === true,
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshUsage().catch(() => {});
    void (async () => {
      try {
        const endpoint = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
        if (!endpoint) return;
        const request = Platform.OS === "web" ? fetch : expoFetch;
        const session = await getGuestSession(endpoint, request);
        const ready = await configureBilling(session.guestId);
        if (!active || !ready) return;
        const offerings = await Purchases.getOfferings();
        const productPackage = offerings.current?.availablePackages.find(
          item => item.product.identifier === PAID_PRODUCT_ID
        ) || null;
        if (active) {
          setPaidPackage(productPackage);
          setBillingReady(true);
          await refreshUsage().catch(() => {});
        }
      } catch (error) {
        console.warn("Receipt credit store unavailable", error);
      }
    })();
    return () => { active = false; };
  }, [refreshUsage]);

  async function buyCredits() {
    if (!paidPackage || !usage.paidEnabled || buying) return;
    try {
      setBuying(true);
      await Purchases.purchasePackage(paidPackage);
      await new Promise(resolve => setTimeout(resolve, 700));
      await refreshUsage();
      Alert.alert("구매 완료", "AI 영수증 분석 크레딧 30회가 추가됐어요.");
    } catch (error: any) {
      if (!error?.userCancelled) {
        Alert.alert("구매를 완료하지 못했어요", error?.message || "잠시 후 다시 시도해주세요.");
      }
    } finally {
      setBuying(false);
    }
  }

  function usePickedImage(uri?: string) {
    if (!uri) return;
    onReceiptUriChange(uri);
    setLastResult(null);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("카메라 권한 필요", "영수증 촬영을 위해 카메라 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      allowsEditing: false,
    });

    if (!result.canceled) usePickedImage(result.assets[0]?.uri);
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 권한 필요", "영수증 사진 선택을 위해 사진 접근 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      allowsEditing: false,
    });

    if (!result.canceled) usePickedImage(result.assets[0]?.uri);
  }

  async function analyzeReceipt() {
    if (!receiptUri || analyzing) return;

    const endpoint = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
    if (!endpoint) {
      Alert.alert(
        "AI 서버 주소가 필요해요",
        "Cloudflare Worker 주소를 EXPO_PUBLIC_RECEIPT_API_URL에 설정하면 영수증 AI가 작동합니다."
      );
      return;
    }

    try {
      setAnalyzing(true);

      const request = Platform.OS === "web" ? fetch : expoFetch;
      const session = await getGuestSession(endpoint, request);
      await configureBilling(session.guestId);

      const form = new FormData();

      if (Platform.OS === "web") {
        const imageResponse = await fetch(receiptUri);
        if (!imageResponse.ok) {
          throw new Error("선택한 영수증 사진을 읽지 못했어요.");
        }
        const imageBlob = await imageResponse.blob();
        form.append("receipt", imageBlob, "receipt.jpg");
      } else {
        // Expo SDK 57's fetch accepts a File/Blob part. The legacy { uri, name, type }
        // React Native FormData part is rejected by this runtime.
        const imageFile = new File(receiptUri);
        if (!imageFile.exists) {
          throw new Error("영수증 사진 파일을 찾지 못했어요. 사진을 다시 선택해주세요.");
        }
        form.append("receipt", imageFile, "receipt.jpg");
      }

      const response = await request(endpoint.replace(/\/$/, ""), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: form,
      });

      const raw = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 402 || raw?.code === "AI_CREDITS_REQUIRED") {
          await refreshUsage().catch(() => {});
          Alert.alert("무료 분석을 모두 사용했어요", "유료 분석 30회를 추가하면 계속 사용할 수 있어요.");
          return;
        }
        if (response.status === 429 || raw?.code === "SERVICE_DAILY_LIMIT_REACHED") {
          Alert.alert("오늘 이용 한도", raw?.error || "오늘 영수증 AI 이용 한도에 도달했습니다. 내일 다시 이용해주세요.");
          return;
        }
        const message =
          typeof raw?.error === "string"
            ? raw.error
            : `서버 오류 (${response.status})`;
        throw new Error(message);
      }

      const parsed = normalizeResult(raw);

      if (
        !parsed.merchant &&
        !parsed.date &&
        parsed.amount == null &&
        !parsed.currency &&
        !parsed.category
      ) {
        throw new Error("영수증 정보를 충분히 읽지 못했어요.");
      }

      setLastResult(parsed);
      onDetected(parsed);
      await refreshUsage().catch(() => {});
    } catch (error: any) {
      Alert.alert(
        "영수증 분석 실패",
        error?.message ||
          "사진 상태나 네트워크를 확인해주세요. AI 결과는 저장 전에 직접 확인해주세요."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.title}>🧾 영수증 AI 자동 입력</Text>
          <Text style={styles.helper}>
            영수증을 촬영하거나 사진을 고르면 가게명·날짜·총액·통화·카테고리를 자동으로 채워요.
          </Text>
        </View>
        <View style={[styles.aiBadge,{backgroundColor:accentSoft}]}>
          <Text style={[styles.aiBadgeText,{color:accent}]}>AI</Text>
        </View>
      </View>

      {receiptUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="cover" />
          <Pressable
            onPress={() => {
              onReceiptUriChange(null);
              setLastResult(null);
            }}
            style={styles.removeButton}
          >
            <Text style={styles.removeText}>사진 제거</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.emptyPreview,{backgroundColor:accentSoft}]}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={styles.emptyText}>영수증 사진을 추가해주세요</Text>
        </View>
      )}

      <View style={styles.usageRow}>
        <Text style={styles.usageText}>
          {usage.freeRemaining < 0 ? "사용량 불러오는 중" : `무료 ${usage.freeRemaining}/5회 · 유료 ${usage.paidCredits}회`}
        </Text>
        <Pressable
          disabled={!paidPackage || !usage.paidEnabled || buying}
          onPress={buyCredits}
          style={[styles.creditButton, (!paidPackage || buying) && styles.disabled]}
        >
          <Text style={styles.creditButtonText}>
            {buying ? "구매 중…" : paidPackage && usage.paidEnabled ? `30회 ${paidPackage.product.priceString}` : billingReady ? "상품 준비 중" : "스토어 연결 준비 중"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={takePhoto} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>📸 촬영</Text>
        </Pressable>
        <Pressable onPress={pickPhoto} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>🖼 사진 선택</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={!receiptUri || analyzing}
        onPress={analyzeReceipt}
        style={[
          styles.analyzeButton,
          {backgroundColor:accent},
          (!receiptUri || analyzing) && styles.disabled,
        ]}
      >
        <Text style={styles.analyzeText}>
          {analyzing ? "AI가 영수증을 읽는 중..." : "✨ AI로 자동 입력"}
        </Text>
      </Pressable>

      {lastResult && (
        <View style={[styles.resultBox,{backgroundColor:accentSoft}]}>
          <View style={styles.resultHeader}>
            <Text style={[styles.resultTitle,{color:accent}]}>AI 인식 결과</Text>
            {lastResult.confidence != null && (
              <Text style={styles.confidence}>
                신뢰도 {Math.round(lastResult.confidence * 100)}%
              </Text>
            )}
          </View>
          <Text style={styles.resultText}>
            {lastResult.merchant || "가게명 미확인"}
          </Text>
          <Text style={styles.resultSub}>
            {lastResult.date || "날짜 미확인"} ·{" "}
            {lastResult.amount != null
              ? lastResult.amount.toLocaleString()
              : "금액 미확인"}{" "}
            {lastResult.currency || ""}
            {lastResult.category ? ` · ${lastResult.category}` : ""}
          </Text>
          <Text style={styles.confirmText}>
            아래 지출 입력칸에 자동 반영됐어요. 저장하기 전에 금액과 날짜를 한 번 확인해주세요.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:{
    backgroundColor:"#FFFFFF",
    borderRadius:22,
    padding:17,
    marginBottom:13,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:5},
    shadowOpacity:0.055,
    shadowRadius:14,
    elevation:2
  },
  flex:{flex:1},
  titleRow:{flexDirection:"row",justifyContent:"space-between",gap:10},
  title:{fontSize:18,fontWeight:"900",color:"#20223F",letterSpacing:-0.3},
  helper:{fontSize:12,color:"#8589A5",lineHeight:18,marginTop:5,maxWidth:320},
  aiBadge:{
    minWidth:34,
    height:26,
    borderRadius:13,
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:8
  },
  aiBadgeText:{fontSize:11,fontWeight:"900"},
  emptyPreview:{
    height:150,
    marginTop:14,
    borderRadius:18,
    alignItems:"center",
    justifyContent:"center"
  },
  emptyEmoji:{fontSize:32},
  emptyText:{fontSize:12,fontWeight:"800",color:"#777C9D",marginTop:7},
  previewWrap:{marginTop:14},
  preview:{width:"100%",height:210,borderRadius:18,backgroundColor:"#F0F2F8"},
  removeButton:{alignSelf:"flex-end",paddingVertical:8,paddingHorizontal:4},
  removeText:{fontSize:12,fontWeight:"800",color:"#E15467"},
  actions:{flexDirection:"row",gap:9,marginTop:4},
  usageRow:{marginTop:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  usageText:{flex:1,fontSize:11,color:"#777C9D",fontWeight:"700"},
  creditButton:{paddingHorizontal:12,paddingVertical:9,borderRadius:12,backgroundColor:"#F4F5FA"},
  creditButtonText:{fontSize:11,fontWeight:"900",color:"#20223F"},
  secondaryButton:{
    flex:1,
    paddingVertical:12,
    borderRadius:14,
    backgroundColor:"#F4F5FA",
    alignItems:"center"
  },
  secondaryText:{fontWeight:"900",color:"#20223F"},
  analyzeButton:{
    marginTop:10,
    paddingVertical:14,
    borderRadius:15,
    alignItems:"center"
  },
  analyzeText:{color:"#FFFFFF",fontWeight:"900"},
  disabled:{opacity:0.35},
  resultBox:{marginTop:12,borderRadius:15,padding:12},
  resultHeader:{flexDirection:"row",justifyContent:"space-between",gap:8},
  resultTitle:{fontSize:12,fontWeight:"900"},
  confidence:{fontSize:10,fontWeight:"800",color:"#777C9D"},
  resultText:{fontSize:14,fontWeight:"900",color:"#20223F",marginTop:6},
  resultSub:{fontSize:12,fontWeight:"700",color:"#4C506B",marginTop:3},
  confirmText:{fontSize:11,color:"#777C9D",marginTop:7,lineHeight:16}
});
