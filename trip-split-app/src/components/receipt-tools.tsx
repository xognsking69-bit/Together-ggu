import {useAppAppearance} from "./appearance-context";
import ReceiptPackPurchase from "./receipt-pack-purchase";
import { prepareReceiptPhoto, removeOwnedReceiptCopy } from "../receipt-files";
import { useAppLanguage, translateUI } from "./language-context";
import { SmoothText as Text } from "./smooth-text";
import { CURRENCIES, type Currency } from "../currencies";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
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

export type ReceiptResult = {
  merchant?: string;
  date?: string;
  amount?: number;
  currency?: Currency;
  category?: "식비" | "카페" | "교통" | "숙박" | "관광" | "쇼핑" | "기타";
  confidence?: number;
};

type Props = {
  accent?: string;
  accentSoft?: string;
  receiptUri: string | null;
  onReceiptUriChange: (uri: string | null) => void;
  onPreparingChange?: (preparing: boolean) => void;
  onDetected: (result: ReceiptResult) => void;
};

type Usage = { freeRemaining: number };
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

const ALLOWED_CURRENCIES = CURRENCIES;
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
  onPreparingChange,
  onDetected,
}: Props) {
  const {language}=useAppLanguage();
  const {isDark,colors}=useAppAppearance();
  const mounted=useRef(true);
  const selectionGeneration=useRef(0);
  const [preparing, setPreparing]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;selectionGeneration.current++;onPreparingChange?.(false);};},[onPreparingChange]);
  const [analyzing, setAnalyzing] = useState(false);
  const [unavailableUri, setUnavailableUri] = useState<string | null>(null);
  const photoUnavailable = Boolean(receiptUri && unavailableUri === receiptUri);
  const [lastResult, setLastResult] = useState<ReceiptResult | null>(null);
  const [usage, setUsage] = useState<Usage>({ freeRemaining: -1 });

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
      });
    }
  }, []);

  useEffect(() => {
    void refreshUsage().catch(() => {});
  }, [refreshUsage]);

  async function usePickedImage(uri?: string) {
    if (!uri || !mounted.current) return;
    const generation=++selectionGeneration.current;
    setPreparing(true);
    onPreparingChange?.(true);
    try {
      const prepared=await prepareReceiptPhoto(uri);
      if(!mounted.current || generation !== selectionGeneration.current) {
        if(prepared.created) { try { removeOwnedReceiptCopy(prepared.uri); } catch {} }
        return;
      }
      onReceiptUriChange(prepared.uri);
      setLastResult(null);
    } catch {
      if(mounted.current && generation===selectionGeneration.current) Alert.alert(
        translateUI("사진 보관 실패",language),
        translateUI("영수증 사진을 앱에 보관하지 못했어요. 저장 공간을 확인하고 다시 선택해주세요.",language)
      );
    } finally {
      if(mounted.current && generation===selectionGeneration.current) { setPreparing(false); onPreparingChange?.(false); }
    }
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

    if (!result.canceled) await usePickedImage(result.assets[0]?.uri);
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

    if (!result.canceled) await usePickedImage(result.assets[0]?.uri);
  }

  async function analyzeReceipt() {
    if (!receiptUri || photoUnavailable || analyzing || preparing) return;

    const endpoint = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
    if (!endpoint) {
      Alert.alert(
        "AI 서버 주소가 필요해요",
        "Cloudflare Worker 주소를 EXPO_PUBLIC_RECEIPT_API_URL에 설정하면 영수증 AI가 작동합니다."
      );
      return;
    }

    const generation=selectionGeneration.current;
    try {
      setAnalyzing(true);

      const request = Platform.OS === "web" ? fetch : expoFetch;
      const session = await getGuestSession(endpoint, request);

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
      if(!mounted.current || generation !== selectionGeneration.current) return;

      if (!response.ok) {
        if (response.status === 402 || raw?.code === "AI_CREDITS_REQUIRED") {
          await refreshUsage().catch(() => {});
          Alert.alert("무료 분석을 모두 사용했어요", "현재 무료 체험은 5회까지 제공됩니다. 10회권 판매 준비 상태는 구매 안내에서 확인해주세요.");
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
      if(!mounted.current || generation !== selectionGeneration.current) return;
      Alert.alert(
        "영수증 분석 실패",
        error?.message ||
          "사진 상태나 네트워크를 확인해주세요. AI 결과는 저장 전에 직접 확인해주세요."
      );
    } finally {
      if(mounted.current && generation===selectionGeneration.current) setAnalyzing(false);
    }
  }

  return (
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={[styles.title,{color:colors.text}]}>🧾 영수증 AI 자동 입력</Text>
          <Text style={[styles.helper,{color:colors.muted}]}>
            영수증을 촬영하거나 사진을 고르면 가게명·날짜·총액·통화·카테고리를 자동으로 채워요.
          </Text>
        </View>
        <View style={[styles.aiBadge,{backgroundColor:accentSoft}]}>
          <Text style={[styles.aiBadgeText,{color:accent}]}>AI</Text>
        </View>
      </View>

      {receiptUri ? (
        <View style={styles.previewWrap}>
          <Image key={receiptUri} source={{ uri: receiptUri }} style={styles.preview} resizeMode="cover" onError={()=>setUnavailableUri(receiptUri)} onLoad={()=>setUnavailableUri(null)} />
          {photoUnavailable && <Text localize style={[styles.helper,{color:colors.muted}]}>영수증 사진을 불러올 수 없어요. 원본 사진을 다시 선택해주세요. 지출 정보는 그대로 남아 있어요.</Text>}
          <Pressable
            disabled={preparing || analyzing}
            onPress={() => {
              selectionGeneration.current++;
              onReceiptUriChange(null);
              setLastResult(null);
            }}
            style={styles.removeButton}
          >
            <Text localize style={styles.removeText}>사진 첨부 해제</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.emptyPreview,{backgroundColor:isDark?colors.surface2:accentSoft}]}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={[styles.emptyText,isDark&&{color:colors.text}]}>영수증 사진을 추가해주세요</Text>
        </View>
      )}

      {preparing && <Text localize style={[styles.helper,{color:colors.muted}]}>영수증 사진 보관 중…</Text>}
      <Text localize style={[styles.helper,{color:colors.muted}]}>{Platform.OS === "web"
        ? "웹에서는 영수증 사진을 장기 보관하지 않아요. 원본 사진은 따로 보관해주세요."
        : "새로 선택한 사진은 앱 전용 폴더에 사본으로 보관해요. 첨부를 해제하고 저장하거나 지출을 삭제하면 기기 저장 성공 후 사용하지 않는 앱 사본을 정리해요. 원본 사진과 서버 데이터는 삭제하지 않아요."}</Text>
      <Text localize style={[styles.helper,{color:colors.muted}]}>영수증 사진은 JSON 백업에 포함되지 않아요. 원본 사진은 따로 보관해주세요.</Text>
      <View style={styles.usageRow}>
        <Text style={[styles.usageText,isDark&&{color:colors.text}]}>
          {usage.freeRemaining < 0 ? "사용량 불러오는 중" : `무료 분석 ${usage.freeRemaining}/5회 남음`}
        </Text>
      </View>

      <ReceiptPackPurchase getSession={async()=>{
        const endpoint=process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
        if(!endpoint) throw new Error("영수증 AI에 연결할 수 없어요.");
        const session=await getGuestSession(endpoint,Platform.OS==="web"?fetch:expoFetch);
        return {endpoint,...session};
      }}/>

      <View style={styles.actions}>
        <Pressable disabled={preparing || analyzing} onPress={takePhoto} style={[styles.secondaryButton,{backgroundColor:colors.surface2}]}>
          <Text style={[styles.secondaryText,{color:colors.text}]}>📸 촬영</Text>
        </Pressable>
        <Pressable disabled={preparing || analyzing} onPress={pickPhoto} style={[styles.secondaryButton,{backgroundColor:colors.surface2}]}>
          <Text style={[styles.secondaryText,{color:colors.text}]}>🖼 사진 선택</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={!receiptUri || photoUnavailable || analyzing || preparing}
        onPress={analyzeReceipt}
        style={[
          styles.analyzeButton,
          {backgroundColor:accent},
          (!receiptUri || photoUnavailable || analyzing || preparing) && {backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.border},
        ]}
      >
        <Text style={[styles.analyzeText,(!receiptUri || photoUnavailable || analyzing || preparing)&&{color:colors.text}]}>
          {analyzing ? "AI가 영수증을 읽는 중..." : "✨ AI로 자동 입력"}
        </Text>
      </Pressable>

      {lastResult && (
        <View style={[styles.resultBox,{backgroundColor:isDark?colors.surface2:accentSoft}]}>
          <View style={styles.resultHeader}>
            <Text style={[styles.resultTitle,{color:accent}]}>AI 인식 결과</Text>
            {lastResult.confidence != null && (
              <Text style={[styles.confidence,{color:colors.muted}]}>
                신뢰도 {Math.round(lastResult.confidence * 100)}%
              </Text>
            )}
          </View>
          <Text style={[styles.resultText,{color:colors.text}]}>
            {lastResult.merchant || "가게명 미확인"}
          </Text>
          <Text style={[styles.resultSub,{color:colors.text}]}>
            {lastResult.date || "날짜 미확인"} ·{" "}
            {lastResult.amount != null
              ? lastResult.amount.toLocaleString()
              : "금액 미확인"}{" "}
            {lastResult.currency || ""}
            {lastResult.category ? ` · ${lastResult.category}` : ""}
          </Text>
          <Text style={[styles.confirmText,{color:colors.muted}]}>
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
    borderWidth:1,
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
