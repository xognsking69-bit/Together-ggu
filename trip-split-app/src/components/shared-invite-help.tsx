import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppAppearance } from "./appearance-context";

const STEPS = [
  ["1. 여행방 만들기", "초대할 사람이 동행자 → 여행공동방에서 ‘공동방 만들기’를 눌러요."],
  ["2. 초대 보내기", "‘초대 보내기’를 눌러 카카오톡이나 문자로 초대 링크와 초대코드를 보내요."],
  ["3. 초대받은 여행 연결", "받은 링크에서 ‘Togetrip에서 열기’를 누른 뒤 더보기 → 공동 여행방에서 ‘초대받은 공동 여행 연결’을 눌러요. 링크가 안 열리면 메시지에 있는 초대코드 전체를 붙여넣어 주세요."],
  ["4. 함께 사용하기", "연결되면 동행인·지출·일정을 함께 수정할 수 있어요. 인터넷 연결 상태에서 약 5초 간격으로 동기화돼요."],
] as const;

export default function SharedInviteHelp() {
  const [visible, setVisible] = useState(false);
  const { colors } = useAppAppearance();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="초대코드 사용법 도움말" accessibilityHint="공동 여행방을 만들고 참가하는 방법을 보여줍니다" onPress={() => setVisible(true)} style={[styles.help, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Text style={[styles.question, { color: colors.text }]}>?</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <SafeAreaView style={styles.overlay}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>초대코드 사용법</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="도움말 닫기" onPress={() => setVisible(false)} style={styles.close}><Text style={[styles.closeText, { color: colors.text }]}>✕</Text></Pressable>
          </View>
          <ScrollView>
            {STEPS.map(([title, body]) => <View key={title} style={styles.step}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
            </View>)}
            <Text style={[styles.note, { color: colors.muted }]}>방 코드 8자리만으로는 참가할 수 없어요. 메시지의 긴 초대코드 전체가 필요해요. 초대 링크와 코드는 함께 여행할 사람에게만 보내주세요.{"\n\n"}‘서버 없이 여행 사본만 보내기’는 자동 동기화 없이 여행 데이터를 복사하는 기능이에요.</Text>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={[styles.done, { backgroundColor: colors.surface2 }]}><Text style={[styles.stepTitle, { color: colors.text }]}>알겠어요</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  help: { width: 44, height: 44, borderWidth: 1, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  question: { fontSize: 22, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  card: { maxHeight: "90%", width: "100%", maxWidth: 520, alignSelf: "center", borderWidth: 1, borderRadius: 24, padding: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  title: { flex: 1, fontSize: 21, fontWeight: "800" },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 22 },
  step: { marginBottom: 18 },
  stepTitle: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 23, marginTop: 6 },
  note: { fontSize: 14, lineHeight: 22, marginBottom: 12 },
  done: { minHeight: 48, borderRadius: 14, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 12 },
});
