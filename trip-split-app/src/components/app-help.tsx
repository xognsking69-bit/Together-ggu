import { SmoothText as Text } from "./smooth-text";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppLanguage, translateUI } from "./language-context";
import { useAppAppearance } from "./appearance-context";

const INVITE_STEPS = [
  ["1. 여행방 만들기", "초대할 사람이 동행자 → 여행공동방에서 ‘공동방 만들기’를 눌러요."],
  ["2. 초대 보내기", "‘초대 보내기’를 눌러 카카오톡이나 문자로 초대 링크와 초대코드를 보내요."],
  ["3. 초대받은 여행 연결", "받은 링크에서 ‘Togetrip에서 열기’를 누른 뒤 더보기 → 공동 여행방에서 ‘초대받은 공동 여행 연결’을 눌러요. 링크가 안 열리면 메시지에 있는 초대코드 전체를 붙여넣어 주세요."],
  ["4. 함께 사용하기", "연결되면 동행인·지출·일정을 함께 수정할 수 있어요. 인터넷 연결 상태에서 약 5초 간격으로 동기화돼요."],
] as const;

type Guide = { title: string; steps: ReadonlyArray<readonly [string, string]>; note?: string };
const GUIDES: Array<{ match: RegExp; guide: Guide }> = [
  {match:/광고 제거|구매 복원/,guide:{title:"광고 제거 사용법",steps:[
    ["가격 확인","광고 제거는 1회 구매 상품이에요. 화면과 스토어 결제창의 가격을 확인한 뒤 직접 구매해주세요."],
    ["구매 복원","재설치하거나 기기를 바꿨다면 구매할 때 사용한 동일 스토어 계정으로 로그인한 뒤 구매 복원을 눌러주세요."],
    ["포함 범위","광고 제거는 앱 배너 광고에만 적용돼요. 영수증 AI 이용권이나 구독은 포함되지 않아요."]
  ],note:"구매가 확인되지 않으면 다시 결제하지 말고 구매 정보 다시 확인 또는 구매 복원을 이용해주세요."}},
  { match: /초대|공동방|공동 여행방/, guide: { title: "공동 여행방 · 초대코드 사용법", steps: INVITE_STEPS, note: "방 코드 8자리만으로는 참가할 수 없어요. 메시지의 긴 초대코드 전체를 붙여넣어 주세요. 초대 링크와 코드는 함께 여행할 사람에게만 보내주세요.\n\n‘서버 없이 여행 사본만 보내기’는 자동 동기화 없이 여행 데이터를 복사하는 기능이에요." } },
  { match: /홈|현재 여행|여행 설정|새 여행/, guide: { title: "여행 시작하기", steps: [["여행 선택", "현재 여행을 선택하거나 새 여행을 만들고 여행 이름·날짜·통화를 정해요."], ["달력 사용", "날짜를 눌러 그날의 일정과 지출을 확인하고 추가해요."], ["함께 여행하기", "동행자 탭에서 이름을 추가하고 공동 여행방으로 친구를 초대할 수 있어요."]] } },
  { match: /일정|지도|날짜/, guide: { title: "일정과 지도 사용법", steps: [["일정 추가", "달력의 날짜를 누른 뒤 일정 추가에서 제목·종류·장소·시간을 입력하고 저장해요."], ["일정 수정", "저장된 일정을 눌러 내용을 수정해요. 삭제하면 해당 일정이 없어져요."], ["지도 열기", "장소를 입력한 뒤 지도에서 보기를 누르면 기기의 지도 앱에서 찾아볼 수 있어요."]] } },
  { match: /예산|소비 분석/, guide: { title: "예산 · 소비 분석", steps: [["예산 설정", "여행 예산을 입력하면 기록된 지출과 비교할 수 있어요."], ["소비 확인", "카테고리별 지출과 남은 예산을 확인해요. 분석은 입력한 지출을 기준으로 계산돼요."]] } },
  { match: /지출/, guide: { title: "지출 기록하기", steps: [["금액 입력", "지출 탭에서 제목·금액·통화·날짜·카테고리를 입력해요."], ["결제자와 참여자", "실제로 결제한 사람과 이 지출을 함께 부담할 사람을 각각 선택해요. 참여하지 않은 사람은 제외해요."], ["환율과 저장", "외화는 환율 조회가 끝난 뒤 저장하거나 직접 환율을 입력해요. 지출 내역에서 수정·삭제할 수 있어요."], ["영수증", "영수증 분석 결과는 금액과 내용을 직접 확인한 뒤 저장해주세요."]] } },
  { match: /동행|사람 목록/, guide: { title: "동행자 관리", steps: [["이름 추가", "동행자 이름을 입력하고 추가를 눌러요. 프로필 사진도 선택할 수 있어요."], ["내 정보", "더보기 → 내 정보에서 이 기기 사용자의 이름과 사진을 관리해요. 공동 여행방에서는 각 기기의 ‘나’가 서로 다른 사람이에요."], ["공동 여행 연결", "동행자 → 여행공동방에서 초대를 보내거나 받은 초대코드를 입력해요."]] } },
  { match: /정산|송금|여행 종료/, guide: { title: "정산 사용법", steps: [["지출 먼저 확인", "각 지출의 결제자·참여자·금액을 확인해요. 사람별 정산에서 낸 금액과 부담할 금액을 비교해요."], ["최종 송금", "더보기 → 정산에서 누가 누구에게 얼마를 보내야 하는지 확인해요. 앱이 실제 송금을 실행하지는 않아요."], ["완료 체크와 공유", "실제 송금 후 완료를 체크하고 정산 결과를 공유해요. 체크는 앱의 기록이며 은행 입금 확인은 아니에요."]] } },
  { match: /체크리스트|준비/, guide: { title: "준비 체크리스트", steps: [["준비물 추가", "준비물 이름을 입력하고 추가를 눌러요."], ["준비 완료", "준비한 항목을 체크하고 진행률을 확인해요. 필요 없는 항목은 삭제할 수 있어요."]] } },
  { match: /꾸미기/, guide: { title: "화면 꾸미기", steps: [["테마 선택", "밝기·색상·배경·카드 모양을 원하는 대로 선택해요."], ["저장", "선택한 꾸미기는 이 기기에 저장돼 앱을 다시 열어도 유지돼요."]] } },
  { match: /백업|복원/, guide: { title: "백업 · 복원", steps: [["백업 보관", "백업 내용을 공유해 안전한 곳에 보관해요. 여행과 지출 등의 데이터가 포함돼요."], ["복원하기", "보관한 백업 내용 전체를 붙여넣고 복원을 눌러요. 확인창의 안내를 읽고 진행해주세요."], ["개인정보 보호", "백업에는 개인 여행 정보가 포함되므로 다른 사람에게 공개하지 마세요."]] } },
  { match: /내 정보/, guide: { title: "내 정보 설정", steps: [["이름과 사진", "내 이름을 입력하고 프로필 사진을 선택할 수 있어요."], ["정산 사용자", "‘나’는 이 기기의 사용자예요. 공동 여행방의 다른 사람과 혼동되지 않도록 이름을 정해주세요."]] } },
  { match: /게임/, guide: { title: "미니게임", steps: [["참여자 선택", "함께할 동행자를 선택하고 게임을 진행해요."], ["결제자에 적용", "게임 결과에서 결제자로 사용하면 지출 입력 화면으로 이동해요. 금액 등 필요한 내용을 확인하고 저장해야 지출에 반영돼요."]] } },
  { match: /더보기|여행 관리/, guide: { title: "더보기 사용법", steps: [["정산과 미니게임", "상단 버튼으로 정산 결과를 확인하거나 미니게임을 열어요."], ["기능 펼치기", "준비물·공동 여행방·꾸미기·백업·내 정보 제목을 누르면 상세 설정이 펼쳐져요."], ["도움말 보기", "각 기능 옆의 ?를 누르면 해당 기능의 사용법을 볼 수 있어요."]] } },
];
export function getGuide(topic: string): Guide {
  return GUIDES.find(item => item.match.test(topic))?.guide || { title: "도움말", steps: [["화면 안내", "원하는 항목을 선택하고 내용을 입력한 뒤 저장 또는 확인 버튼을 눌러요."], ["처음 사용한다면", "여행을 만들고 동행자를 추가한 뒤 일정과 지출을 기록하면 정산을 확인할 수 있어요."]] };
}

