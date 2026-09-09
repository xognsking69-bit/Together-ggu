import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Pressable, SafeAreaView, ScrollView, Share,
  StyleSheet, Text, TextInput, View
} from "react-native";

import TripCalendar from "../components/trip-calendar";
import type { AppState, CheckItem, Expense, Person, Trip } from "../types";
import { computeBalances, minimalTransfers } from "../settlement";
import { loadState, saveState } from "../storage";

const ME_ID = "me";
const categories = ["식비", "카페", "교통", "숙박", "관광", "쇼핑", "기타"];
const currencies: Expense["currency"][] = ["KRW", "JPY", "USD", "EUR"];
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const won = (n:number) => `${Math.round(n || 0).toLocaleString("ko-KR")}원`;

function createTrip(name = "나"): Trip {
  return {
    id: makeId(),
    name: "새 여행",
    start: "",
    end: "",
    budget: 0,
    baseCurrency: "KRW",
    people: [{ id: ME_ID, name }],
    expenses: [],
    checklist: [
      { id: "passport", text: "여권 / 신분증 확인", done: false },
      { id: "flight", text: "항공권 / 숙소 예약 확인", done: false },
      { id: "money", text: "카드 / 현금 / 환전 준비", done: false },
    ],
  };
}

const first = createTrip("나");
const INITIAL: AppState = {
  profile: { id: ME_ID, name: "나" },
  activeTripId: first.id,
  trips: [first],
};

type Tab = "home" | "add" | "list" | "settle";

function migrate(saved:any): AppState {
  if (!saved) return INITIAL;
  if (Array.isArray(saved.trips)) return saved;

  const profile = saved.profile || { id: ME_ID, name: "나" };
  const oldPeople:Person[] = Array.isArray(saved.people) ? saved.people : [];
  const hasMe = oldPeople.some(p => p.id === profile.id);
  const trip:Trip = {
    id: makeId(),
    name: saved.trip?.name || "기존 여행",
    start: saved.trip?.start || "",
    end: saved.trip?.end || "",
    budget: Number(saved.trip?.budget || 0),
    baseCurrency: "KRW",
    people: hasMe ? oldPeople : [{ id: profile.id, name: profile.name }, ...oldPeople],
    expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
    checklist: Array.isArray(saved.checklist) ? saved.checklist : [],
  };
  return { profile, activeTripId: trip.id, trips: [trip] };
}

