import React, { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

export type ReceiptResult = {
  merchant?: string;
  date?: string;
  amount?: number;
  currency?: "KRW" | "JPY" | "USD" | "EUR";
  category?: string;
  confidence?: number;
};

type Props = {
  accent?: string;
  accentSoft?: string;
  receiptUri: string | null;
  onReceiptUriChange: (uri: string | null) => void;
  onDetected: (result: ReceiptResult) => void;
};

export default function ReceiptTools({
  accent = "#5C5CE2",
  accentSoft = "#EEEEFF",
  receiptUri,
  onReceiptUriChange,
  onDetected,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<ReceiptResult | null>(null);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("카메라 권한 필요", "영수증 촬영을 위해 카메라 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onReceiptUriChange(result.assets[0].uri);
      setLastResult(null);
    }
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 권한 필요", "영수증 사진 선택을 위해 사진 접근 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onReceiptUriChange(result.assets[0].uri);
      setLastResult(null);
    }
  }

  async function analyzeReceipt() {
    if (!receiptUri || analyzing) return;

    const endpoint = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
    if (!endpoint) {
      Alert.alert(
        "AI 연결 준비 완료",
        "영수증 촬영/첨부 기능은 사용할 수 있어요. 자동 분석은 나중에 서버 주소와 API Secret을 연결하면 바로 켜집니다."
      );
      return;
    }

    try {
      setAnalyzing(true);

      const form = new FormData();
      form.append("receipt", {
        uri: receiptUri,
        name: "receipt.jpg",
        type: "image/jpeg",
      } as any);

      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = await response.json();
      const parsed: ReceiptResult = {
        merchant: typeof raw.merchant === "string" ? raw.merchant : undefined,
        date: typeof raw.date === "string" ? raw.date : undefined,
        amount: Number.isFinite(Number(raw.amount)) ? Number(raw.amount) : undefined,
        currency: ["KRW","JPY","USD","EUR"].includes(raw.currency) ? raw.currency : undefined,
        category: typeof raw.category === "string" ? raw.category : undefined,
        confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : undefined,
      };

      setLastResult(parsed);
      onDetected(parsed);
    } catch (error) {
      Alert.alert(
        "영수증 분석 실패",
        "사진 상태나 네트워크를 확인해주세요. AI 결과는 항상 저장 전에 직접 확인하는 방식으로 사용할 거예요."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>🧾 영수증 자동 입력</Text>
          <Text style={styles.helper}>
            촬영하거나 사진을 골라두면 AI가 가게명·날짜·금액·통화를 자동으로 채울 수 있어요.
          </Text>
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
          {analyzing ? "AI가 확인하는 중..." : "✨ AI로 영수증 자동 확인"}
        </Text>
      </Pressable>

      {lastResult && (
        <View style={[styles.resultBox,{backgroundColor:accentSoft}]}>
          <Text style={[styles.resultTitle,{color:accent}]}>자동 입력 결과</Text>
          <Text style={styles.resultText}>
            {lastResult.merchant || "가게명 미확인"} · {lastResult.amount ?? "금액 미확인"} {lastResult.currency || ""}
          </Text>
          <Text style={styles.confirmText}>
            AI가 틀릴 수 있으니 아래 입력칸을 확인한 뒤 저장해주세요.
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
  titleRow:{flexDirection:"row",justifyContent:"space-between"},
  title:{fontSize:18,fontWeight:"900",color:"#20223F",letterSpacing:-0.3},
  helper:{fontSize:12,color:"#8589A5",lineHeight:18,marginTop:5,maxWidth:320},
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
  resultTitle:{fontSize:12,fontWeight:"900"},
  resultText:{fontSize:13,fontWeight:"800",color:"#20223F",marginTop:4},
  confirmText:{fontSize:11,color:"#777C9D",marginTop:5,lineHeight:16}
});
