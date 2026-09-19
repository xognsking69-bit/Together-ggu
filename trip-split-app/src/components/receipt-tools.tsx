import React, { useState } from "react";
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

const form = new FormData();

if (Platform.OS === "web") {
  const imageResponse = await fetch(receiptUri);
  const imageBlob = await imageResponse.blob();

  form.append("receipt", imageBlob, "receipt.jpg");
} else {
  form.append(
    "receipt",
    {
      uri: receiptUri,
      name: "receipt.jpg",
      type: "image/jpeg",
    } as any
  );
}

      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      const raw = await response.json().catch(() => ({}));

      if (!response.ok) {
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