export default function Index() {
  const [state, setState] = useState<AppState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");

  const [personName, setPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const [currency, setCurrency] = useState<Expense["currency"]>("KRW");
  const [category, setCategory] = useState("식비");
  const [date, setDate] = useState(today());
  const [payerId, setPayerId] = useState(ME_ID);
  const [participants, setParticipants] = useState<string[]>([ME_ID]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTripConfirmId, setDeleteTripConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadState().then(saved => {
      const next = migrate(saved);
      setState(next);
      const trip = next.trips.find(t => t.id === next.activeTripId) || next.trips[0];
      if (trip) {
        setParticipants(trip.people.map(p => p.id));
        setDate(trip.start || today());
      }
      setReady(true);
    });
  }, []);

  useEffect(() => { if (ready) saveState(state); }, [state, ready]);

  const activeTrip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
  const total = useMemo(() => activeTrip?.expenses.reduce((s,e)=>s+e.krwAmount,0) || 0, [activeTrip]);
  const balances = useMemo(() => computeBalances(activeTrip?.people || [], activeTrip?.expenses || []), [activeTrip]);
  const transfers = useMemo(() => minimalTransfers(balances), [balances]);

  if (!activeTrip) return null;

  function updateTrip(fn:(trip:Trip)=>Trip) {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t => t.id === prev.activeTripId ? fn(t) : t)
    }));
  }

  function selectTrip(id:string) {
    setDeleteTripConfirmId(null);
    const trip = state.trips.find(t=>t.id===id);
    if (!trip) return;
    setState(prev => ({...prev, activeTripId:id}));
    setParticipants(trip.people.map(p=>p.id));
    setPayerId(state.profile.id);
    setDate(trip.start || today());
    setEditingId(null);
  }

  function addTrip() {
    setDeleteTripConfirmId(null);
    const trip = createTrip(state.profile.name || "나");
    setState(prev => ({...prev, trips:[...prev.trips, trip], activeTripId:trip.id}));
    setParticipants(trip.people.map(p=>p.id));
    setDate(today());
  }

  function deleteTripNow(id:string) {
    const target = state.trips.find(t => t.id === id);
    if (!target) return;

    const remain = state.trips.filter(t => t.id !== id);

    if (remain.length === 0) {
      const freshTrip = createTrip(state.profile.name || "나");

      setState(prev => ({
        ...prev,
        trips: [freshTrip],
        activeTripId: freshTrip.id,
      }));

      setParticipants(freshTrip.people.map(p => p.id));
      setPayerId(state.profile.id);
      setDate(today());
      setEditingId(null);
      setPersonName("");
      setDeleteTripConfirmId(null);
      return;
    }

    const nextActiveId =
      id === state.activeTripId
        ? remain[0].id
        : state.activeTripId;

    const nextTrip =
      remain.find(t => t.id === nextActiveId) || remain[0];

    setState(prev => ({
      ...prev,
      trips: remain,
      activeTripId: nextTrip.id,
    }));

    setParticipants(nextTrip.people.map(p => p.id));
    setPayerId(state.profile.id);
    setDate(nextTrip.start || today());
    setEditingId(null);
    setPersonName("");
    setDeleteTripConfirmId(null);
  }

  function requestTripDelete(id:string) {
    if (deleteTripConfirmId === id) {
      deleteTripNow(id);
      return;
    }

    setDeleteTripConfirmId(id);
  }

  function updateMyName(name:string) {
    setState(prev => ({
      ...prev,
      profile:{...prev.profile, name},
      trips:prev.trips.map(trip=>({
        ...trip,
        people:trip.people.map(p=>p.id===prev.profile.id?{...p,name}:p)
      }))
    }));
  }

  function addPerson() {
    const name = personName.trim();
    if (!name) return;
    const person = {id:makeId(), name};
    updateTrip(trip=>({...trip, people:[...trip.people, person]}));
    setParticipants(ids=>[...ids, person.id]);
    setPersonName("");
  }

  function removePerson(id:string) {
    if (id === state.profile.id) return;
    if (activeTrip.expenses.some(e=>e.payerId===id || e.participantIds.includes(id))) {
      return Alert.alert("삭제할 수 없어요", "이 동행인이 포함된 지출을 먼저 수정하거나 삭제해주세요.");
    }
    updateTrip(trip=>({...trip, people:trip.people.filter(p=>p.id!==id)}));
    setParticipants(ids=>ids.filter(x=>x!==id));
  }

  function resetForm() {
    setTitle(""); setAmount(""); setRate("1"); setCurrency("KRW"); setCategory("식비");
    setPayerId(state.profile.id); setParticipants(activeTrip.people.map(p=>p.id));
    setDate(activeTrip.start || today()); setEditingId(null);
  }

  function saveExpense() {
    const a = Number(amount), r = Number(rate);
    if (!a || a <= 0) return Alert.alert("금액을 확인해주세요.");
    if (!r || r <= 0) return Alert.alert("환율을 확인해주세요.");
    if (!participants.length) return Alert.alert("함께 사용한 사람을 선택해주세요.");

    const expense:Expense = {
      id: editingId || makeId(),
      title:title.trim() || category,
      category, date:date || today(), amount:a, currency, rate:r,
      krwAmount:a*r, payerId, participantIds:participants
    };

    updateTrip(trip=>({
      ...trip,
      expenses: editingId
        ? trip.expenses.map(e=>e.id===editingId?expense:e)
        : [...trip.expenses, expense]
    }));
    resetForm();
    setTab("list");
  }

  function editExpense(e:Expense) {
    setEditingId(e.id); setTitle(e.title); setAmount(String(e.amount)); setRate(String(e.rate));
    setCurrency(e.currency); setCategory(e.category); setDate(e.date); setPayerId(e.payerId);
    setParticipants(e.participantIds); setTab("add");
  }

  function deleteExpense(id:string) {
    Alert.alert("지출 삭제", "이 지출을 삭제할까요?", [
      {text:"취소", style:"cancel"},
      {text:"삭제", style:"destructive", onPress:()=>updateTrip(trip=>({...trip, expenses:trip.expenses.filter(e=>e.id!==id)}))}
    ]);
  }

  async function shareSettlement() {
    const names = Object.fromEntries(activeTrip.people.map(p=>[p.id,p.name]));
    const lines = transfers.length
      ? transfers.map(t=>`${names[t.from]} → ${names[t.to]} ${won(t.amount)}`)
      : ["현재 정산할 금액이 없습니다."];
    await Share.share({message:`✈️ ${activeTrip.name} 정산\n${lines.join("\n")}`});
  }

  if (!ready) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text>불러오는 중...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.logo}>Trip Split</Text><Text style={styles.muted}>여행은 즐기고, 계산은 간단하게.</Text></View>
        <Text style={styles.version}>V1.3.4</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab==="home" && <>
          <Card title="여행 선택">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.tripRow}>
                {state.trips.map(trip=>(
                  <View key={trip.id} style={styles.tripItemWrap}>
                    <Pressable
                      onPress={()=>selectTrip(trip.id)}
                      style={[
                        styles.tripChip,
                        trip.id===state.activeTripId && styles.tripChipActive
                      ]}
                    >
                      <Text
                        style={
                          trip.id===state.activeTripId
                            ? styles.tripChipActiveText
                            : styles.bold
                        }
                      >
                        {trip.name || "여행"}
                      </Text>
                    </Pressable>


                  </View>
                ))}
                <Pressable onPress={addTrip} style={styles.tripChip}>
                  <Text style={styles.bold}>＋ 새 여행</Text>
                </Pressable>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => requestTripDelete(state.activeTripId)}
              style={[
                styles.selectedTripDelete,
                deleteTripConfirmId === state.activeTripId &&
                  styles.selectedTripDeleteConfirm
              ]}
            >
              <Text
                style={[
                  styles.selectedTripDeleteText,
                  deleteTripConfirmId === state.activeTripId &&
                    styles.selectedTripDeleteConfirmText
                ]}
              >
                {deleteTripConfirmId === state.activeTripId
                  ? "한번 더 누르면 이 여행 기록이 삭제됩니다"
                  : "선택한 여행 삭제"}
              </Text>
            </Pressable>
          </Card>

          <Card title="내 정보">
            <Field label="내 이름" value={state.profile.name} onChangeText={updateMyName} />
          </Card>

          <Card title="여행 설정">
            <Field label="여행 이름" value={activeTrip.name} onChangeText={v=>updateTrip(t=>({...t,name:v}))} />
            <View style={styles.two}>
              <View style={styles.flex}><Field label="시작일" value={activeTrip.start} onChangeText={v=>updateTrip(t=>({...t,start:v}))} placeholder="2026-09-12"/></View>
              <View style={styles.flex}><Field label="종료일" value={activeTrip.end} onChangeText={v=>updateTrip(t=>({...t,end:v}))} placeholder="2026-09-15"/></View>
            </View>
            <Field label="총 예산(원)" value={activeTrip.budget?String(activeTrip.budget):""} onChangeText={v=>updateTrip(t=>({...t,budget:Number(v.replace(/[^0-9]/g,""))||0}))} keyboardType="numeric"/>
          </Card>

          <Card title="여행 현황">
            <Text style={styles.muted}>총 사용금액</Text>
            <Text style={styles.hero}>{won(total)}</Text>
            <View style={styles.two}>
              <Stat label="남은 예산" value={activeTrip.budget?won(activeTrip.budget-total):"-"} />
              <Stat label="동행인" value={`${activeTrip.people.length}명`} />
            </View>
          </Card>

          <TripCalendar expenses={activeTrip.expenses} people={activeTrip.people} initialDate={activeTrip.start||today()} onAddForDate={d=>{resetForm();setDate(d);setTab("add");}} />

          <Card title="동행인 · 인원 무제한">
            <View style={styles.listRow}><Text style={styles.bold}>👤 나 · {state.profile.name}</Text><Text style={styles.meBadge}>기본 포함</Text></View>
            {activeTrip.people.filter(p=>p.id!==state.profile.id).map(p=>(
              <View key={p.id} style={styles.listRow}><Text>👤 {p.name}</Text><Pressable onPress={()=>removePerson(p.id)}><Text style={styles.danger}>삭제</Text></Pressable></View>
            ))}
            <View style={styles.row}><TextInput style={[styles.input,styles.flex]} value={personName} onChangeText={setPersonName} placeholder="동행인 이름"/><Primary text="추가" onPress={addPerson}/></View>
          </Card>
        </>}

        {tab==="add" && <Card title={editingId?"지출 수정":"지출 추가"}>
          <Text style={styles.dateBanner}>📅 {date}</Text>
          <Field label="내용" value={title} onChangeText={setTitle} placeholder="예: 라멘"/>
          <Text style={styles.label}>카테고리</Text>
          <View style={styles.chips}>{categories.map(x=><Chip key={x} text={x} selected={category===x} onPress={()=>setCategory(x)}/>)}</View>
          <Field label="날짜" value={date} onChangeText={setDate}/>
          <Field label="금액" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
          <Text style={styles.label}>통화</Text>
          <View style={styles.chips}>{currencies.map(x=><Chip key={x} text={x} selected={currency===x} onPress={()=>{setCurrency(x);if(x==="KRW")setRate("1");}}/>)}</View>
          <Field label="1 외화 = 몇 원? (KRW는 1)" value={rate} onChangeText={setRate} keyboardType="decimal-pad"/>
          <Text style={styles.label}>누가 결제했나요?</Text>
          <View style={styles.chips}>{activeTrip.people.map(p=><Chip key={p.id} text={p.id===state.profile.id?`나 · ${p.name}`:p.name} selected={payerId===p.id} onPress={()=>setPayerId(p.id)}/>)}</View>
          <Text style={styles.label}>누가 같이 사용했나요?</Text>
          <View style={styles.chips}>{activeTrip.people.map(p=><Chip key={p.id} text={p.id===state.profile.id?`나 · ${p.name}`:p.name} selected={participants.includes(p.id)} onPress={()=>setParticipants(ids=>ids.includes(p.id)?ids.filter(id=>id!==p.id):[...ids,p.id])}/>)}</View>
          <Primary text={editingId?"수정 저장":"지출 저장"} onPress={saveExpense} full/>
          {editingId && <Pressable onPress={()=>{resetForm();setTab("list");}}><Text style={[styles.link,{textAlign:"center",marginTop:12}]}>수정 취소</Text></Pressable>}
        </Card>}

        {tab==="list" && <Card title={`지출 내역 · ${activeTrip.expenses.length}건`}>
          {!activeTrip.expenses.length && <Text style={styles.muted}>아직 지출이 없습니다.</Text>}
          {[...activeTrip.expenses].reverse().map(e=>{
            const payer=activeTrip.people.find(p=>p.id===e.payerId)?.name || "?";
            return <View key={e.id} style={styles.expense}>
              <View style={styles.rowBetween}><View style={styles.flex}><Text style={styles.bold}>{e.title}</Text><Text style={styles.muted}>{e.date} · {e.category} · {payer} 결제 · {e.participantIds.length}명</Text></View><Text style={styles.bold}>{won(e.krwAmount)}</Text></View>
              <View style={styles.row}><Pressable onPress={()=>editExpense(e)}><Text style={styles.link}>수정</Text></Pressable><Pressable onPress={()=>deleteExpense(e.id)}><Text style={styles.danger}>삭제</Text></Pressable></View>
            </View>
          })}
        </Card>}

        {tab==="settle" && <>
          <Card title="사람별 정산">
            {activeTrip.people.map(p=>{
              const b=balances[p.id]||{paid:0,owed:0,net:0};
              return <View key={p.id} style={styles.listRow}><View><Text style={styles.bold}>{p.id===state.profile.id?`나 · ${p.name}`:p.name}</Text><Text style={styles.muted}>결제 {won(b.paid)} · 부담 {won(b.owed)}</Text></View><Text style={b.net>0?styles.good:b.net<0?styles.danger:styles.muted}>{b.net>0?`받을 돈 ${won(b.net)}`:b.net<0?`보낼 돈 ${won(-b.net)}`:"정산 완료"}</Text></View>
            })}
          </Card>
          <Card title="최종 송금">
            {!transfers.length && <Text style={styles.muted}>현재 정산할 금액이 없습니다.</Text>}
            {transfers.map((t,i)=>{
              const f=activeTrip.people.find(p=>p.id===t.from)?.name||"?";
              const to=activeTrip.people.find(p=>p.id===t.to)?.name||"?";
              return <View key={i} style={styles.listRow}><Text><Text style={styles.bold}>{f}</Text> → <Text style={styles.bold}>{to}</Text></Text><Text style={styles.bold}>{won(t.amount)}</Text></View>
            })}
            <Primary text="정산 결과 공유" onPress={shareSettlement} full/>
          </Card>
        </>}
      </ScrollView>

      <View style={styles.tabs}>
        <TabButton label="홈" active={tab==="home"} onPress={()=>setTab("home")}/>
        <TabButton label="+ 지출" active={tab==="add"} onPress={()=>{if(!editingId)resetForm();setTab("add");}}/>
        <TabButton label="내역" active={tab==="list"} onPress={()=>setTab("list")}/>
        <TabButton label="정산" active={tab==="settle"} onPress={()=>setTab("settle")}/>
      </View>
    </SafeAreaView>
  );
}