export default function AppHelp({ topic = "공동 여행방" }: { topic?: string }) {
  const guide = getGuide(topic);
  const {language} = useAppLanguage();
  const t = (value:string) => translateUI(value,language);
  const [visible, setVisible] = useState(false);
  const { colors } = useAppAppearance();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t(guide.title)} · ${t("도움말")}`} accessibilityHint={t("이 기능의 사용법을 보여줍니다")} onPress={() => setVisible(true)} style={[styles.help, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Text style={[styles.question, { color: colors.text }]}>?</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <SafeAreaView style={styles.overlay}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} localize>{guide.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("도움말 닫기")} onPress={() => setVisible(false)} style={styles.close}><Text style={[styles.closeText, { color: colors.text }]}>✕</Text></Pressable>
          </View>
          <ScrollView>
            {guide.steps.map(([title, body]) => <View key={title} style={styles.step}>
              <Text style={[styles.stepTitle, { color: colors.text }]} localize>{title}</Text>
              <Text style={[styles.body, { color: colors.muted }]} localize>{body}</Text>
            </View>)}
            {!!guide.note && <Text style={[styles.note, { color: colors.muted }]} localize>{guide.note}</Text>}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={[styles.done, { backgroundColor: colors.surface2 }]}><Text localize style={[styles.stepTitle, { color: colors.text }]}>알겠어요</Text></Pressable>
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