function Card({title,children}:React.PropsWithChildren<{title:string}>){return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>}
function Stat({label,value}:{label:string;value:string}){return <View style={styles.stat}><Text style={styles.muted}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>}
function Field(props:React.ComponentProps<typeof TextInput>&{label:string}){const{label,...rest}=props;return <View><Text style={styles.label}>{label}</Text><TextInput style={styles.input}{...rest}/></View>}
function Chip({text,selected,onPress}:{text:string;selected:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[styles.chip,selected&&styles.chipSelected]}><Text style={selected?styles.chipSelectedText:undefined}>{text}</Text></Pressable>}
function Primary({text,onPress,full}:{text:string;onPress:()=>void;full?:boolean}){return <Pressable onPress={onPress} style={[styles.primary,full&&{width:"100%",marginTop:18}]}><Text style={styles.primaryText}>{text}</Text></Pressable>}
function TabButton({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[styles.tab,active&&styles.tabActive]}><Text style={[styles.tabText,active&&styles.bold]}>{label}</Text></Pressable>}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#F6F7F9"},center:{flex:1,alignItems:"center",justifyContent:"center"},
  header:{paddingHorizontal:18,paddingTop:12,paddingBottom:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  logo:{fontSize:25,fontWeight:"800",color:"#17191C"},version:{fontSize:12,color:"#6B7280"},
  content:{padding:14,paddingBottom:100},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5E7EB",borderRadius:20,padding:16,marginBottom:12},
  cardTitle:{fontSize:18,fontWeight:"800",marginBottom:12,color:"#17191C"},label:{fontSize:13,color:"#6B7280",marginTop:10,marginBottom:6},
  input:{borderWidth:1,borderColor:"#E5E7EB",borderRadius:13,paddingHorizontal:13,paddingVertical:12,backgroundColor:"#FFF",fontSize:16},
  muted:{color:"#6B7280",fontSize:13,lineHeight:19},bold:{fontWeight:"800",color:"#17191C"},hero:{fontSize:30,fontWeight:"900",marginTop:2,marginBottom:12},
  row:{flexDirection:"row",alignItems:"center",gap:10,marginTop:10},rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
  two:{flexDirection:"row",gap:8,marginTop:8},flex:{flex:1},stat:{flex:1,backgroundColor:"#F8F9FB",padding:11,borderRadius:13},statValue:{fontSize:17,fontWeight:"800",marginTop:3},
  primary:{backgroundColor:"#111827",borderRadius:13,paddingHorizontal:15,paddingVertical:12,alignItems:"center"},primaryText:{color:"#FFF",fontWeight:"800"},
  listRow:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#E5E7EB",paddingVertical:9,gap:10},
  meBadge:{color:"#047857",backgroundColor:"#ECFDF5",fontSize:12,fontWeight:"800",paddingHorizontal:9,paddingVertical:5,borderRadius:999},
  expense:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#E5E7EB",paddingVertical:12},danger:{color:"#B91C1C",fontWeight:"700"},good:{color:"#047857",fontWeight:"800"},
  chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:4},chip:{backgroundColor:"#F0F2F5",paddingHorizontal:12,paddingVertical:9,borderRadius:999},
  chipSelected:{backgroundColor:"#111827"},chipSelectedText:{color:"#FFF",fontWeight:"800"},link:{color:"#111827",fontWeight:"800",fontSize:13},
  dateBanner:{fontSize:13,fontWeight:"800",backgroundColor:"#F0F2F5",padding:10,borderRadius:11,marginBottom:4},
  tabs:{flexDirection:"row",borderTopWidth:1,borderTopColor:"#E5E7EB",backgroundColor:"#FFF",paddingHorizontal:8,paddingBottom:4},
  tab:{flex:1,alignItems:"center",paddingVertical:13,borderRadius:12},tabActive:{backgroundColor:"#F0F2F5"},tabText:{color:"#6B7280"},
  tripRow:{flexDirection:"row",gap:10,alignItems:"center"},
  tripItemWrap:{alignItems:"center",gap:5},
  tripChip:{backgroundColor:"#F0F2F5",paddingHorizontal:12,paddingVertical:10,borderRadius:999},
  tripChipActive:{backgroundColor:"#111827"},
  tripChipActiveText:{color:"#FFF",fontWeight:"800"},
  tripDeleteButton:{paddingHorizontal:12,paddingVertical:7,borderRadius:999,backgroundColor:"#FEE2E2",minWidth:52,alignItems:"center"},
  tripDeleteText:{fontSize:11,fontWeight:"800",color:"#B91C1C"},
  tripDeleteConfirmButton:{backgroundColor:"#B91C1C"},
  tripDeleteConfirmText:{color:"#FFFFFF"},
  selectedTripDelete:{
    marginTop:14,
    width:"100%",
    paddingVertical:13,
    borderRadius:13,
    backgroundColor:"#FEE2E2",
    alignItems:"center"
  },
  selectedTripDeleteText:{
    color:"#B91C1C",
    fontWeight:"800",
    fontSize:14
  },
  selectedTripDeleteConfirm:{
    backgroundColor:"#B91C1C"
  },
  selectedTripDeleteConfirmText:{
    color:"#FFFFFF"
  }
});
