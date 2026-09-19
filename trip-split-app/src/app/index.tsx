import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Animated, Easing, Image, Modal, SafeAreaView, ScrollView, Share,
  StyleSheet, useWindowDimensions, View
} from "react-native";

import TripCalendar, { type TripPlan } from "../components/trip-calendar";
import GameZone from "../components/game-zone";
import type { AppState, CheckItem, Expense, Person, Trip } from "../types";
import { computeBalances, minimalTransfers } from "../settlement";
import { loadState, saveState } from "../storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReceiptTools, { type ReceiptResult } from "../components/receipt-tools";
import SmoothPressable from "../components/smooth-pressable";
import { SmoothText as Text, SmoothTextInput as TextInput } from "../components/smooth-text";
import { AppearanceProvider, useAppAppearance, type AppearanceMode } from "../components/appearance-context";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";



const Pressable = SmoothPressable;

function MotionBackdrop({ accent, accentSoft }: { accent: string; accentSoft: string }) {
  const driftA = useRef(new Animated.Value(0)).current;
  const driftB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopA = Animated.loop(
      Animated.sequence([
        Animated.timing(driftA, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftA, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const loopB = Animated.loop(
      Animated.sequence([
        Animated.timing(driftB, { toValue: 1, duration: 11500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftB, { toValue: 0, duration: 11500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loopA.start();
    loopB.start();
    return () => { loopA.stop(); loopB.stop(); };
  }, [driftA, driftB]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.motionBlob,
          styles.motionBlobTop,
          { backgroundColor: accentSoft, opacity: 0.64, transform: [
            { translateX: driftA.interpolate({ inputRange: [0, 1], outputRange: [-20, 28] }) },
            { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [-8, 34] }) },
            { scale: driftA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
          ] },
        ]}
      />
      <Animated.View
        style={[
          styles.motionBlob,
          styles.motionBlobBottom,
          { backgroundColor: accentSoft, opacity: 0.48, transform: [
            { translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [24, -32] }) },
            { translateY: driftB.interpolate({ inputRange: [0, 1], outputRange: [20, -24] }) },
            { scale: driftB.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.96] }) },
          ] },
        ]}
      />
      <Animated.View
        style={[
          styles.textureField,
          { transform: [
            { translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [-8, 12] }) },
            { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [8, -12] }) },
          ] },
        ]}
      >
        {[0,1,2,3,4,5,6,7].map((i) => (
          <View key={i} style={[styles.textureDot, { backgroundColor: accent, left: `${8 + (i % 4) * 27}%`, top: `${12 + Math.floor(i / 4) * 62}%` }]} />
        ))}
      </Animated.View>
    </View>
  );
}

const ME_ID = "me";
const categories = ["식비", "카페", "교통", "숙박", "관광", "쇼핑", "기타"];
const currencies: Expense["currency"][] = ["KRW", "JPY", "USD", "EUR"];
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const won = (n:number) => `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
const hexToRgba = (hex:string, alpha:number) => {
  const clean = hex.replace("#","");
  const value = parseInt(clean.length===3 ? clean.split("").map(x=>x+x).join("") : clean,16);
  const r=(value>>16)&255, g=(value>>8)&255, b=value&255;
  return `rgba(${r},${g},${b},${alpha})`;
};
const parseYmd = (value:string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const daysInclusive = (start:Date,end:Date) => Math.max(1, Math.floor((end.getTime()-start.getTime())/86400000)+1);

function createTrip(name = "나", personId = ME_ID): Trip {
  return {
    id: makeId(),
    name: "새 여행",
    start: "",
    end: "",
    budget: 0,
    baseCurrency: "KRW",
    people: [{ id: personId, name }],
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

type Tab = "home" | "expense" | "game" | "settle" | "manage";
type ExpenseView = "add" | "list";
type ManageSection = "checklist" | "shared" | "decorate" | "backup" | "profile";

type ThemeId = "lavender" | "ocean" | "peach" | "mint";

const THEMES: Record<ThemeId, {
  id: ThemeId;
  name: string;
  emoji: string;
  accent: string;
  accentSoft: string;
  bg: string;
}> = {
  lavender: { id:"lavender", name:"라벤더", emoji:"💜", accent:"#5C5CE2", accentSoft:"#EEEEFF", bg:"#F4F6FC" },
  ocean:    { id:"ocean",    name:"트래블 블루", emoji:"🌊", accent:"#2878D0", accentSoft:"#EAF4FF", bg:"#F3F8FD" },
  peach:    { id:"peach",    name:"피치", emoji:"🍑", accent:"#EA7A6A", accentSoft:"#FFF0ED", bg:"#FFF8F5" },
  mint:     { id:"mint",     name:"민트", emoji:"🌿", accent:"#2A9D7C", accentSoft:"#EAF8F3", bg:"#F3FAF7" },
};

const THEME_KEY = "trip-split-theme-v1";

type CardStyleId = "soft" | "round" | "clean";
type BackgroundStyleId = "theme" | "white" | "cream";

const DECOR_KEY = "trip-split-decor-v1";

const PLAN_KEY = "trip-split-plans-v1";
const PROFILE_PHOTO_KEY = "trip-split-profile-photos-v1";
const SHARED_ROOM_KEY = "trip-split-shared-rooms-v1";
const IDENTITY_KEY = "trip-split-device-identity-v1";

let stableIdentityPromise: Promise<string> | null = null;
function getStableIdentityId() {
  if (!stableIdentityPromise) {
    stableIdentityPromise = AsyncStorage.getItem(IDENTITY_KEY).then(async value => {
      if (value) return value;
      const id = `person-${makeId()}`;
      await AsyncStorage.setItem(IDENTITY_KEY, id);
      return id;
    });
  }
  return stableIdentityPromise;
}

function remapExpensePersonId(expense:any, fromId:string, toId:string) {
  return {
    ...expense,
    payerId: expense.payerId === fromId ? toId : expense.payerId,
    participantIds: Array.isArray(expense.participantIds)
      ? expense.participantIds.map((id:string)=>id===fromId?toId:id)
      : expense.participantIds,
    customShares: expense.customShares
      ? Object.fromEntries(Object.entries(expense.customShares).map(([id,share])=>[id===fromId?toId:id,share]))
      : expense.customShares,
  };
}

function remapTripPersonId(trip:Trip, fromId:string, toId:string):Trip {
  if (!trip || fromId === toId) return trip;
  const people = trip.people.map(p=>p.id===fromId?{...p,id:toId}:p);
  const deduped = people.filter((p,index,all)=>all.findIndex(x=>x.id===p.id)===index);
  return {
    ...trip,
    people:deduped,
    expenses:trip.expenses.map(e=>remapExpensePersonId(e,fromId,toId)),
  };
}

function applyStableIdentity(app:AppState, identityId:string):AppState {
  const oldId = app.profile?.id || ME_ID;
  if (!identityId || oldId === identityId) return app;
  return {
    ...app,
    profile:{...app.profile,id:identityId},
    trips:app.trips.map(t=>remapTripPersonId(t,oldId,identityId)),
  };
}
const SHARED_API_URL = (process.env.EXPO_PUBLIC_SHARED_API_URL || "https://trip-split-shared-api.xognsking69.workers.dev").replace(/\/$/, "");
const APP_SCHEME = "tripsplitapp";

type SharedRoomMeta = {
  code: string;
  token: string;
  revision: number;
  lastSyncedAt?: string;
  pendingSync?: boolean;
  pendingSince?: string;
  baseSnapshot?: { trip: Trip; plans: TripPlan[] };
  conflictCount?: number;
};

type SharedSnapshot = {
  trip: Trip;
  plans: TripPlan[];
  revision: number;
  updatedAt?: string;
};
type PlanType = TripPlan["type"];

const CARD_STYLES: Record<CardStyleId, { name:string; emoji:string; radius:number; shadowOpacity:number; elevation:number }> = {
  soft:  { name:"소프트", emoji:"☁️", radius:22, shadowOpacity:0.055, elevation:2 },
  round: { name:"라운드", emoji:"🫧", radius:30, shadowOpacity:0.10, elevation:4 },
  clean: { name:"클린", emoji:"✨", radius:14, shadowOpacity:0.0, elevation:0 },
};

const BACKGROUNDS: Record<BackgroundStyleId, { name:string; emoji:string; color?:string }> = {
  theme: { name:"테마 배경", emoji:"🎨" },
  white: { name:"화이트", emoji:"🤍", color:"#FFFFFF" },
  cream: { name:"크림", emoji:"🍨", color:"#FFF9F1" },
};


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

function IndexContent() {
  const { width } = useWindowDimensions();
  const { mode: appearanceMode, setMode: setAppearanceMode, isDark, colors: appearanceColors } = useAppAppearance();
  const screenMotion = useRef(new Animated.Value(1)).current;
  const isTiny = width < 360;
  const isCompact = width < 430;
  const isTablet = width >= 768;
  const horizontalPadding = isTiny ? 8 : isCompact ? 10 : isTablet ? 24 : 14;
  const contentMaxWidth = isTablet ? 860 : 760;
  const navInset = isTablet ? Math.max(18, (width - 760) / 2) : isTiny ? 6 : 10;
  const [state, setState] = useState<AppState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [expenseView, setExpenseView] = useState<ExpenseView>("add");
  const [openManageSection, setOpenManageSection] = useState<ManageSection | null>("checklist");

  const [personName, setPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const [rateMode, setRateMode] = useState<"auto" | "manual">("auto");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Expense["currency"]>("KRW");
  const [category, setCategory] = useState("식비");
  const [date, setDate] = useState(today());
  const [payerId, setPayerId] = useState(ME_ID);
  const [participants, setParticipants] = useState<string[]>([ME_ID]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTripConfirmId, setDeleteTripConfirmId] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("lavender");
  const [cardStyleId, setCardStyleId] = useState<CardStyleId>("soft");
  const [backgroundStyleId, setBackgroundStyleId] = useState<BackgroundStyleId>("theme");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptAnalysis, setReceiptAnalysis] = useState<ReceiptResult | null>(null);
  const [receiptItemShares, setReceiptItemShares] = useState<Record<string, number> | null>(null);
  const [restoreText, setRestoreText] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [plansByTrip, setPlansByTrip] = useState<Record<string, TripPlan[]>>({});
  const [planModalDate, setPlanModalDate] = useState<string | null>(null);
  const [planType, setPlanType] = useState<PlanType>("flight");
  const [planTitle, setPlanTitle] = useState("");
  const [planTime, setPlanTime] = useState("");
  const [planDetail, setPlanDetail] = useState("");
  const [checkItemText, setCheckItemText] = useState("");
  const [datePickerMode, setDatePickerMode] = useState<"expense" | "start" | "end" | "newStart" | "newEnd" | null>(null);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newTripStart, setNewTripStart] = useState("");
  const [newTripEnd, setNewTripEnd] = useState("");
  const [newTripBudget, setNewTripBudget] = useState("");
  const [newTripCompanionName, setNewTripCompanionName] = useState("");
  const [newTripCompanions, setNewTripCompanions] = useState<string[]>([]);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [profilePhotos, setProfilePhotos] = useState<Record<string,string>>({});
  const [profilePhotosReady, setProfilePhotosReady] = useState(false);
  const [sharedInviteText, setSharedInviteText] = useState("");
  const [sharedRooms, setSharedRooms] = useState<Record<string, SharedRoomMeta>>({});
  const [sharedRoomsReady, setSharedRoomsReady] = useState(false);
  const [sharedStatus, setSharedStatus] = useState<"idle"|"creating"|"syncing"|"synced"|"error">("idle");
  const [sharedStatusText, setSharedStatusText] = useState("");
  const applyingRemoteRef = useRef(false);
  const lastSharedFingerprintRef = useRef<Record<string,string>>({});
  const sharedRoomsRef = useRef<Record<string, SharedRoomMeta>>({});

  useEffect(() => {
    Promise.all([loadState(), getStableIdentityId()]).then(([saved, identityId]) => {
      const next = applyStableIdentity(migrate(saved), identityId);
      setState(next);
      const trip = next.trips.find(t => t.id === next.activeTripId) || next.trips[0];
      if (trip) {
        setParticipants(trip.people.map(p => p.id));
        setPayerId(next.profile.id);
        setDate(trip.start || today());
      }
      setReady(true);
    });
  }, []);

  useEffect(() => { if (ready) saveState(state); }, [state, ready]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then(value => {
        if (value && value in THEMES) setThemeId(value as ThemeId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(THEME_KEY, themeId).catch(() => {});
  }, [themeId]);

  useEffect(() => {
    AsyncStorage.getItem(DECOR_KEY)
      .then(value => {
        if (!value) return;
        const parsed = JSON.parse(value);
        if (parsed.cardStyleId && parsed.cardStyleId in CARD_STYLES) {
          setCardStyleId(parsed.cardStyleId as CardStyleId);
        }
        if (parsed.backgroundStyleId && parsed.backgroundStyleId in BACKGROUNDS) {
          setBackgroundStyleId(parsed.backgroundStyleId as BackgroundStyleId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      DECOR_KEY,
      JSON.stringify({ cardStyleId, backgroundStyleId })
    ).catch(() => {});
  }, [cardStyleId, backgroundStyleId]);

  useEffect(() => {
    AsyncStorage.getItem(PLAN_KEY)
      .then(value => {
        if (!value) return;
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") setPlansByTrip(parsed);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plansByTrip)).catch(() => {});
  }, [plansByTrip]);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_PHOTO_KEY)
      .then(value => {
        if (value) {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === "object") setProfilePhotos(parsed);
        }
      })
      .catch(() => {})
      .finally(() => setProfilePhotosReady(true));
  }, []);

  useEffect(() => {
    if (!profilePhotosReady) return;
    AsyncStorage.setItem(PROFILE_PHOTO_KEY, JSON.stringify(profilePhotos)).catch(() => {});
  }, [profilePhotos, profilePhotosReady]);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(SHARED_ROOM_KEY), getStableIdentityId()])
      .then(([value, identityId]) => {
        if (!value) return;
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") {
          const migrated = Object.fromEntries(Object.entries(parsed).map(([tripId,raw])=>{
            const meta = raw as SharedRoomMeta;
            const base = meta.baseSnapshot;
            return [tripId,{
              ...meta,
              baseSnapshot:base ? {trip:remapTripPersonId(base.trip,ME_ID,identityId),plans:base.plans} : base
            }];
          }));
          setSharedRooms(migrated);
          sharedRoomsRef.current = migrated;
        }
      })
      .catch(() => {})
      .finally(() => setSharedRoomsReady(true));
  }, []);

  useEffect(() => {
    sharedRoomsRef.current = sharedRooms;
    if (!sharedRoomsReady) return;
    AsyncStorage.setItem(SHARED_ROOM_KEY, JSON.stringify(sharedRooms)).catch(() => {});
  }, [sharedRooms, sharedRoomsReady]);

  useEffect(() => {
    const applyUrl = (url?:string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        if (parsed.path !== "invite" && parsed.hostname !== "invite") return;
        const payloadValue = parsed.queryParams?.payload;
        const payload = Array.isArray(payloadValue) ? payloadValue[0] : payloadValue;
        if (!payload || typeof payload !== "string") return;
        const invite = JSON.parse(payload);
        if (!invite?.code || !invite?.token) return;
        const raw = `TRIPSPLIT_LIVE_V1:${encodeURIComponent(JSON.stringify(invite))}`;
        setSharedInviteText(raw);
        setTab("manage");
        setOpenManageSection("shared");
        setSharedStatusText("초대 링크를 받았어요. ‘초대코드로 참가하기’를 눌러 연결해주세요.");
      } catch {}
    };
    Linking.getInitialURL().then(applyUrl).catch(() => {});
    const subscription = Linking.addEventListener("url", event => applyUrl(event.url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    screenMotion.setValue(0);
    Animated.spring(screenMotion, {
      toValue: 1,
      speed: 18,
      bounciness: 1,
      useNativeDriver: true,
    }).start();
  }, [tab, expenseView, screenMotion]);

  const activeTrip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
  const activePlans = plansByTrip[activeTrip.id] || [];
  const activeSharedRoom = sharedRooms[activeTrip.id];
  const activeSharedFingerprint = useMemo(
    () => sharedFingerprint(activeTrip, activePlans),
    [activeTrip, activePlans]
  );

  useEffect(() => {
    if (!ready || !sharedRoomsReady || !activeSharedRoom) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      lastSharedFingerprintRef.current[activeTrip.id] = activeSharedFingerprint;
      return;
    }
    if (!lastSharedFingerprintRef.current[activeTrip.id]) {
      lastSharedFingerprintRef.current[activeTrip.id] = activeSharedFingerprint;
      return;
    }
    if (lastSharedFingerprintRef.current[activeTrip.id] === activeSharedFingerprint) return;

    const currentMeta = sharedRoomsRef.current[activeTrip.id];
    if (currentMeta && !currentMeta.pendingSync) {
      const pendingMeta = { ...currentMeta, pendingSync:true, pendingSince:new Date().toISOString() };
      sharedRoomsRef.current = { ...sharedRoomsRef.current, [activeTrip.id]:pendingMeta };
      setSharedRooms(prev=>({...prev,[activeTrip.id]:pendingMeta}));
      setSharedStatusText("오프라인이어도 변경 내용은 이 기기에 안전하게 보관돼요.");
    }

    const timer=setTimeout(()=>{
      void pushSharedRoom(activeTrip.id,activeTrip,activePlans,activeSharedFingerprint);
    },1200);
    return ()=>clearTimeout(timer);
  }, [activeSharedFingerprint, activeSharedRoom?.code, ready, sharedRoomsReady]);

  useEffect(() => {
    if (!ready || !sharedRoomsReady || !activeSharedRoom) return;
    const syncNow = () => {
      const meta = sharedRoomsRef.current[activeTrip.id];
      if (meta?.pendingSync) {
        void pushSharedRoom(activeTrip.id,activeTrip,activePlans,activeSharedFingerprint);
      } else {
        void pullSharedRoom(activeTrip.id,true);
      }
    };
    syncNow();
    const interval=setInterval(syncNow,5000);
    return ()=>clearInterval(interval);
  }, [activeTrip.id, activeSharedRoom?.code, activeSharedRoom?.token, activeSharedFingerprint, ready, sharedRoomsReady]);
  const todayKey = today();
  const recentExpenses = useMemo(
    () => [...activeTrip.expenses].slice(-3).reverse(),
    [activeTrip.expenses]
  );
  const todayPlans = useMemo(
    () => activePlans
      .filter(plan => plan.date === todayKey)
      .sort((a,b)=>(a.time || "99:99").localeCompare(b.time || "99:99")),
    [activePlans, todayKey]
  );
  const peopleNameMap = useMemo(
    () => Object.fromEntries(activeTrip.people.map(p=>[p.id,p.name])),
    [activeTrip.people]
  );
  const checklistDoneCount = useMemo(
    () => activeTrip.checklist.filter(item=>item.done).length,
    [activeTrip.checklist]
  );
  const checklistProgress = activeTrip.checklist.length
    ? Math.round(checklistDoneCount / activeTrip.checklist.length * 100)
    : 0;
  const theme = THEMES[themeId];
  const cardPreset = CARD_STYLES[cardStyleId];
  const uiAccentSoft = isDark ? hexToRgba(theme.accent,0.16) : theme.accentSoft;
  const screenBackground = isDark ? appearanceColors.background : (BACKGROUNDS[backgroundStyleId].color || theme.bg);
  const cardDecorStyle = {
    borderRadius: cardPreset.radius,
    shadowOpacity: isDark ? 0.18 : cardPreset.shadowOpacity,
    elevation: cardPreset.elevation,
    backgroundColor: appearanceColors.surface,
    borderColor: isDark ? appearanceColors.border : undefined,
    borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
  };
  const total = useMemo(() => activeTrip?.expenses.reduce((s,e)=>s+e.krwAmount,0) || 0, [activeTrip]);
  const balances = useMemo(() => computeBalances(activeTrip?.people || [], activeTrip?.expenses || []), [activeTrip]);
  const transfers = useMemo(() => minimalTransfers(balances), [balances]);
  const categoryAnalytics = useMemo(() => {
    const sums = Object.fromEntries(categories.map(c=>[c,0])) as Record<string,number>;
    activeTrip.expenses.forEach(e=>{ sums[e.category] = (sums[e.category] || 0) + e.krwAmount; });
    return categories
      .map(category=>({category,amount:sums[category] || 0,ratio:total>0 ? (sums[category] || 0)/total : 0}))
      .filter(item=>item.amount>0)
      .sort((a,b)=>b.amount-a.amount);
  }, [activeTrip.expenses,total]);
  const budgetRate = activeTrip.budget>0 ? Math.min(100, Math.round(total/activeTrip.budget*100)) : 0;
  const remainingBudget = activeTrip.budget - total;
  const tripStartDate = parseYmd(activeTrip.start);
  const tripEndDate = parseYmd(activeTrip.end);
  const todayDate = parseYmd(today());
  const tripTotalDays = tripStartDate && tripEndDate && tripEndDate>=tripStartDate ? daysInclusive(tripStartDate,tripEndDate) : 0;
  const elapsedTripDays = tripStartDate && tripEndDate && todayDate && todayDate>=tripStartDate
    ? Math.min(tripTotalDays, daysInclusive(tripStartDate, todayDate>tripEndDate ? tripEndDate : todayDate))
    : 0;
  const spendDayCount = Math.max(1, new Set(activeTrip.expenses.map(e=>e.date).filter(Boolean)).size);
  const analysisDayCount = elapsedTripDays || spendDayCount;
  const dailyAverage = total / Math.max(1,analysisDayCount);
  const projectedSpend = tripTotalDays>0 && elapsedTripDays>0 ? dailyAverage*tripTotalDays : total;
  const perPersonAverage = total / Math.max(1,activeTrip.people.length);

  useEffect(() => {
    setBudgetDraft(activeTrip.budget ? String(Math.round(activeTrip.budget)) : "");
  }, [activeTrip.id, activeTrip.budget]);
if (!activeTrip) return null;

  function updateTrip(fn:(trip:Trip)=>Trip) {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t => t.id === prev.activeTripId ? fn(t) : t)
    }));
  }

  function saveBudget() {
    const nextBudget = Number(budgetDraft.replace(/[^0-9]/g,"")) || 0;
    updateTrip(t=>({...t,budget:nextBudget}));
    setBudgetDraft(nextBudget ? String(nextBudget) : "");
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
    setNewTripName("");
    setNewTripStart("");
    setNewTripEnd("");
    setNewTripBudget("");
    setNewTripCompanionName("");
    setNewTripCompanions([]);
    setShowNewTrip(true);
  }

  function addNewTripCompanion() {
    const name = newTripCompanionName.trim();
    if (!name) return;
    setNewTripCompanions(prev=>[...prev,name]);
    setNewTripCompanionName("");
  }

  function createNewTripQuick() {
    const trip = createTrip(state.profile.name || "나", state.profile.id);
    const name = newTripName.trim() || "새 여행";
    const budget = Number(newTripBudget.replace(/[^0-9]/g,"")) || 0;

    const companionPeople = newTripCompanions
      .map(name=>name.trim())
      .filter(Boolean)
      .map(name=>({id:makeId(),name}));

    const readyTrip:Trip = {
      ...trip,
      name,
      start:newTripStart,
      end:newTripEnd,
      budget,
      people:[...trip.people,...companionPeople],
    };

    setState(prev => ({
      ...prev,
      trips:[...prev.trips, readyTrip],
      activeTripId:readyTrip.id
    }));
    setParticipants(readyTrip.people.map(p=>p.id));
    setPayerId(state.profile.id);
    setDate(readyTrip.start || today());
    setEditingId(null);
    setShowNewTrip(false);
  }

  function deleteTripNow(id:string) {
    const target = state.trips.find(t => t.id === id);
    if (!target) return;

    const remain = state.trips.filter(t => t.id !== id);

    if (remain.length === 0) {
      const freshTrip = createTrip(state.profile.name || "나", state.profile.id);

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

  async function pickProfilePhoto(personId:string) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 권한 필요", "프로필 사진을 선택하려면 사진 접근 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const photoValue = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : asset.uri;

    if (!photoValue) return;
    setProfilePhotos(prev => ({...prev, [personId]: photoValue}));
  }

  function removeProfilePhoto(personId:string) {
    setProfilePhotos(prev => {
      const next = {...prev};
      delete next[personId];
      return next;
    });
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

    const usedExpenses = activeTrip.expenses.filter(
      e => e.payerId===id || e.participantIds.includes(id)
    );

    const applyDelete = () => {
      updateTrip(trip=>({
        ...trip,
        people:trip.people.filter(p=>p.id!==id),
        expenses:trip.expenses.map(e=>{
          const nextParticipants=e.participantIds.filter(pid=>pid!==id);
          return {
            ...e,
            payerId:e.payerId===id ? state.profile.id : e.payerId,
            participantIds:nextParticipants.length ? nextParticipants : [state.profile.id],
            customShares:e.customShares ? Object.fromEntries(Object.entries(e.customShares).filter(([pid])=>pid!==id)) : undefined
          };
        })
      }));
      setParticipants(ids=>{
        const next=ids.filter(x=>x!==id);
        return next.length ? next : [state.profile.id];
      });
      if (payerId===id) setPayerId(state.profile.id);
      removeProfilePhoto(id);
    };

    if (usedExpenses.length) {
      Alert.alert(
        "동행인 삭제",
        `이 동행인이 포함된 지출 ${usedExpenses.length}건이 있어요. 삭제하면 해당 지출에서는 빠지고, 결제자로 지정된 경우 '나'로 변경됩니다.`,
        [
          {text:"취소",style:"cancel"},
          {text:"삭제",style:"destructive",onPress:applyDelete}
        ]
      );
      return;
    }

    applyDelete();
  }

  function formatExchangeRate(value:number) {
    if (value >= 100) return String(Number(value.toFixed(2)));
    if (value >= 10) return String(Number(value.toFixed(3)));
    return String(Number(value.toFixed(4)));
  }

  async function refreshAutoRate(nextCurrency:Expense["currency"] = currency) {
    if (nextCurrency === "KRW") {
      setRate("1");
      setRateDate(today());
      setRateError(null);
      return;
    }

    setRateLoading(true);
    setRateError(null);
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${nextCurrency.toLowerCase()}/krw`);
      if (!response.ok) throw new Error(`rate ${response.status}`);
      const data = await response.json();
      const nextRate = Number(data?.rate);
      if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("invalid rate");
      setRate(formatExchangeRate(nextRate));
      setRateDate(typeof data?.date === "string" ? data.date : today());
    } catch {
      setRateError("자동 환율을 불러오지 못했어요. 직접 입력으로 사용할 수 있어요.");
    } finally {
      setRateLoading(false);
    }
  }

  useEffect(() => {
    if (rateMode === "auto") void refreshAutoRate(currency);
  }, [currency, rateMode]);

  function resetForm() {
    setTitle(""); setAmount(""); setRate("1"); setCurrency("KRW"); setRateMode("auto");
    setRateDate(null); setRateError(null); setCategory("식비");
    setPayerId(state.profile.id); setParticipants(activeTrip.people.map(p=>p.id));
    setDate(activeTrip.start || today()); setEditingId(null);
    setReceiptUri(null); setReceiptAnalysis(null); setReceiptItemShares(null);
  }

  function saveExpense() {
    const a = Number(amount), r = Number(rate);
    if (!a || a <= 0) return Alert.alert("금액을 확인해주세요.");
    if (!r || r <= 0) return Alert.alert("환율을 확인해주세요.");
    if (!participants.length) return Alert.alert("함께 사용한 사람을 선택해주세요.");

    const expense: Expense & {
      receiptUri?: string;
      receiptAnalysis?: ReceiptResult;
    } = {
      id: editingId || makeId(),
      title:title.trim() || category,
      category, date:date || today(), amount:a, currency, rate:r,
      krwAmount:a*r, payerId, participantIds:participants,
      ...(receiptUri ? { receiptUri } : {}),
      ...(receiptAnalysis ? { receiptAnalysis } : {}),
      ...(receiptItemShares ? { customShares:Object.fromEntries(Object.entries(receiptItemShares).map(([id,share])=>[id,share*r])) } : {})
    };

    updateTrip(trip=>({
      ...trip,
      expenses: editingId
        ? trip.expenses.map(e=>e.id===editingId?expense:e)
        : [...trip.expenses, expense]
    }));
    resetForm();
    setExpenseView("list");setTab("expense");
  }

  function editExpense(e:Expense) {
    const receiptExpense = e as Expense & {
      receiptUri?: string;
      receiptAnalysis?: ReceiptResult;
    };
    setEditingId(e.id); setTitle(e.title); setAmount(String(e.amount)); setRate(String(e.rate));
    setRateMode("manual"); setRateDate(null); setRateError(null);
    setCurrency(e.currency); setCategory(e.category); setDate(e.date); setPayerId(e.payerId);
    setParticipants(e.participantIds);
    setReceiptUri(receiptExpense.receiptUri || null);
    setReceiptAnalysis(receiptExpense.receiptAnalysis || null);
    setReceiptItemShares(e.customShares ? Object.fromEntries(Object.entries(e.customShares).map(([id,share])=>[id,share/e.rate])) : null);
    setExpenseView("add");setTab("expense");
  }

  function deleteExpense(id:string) {
    Alert.alert("지출 삭제", "이 지출을 삭제할까요?", [
      {text:"취소", style:"cancel"},
      {text:"삭제", style:"destructive", onPress:()=>updateTrip(trip=>({...trip, expenses:trip.expenses.filter(e=>e.id!==id)}))}
    ]);
  }

  function toggleChecklist(id:string) {
    updateTrip(trip=>({
      ...trip,
      checklist: trip.checklist.map(item=>item.id===id ? {...item,done:!item.done} : item)
    }));
  }

  function addChecklistItem() {
    const text = checkItemText.trim();
    if (!text) return;
    updateTrip(trip=>({
      ...trip,
      checklist:[...trip.checklist,{id:makeId(),text,done:false}]
    }));
    setCheckItemText("");
  }

  function deleteChecklistItem(id:string) {
    updateTrip(trip=>({...trip,checklist:trip.checklist.filter(item=>item.id!==id)}));
  }

  function resetChecklistDone() {
    updateTrip(trip=>({...trip,checklist:trip.checklist.map(item=>({...item,done:false}))}));
  }

  function openPlanModal(date:string) {
    setPlanModalDate(date);
    setPlanType("flight");
    setPlanTitle("");
    setPlanTime("");
    setPlanDetail("");
  }

  function savePlan() {
    if (!planModalDate) return;
    const titleText = planTitle.trim();
    if (!titleText) {
      Alert.alert("일정 이름 필요", "항공편, 숙소, 관광지처럼 일정 이름을 입력해주세요.");
      return;
    }

    const plan:TripPlan = {
      id: makeId(),
      date: planModalDate,
      type: planType,
      title: titleText,
      time: planTime.trim(),
      detail: planDetail.trim(),
    };

    setPlansByTrip(prev => ({
      ...prev,
      [activeTrip.id]: [...(prev[activeTrip.id] || []), plan]
    }));
    setPlanModalDate(null);
  }

  function deletePlan(planId:string) {
    Alert.alert("일정 삭제", "이 일정을 삭제할까요?", [
      {text:"취소",style:"cancel"},
      {
        text:"삭제",
        style:"destructive",
        onPress:()=>setPlansByTrip(prev=>({
          ...prev,
          [activeTrip.id]:(prev[activeTrip.id] || []).filter(p=>p.id!==planId)
        }))
      }
    ]);
  }

  function applyPickedDate(picked:string) {
    if (datePickerMode==="newStart") {
      setNewTripStart(picked);
      if (newTripEnd && newTripEnd < picked) setNewTripEnd(picked);
      setDatePickerMode(null);
      return;
    }

    if (datePickerMode==="newEnd") {
      if (newTripStart && picked < newTripStart) {
        Alert.alert("날짜 확인", "종료일은 시작일보다 빠를 수 없어요.");
        return;
      }
      setNewTripEnd(picked);
      setDatePickerMode(null);
      return;
    }

    if (datePickerMode==="expense") {
      setDate(picked);
      setDatePickerMode(null);
      return;
    }

    if (datePickerMode==="start") {
      updateTrip(t=>({
        ...t,
        start:picked,
        end:t.end && t.end < picked ? picked : t.end
      }));
      setDatePickerMode(null);
      return;
    }

    if (datePickerMode==="end") {
      if (activeTrip.start && picked < activeTrip.start) {
        Alert.alert("날짜 확인", "종료일은 시작일보다 빠를 수 없어요.");
        return;
      }
      updateTrip(t=>({...t,end:picked}));
      setDatePickerMode(null);
    }
  }

  async function shareBackup() {
    const backup = {
      app: "Trip Split",
      version: "V3.8.0",
      exportedAt: new Date().toISOString(),
      state,
      appearance: {
        themeId,
        cardStyleId,
        backgroundStyleId,
      },
      plansByTrip,
      profilePhotos,
    };

    try {
      await Share.share({
        message: JSON.stringify(backup, null, 2),
        title: `Trip Split 백업 - ${activeTrip.name}`,
      });
    } catch (error:any) {
      const message = String(error?.message || error || "");
      const name = String(error?.name || "");
      const cancelled = name === "AbortError" || /cancel|cancellation|abort/i.test(message);
      if (!cancelled) Alert.alert("백업 실패", "백업 내용을 공유하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  function restoreBackup() {
    const text = restoreText.trim();
    if (!text) {
      Alert.alert("백업 내용 필요", "이전에 저장한 Trip Split 백업 내용을 붙여넣어 주세요.");
      return;
    }

    let parsed:any;
    try {
      parsed = JSON.parse(text);
    } catch {
      Alert.alert("백업 확인 필요", "백업 형식이 올바르지 않아요. 전체 내용을 빠짐없이 붙여넣었는지 확인해주세요.");
      return;
    }

    const restored = parsed?.state;
    if (!restored || !Array.isArray(restored.trips) || !restored.profile) {
      Alert.alert("지원하지 않는 백업", "Trip Split에서 만든 백업인지 확인해주세요.");
      return;
    }

    Alert.alert(
      "데이터 복원",
      "현재 앱 데이터가 백업 내용으로 교체됩니다. 계속할까요?",
      [
        { text:"취소", style:"cancel" },
        {
          text:"복원",
          style:"destructive",
          onPress: async () => {
            try {
              const next = migrate(restored);
              setState(next);

              if (parsed?.plansByTrip && typeof parsed.plansByTrip === "object") {
                setPlansByTrip(parsed.plansByTrip);
              }

              if (parsed?.profilePhotos && typeof parsed.profilePhotos === "object") {
                setProfilePhotos(parsed.profilePhotos);
              }

              const appearance = parsed?.appearance;
              if (appearance?.themeId && appearance.themeId in THEMES) {
                setThemeId(appearance.themeId as ThemeId);
              }
              if (appearance?.cardStyleId && appearance.cardStyleId in CARD_STYLES) {
                setCardStyleId(appearance.cardStyleId as CardStyleId);
              }
              if (appearance?.backgroundStyleId && appearance.backgroundStyleId in BACKGROUNDS) {
                setBackgroundStyleId(appearance.backgroundStyleId as BackgroundStyleId);
              }

              const trip = next.trips.find(t=>t.id===next.activeTripId) || next.trips[0];
              if (trip) {
                setParticipants(trip.people.map(p=>p.id));
                setPayerId(next.profile.id);
                setDate(trip.start || today());
              }

              setRestoreText("");
              setShowRestore(false);
              Alert.alert("복원 완료", "여행·지출·인원·프로필 사진·꾸미기 설정을 복원했어요.");
            } catch {
              Alert.alert("복원 실패", "백업 내용을 다시 확인해주세요.");
            }
          }
        }
      ]
    );
  }

  function safeTripForShare(trip:Trip):Trip {
    return {
      ...trip,
      expenses: trip.expenses.map((expense:any) => {
        const { receiptUri, ...rest } = expense;
        return rest;
      }),
    };
  }

  function sharedFingerprint(trip:Trip, plans:TripPlan[]) {
    return JSON.stringify({ trip:safeTripForShare(trip), plans });
  }

  async function sharedApi(path:string, body:any) {
    const response = await fetch(`${SHARED_API_URL}${path}`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    const text = await response.text();
    let data:any = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
      const error:any = new Error(data?.error || `공동 여행 서버 오류 (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function sameJson(a:any,b:any) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  function mergeScalar(base:any, local:any, remote:any) {
    if (sameJson(local,base)) return remote;
    if (sameJson(remote,base)) return local;
    if (sameJson(local,remote)) return local;
    return local;
  }

  function mergeEntityArray<T extends {id:string}>(base:T[] = [], local:T[] = [], remote:T[] = []):T[] {
    const b = new Map(base.map(item=>[item.id,item]));
    const l = new Map(local.map(item=>[item.id,item]));
    const r = new Map(remote.map(item=>[item.id,item]));
    const ids = Array.from(new Set([...b.keys(),...l.keys(),...r.keys()]));
    const out:T[] = [];
    for (const id of ids) {
      const bv=b.get(id), lv=l.get(id), rv=r.get(id);
      if (!bv) {
        if (lv) out.push(lv); else if (rv) out.push(rv);
        continue;
      }
      if (!lv) {
        if (!rv || sameJson(rv,bv)) continue;
        continue;
      }
      if (!rv) {
        if (sameJson(lv,bv)) continue;
        out.push(lv);
        continue;
      }
      if (sameJson(lv,bv)) out.push(rv);
      else if (sameJson(rv,bv)) out.push(lv);
      else if (sameJson(lv,rv)) out.push(lv);
      else out.push(lv);
    }
    return out;
  }

  function mergeSharedSnapshots(base:{trip:Trip;plans:TripPlan[]} | undefined, local:{trip:Trip;plans:TripPlan[]}, remote:{trip:Trip;plans:TripPlan[]}) {
    const bTrip = base?.trip || remote.trip;
    const bPlans = base?.plans || remote.plans;
    const mergedTrip:Trip = {
      ...remote.trip,
      id: local.trip.id,
      name: mergeScalar(bTrip.name,local.trip.name,remote.trip.name),
      start: mergeScalar(bTrip.start,local.trip.start,remote.trip.start),
      end: mergeScalar(bTrip.end,local.trip.end,remote.trip.end),
      budget: mergeScalar(bTrip.budget,local.trip.budget,remote.trip.budget),
      baseCurrency: "KRW",
      people: mergeEntityArray(bTrip.people,local.trip.people,remote.trip.people),
      expenses: mergeEntityArray(bTrip.expenses,local.trip.expenses,remote.trip.expenses),
      checklist: mergeEntityArray(bTrip.checklist,local.trip.checklist,remote.trip.checklist),
    };
    return { trip:mergedTrip, plans:mergeEntityArray(bPlans,local.plans,remote.plans) };
  }

  function liveInviteData(meta:SharedRoomMeta) {
    return { code:meta.code, token:meta.token, name:activeTrip.name };
  }

  function buildLiveInvite(meta:SharedRoomMeta) {
    return `TRIPSPLIT_LIVE_V1:${encodeURIComponent(JSON.stringify(liveInviteData(meta)))}`;
  }

  function buildInviteWebUrl(meta:SharedRoomMeta) {
    const payload = encodeURIComponent(JSON.stringify(liveInviteData(meta)));
    return `${SHARED_API_URL}/invite#payload=${payload}`;
  }

  async function shareLiveInvite(meta:SharedRoomMeta) {
    const invite = buildLiveInvite(meta);
    const inviteUrl = buildInviteWebUrl(meta);
    try {
      await Share.share({
        message:`✈️ Trip Split 실시간 공동 여행 초대\n${activeTrip.name}\n\n아래 링크를 열면 앱에서 참가하거나 다운로드 안내를 볼 수 있어요.\n${inviteUrl}\n\n링크가 안 열리면 이 초대코드를 직접 붙여넣어주세요.\n${invite}`,
      });
    } catch (error:any) {
      const message = String(error?.message || error || "");
      const name = String(error?.name || "");
      const cancelled = name === "AbortError" || /cancel|cancellation|abort/i.test(message);
      if (!cancelled) Alert.alert("공유 실패", "실시간 공동 여행 초대를 공유하지 못했어요.");
    }
  }

  async function createLiveSharedRoom() {
    if (sharedStatus === "creating" || sharedStatus === "syncing") return;
    setSharedStatus("creating");
    setSharedStatusText("공동 여행방 만드는 중…");
    try {
      const data = await sharedApi("/shared/create", {trip:safeTripForShare(activeTrip),plans:activePlans});
      const meta:SharedRoomMeta = {
        code:String(data.code),
        token:String(data.token),
        revision:Number(data.revision || 1),
        lastSyncedAt:new Date().toISOString(),
        pendingSync:false,
        baseSnapshot:{trip:safeTripForShare(activeTrip),plans:activePlans},
        conflictCount:0,
      };
      lastSharedFingerprintRef.current[activeTrip.id] = sharedFingerprint(activeTrip,activePlans);
      setSharedRooms(prev=>({...prev,[activeTrip.id]:meta}));
      setSharedStatus("synced");
      setSharedStatusText("실시간 공동 여행방이 연결됐어요.");
      await shareLiveInvite(meta);
    } catch (error:any) {
      setSharedStatus("error");
      setSharedStatusText(String(error?.message || "공동 여행방을 만들지 못했어요."));
      Alert.alert("공동 여행방 연결 실패", String(error?.message || "서버 연결을 확인해주세요."));
    }
  }

  async function pullSharedRoom(tripId:string, quiet=false) {
    const meta = sharedRoomsRef.current[tripId];
    if (!meta) return;
    if (!quiet) { setSharedStatus("syncing"); setSharedStatusText("최신 내용을 확인하는 중…"); }
    try {
      const data = await sharedApi("/shared/pull", {code:meta.code,token:meta.token});
      const snapshot:SharedSnapshot = {trip:data.trip,plans:Array.isArray(data.plans)?data.plans:[],revision:Number(data.revision||0),updatedAt:data.updatedAt};
      const currentMeta = sharedRoomsRef.current[tripId];
      if (!currentMeta) return;
      if (snapshot.revision > Number(currentMeta.revision || 0) && snapshot.trip) {
        const remoteTrip:Trip = {...snapshot.trip,id:tripId};
        applyingRemoteRef.current = true;
        lastSharedFingerprintRef.current[tripId] = sharedFingerprint(remoteTrip,snapshot.plans);
        setState(prev=>({...prev,trips:prev.trips.map(t=>t.id===tripId?remoteTrip:t)}));
        setPlansByTrip(prev=>({...prev,[tripId]:snapshot.plans}));
        if (state.activeTripId===tripId) {
          const ids=remoteTrip.people.map(p=>p.id);
          setParticipants(prev=>prev.filter(id=>ids.includes(id)).length ? prev.filter(id=>ids.includes(id)) : ids);
          if (!ids.includes(payerId)) setPayerId(ids[0] || state.profile.id);
        }
      }
      const normalizedSnapshot = snapshot.trip ? {trip:{...snapshot.trip,id:tripId},plans:snapshot.plans} : currentMeta.baseSnapshot;
      const nextMeta={...currentMeta,revision:Math.max(Number(currentMeta.revision||0),snapshot.revision),lastSyncedAt:new Date().toISOString(),pendingSync:false,baseSnapshot:normalizedSnapshot};
      sharedRoomsRef.current={...sharedRoomsRef.current,[tripId]:nextMeta};
      setSharedRooms(prev=>({...prev,[tripId]:nextMeta}));
      if (!quiet) { setSharedStatus("synced"); setSharedStatusText("최신 상태로 동기화됐어요."); }
    } catch (error:any) {
      if (!quiet) { setSharedStatus("error"); setSharedStatusText(String(error?.message || "동기화하지 못했어요.")); }
    }
  }

  async function pushSharedRoom(tripId:string, trip:Trip, plans:TripPlan[], fingerprint:string) {
    const meta = sharedRoomsRef.current[tripId];
    if (!meta) return;
    const localSnapshot={trip:safeTripForShare(trip),plans};
    try {
      const data = await sharedApi("/shared/push", {code:meta.code,token:meta.token,expectedRevision:meta.revision,trip:localSnapshot.trip,plans});
      const nextMeta={...meta,revision:Number(data.revision||meta.revision),lastSyncedAt:new Date().toISOString(),pendingSync:false,pendingSince:undefined,baseSnapshot:localSnapshot};
      lastSharedFingerprintRef.current[tripId]=fingerprint;
      sharedRoomsRef.current={...sharedRoomsRef.current,[tripId]:nextMeta};
      setSharedRooms(prev=>({...prev,[tripId]:nextMeta}));
      setSharedStatus("synced");
      setSharedStatusText(meta.pendingSync ? "인터넷 연결이 돌아와 변경 내용을 자동 동기화했어요." : "변경 내용이 자동 저장됐어요.");
    } catch (error:any) {
      if (Number(error?.status)===409 && error?.data?.trip) {
        try {
          const remoteSnapshot={trip:{...error.data.trip,id:tripId} as Trip,plans:Array.isArray(error.data.plans)?error.data.plans:[] as TripPlan[]};
          const merged=mergeSharedSnapshots(meta.baseSnapshot,localSnapshot,remoteSnapshot);
          const remoteRevision=Number(error.data.revision||meta.revision);
          const retry=await sharedApi("/shared/push", {code:meta.code,token:meta.token,expectedRevision:remoteRevision,trip:safeTripForShare(merged.trip),plans:merged.plans});
          applyingRemoteRef.current=true;
          setState(prev=>({...prev,trips:prev.trips.map(t=>t.id===tripId?merged.trip:t)}));
          setPlansByTrip(prev=>({...prev,[tripId]:merged.plans}));
          const mergedFingerprint=sharedFingerprint(merged.trip,merged.plans);
          lastSharedFingerprintRef.current[tripId]=mergedFingerprint;
          const nextMeta={...meta,revision:Number(retry.revision||remoteRevision),lastSyncedAt:new Date().toISOString(),pendingSync:false,pendingSince:undefined,baseSnapshot:merged,conflictCount:Number(meta.conflictCount||0)+1};
          sharedRoomsRef.current={...sharedRoomsRef.current,[tripId]:nextMeta};
          setSharedRooms(prev=>({...prev,[tripId]:nextMeta}));
          setSharedStatus("synced");
          setSharedStatusText("동시에 수정된 내용을 합쳐서 자동 동기화했어요.");
          return;
        } catch (mergeError:any) {
          const pendingMeta={...meta,pendingSync:true,pendingSince:meta.pendingSince||new Date().toISOString()};
          sharedRoomsRef.current={...sharedRoomsRef.current,[tripId]:pendingMeta};
          setSharedRooms(prev=>({...prev,[tripId]:pendingMeta}));
          setSharedStatus("error");
          setSharedStatusText("동기화를 다시 시도할게요. 이 기기의 변경 내용은 보관되어 있어요.");
          return;
        }
      }
      const pendingMeta={...meta,pendingSync:true,pendingSince:meta.pendingSince||new Date().toISOString()};
      sharedRoomsRef.current={...sharedRoomsRef.current,[tripId]:pendingMeta};
      setSharedRooms(prev=>({...prev,[tripId]:pendingMeta}));
      setSharedStatus("error");
      setSharedStatusText("오프라인 상태예요. 변경 내용은 이 기기에 저장되고 연결되면 자동 동기화돼요.");
    }
  }

  function disconnectSharedRoom() {
    const tripId=activeTrip.id;
    Alert.alert("공동 여행방 연결 해제", "이 기기에서만 실시간 연결을 해제할까요? 여행 데이터는 그대로 남아요.", [
      {text:"취소",style:"cancel"},
      {text:"연결 해제",style:"destructive",onPress:()=>{
        setSharedRooms(prev=>{const next={...prev};delete next[tripId];return next;});
        delete lastSharedFingerprintRef.current[tripId];
        setSharedStatus("idle");
        setSharedStatusText("");
      }}
    ]);
  }

  function buildSharedInvite() {
    const safeTrip = {
      ...activeTrip,
      id: makeId(),
      expenses: activeTrip.expenses.map((expense:any) => {
        const { receiptUri, ...rest } = expense;
        return rest;
      }),
    };
    const payload = {
      version: 1,
      trip: safeTrip,
      plans: activePlans,
      createdAt: new Date().toISOString(),
    };
    return `TRIPSPLIT_INVITE_V1:${encodeURIComponent(JSON.stringify(payload))}`;
  }

  async function shareTripInvite() {
    const invite = buildSharedInvite();
    try {
      await Share.share({
        message: `✈️ Trip Split 공동 여행 초대\n${activeTrip.name}\n\n아래 초대코드를 Trip Split의 관리 → 공동 여행방에 붙여넣어주세요.\n\n${invite}`,
      });
    } catch (error:any) {
      const message = String(error?.message || error || "");
      const name = String(error?.name || "");
      const cancelled = name === "AbortError" || /cancel|cancellation|abort/i.test(message);
      if (!cancelled) Alert.alert("공유 실패", "초대 내용을 공유하지 못했어요.");
    }
  }

  async function joinSharedInvite() {
    const raw = sharedInviteText.trim();
    const livePrefix = "TRIPSPLIT_LIVE_V1:";
    const liveAt = raw.indexOf(livePrefix);
    if (liveAt >= 0) {
      setSharedStatus("syncing");
      setSharedStatusText("공동 여행방에 들어가는 중…");
      try {
        const encoded=raw.slice(liveAt+livePrefix.length).trim();
        const invite=JSON.parse(decodeURIComponent(encoded));
        if (!invite?.code || !invite?.token) throw new Error("초대코드가 올바르지 않아요.");
        const data=await sharedApi("/shared/pull",{code:invite.code,token:invite.token});
        if (!data?.trip || !Array.isArray(data.trip.people) || !Array.isArray(data.trip.expenses)) throw new Error("공동 여행 데이터를 불러오지 못했어요.");
        const imported:Trip={...data.trip,id:makeId(),name:data.trip.name || invite.name || "공동 여행"};
        const plans:Array<TripPlan>=Array.isArray(data.plans)?data.plans:[];
        const meta:SharedRoomMeta={code:String(invite.code),token:String(invite.token),revision:Number(data.revision||1),lastSyncedAt:new Date().toISOString(),pendingSync:false,baseSnapshot:{trip:{...imported},plans},conflictCount:0};
        applyingRemoteRef.current=true;
        lastSharedFingerprintRef.current[imported.id]=sharedFingerprint(imported,plans);
        setState(prev=>({...prev,trips:[...prev.trips,imported],activeTripId:imported.id}));
        setPlansByTrip(prev=>({...prev,[imported.id]:plans}));
        setSharedRooms(prev=>({...prev,[imported.id]:meta}));
        setParticipants(imported.people.map(p=>p.id));
        setPayerId(imported.people[0]?.id || state.profile.id);
        setDate(imported.start || today());
        setSharedInviteText("");
        setTab("home");
        setSharedStatus("synced");
        setSharedStatusText("실시간 공동 여행방에 연결됐어요.");
        Alert.alert("공동 여행방 연결 완료", "이제 이 여행의 동행인·지출·일정 변경이 자동으로 동기화돼요.");
      } catch (error:any) {
        setSharedStatus("error");
        setSharedStatusText(String(error?.message || "공동 여행방에 들어가지 못했어요."));
        Alert.alert("초대코드 오류", String(error?.message || "실시간 공동 여행 초대코드를 다시 확인해주세요."));
      }
      return;
    }

    const prefix = "TRIPSPLIT_INVITE_V1:";
    const at = raw.indexOf(prefix);
    if (at < 0) {
      Alert.alert("초대코드 확인", "Trip Split 초대코드를 다시 붙여넣어주세요.");
      return;
    }
    try {
      const encoded = raw.slice(at + prefix.length).trim();
      const payload = JSON.parse(decodeURIComponent(encoded));
      if (!payload?.trip || !Array.isArray(payload.trip.people) || !Array.isArray(payload.trip.expenses)) throw new Error("invalid");
      const imported:Trip = {
        ...payload.trip,
        id: makeId(),
        name: `${payload.trip.name || "공동 여행"} · 초대`,
      };
      setState(prev => ({...prev, trips:[...prev.trips, imported], activeTripId:imported.id}));
      if (Array.isArray(payload.plans)) setPlansByTrip(prev => ({...prev,[imported.id]:payload.plans.map((plan:TripPlan)=>({...plan,id:makeId()}))}));
      setParticipants(imported.people.map(p=>p.id));
      setPayerId(imported.people.some(p=>p.id===state.profile.id) ? state.profile.id : imported.people[0]?.id || state.profile.id);
      setDate(imported.start || today());
      setSharedInviteText("");
      setTab("home");
      Alert.alert("공동 여행 추가 완료", "사본 형태의 초대 여행을 새 여행으로 추가했어요.");
    } catch {
      Alert.alert("초대코드 오류", "초대코드가 손상되었거나 지원하지 않는 형식이에요.");
    }
  }

  async function shareSettlement() {
    const names = Object.fromEntries(activeTrip.people.map(p=>[p.id,p.name]));
    const lines = transfers.length
      ? transfers.map(t=>`${names[t.from]} → ${names[t.to]} ${won(t.amount)}`)
      : ["현재 정산할 금액이 없습니다."];
    try {
      await Share.share({message:`✈️ ${activeTrip.name} 정산\n${lines.join("\n")}`});
    } catch (error:any) {
      const message = String(error?.message || error || "");
      const name = String(error?.name || "");
      const cancelled = name === "AbortError" || /cancel|cancellation|abort/i.test(message);
      if (!cancelled) Alert.alert("공유 실패", "정산 내용을 공유하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  if (!ready) return <SafeAreaView style={[styles.safe,{backgroundColor:theme.bg}]}><View style={styles.center}><Text>불러오는 중...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.safe,{backgroundColor:screenBackground}]}>
      <MotionBackdrop accent={theme.accent} accentSoft={uiAccentSoft} />
      <ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:horizontalPadding,maxWidth:contentMaxWidth,width:"100%",alignSelf:"center"}]}>
        <View style={[styles.appHeader,isDark&&{backgroundColor:"rgba(13,24,37,0.92)",borderColor:appearanceColors.border}]}>
          <View style={[styles.appBrandIcon,{backgroundColor:uiAccentSoft,borderColor:isDark?hexToRgba(theme.accent,0.34):"transparent"}]}><Text style={styles.appBrandEmoji}>🏝️</Text></View>
          <View style={styles.appBrandCopy}>
            <Text style={styles.appBrandName}>Trip Split</Text>
            {!isTiny&&<Text style={styles.appBrandTagline}>여행은 가볍게 · 정산은 정확하게</Text>}
          </View>
          <View style={styles.appHeaderActions}>
            <View style={[styles.versionPill,{backgroundColor:uiAccentSoft,borderColor:isDark?hexToRgba(theme.accent,0.32):"transparent"}]}>
              <Text style={[styles.version,{color:theme.accent}]}>V3.8.0</Text>
            </View>
          </View>
        </View>

        <Animated.View style={{
          opacity: screenMotion,
          transform: [
            { translateY: screenMotion.interpolate({ inputRange:[0,1], outputRange:[8,0] }) },
          ],
        }}>
        {tab==="home" && <>
          <TripCalendar
            expenses={activeTrip.expenses}
            people={activeTrip.people}
            initialDate={activeTrip.start||today()}
            startDate={activeTrip.start}
            endDate={activeTrip.end}
            plans={activePlans}
            accent={theme.accent}
            accentSoft={uiAccentSoft}
            onAddForDate={d=>{resetForm();setDate(d);setExpenseView("add");setTab("expense");}}
            onAddPlan={openPlanModal}
            onDeletePlan={deletePlan}
          />

          <Card cardStyle={cardDecorStyle} title="🧭 여행 설정">
            <Text style={[styles.homeCompanionSubtitle,isDark&&{color:appearanceColors.muted}]}>여행을 선택하거나 새 여행을 만들고 기본 설정을 관리해요.</Text>
            <View style={[styles.tripSelectorShell,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border}]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tripRow}>
                  {state.trips.map(trip=>(
                    <Pressable
                      key={trip.id}
                      onPress={()=>selectTrip(trip.id)}
                      style={[styles.tripChip,isDark&&trip.id!==state.activeTripId&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border,borderWidth:1},trip.id===state.activeTripId&&styles.tripChipActive,trip.id===state.activeTripId&&{backgroundColor:theme.accent}]}
                    >
                      <Text style={trip.id===state.activeTripId?styles.tripChipActiveText:styles.bold}>{trip.name||"여행"}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={addTrip} style={[styles.tripChip,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border,borderWidth:1}]}>
                    <Text style={styles.bold}>＋ 새 여행</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
            <View style={[styles.two,isCompact&&styles.stackOnCompact,{marginTop:12}]}>
              <Pressable onPress={()=>setDatePickerMode("start")} style={[styles.dateSelectButton,styles.flex,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border}]}>
                <Text style={styles.dateSelectIcon}>🛫</Text><Text style={[styles.dateSelectText,!activeTrip.start&&styles.datePlaceholder]}>{activeTrip.start||"출발일"}</Text>
              </Pressable>
              <Pressable onPress={()=>setDatePickerMode("end")} style={[styles.dateSelectButton,styles.flex,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border}]}>
                <Text style={styles.dateSelectIcon}>🏁</Text><Text style={[styles.dateSelectText,!activeTrip.end&&styles.datePlaceholder]}>{activeTrip.end||"귀국일"}</Text>
              </Pressable>
            </View>
          </Card>
          <Card cardStyle={cardDecorStyle} title="👥 동행인 관리">
            <Text style={styles.homeCompanionSubtitle}>현재 여행과 함께하는 사람을 한눈에 관리해요.</Text>
            <View style={styles.homeTripSectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.homeTripSectionTitle}>동행인 <Text style={[styles.homePeopleInlineCount,{color:theme.accent}]}>{activeTrip.people.length}명</Text></Text>
                <Text style={styles.homeTripActionHint}>현재 여행에 함께하는 사람을 바로 관리해요.</Text>
              </View>

            </View>

            <View style={styles.homePeopleList}>
              {activeTrip.people.map(p=>(
                <View key={p.id} style={[styles.homePersonRow,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border}]}>
                  <Pressable
                    onPress={()=>pickProfilePhoto(p.id)}
                    style={[styles.avatarButton,{backgroundColor:uiAccentSoft}]}
                  >
                    {profilePhotos[p.id] ? (
                      <Image source={{uri:profilePhotos[p.id]}} style={styles.avatarImage}/>
                    ) : (
                      <Text style={[styles.avatarInitial,{color:theme.accent}]}>
                        {(p.name || "나").trim().slice(0,1)}
                      </Text>
                    )}
                  </Pressable>

                  <Pressable onPress={()=>pickProfilePhoto(p.id)} style={styles.flex}>
                    <Text style={styles.homePersonName}>
                      {p.id===state.profile.id ? `${p.name} · 나` : p.name}
                    </Text>
                    <View style={styles.homePersonMetaRow}>
                      <Text style={styles.homePersonPhotoHint}>{profilePhotos[p.id] ? "사진 변경" : "프로필 사진 추가"}</Text>
                      {p.id===state.profile.id && <View style={[styles.leaderBadge,{backgroundColor:uiAccentSoft}]}><Text style={[styles.leaderBadgeText,{color:theme.accent}]}>👑 여행 리더</Text></View>}
                    </View>
                  </Pressable>

                  {p.id!==state.profile.id && (
                    <Pressable
                      onPress={()=>removePerson(p.id)}
                      hitSlop={8}
                      style={[styles.homePersonDeleteButton,isDark&&{backgroundColor:appearanceColors.dangerSurface,borderColor:appearanceColors.dangerBorder}]}
                    >
                      <Text style={styles.homePersonDeleteText}>삭제</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <View style={[styles.homePersonAddRow,isCompact&&styles.stackOnCompact]}>
              <TextInput
                style={[styles.input,styles.flex]}
                value={personName}
                onChangeText={setPersonName}
                onSubmitEditing={addPerson}
                returnKeyType="done"
                placeholder="동행인 이름"
              />
              <Pressable
                onPress={addPerson}
                style={[styles.homePersonAddButton,{backgroundColor:theme.accent}]}
              >
                <Text style={styles.homePersonAddButtonText}>추가</Text>
              </Pressable>
            </View>

            <View style={[styles.homeTripDivider,isDark&&{backgroundColor:appearanceColors.border}]}/>

            <Pressable
              onPress={() => requestTripDelete(state.activeTripId)}
              style={[
                styles.homeTripDeleteButton,
                isDark&&{backgroundColor:appearanceColors.dangerSurface,borderColor:appearanceColors.dangerBorder},
                deleteTripConfirmId === state.activeTripId && styles.homeTripDeleteConfirm
              ]}
            >
              <Text
                style={[
                  styles.homeTripDeleteText,
                  deleteTripConfirmId === state.activeTripId && styles.homeTripDeleteConfirmText
                ]}
              >
                {deleteTripConfirmId === state.activeTripId
                  ? "한번 더 누르면 현재 여행이 삭제됩니다"
                  : "🗑️ 현재 여행 삭제"}
              </Text>
            </Pressable>
          </Card>

          <View style={[styles.heroCard,{backgroundColor:theme.accent}]}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroEyebrow}>이번 여행 지출</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={[styles.hero,isTiny&&styles.heroTiny]}>{won(total)}</Text>
              </View>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>💳 {activeTrip.expenses.length}건</Text>
              </View>
            </View>
            <View style={styles.heroDivider} />
            <View style={[styles.two,isCompact&&styles.stackOnCompact]}>
              <Stat label="남은 예산" value={activeTrip.budget?won(activeTrip.budget-total):"-"} />
              <Stat label="함께 가는 사람" value={`${activeTrip.people.length}명`} />
            </View>
          </View>

          <Card cardStyle={cardDecorStyle} title="📊 예산 · 소비 분석">
            <View style={[styles.budgetSummaryRow,isCompact&&styles.stackOnCompact]}>
              <View style={[styles.budgetSummaryBox,{backgroundColor:uiAccentSoft}]}>
                <Text style={styles.analyticsLabel}>총 예산</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.analyticsBig,{color:theme.accent}]}>
                  {activeTrip.budget ? won(activeTrip.budget) : "미설정"}
                </Text>
              </View>
              <View style={[styles.budgetSummaryBox,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.analyticsLabel}>남은 예산</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.analyticsBig,remainingBudget<0&&styles.danger]}>
                  {activeTrip.budget ? won(remainingBudget) : "-"}
                </Text>
              </View>
            </View>

            <View style={styles.budgetEditRow}>
              <TextInput
                value={budgetDraft}
                onChangeText={v=>setBudgetDraft(v.replace(/[^0-9]/g,""))}
                onSubmitEditing={saveBudget}
                keyboardType="numeric"
                returnKeyType="done"
                placeholder="여행 총 예산 입력"
                placeholderTextColor="#A4A7B8"
                style={[styles.input,styles.flex]}
              />
              <Pressable onPress={saveBudget} style={[styles.budgetSaveButton,{backgroundColor:theme.accent}]}>
                <Text style={styles.budgetSaveText}>예산 저장</Text>
              </Pressable>
            </View>

            {activeTrip.budget>0 && (
              <>
                <View style={styles.analyticsProgressHeader}>
                  <Text style={styles.muted}>예산 사용률</Text>
                  <Text style={[styles.analyticsPercent,{color:total>activeTrip.budget?"#D9534F":theme.accent}]}>{Math.round(total/activeTrip.budget*100)}%</Text>
                </View>
                <View style={[styles.analyticsTrack,{backgroundColor:uiAccentSoft}]}>
                  <View style={[styles.analyticsFill,{backgroundColor:total>activeTrip.budget?"#D9534F":theme.accent,width:`${budgetRate}%`}]} />
                </View>
              </>
            )}

            <View style={[styles.analyticsMiniGrid,isTiny&&styles.stackOnCompact]}>
              <View style={[styles.analyticsMiniBox,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.analyticsMiniLabel}>하루 평균</Text>
                <Text style={styles.analyticsMiniValue}>{won(dailyAverage)}</Text>
              </View>
              <View style={[styles.analyticsMiniBox,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.analyticsMiniLabel}>1인 평균</Text>
                <Text style={styles.analyticsMiniValue}>{won(perPersonAverage)}</Text>
              </View>
              <View style={[styles.analyticsMiniBox,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.analyticsMiniLabel}>예상 총지출</Text>
                <Text style={styles.analyticsMiniValue}>{tripTotalDays>0&&elapsedTripDays>0?won(projectedSpend):"날짜 설정 필요"}</Text>
              </View>
            </View>

            <View style={styles.analyticsDivider}/>
            <View style={styles.analyticsSectionHeader}>
              <Text style={styles.analyticsSectionTitle}>카테고리별 소비</Text>
              <Text style={styles.muted}>{activeTrip.expenses.length}건 기준</Text>
            </View>
            {categoryAnalytics.length===0 ? (
              <Text style={styles.muted}>지출을 입력하면 식비·교통·쇼핑 비중을 자동으로 분석해요.</Text>
            ) : categoryAnalytics.map(item=>(
              <View key={item.category} style={styles.categoryAnalyticsRow}>
                <View style={styles.categoryAnalyticsTop}>
                  <Text style={styles.categoryAnalyticsName}>{item.category}</Text>
                  <Text style={styles.categoryAnalyticsAmount}>{won(item.amount)} · {Math.round(item.ratio*100)}%</Text>
                </View>
                <View style={[styles.categoryTrack,{backgroundColor:uiAccentSoft}]}>
                  <View style={[styles.categoryFill,{backgroundColor:theme.accent,width:`${Math.max(4,Math.round(item.ratio*100))}%`}]} />
                </View>
              </View>
            ))}
            {tripTotalDays>0 && (
              <Text style={styles.analyticsFootnote}>
                여행 {tripTotalDays}일 중 {elapsedTripDays>0?`${elapsedTripDays}일차 기준`:"출발 전"} · 현재 소비 속도로 예상 총지출을 계산해요.
              </Text>
            )}
          </Card>

          <Card cardStyle={cardDecorStyle} title="오늘 일정">
            {todayPlans.length===0 ? (
              <View style={styles.todayEmpty}>
                <View style={[styles.todayIconBox,{backgroundColor:uiAccentSoft}]}>
                  <Text style={styles.todayIcon}>🗓️</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.todayEmptyTitle}>오늘 등록된 일정이 없어요</Text>
                  <Text style={styles.muted}>달력에서 날짜를 눌러 항공·숙소·여행 일정을 추가할 수 있어요.</Text>
                </View>
              </View>
            ) : (
              todayPlans.slice(0,3).map(plan=>(
                <View key={plan.id} style={styles.todayPlanRow}>
                  <View style={[styles.todayTimeBox,{backgroundColor:uiAccentSoft}]}>
                    <Text style={[styles.todayTime,{color:theme.accent}]}>{plan.time || "일정"}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.todayPlanTitle}>
                      {plan.type==="flight"?"✈️":plan.type==="hotel"?"🏨":"📍"} {plan.title}
                    </Text>
                    {!!plan.detail && <Text style={styles.todayPlanDetail} numberOfLines={1}>{plan.detail}</Text>}
                  </View>
                </View>
              ))
            )}
            <Pressable
              onPress={()=>openPlanModal(todayKey)}
              style={[styles.todayAddButton,{backgroundColor:uiAccentSoft}]}
            >
              <Text style={[styles.todayAddText,{color:theme.accent}]}>＋ 오늘 일정 추가</Text>
            </Pressable>
          </Card>

          <Card cardStyle={cardDecorStyle} title="최근 지출">
            {!activeTrip.expenses.length && (
              <Text style={styles.muted}>아직 지출이 없어요. 첫 지출을 기록해보세요.</Text>
            )}
            {recentExpenses.map(e=>{
              const payer=peopleNameMap[e.payerId] || "?";
              return (
                <Pressable
                  key={e.id}
                  onPress={()=>{setExpenseView("list");setTab("expense");}}
                  style={styles.homeExpenseRow}
                >
                  <View style={styles.flex}>
                    <Text style={styles.bold}>{e.title}</Text>
                    <Text style={styles.muted}>{e.date} · {e.category} · {payer}</Text>
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.homeExpenseAmount}>{won(e.krwAmount)}</Text>
                </Pressable>
              );
            })}
            <View style={[styles.homeQuickRow,isCompact&&styles.stackOnCompact]}>
              <Pressable
                onPress={()=>{resetForm();setExpenseView("add");setTab("expense");}}
                style={[styles.homeQuickButton,{backgroundColor:theme.accent}]}
              >
                <Text style={styles.homeQuickButtonPrimary}>＋ 지출 추가</Text>
              </Pressable>
              <Pressable
                onPress={()=>{setExpenseView("list");setTab("expense");}}
                style={[styles.homeQuickButton,{backgroundColor:uiAccentSoft}]}
              >
                <Text style={[styles.homeQuickButtonSecondary,{color:theme.accent}]}>전체 내역</Text>
              </Pressable>
            </View>
          </Card>
        </>}

        {tab==="expense" && <>
          <View style={[styles.segmentWrap,{backgroundColor:uiAccentSoft}]}>
            <Pressable
              onPress={()=>setExpenseView("add")}
              style={[styles.segmentButton,expenseView==="add"&&{backgroundColor:theme.accent}]}
            >
              <Text style={[styles.segmentText,expenseView==="add"&&styles.segmentTextActive]}>＋ 지출 추가</Text>
            </Pressable>
            <Pressable
              onPress={()=>setExpenseView("list")}
              style={[styles.segmentButton,expenseView==="list"&&{backgroundColor:theme.accent}]}
            >
              <Text style={[styles.segmentText,expenseView==="list"&&styles.segmentTextActive]}>🧾 지출 내역</Text>
            </Pressable>
          </View>
          {expenseView==="add" && <>
          <ReceiptTools
            accent={theme.accent}
            accentSoft={uiAccentSoft}
            receiptUri={receiptUri}
            onReceiptUriChange={uri=>{
              setReceiptUri(uri);
              if (!uri) { setReceiptAnalysis(null); setReceiptItemShares(null); }
            }}
            people={activeTrip.people}
            onItemSplitChange={(shares, ids)=>{ setReceiptItemShares(shares); if (ids.length) setParticipants(ids); }}
            onDetected={result=>{
              setReceiptAnalysis(result);
              if (result.merchant) setTitle(result.merchant);
              if (result.date) setDate(result.date);
              if (result.amount != null) setAmount(String(result.amount));
              if (result.currency && currencies.includes(result.currency as Expense["currency"])) {
                const detectedCurrency = result.currency as Expense["currency"];
                setCurrency(detectedCurrency);
                if (detectedCurrency === "KRW") {
                  setRate("1");
                  setRateDate(today());
                } else if (rateMode === "auto") {
                  void refreshAutoRate(detectedCurrency);
                }
              }
              if (result.category && categories.includes(result.category)) setCategory(result.category);
            }}
          />
          <Card cardStyle={cardDecorStyle} title={editingId?"지출 수정":"지출 추가"}>
          <Text style={[styles.dateBanner,{color:theme.accent,backgroundColor:uiAccentSoft}]}>📅 {date}</Text>
          <Field label="내용" value={title} onChangeText={setTitle} placeholder="예: 라멘"/>
          <Text style={styles.label}>카테고리</Text>
          <View style={styles.chips}>{categories.map(x=><Chip key={x} text={x} selected={category===x} onPress={()=>setCategory(x)}/>)}</View>
          <Text style={styles.label}>날짜</Text>
          <Pressable
            onPress={()=>setDatePickerMode("expense")}
            style={[styles.dateSelectButton,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border},{borderColor:isDark?appearanceColors.border:uiAccentSoft}]}
          >
            <Text style={styles.dateSelectIcon}>📅</Text>
            <Text style={styles.dateSelectText}>{date}</Text>
            <Text style={[styles.dateSelectChange,{color:theme.accent}]}>변경</Text>
          </Pressable>
          <Field label="금액" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
          <Text style={styles.label}>통화</Text>
          <View style={styles.chips}>{currencies.map(x=><Chip key={x} text={x} selected={currency===x} onPress={()=>{
            setCurrency(x);
            if (x === "KRW") { setRate("1"); setRateDate(today()); setRateError(null); }
          }}/>)}</View>
          {currency !== "KRW" && <>
            <Text style={styles.label}>환율 방식</Text>
            <View style={styles.rateModeRow}>
              <Pressable
                onPress={()=>setRateMode("auto")}
                style={[styles.rateModeButton,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border}, rateMode==="auto" && {backgroundColor:uiAccentSoft,borderColor:theme.accent}]}
              >
                <Text style={[styles.rateModeText, rateMode==="auto" && {color:theme.accent}]}>✨ 자동 환율</Text>
              </Pressable>
              <Pressable
                onPress={()=>setRateMode("manual")}
                style={[styles.rateModeButton,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border}, rateMode==="manual" && {backgroundColor:uiAccentSoft,borderColor:theme.accent}]}
              >
                <Text style={[styles.rateModeText, rateMode==="manual" && {color:theme.accent}]}>✍️ 직접 입력</Text>
              </Pressable>
            </View>
          </>}
          <Field
            label={currency === "KRW" ? "환율 (KRW는 1)" : `1 ${currency} = 몇 원?`}
            value={rate}
            onChangeText={text=>{ setRate(text); if (currency!=="KRW") setRateMode("manual"); }}
            keyboardType="decimal-pad"
          />
          {currency !== "KRW" && rateMode === "auto" && <View style={[styles.rateStatus,{backgroundColor:uiAccentSoft}]}>
            <View style={styles.rateStatusCopy}>
              <Text style={[styles.rateStatusTitle,{color:theme.accent}]}>{rateLoading ? "환율 불러오는 중…" : `자동 환율 · 1 ${currency} = ${rate || "-"}원`}</Text>
              <Text style={styles.rateStatusMeta}>{rateDate ? `${rateDate} 기준 · ` : ""}참고 환율이며 실제 카드/환전 금액과 다를 수 있어요.</Text>
            </View>
            <Pressable disabled={rateLoading} onPress={()=>void refreshAutoRate(currency)} style={[styles.rateRefresh,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border},{borderColor:theme.accent}]}>
              <Text style={[styles.rateRefreshText,{color:theme.accent}]}>↻ 새로고침</Text>
            </Pressable>
          </View>}
          {!!rateError && <Text style={styles.rateError}>{rateError}</Text>}
          <Text style={styles.label}>누가 결제했나요?</Text>
          <View style={styles.chips}>{activeTrip.people.map(p=><Chip key={p.id} text={p.id===state.profile.id?`나 · ${p.name}`:p.name} selected={payerId===p.id} onPress={()=>setPayerId(p.id)}/>)}</View>
          <Text style={styles.label}>누가 같이 사용했나요?</Text>
          <View style={styles.chips}>{activeTrip.people.map(p=><Chip key={p.id} text={p.id===state.profile.id?`나 · ${p.name}`:p.name} selected={participants.includes(p.id)} onPress={()=>setParticipants(ids=>ids.includes(p.id)?ids.filter(id=>id!==p.id):[...ids,p.id])}/>)}</View>
          <Primary text={editingId?"수정 저장":"지출 저장"} onPress={saveExpense} full/>
          {editingId && <Pressable onPress={()=>{resetForm();setExpenseView("list");setTab("expense");}}><Text style={[styles.link,{textAlign:"center",marginTop:12,color:theme.accent}]}>수정 취소</Text></Pressable>}
        </Card>
          </>}
          {expenseView==="list" && <>
<Card cardStyle={cardDecorStyle} title={`지출 내역 · ${activeTrip.expenses.length}건`}>
          {!activeTrip.expenses.length && <Text style={styles.muted}>아직 지출이 없습니다.</Text>}
          {[...activeTrip.expenses].reverse().map(e=>{
            const payer=activeTrip.people.find(p=>p.id===e.payerId)?.name || "?";
            return <View key={e.id} style={styles.expense}>
              <View style={styles.rowBetween}><View style={styles.flex}><Text style={styles.bold}>{e.title}</Text><Text style={styles.muted}>
                {e.date} · {e.category} · {payer} 결제 · {e.participantIds.length}명
                {(e as Expense & {receiptUri?:string}).receiptUri ? " · 🧾 영수증" : ""}
              </Text></View><Text style={styles.bold}>{won(e.krwAmount)}</Text></View>
              <View style={styles.row}><Pressable onPress={()=>editExpense(e)}><Text style={styles.link}>수정</Text></Pressable><Pressable onPress={()=>deleteExpense(e.id)}><Text style={styles.danger}>삭제</Text></Pressable></View>
            </View>
          })}
        </Card>          </>}
        </>}

        {tab==="game" && <GameZone
          people={activeTrip.people}
          accent={theme.accent}
          accentSoft={uiAccentSoft}
          meId={state.profile.id}
          onUsePayer={(winnerId, gameParticipantIds)=>{
            resetForm();
            setPayerId(winnerId);
            setParticipants(gameParticipantIds);
            setTitle("");
            setCategory("식비");
            setExpenseView("add");setTab("expense");
          }}
        />}

        {tab==="manage" && <>
          <View style={styles.manageIntro}>
            <Text style={[styles.manageTitle,isDark&&{color:appearanceColors.text}]}>여행 관리</Text>
            <Text style={[styles.manageSubtitle,isDark&&{color:appearanceColors.muted}]}>준비물, 공동 여행방, 백업과 내 정보를 관리해요.</Text>
          </View>
          <ManageGroup
            title="✅ 준비 체크리스트"
            subtitle="준비물 체크와 진행률"
            open={openManageSection==="checklist"}
            onPress={()=>setOpenManageSection(openManageSection==="checklist"?null:"checklist")}
            cardStyle={cardDecorStyle}
          >
            <View style={styles.checkProgressRow}>
              <Text style={styles.muted}>
                {checklistDoneCount} / {activeTrip.checklist.length} 완료
              </Text>
              {activeTrip.checklist.some(item=>item.done) && (
                <Pressable onPress={resetChecklistDone}>
                  <Text style={[styles.checkReset,{color:theme.accent}]}>전체 체크 해제</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.checkProgressTrack,{backgroundColor:uiAccentSoft}]}>
              <View
                style={[
                  styles.checkProgressFill,
                  {
                    backgroundColor:theme.accent,
                    width:`${checklistProgress}%`
                  }
                ]}
              />
            </View>

            <View style={styles.checkList}>
              {activeTrip.checklist.length===0 && (
                <Text style={styles.emptyText}>아직 준비물이 없어요. 아래에서 추가해보세요.</Text>
              )}
              {activeTrip.checklist.map(item=>(
                <View key={item.id} style={[styles.checkItemRow,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                  <Pressable
                    onPress={()=>toggleChecklist(item.id)}
                    style={[styles.checkBox,item.done&&{backgroundColor:theme.accent,borderColor:theme.accent}]}
                  >
                    <Text style={styles.checkBoxText}>{item.done?"✓":""}</Text>
                  </Pressable>
                  <Pressable onPress={()=>toggleChecklist(item.id)} style={styles.checkTextWrap}>
                    <Text style={[styles.checkItemText,item.done&&styles.checkItemDone]}>{item.text}</Text>
                  </Pressable>
                  <Pressable onPress={()=>deleteChecklistItem(item.id)} style={styles.checkDelete}>
                    <Text style={styles.checkDeleteText}>삭제</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.checkAddRow}>
              <TextInput
                value={checkItemText}
                onChangeText={setCheckItemText}
                onSubmitEditing={addChecklistItem}
                returnKeyType="done"
                placeholder="준비물 추가 (예: 보조배터리)"
                placeholderTextColor="#A4A7B8"
                style={[styles.checkInput,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border}]}
              />
              <Pressable onPress={addChecklistItem} style={[styles.checkAddButton,{backgroundColor:theme.accent}]}>
                <Text style={styles.checkAddButtonText}>추가</Text>
              </Pressable>
            </View>
          </ManageGroup>

          <ManageGroup
            title="🤝 공동 여행방"
            subtitle={activeSharedRoom ? "실시간 자동 동기화 연결됨" : "친구와 같은 여행을 함께 수정해요"}
            open={openManageSection==="shared"}
            onPress={()=>setOpenManageSection(openManageSection==="shared"?null:"shared")}
            cardStyle={cardDecorStyle}
          >
            <Text style={[styles.muted,isDark&&{color:appearanceColors.muted}]}>동행인·지출·일정이 약 5초 간격으로 자동 동기화돼요. 동시에 같은 내용을 바꾸면 마지막으로 저장된 내용이 우선돼요.</Text>
            <View style={[styles.sharedRoomBanner,{backgroundColor:uiAccentSoft,borderColor:isDark?hexToRgba(theme.accent,0.34):theme.accentSoft}]}> 
              <Text style={[styles.sharedRoomTitle,{color:theme.accent}]}>✈️ {activeTrip.name}</Text>
              <Text style={[styles.sharedRoomMeta,isDark&&{color:appearanceColors.muted}]}>동행 {activeTrip.people.length}명 · 지출 {activeTrip.expenses.length}건 · 일정 {activePlans.length}개</Text>
              {activeSharedRoom ? (
                <>
                  <View style={styles.sharedLiveRow}>
                    <View style={[styles.sharedLiveDot,{backgroundColor:activeSharedRoom.pendingSync?"#F5A524":sharedStatus==="error"?"#EF6262":"#38C793"}]}/>
                    <Text style={[styles.sharedLiveText,isDark&&{color:appearanceColors.text}]}>{activeSharedRoom.pendingSync?"오프라인 변경 보관 중":"실시간 연결"} · 방 코드 {activeSharedRoom.code}</Text>
                  </View>
                  {!!sharedStatusText && <Text style={[styles.sharedStatusText,isDark&&{color:appearanceColors.muted}]}>{sharedStatusText}</Text>}
                </>
              ) : (
                <Text style={[styles.sharedStatusText,isDark&&{color:appearanceColors.muted}]}>아직 이 여행은 실시간 공동방에 연결되지 않았어요.</Text>
              )}
            </View>

            {activeSharedRoom ? (
              <>
                <Primary text="친구에게 실시간 초대 보내기" onPress={()=>shareLiveInvite(activeSharedRoom)} full/>
                <View style={[styles.sharedActionRow,isCompact&&styles.stackOnCompact]}>
                  <Pressable onPress={()=>activeSharedRoom.pendingSync?pushSharedRoom(activeTrip.id,activeTrip,activePlans,activeSharedFingerprint):pullSharedRoom(activeTrip.id)} style={[styles.sharedSecondaryButton,{borderColor:theme.accent}]}>
                    <Text style={[styles.sharedSecondaryText,{color:theme.accent}]}>↻ 지금 동기화</Text>
                  </Pressable>
                  <Pressable onPress={disconnectSharedRoom} style={[styles.sharedSecondaryButton,{borderColor:isDark?appearanceColors.border:"#E5E6EC"}]}>
                    <Text style={[styles.sharedSecondaryText,{color:isDark?appearanceColors.muted:"#777B8F"}]}>연결 해제</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Primary text={sharedStatus==="creating"?"공동 여행방 만드는 중…":"실시간 공동 여행방 만들기"} onPress={createLiveSharedRoom} full/>
            )}

            <View style={styles.sharedDivider}/>
            <Text style={[styles.label,isDark&&{color:appearanceColors.text}]}>받은 초대코드</Text>
            <TextInput
              value={sharedInviteText}
              onChangeText={setSharedInviteText}
              placeholder="카카오톡·문자 등으로 받은 초대코드를 붙여넣기"
              placeholderTextColor={isDark?appearanceColors.muted:"#A4A7B8"}
              multiline
              style={[styles.input,styles.sharedInviteInput,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border,color:appearanceColors.text}]}
            />
            <Pressable onPress={joinSharedInvite} style={[styles.sharedJoinButton,{backgroundColor:theme.accent}]}>
              <Text style={styles.primaryText}>초대받은 공동 여행 연결</Text>
            </Pressable>
            <Pressable onPress={shareTripInvite} style={styles.sharedCopyButton}>
              <Text style={[styles.sharedCopyText,{color:theme.accent}]}>서버 없이 여행 사본만 보내기</Text>
            </Pressable>
            <Text style={[styles.sharedBetaNote,isDark&&{color:appearanceColors.muted}]}>V3.8.0 · 기기별 사용자 구분 + 오프라인 변경 보관 · 각 기기의 ‘나’를 서로 다른 사람으로 정산해요.</Text>
          </ManageGroup>

          <ManageGroup
            title="🎨 꾸미기 전용 공간"
            subtitle="홈과 분리된 디자인 설정 공간"
            open={openManageSection==="decorate"}
            onPress={()=>setOpenManageSection(openManageSection==="decorate"?null:"decorate")}
            cardStyle={cardDecorStyle}
          >
            <Text style={[styles.muted,isDark&&{color:appearanceColors.muted}]}>색상뿐 아니라 밝기, 배경과 카드 모양까지 취향대로 바꿀 수 있어요. 선택한 꾸미기는 앱을 다시 열어도 유지돼요.</Text>

            <Text style={[styles.decorSectionTitle,isDark&&{color:appearanceColors.text}]}>화면 밝기</Text>
            <View style={[styles.decorChoiceRow,isCompact&&styles.stackOnCompact]}>
              {([
                ["system","📱","시스템"],
                ["light","☀️","라이트"],
                ["dark","🌙","다크"],
              ] as [AppearanceMode,string,string][]).map(([id,emoji,label])=>(
                <Pressable key={id} onPress={()=>setAppearanceMode(id)} style={[styles.decorChoice,{backgroundColor:isDark?appearanceColors.surface2:"#FFFFFF"},appearanceMode===id&&{borderColor:theme.accent,borderWidth:2}]}>
                  <Text style={styles.decorChoiceEmoji}>{emoji}</Text>
                  <Text style={[styles.decorChoiceText,isDark&&{color:appearanceColors.text},appearanceMode===id&&{color:theme.accent}]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.muted,isDark&&{color:appearanceColors.muted}]}>시스템은 휴대폰의 라이트/다크 설정을 자동으로 따라가요.</Text>

            <Text style={[styles.decorSectionTitle,isDark&&{color:appearanceColors.text}]}>테마 색상</Text>
            <View style={styles.themeGrid}>
              {(Object.values(THEMES) as typeof theme[]).map(t=>(
                <Pressable
                  key={t.id}
                  onPress={()=>setThemeId(t.id)}
                  style={[
                    styles.themeOption,
                    isCompact && styles.themeOptionCompact,
                    {backgroundColor:t.accentSoft},
                    themeId===t.id && {borderColor:t.accent,borderWidth:2}
                  ]}
                >
                  <View style={[styles.themeDot,{backgroundColor:t.accent}]} />
                  <Text style={styles.themeEmoji}>{t.emoji}</Text>
                  <Text style={[styles.themeName,isDark&&{color:"#20223F"},themeId===t.id&&{color:t.accent}]}>{t.name}</Text>
                  {themeId===t.id && <Text style={[styles.themeSelected,{color:t.accent}]}>선택됨</Text>}
                </Pressable>
              ))}
            </View>

            <Text style={[styles.decorSectionTitle,isDark&&{color:appearanceColors.text}]}>배경 스타일</Text>
            <View style={[styles.decorChoiceRow,isCompact&&styles.stackOnCompact]}>
              {(Object.entries(BACKGROUNDS) as [BackgroundStyleId, typeof BACKGROUNDS[BackgroundStyleId]][]).map(([id,item])=>(
                <Pressable
                  key={id}
                  onPress={()=>setBackgroundStyleId(id)}
                  style={[
                    styles.decorChoice,
                    {backgroundColor:id==="theme"?THEMES[themeId].accentSoft:(item.color || "#FFFFFF")},
                    backgroundStyleId===id && {borderColor:theme.accent,borderWidth:2}
                  ]}
                >
                  <Text style={styles.decorChoiceEmoji}>{item.emoji}</Text>
                  <Text style={[styles.decorChoiceText,backgroundStyleId===id&&{color:theme.accent}]}>{item.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.decorSectionTitle,isDark&&{color:appearanceColors.text}]}>카드 모양</Text>
            <View style={[styles.decorChoiceRow,isCompact&&styles.stackOnCompact]}>
              {(Object.entries(CARD_STYLES) as [CardStyleId, typeof CARD_STYLES[CardStyleId]][]).map(([id,item])=>(
                <Pressable
                  key={id}
                  onPress={()=>setCardStyleId(id)}
                  style={[
                    styles.cardPreview,
                    isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border},
                    {borderRadius:item.radius,shadowOpacity:item.shadowOpacity,elevation:item.elevation},
                    cardStyleId===id && {borderColor:theme.accent,borderWidth:2}
                  ]}
                >
                  <Text style={styles.decorChoiceEmoji}>{item.emoji}</Text>
                  <Text style={[styles.decorChoiceText,isDark&&{color:appearanceColors.text},cardStyleId===id&&{color:theme.accent}]}>{item.name}</Text>
                </Pressable>
              ))}
            </View>
          </ManageGroup>

          <ManageGroup
            title="💾 백업 · 복원"
            subtitle="여행 데이터를 안전하게 보관"
            open={openManageSection==="backup"}
            onPress={()=>setOpenManageSection(openManageSection==="backup"?null:"backup")}
            cardStyle={cardDecorStyle}
          >
            <Text style={styles.muted}>
              여행 기록과 지출 내역을 백업해두면 휴대폰을 바꾸거나 앱을 다시 설치한 뒤에도 복원할 수 있어요.
            </Text>

            <Pressable
              onPress={shareBackup}
              style={[styles.primaryButton,{backgroundColor:theme.accent,marginTop:13}]}
            >
              <Text style={styles.primaryButtonText}>📤 전체 데이터 백업하기</Text>
            </Pressable>

            <Pressable
              onPress={()=>setShowRestore(v=>!v)}
              style={[styles.secondaryWideButton,{borderColor:theme.accent}]}
            >
              <Text style={[styles.secondaryWideButtonText,{color:theme.accent}]}>
                {showRestore ? "복원창 닫기" : "📥 백업 데이터 복원하기"}
              </Text>
            </Pressable>

            {showRestore && (
              <View style={[styles.restoreBox,{backgroundColor:uiAccentSoft}]}>
                <Text style={styles.restoreGuide}>
                  백업할 때 저장하거나 공유한 긴 JSON 내용을 아래에 그대로 붙여넣어 주세요.
                </Text>
                <TextInput
                  value={restoreText}
                  onChangeText={setRestoreText}
                  placeholder={'{ "app": "Trip Split", ... }'}
                  placeholderTextColor="#A4A7B8"
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.restoreInput}
                />
                <Pressable
                  onPress={restoreBackup}
                  style={[styles.restoreButton,{backgroundColor:theme.accent}]}
                >
                  <Text style={styles.primaryButtonText}>백업 내용으로 복원</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.backupNote}>
              ※ 프로필 사진은 백업에 포함돼요. 영수증 사진 파일 자체는 아직 백업 대상이 아니며, 연결 정보만 보존돼요.
            </Text>
          </ManageGroup>

          <ManageGroup
            title="👤 내 정보"
            subtitle="내 이름 · 프로필 사진"
            open={openManageSection==="profile"}
            onPress={()=>setOpenManageSection(openManageSection==="profile"?null:"profile")}
            cardStyle={cardDecorStyle}
          >
            <View style={[styles.profileEditorRow,isCompact&&styles.stackOnCompact]}>
              <Pressable
                onPress={()=>pickProfilePhoto(state.profile.id)}
                style={[styles.profileAvatarButton,{backgroundColor:uiAccentSoft}]}
              >
                {profilePhotos[state.profile.id] ? (
                  <Image source={{uri:profilePhotos[state.profile.id]}} style={styles.profileAvatarImage}/>
                ) : (
                  <Text style={[styles.profileAvatarInitial,{color:theme.accent}]}>
                    {(state.profile.name || "나").trim().slice(0,1)}
                  </Text>
                )}
              </Pressable>

              <View style={styles.flex}>
                <Text style={styles.profilePhotoTitle}>프로필 사진</Text>
                <Text style={styles.profilePhotoHint}>사진을 누르면 앨범에서 변경할 수 있어요.</Text>
                <View style={styles.profilePhotoActions}>
                  <Pressable
                    onPress={()=>pickProfilePhoto(state.profile.id)}
                    style={[styles.profilePhotoAction,{borderColor:theme.accent}]}
                  >
                    <Text style={[styles.profilePhotoActionText,{color:theme.accent}]}>
                      {profilePhotos[state.profile.id] ? "사진 변경" : "사진 선택"}
                    </Text>
                  </Pressable>
                  {profilePhotos[state.profile.id] && (
                    <Pressable
                      onPress={()=>removeProfilePhoto(state.profile.id)}
                      style={styles.profilePhotoRemove}
                    >
                      <Text style={styles.profilePhotoRemoveText}>사진 삭제</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <Field label="내 이름" value={state.profile.name} onChangeText={updateMyName} />
          </ManageGroup>
        </>}

        {tab==="settle" && <>
          <Card cardStyle={cardDecorStyle} title="사람별 정산">
            {activeTrip.people.map(p=>{
              const b=balances[p.id]||{paid:0,owed:0,net:0};
              return <View key={p.id} style={styles.listRow}><View><Text style={styles.bold}>{p.id===state.profile.id?`나 · ${p.name}`:p.name}</Text><Text style={styles.muted}>결제 {won(b.paid)} · 부담 {won(b.owed)}</Text></View><Text style={b.net>0?styles.good:b.net<0?styles.danger:styles.muted}>{b.net>0?`받을 돈 ${won(b.net)}`:b.net<0?`보낼 돈 ${won(-b.net)}`:"정산 완료"}</Text></View>
            })}
          </Card>
          <Card cardStyle={cardDecorStyle} title="최종 송금">
            {!transfers.length && <Text style={styles.muted}>현재 정산할 금액이 없습니다.</Text>}
            {transfers.map((t,i)=>{
              const f=activeTrip.people.find(p=>p.id===t.from)?.name||"?";
              const to=activeTrip.people.find(p=>p.id===t.to)?.name||"?";
              return <View key={i} style={styles.listRow}><Text><Text style={styles.bold}>{f}</Text>{" → "}<Text style={styles.bold}>{to}</Text></Text><Text style={styles.bold}>{won(t.amount)}</Text></View>
            })}
            <Primary text="정산 결과 공유" onPress={shareSettlement} full/>
          </Card>
        </>}
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showNewTrip}
        transparent
        animationType="fade"
        onRequestClose={()=>setShowNewTrip(false)}
      >
        <View style={[styles.dateModalBackdrop,isDark&&{backgroundColor:appearanceColors.overlay}]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={()=>setShowNewTrip(false)}/>
          <View style={[styles.newTripModalCard,isDark&&{backgroundColor:appearanceColors.surface,borderColor:appearanceColors.border,borderWidth:1}]}>
            <View style={styles.planModalHeader}>
              <View>
                <Text style={styles.planModalTitle}>새 여행 만들기</Text>
                <Text style={styles.planModalDate}>여행에 필요한 기본 정보만 먼저 입력해요.</Text>
              </View>
              <Pressable onPress={()=>setShowNewTrip(false)} style={[styles.dateModalClose,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.dateModalCloseText}>✕</Text>
              </Pressable>
            </View>

            <Field
              label="여행지 / 여행 이름"
              value={newTripName}
              onChangeText={setNewTripName}
              placeholder="예: 오사카 여행"
              autoFocus
            />

            <View style={[styles.two,isCompact&&styles.stackOnCompact]}>
              <View style={styles.flex}>
                <Text style={styles.label}>출발일</Text>
                <Pressable
                  onPress={()=>setDatePickerMode("newStart")}
                  style={[styles.dateSelectButton,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border},{borderColor:isDark?appearanceColors.border:uiAccentSoft}]}
                >
                  <Text style={styles.dateSelectIcon}>🗓️</Text>
                  <Text style={[styles.dateSelectText,!newTripStart&&styles.datePlaceholder]}>
                    {newTripStart || "선택"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.flex}>
                <Text style={styles.label}>귀국일</Text>
                <Pressable
                  onPress={()=>setDatePickerMode("newEnd")}
                  style={[styles.dateSelectButton,isDark&&{backgroundColor:appearanceColors.input,borderColor:appearanceColors.border},{borderColor:isDark?appearanceColors.border:uiAccentSoft}]}
                >
                  <Text style={styles.dateSelectIcon}>🏁</Text>
                  <Text style={[styles.dateSelectText,!newTripEnd&&styles.datePlaceholder]}>
                    {newTripEnd || "선택"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Field
              label="총 예산(선택)"
              value={newTripBudget}
              onChangeText={v=>setNewTripBudget(v.replace(/[^0-9]/g,""))}
              keyboardType="numeric"
              placeholder="예: 1500000"
            />

            <Text style={[styles.label,{marginTop:4}]}>동행인</Text>
            <Text style={[styles.muted,isDark&&{color:appearanceColors.muted}]}>나는 자동으로 포함돼요. 함께 갈 사람만 추가해 주세요.</Text>
            {newTripCompanions.map((name,index)=>(
              <View key={`${name}-${index}`} style={[styles.homePersonRow,isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border}]}>
                <View style={styles.flex}><Text style={styles.homePersonName}>{name}</Text></View>
                <Pressable onPress={()=>setNewTripCompanions(prev=>prev.filter((_,i)=>i!==index))} style={[styles.homePersonDeleteButton,isDark&&{backgroundColor:appearanceColors.dangerSurface,borderColor:appearanceColors.dangerBorder}]}>
                  <Text style={styles.homePersonDeleteText}>삭제</Text>
                </Pressable>
              </View>
            ))}
            <View style={[styles.homePersonAddRow,isCompact&&styles.stackOnCompact]}>
              <TextInput
                style={[styles.input,styles.flex]}
                value={newTripCompanionName}
                onChangeText={setNewTripCompanionName}
                onSubmitEditing={addNewTripCompanion}
                returnKeyType="done"
                placeholder="동행인 이름"
              />
              <Pressable onPress={addNewTripCompanion} style={[styles.homePersonAddButton,{backgroundColor:theme.accent}]}>
                <Text style={styles.homePersonAddButtonText}>추가</Text>
              </Pressable>
            </View>

            <Text style={styles.newTripHint}>
              여행 설정과 동행인을 한 번에 만들 수 있어요. 생성 후에도 홈에서 언제든 수정할 수 있어요.
            </Text>

            <Pressable
              onPress={createNewTripQuick}
              style={[styles.planSaveButton,{backgroundColor:theme.accent}]}
            >
              <Text style={styles.planSaveText}>여행 만들기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!planModalDate}
        transparent
        animationType="fade"
        onRequestClose={()=>setPlanModalDate(null)}
      >
        <View style={[styles.dateModalBackdrop,isDark&&{backgroundColor:appearanceColors.overlay}]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={()=>setPlanModalDate(null)}/>
          <View style={[styles.planModalCard,isDark&&{backgroundColor:appearanceColors.surface,borderColor:appearanceColors.border,borderWidth:1}]}>
            <View style={styles.planModalHeader}>
              <View>
                <Text style={styles.planModalTitle}>일정 추가</Text>
                <Text style={styles.planModalDate}>📅 {planModalDate}</Text>
              </View>
              <Pressable onPress={()=>setPlanModalDate(null)} style={[styles.dateModalClose,isDark&&{backgroundColor:appearanceColors.surface2}]}>
                <Text style={styles.dateModalCloseText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>일정 종류</Text>
            <View style={styles.planTypeRow}>
              {([
                ["flight","✈️ 항공"],
                ["hotel","🏨 숙소"],
                ["activity","📍 일정"]
              ] as [PlanType,string][]).map(([value,label])=>(
                <Pressable
                  key={value}
                  onPress={()=>setPlanType(value)}
                  style={[
                    styles.planTypeChip,
                    isDark&&{backgroundColor:appearanceColors.surface2,borderColor:appearanceColors.border},
                    planType===value && {backgroundColor:theme.accent,borderColor:theme.accent}
                  ]}
                >
                  <Text style={[styles.planTypeText,planType===value&&styles.planTypeTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Field
              label={planType==="flight" ? "항공편 / 이동 이름" : planType==="hotel" ? "숙소 이름" : "일정 이름"}
              value={planTitle}
              onChangeText={setPlanTitle}
              placeholder={planType==="flight" ? "예: 인천 → 오사카" : planType==="hotel" ? "예: 난바 호텔 체크인" : "예: 도톤보리 구경"}
            />
            <Field
              label="시간"
              value={planTime}
              onChangeText={setPlanTime}
              placeholder="예: 21:30"
            />
            <Field
              label="메모"
              value={planDetail}
              onChangeText={setPlanDetail}
              placeholder={planType==="flight" ? "예: KE721 · 인천공항 T2" : planType==="hotel" ? "예: 체크인 15:00" : "예: 예약번호 / 장소 메모"}
            />

            <Pressable
              onPress={savePlan}
              style={[styles.planSaveButton,{backgroundColor:theme.accent}]}
            >
              <Text style={styles.planSaveText}>일정 저장</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerMode!==null}
        value={
          datePickerMode==="newStart"
            ? (newTripStart || today())
            : datePickerMode==="newEnd"
              ? (newTripEnd || newTripStart || today())
              : datePickerMode==="start"
                ? (activeTrip.start || today())
                : datePickerMode==="end"
                  ? (activeTrip.end || activeTrip.start || today())
                  : date
        }
        title={
          datePickerMode==="newStart"
            ? "새 여행 출발일 선택"
            : datePickerMode==="newEnd"
              ? "새 여행 귀국일 선택"
              : datePickerMode==="start"
                ? "여행 시작일 선택"
                : datePickerMode==="end"
                  ? "여행 종료일 선택"
                  : "지출 날짜 선택"
        }
        accent={theme.accent}
        accentSoft={uiAccentSoft}
        onClose={()=>setDatePickerMode(null)}
        onSelect={applyPickedDate}
      />

      <View style={[styles.tabs,isDark&&{backgroundColor:appearanceColors.nav,borderColor:appearanceColors.border,borderWidth:1},isTiny&&styles.tabsTiny,{left:navInset,right:navInset,bottom:isTiny?5:isCompact?6:8}]}>
        <TabButton label="🏠 홈" active={tab==="home"} onPress={()=>setTab("home")}/>
        <TabButton label="＋ 지출" active={tab==="expense"} onPress={()=>{if(!editingId)resetForm();setExpenseView("add");setTab("expense");}}/>
        <TabButton label="🎮 게임" active={tab==="game"} onPress={()=>setTab("game")}/>
        <TabButton label="💸 정산" active={tab==="settle"} onPress={()=>setTab("settle")}/>
        <TabButton label="⚙️ 관리" active={tab==="manage"} onPress={()=>setTab("manage")}/>
      </View>
    </SafeAreaView>
  );
 }

export default function Index() {
  return <AppearanceProvider><IndexContent /></AppearanceProvider>;
}

function DatePickerModal({
  visible,
  value,
  title,
  accent,
  accentSoft,
  onClose,
  onSelect
}:{
  visible:boolean;
  value:string;
  title:string;
  accent:string;
  accentSoft:string;
  onClose:()=>void;
  onSelect:(date:string)=>void;
}) {
  const {isDark,colors} = useAppAppearance();
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
  const initial = new Date(`${safeDate}T12:00:00`);
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  useEffect(()=>{
    if (!visible) return;
    const d = new Date(`${safeDate}T12:00:00`);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [visible, safeDate]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cells:(number|null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({length:lastDay},(_,i)=>i+1)
  ];
  while (cells.length % 7) cells.push(null);

  const ymd = (day:number) =>
    `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  const todayValue = today();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.dateModalBackdrop,isDark&&{backgroundColor:colors.overlay}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
        <View style={[styles.dateModalCard,isDark&&{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1}]}>
          <View style={styles.dateModalHeader}>
            <View>
              <Text style={styles.dateModalTitle}>{title}</Text>
              <Text style={styles.dateModalSelected}>선택된 날짜 · {safeDate}</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.dateModalClose,isDark&&{backgroundColor:colors.surface2}]}>
              <Text style={styles.dateModalCloseText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.dateMonthRow}>
            <Pressable
              onPress={()=>setCursor(new Date(year,month-1,1))}
              style={[styles.dateArrowButton,isDark&&{backgroundColor:colors.surface2}]}
            >
              <Text style={styles.dateArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.dateMonthTitle}>{year}년 {month+1}월</Text>
            <Pressable
              onPress={()=>setCursor(new Date(year,month+1,1))}
              style={[styles.dateArrowButton,isDark&&{backgroundColor:colors.surface2}]}
            >
              <Text style={styles.dateArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.dateWeekRow}>
            {["일","월","화","수","목","금","토"].map((w,i)=>(
              <Text key={w} style={[styles.dateWeekText,i===0&&styles.dateSunday,i===6&&styles.dateSaturday]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.dateGrid}>
            {cells.map((day,i)=>{
              if (!day) return <View key={`blank-${i}`} style={styles.dateCell}/>;
              const dateValue = ymd(day);
              const selected = dateValue===safeDate;
              const isToday = dateValue===todayValue;
              return (
                <Pressable
                  key={dateValue}
                  onPress={()=>onSelect(dateValue)}
                  style={[
                    styles.dateCell,
                    selected && {backgroundColor:accent},
                    !selected && isToday && {backgroundColor:accentSoft}
                  ]}
                >
                  <Text
                    style={[
                      styles.dateCellText,
                      selected && styles.dateCellSelectedText,
                      !selected && isToday && {color:accent,fontWeight:"900"}
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={()=>onSelect(todayValue)}
            style={[styles.dateTodayButton,{backgroundColor:accentSoft}]}
          >
            <Text style={[styles.dateTodayText,{color:accent}]}>오늘 날짜 선택</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ManageGroup({
  title,
  subtitle,
  open,
  onPress,
  children,
  cardStyle
}:React.PropsWithChildren<{
  title:string;
  subtitle?:string;
  open:boolean;
  onPress:()=>void;
  cardStyle?:object;
}>){
  const {isDark,colors}=useAppAppearance();
  return (
    <View style={[styles.card,cardStyle,isDark&&{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1}]}>
      <Pressable onPress={onPress} style={styles.manageGroupHeader}>
        <View style={styles.flex}>
          <Text style={[styles.manageGroupTitle,isDark&&{color:colors.text}]}>{title}</Text>
          {!!subtitle && <Text style={[styles.manageGroupSubtitle,isDark&&{color:colors.muted}]}>{subtitle}</Text>}
        </View>
        <Text style={[styles.manageChevron,isDark&&{color:colors.muted}]}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open && <View style={styles.manageGroupBody}>{children}</View>}
    </View>
  );
}

function Card({
  title,
  children,
  cardStyle
}:React.PropsWithChildren<{title:string;cardStyle?:object}>){
  const {isDark,colors}=useAppAppearance();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, speed: 20, bounciness: 1, useNativeDriver: true }).start();
  }, [enter]);
  return (
    <Animated.View style={[styles.card,cardStyle,isDark&&{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1},{
      opacity: enter,
      transform:[
        { translateY: enter.interpolate({inputRange:[0,1],outputRange:[10,0]}) },
        { scale: enter.interpolate({inputRange:[0,1],outputRange:[0.992,1]}) },
      ],
    }]}>
      <Text style={styles.cardTitle}>{title}</Text>{children}
    </Animated.View>
  );
}
function Stat({label,value}:{label:string;value:string}){const {isDark,colors}=useAppAppearance();return <View style={[styles.stat,isDark&&{backgroundColor:colors.surface2}]}><Text numberOfLines={1} style={styles.muted}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.statValue}>{value}</Text></View>}
function Field(props:React.ComponentProps<typeof TextInput>&{label:string}){const{label,...rest}=props;const{isDark,colors}=useAppAppearance();return <View><Text style={styles.label}>{label}</Text><TextInput style={[styles.input,isDark&&{backgroundColor:colors.input,borderColor:colors.border}]} {...rest}/></View>}
function Chip({text,selected,onPress}:{text:string;selected:boolean;onPress:()=>void}){const{isDark,colors}=useAppAppearance();return <Pressable onPress={onPress} style={[styles.chip,isDark&&!selected&&{backgroundColor:colors.surface2,borderColor:colors.border,borderWidth:1},selected&&styles.chipSelected]}><Text style={selected?styles.chipSelectedText:undefined}>{text}</Text></Pressable>}
function Primary({text,onPress,full}:{text:string;onPress:()=>void;full?:boolean}){return <Pressable onPress={onPress} style={[styles.primary,full&&{width:"100%",marginTop:18}]}><Text style={styles.primaryText}>{text}</Text></Pressable>}
function TabButton({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){const{isDark}=useAppAppearance();return <Pressable onPress={onPress} style={[styles.tab,active&&styles.tabActive,isDark&&active&&{backgroundColor:"rgba(80,140,255,0.18)"}]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.tabText,active&&styles.bold]}>{label}</Text></Pressable>}

const styles=StyleSheet.create({
  sharedRoomBanner:{marginTop:14,borderRadius:18,borderWidth:1,padding:14},
  sharedRoomTitle:{fontSize:15,fontWeight:"900"},
  sharedRoomMeta:{fontSize:11,color:"#8589A5",fontWeight:"700",marginTop:5},
  sharedDivider:{height:1,backgroundColor:"rgba(130,135,160,0.18)",marginTop:18,marginBottom:14},
  sharedInviteInput:{minHeight:96,textAlignVertical:"top",paddingTop:12},
  sharedJoinButton:{marginTop:10,borderRadius:16,paddingVertical:14,alignItems:"center",justifyContent:"center"},
  sharedBetaNote:{fontSize:10,color:"#8589A5",fontWeight:"700",lineHeight:16,marginTop:10,textAlign:"center"},
  sharedLiveRow:{flexDirection:"row",alignItems:"center",gap:7,marginTop:10},
  sharedLiveDot:{width:8,height:8,borderRadius:4},
  sharedLiveText:{fontSize:11,fontWeight:"900",color:"#35384C"},
  sharedStatusText:{fontSize:10,fontWeight:"700",color:"#8589A5",marginTop:6,lineHeight:15},
  sharedActionRow:{flexDirection:"row",gap:8,marginTop:10},
  sharedSecondaryButton:{flex:1,borderWidth:1,borderRadius:14,paddingVertical:12,alignItems:"center",justifyContent:"center"},
  sharedSecondaryText:{fontSize:12,fontWeight:"900"},
  sharedCopyButton:{alignItems:"center",paddingVertical:10,marginTop:4},
  sharedCopyText:{fontSize:11,fontWeight:"900"},
  appHeader:{
    marginTop:8,marginBottom:4,minHeight:72,borderRadius:24,paddingVertical:10,
    flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"rgba(255,255,255,0.82)",
    borderWidth:1,borderColor:"rgba(255,255,255,0.7)",shadowColor:"#20234A",
    shadowOffset:{width:0,height:6},shadowOpacity:0.08,shadowRadius:16,elevation:3
  },
  appBrandIcon:{width:46,height:46,borderRadius:16,alignItems:"center",justifyContent:"center",borderWidth:1},
  appBrandEmoji:{fontSize:24},
  appBrandCopy:{flex:1,minWidth:0},
  appBrandName:{fontSize:20,fontWeight:"900",letterSpacing:-0.45},
  appBrandTagline:{fontSize:9.5,fontWeight:"700",color:"#8589A5",marginTop:2},
  appHeaderActions:{flexDirection:"row",alignItems:"center",gap:6},
  homeCompanionSubtitle:{fontSize:11,color:"#8589A5",lineHeight:17,marginTop:-7,marginBottom:12},
  tripSelectorShell:{borderRadius:18,padding:5,backgroundColor:"#F5F7FB",borderWidth:1,borderColor:"#ECEEF6"},
  homePeopleInlineCount:{fontSize:11,fontWeight:"900"},
  homePersonMetaRow:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap",marginTop:2},
  leaderBadge:{borderRadius:999,paddingHorizontal:7,paddingVertical:3},
  leaderBadgeText:{fontSize:8.5,fontWeight:"900"},
  motionBlob:{
    position:"absolute",
    width:260,
    height:260,
    borderRadius:999,
  },
  motionBlobTop:{
    top:-90,
    right:-105,
  },
  motionBlobBottom:{
    bottom:45,
    left:-125,
    width:300,
    height:300,
  },
  textureField:{
    ...StyleSheet.absoluteFill,
    opacity:0.22,
  },
  textureDot:{
    position:"absolute",
    width:3,
    height:3,
    borderRadius:999,
    opacity:0.22,
  },
  budgetSummaryRow:{
    flexDirection:"row",
    gap:10,
  },
  budgetSummaryBox:{
    flex:1,
    minWidth:0,
    borderRadius:18,
    paddingHorizontal:14,
    paddingVertical:13,
    backgroundColor:"#F7F8FC",
  },
  analyticsLabel:{fontSize:12,fontWeight:"700",color:"#888DA6"},
  analyticsBig:{marginTop:5,fontSize:20,fontWeight:"900",color:"#20233B",letterSpacing:-0.4},
  budgetEditRow:{flexDirection:"row",gap:8,alignItems:"center",marginTop:12},
  budgetSaveButton:{paddingHorizontal:14,minHeight:48,borderRadius:15,alignItems:"center",justifyContent:"center"},
  budgetSaveText:{fontSize:13,fontWeight:"900",color:"#FFFFFF"},
  analyticsProgressHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:16,marginBottom:7},
  analyticsPercent:{fontSize:13,fontWeight:"900"},
  analyticsTrack:{height:9,borderRadius:999,overflow:"hidden"},
  analyticsFill:{height:"100%",borderRadius:999},
  analyticsMiniGrid:{flexDirection:"row",gap:8,marginTop:14},
  analyticsMiniBox:{flex:1,minWidth:0,padding:11,borderRadius:15,backgroundColor:"#F7F8FC"},
  analyticsMiniLabel:{fontSize:11,fontWeight:"700",color:"#9094AA"},
  analyticsMiniValue:{marginTop:4,fontSize:13,fontWeight:"900",color:"#282B42"},
  analyticsDivider:{height:1,backgroundColor:"#EEF0F6",marginVertical:16},
  analyticsSectionHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10},
  analyticsSectionTitle:{fontSize:15,fontWeight:"900",color:"#24263D"},
  categoryAnalyticsRow:{marginBottom:11},
  categoryAnalyticsTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:6},
  categoryAnalyticsName:{fontSize:13,fontWeight:"800",color:"#34374E"},
  categoryAnalyticsAmount:{fontSize:12,fontWeight:"700",color:"#7D8199"},
  categoryTrack:{height:7,borderRadius:999,overflow:"hidden"},
  categoryFill:{height:"100%",borderRadius:999},
  analyticsFootnote:{marginTop:4,fontSize:11,lineHeight:17,fontWeight:"600",color:"#999DB0"},
  safe:{
    flex:1,
    backgroundColor:"#F4F6FC"
  },
  center:{
    flex:1,
    alignItems:"center",
    justifyContent:"center"
  },
  header:{
    marginHorizontal:14,
    marginTop:8,
    marginBottom:4,
    paddingHorizontal:15,
    paddingVertical:13,
    borderRadius:22,
    backgroundColor:"#FFFFFF",
    flexDirection:"row",
    alignItems:"center",
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:6},
    shadowOpacity:0.08,
    shadowRadius:16,
    elevation:3
  },
  brandMark:{
    width:44,
    height:44,
    borderRadius:15,
    backgroundColor:"#5C5CE2",
    alignItems:"center",
    justifyContent:"center"
  },
  brandEmoji:{
    fontSize:22
  },
  headerTextWrap:{
    flex:1,
    marginLeft:11
  },
  logo:{
    fontSize:22,
    fontWeight:"900",
    letterSpacing:-0.6,
    color:"#1B1D3A"
  },
  headerSubtitle:{
    marginTop:2,
    fontSize:12,
    fontWeight:"600",
    color:"#8488A8"
  },
  versionPill:{paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:"#F0F0FF",borderWidth:1,borderColor:"transparent"},
  version:{
    fontSize:11,
    color:"#5C5CE2",
    fontWeight:"900",
    letterSpacing:0.2
  },
  content:{
    padding:14,
    paddingTop:10,
    paddingBottom:112
  },
  card:{
    backgroundColor:"#FFFFFF",
    borderRadius:22,
    padding:17,
    marginBottom:13,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:5},
    shadowOpacity:0.07,
    shadowRadius:18,
    elevation:2
  },
  cardTitle:{
    fontSize:18,
    fontWeight:"800",
    letterSpacing:-0.22,
    lineHeight:24,
    marginBottom:13,
    color:"#1B1D3A"
  },
  label:{
    fontSize:12,
    color:"#777C9D",
    fontWeight:"800",
    marginTop:11,
    marginBottom:7
  },
  rateModeRow:{
    flexDirection:"row",
    gap:8,
    marginBottom:2
  },
  rateModeButton:{
    flex:1,
    minHeight:42,
    borderWidth:1,
    borderColor:"#E4E6F2",
    borderRadius:14,
    alignItems:"center",
    justifyContent:"center",
    backgroundColor:"#FFFFFF",
    paddingHorizontal:10
  },
  rateModeText:{
    fontSize:12,
    fontWeight:"900",
    color:"#686D8C"
  },
  rateStatus:{
    marginTop:9,
    borderRadius:15,
    padding:11,
    flexDirection:"row",
    alignItems:"center",
    gap:8
  },
  rateStatusCopy:{
    flex:1
  },
  rateStatusTitle:{
    fontSize:12,
    fontWeight:"900"
  },
  rateStatusMeta:{
    marginTop:3,
    color:"#737895",
    fontSize:10,
    lineHeight:15
  },
  rateRefresh:{
    borderWidth:1,
    borderRadius:11,
    paddingHorizontal:9,
    paddingVertical:8,
    backgroundColor:"#FFFFFF"
  },
  rateRefreshText:{
    fontSize:10,
    fontWeight:"900"
  },
  rateError:{
    marginTop:7,
    color:"#D84D5D",
    fontSize:11,
    lineHeight:16,
    fontWeight:"700"
  },
  helper:{
    fontSize:12,
    color:"#8A8EAA",
    marginTop:7,
    lineHeight:18
  },
  input:{
    borderWidth:1,
    borderColor:"#E4E6F2",
    borderRadius:15,
    paddingHorizontal:14,
    paddingVertical:13,
    backgroundColor:"#FAFBFF",
    fontSize:16,
    fontWeight:"600",
    color:"#20223F"
  },
  muted:{
    color:"#8589A5",
    fontSize:13,
    lineHeight:19
  },
  bold:{
    fontWeight:"900",
    color:"#20223F"
  },
  heroCard:{
    backgroundColor:"#20234A",
    borderRadius:26,
    padding:18,
    marginBottom:13,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:8},
    shadowOpacity:0.18,
    shadowRadius:18,
    elevation:5
  },
  heroTop:{
    flexDirection:"row",
    alignItems:"flex-start",
    justifyContent:"space-between",
    gap:10
  },
  heroEyebrow:{
    color:"#C9CBFF",
    fontSize:12,
    fontWeight:"800",
    marginBottom:4
  },
  hero:{
    fontSize:31,
    fontWeight:"900",
    letterSpacing:-1,
    color:"#FFFFFF"
  },
  heroTiny:{
    fontSize:27,
    letterSpacing:-0.7
  },
  heroBadge:{
    paddingHorizontal:10,
    paddingVertical:7,
    borderRadius:999,
    backgroundColor:"rgba(255,255,255,0.12)"
  },
  heroBadgeText:{
    color:"#FFFFFF",
    fontSize:11,
    fontWeight:"800"
  },
  heroDivider:{
    height:1,
    backgroundColor:"rgba(255,255,255,0.12)",
    marginVertical:15
  },
  row:{
    flexDirection:"row",
    alignItems:"center",
    gap:10,
    marginTop:10
  },
  rowBetween:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10
  },
  two:{
    flexDirection:"row",
    gap:9,
    marginTop:8
  },
  flex:{flex:1,minWidth:0},
  stat:{
    flex:1,
    backgroundColor:"#F6F7FD",
    padding:12,
    borderRadius:16
  },
  statValue:{
    fontSize:16,
    color:"#20223F",
    fontWeight:"900",
    marginTop:4,
    letterSpacing:-0.2
  },
  primary:{
    backgroundColor:"#5C5CE2",
    borderRadius:15,
    paddingHorizontal:16,
    paddingVertical:13,
    alignItems:"center",
    shadowColor:"#5C5CE2",
    shadowOffset:{width:0,height:4},
    shadowOpacity:0.2,
    shadowRadius:8,
    elevation:2
  },
  primaryText:{
    color:"#FFFFFF",
    fontWeight:"900",
    letterSpacing:-0.1
  },
  listRow:{
    minHeight:50,
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:"#ECEEF6",
    paddingVertical:10,
    gap:10
  },
  meBadge:{
    color:"#4C4CC7",
    backgroundColor:"#EEEEFF",
    fontSize:11,
    fontWeight:"900",
    paddingHorizontal:9,
    paddingVertical:5,
    borderRadius:999
  },
  expense:{
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:"#ECEEF6",
    paddingVertical:13
  },
  danger:{
    color:"#E15467",
    fontWeight:"800"
  },
  good:{
    color:"#189B75",
    fontWeight:"900"
  },
  chips:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:8,
    marginBottom:4
  },
  chip:{
    backgroundColor:"#F0F2F8",
    paddingHorizontal:13,
    paddingVertical:10,
    borderRadius:999
  },
  chipSelected:{
    backgroundColor:"#5C5CE2"
  },
  chipSelectedText:{
    color:"#FFFFFF",
    fontWeight:"900"
  },
  link:{
    color:"#5C5CE2",
    fontWeight:"900",
    fontSize:13
  },
  dateBanner:{
    fontSize:13,
    fontWeight:"900",
    color:"#4D50B8",
    backgroundColor:"#EFEFFF",
    padding:11,
    borderRadius:13,
    marginBottom:5
  },
  newTripModalCard:{
    width:"100%",
    maxWidth:560,
    alignSelf:"center",
    backgroundColor:"#FFFFFF",
    borderRadius:26,
    padding:18,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:10},
    shadowOpacity:0.18,
    shadowRadius:24,
    elevation:12
  },
  newTripHint:{
    marginTop:12,
    fontSize:11,
    lineHeight:17,
    color:"#8A8EAA"
  },
  planModalCard:{
    width:"100%",
    maxWidth:560,
    alignSelf:"center",
    backgroundColor:"#FFFFFF",
    borderRadius:26,
    padding:18,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:10},
    shadowOpacity:0.18,
    shadowRadius:24,
    elevation:12
  },
  planModalHeader:{
    flexDirection:"row",
    alignItems:"flex-start",
    justifyContent:"space-between"
  },
  planModalTitle:{
    fontSize:20,
    fontWeight:"900",
    color:"#1B1D3A"
  },
  planModalDate:{
    marginTop:4,
    fontSize:12,
    color:"#7C809B",
    fontWeight:"700"
  },
  planTypeRow:{
    flexDirection:"row",
    gap:8
  },
  planTypeChip:{
    flex:1,
    borderWidth:1,
    borderColor:"#E5E7F0",
    backgroundColor:"#F7F8FC",
    borderRadius:14,
    paddingVertical:11,
    alignItems:"center"
  },
  planTypeText:{
    fontSize:12,
    fontWeight:"900",
    color:"#666A83"
  },
  planTypeTextActive:{
    color:"#FFFFFF"
  },
  planSaveButton:{
    marginTop:18,
    borderRadius:15,
    paddingVertical:14,
    alignItems:"center"
  },
  planSaveText:{
    color:"#FFFFFF",
    fontSize:14,
    fontWeight:"900"
  },
  dateSelectButton:{
    minHeight:50,
    borderWidth:1.5,
    borderRadius:15,
    paddingHorizontal:13,
    backgroundColor:"#FAFBFF",
    flexDirection:"row",
    alignItems:"center",
    gap:8
  },
  dateSelectIcon:{
    fontSize:17
  },
  dateSelectText:{
    flex:1,
    fontSize:14,
    fontWeight:"800",
    color:"#20223F"
  },
  datePlaceholder:{
    color:"#9A9DB0",
    fontWeight:"700"
  },
  dateSelectChange:{
    fontSize:11,
    fontWeight:"900"
  },
  dateModalBackdrop:{
    flex:1,
    justifyContent:"center",
    paddingHorizontal:18,
    backgroundColor:"rgba(25,27,48,0.38)"
  },
  dateModalCard:{
    width:"100%",
    maxWidth:560,
    alignSelf:"center",
    backgroundColor:"#FFFFFF",
    borderRadius:26,
    padding:18,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:10},
    shadowOpacity:0.18,
    shadowRadius:24,
    elevation:12
  },
  dateModalHeader:{
    flexDirection:"row",
    alignItems:"flex-start",
    justifyContent:"space-between",
    gap:10
  },
  dateModalTitle:{
    fontSize:18,
    fontWeight:"900",
    color:"#1B1D3A"
  },
  dateModalSelected:{
    marginTop:4,
    fontSize:11,
    color:"#8A8EAA",
    fontWeight:"700"
  },
  dateModalClose:{
    width:34,
    height:34,
    borderRadius:17,
    backgroundColor:"#F2F3F8",
    alignItems:"center",
    justifyContent:"center"
  },
  dateModalCloseText:{
    fontSize:14,
    color:"#74788F",
    fontWeight:"900"
  },
  dateMonthRow:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    marginTop:18,
    marginBottom:12
  },
  dateArrowButton:{
    width:38,
    height:38,
    borderRadius:14,
    backgroundColor:"#F5F6FA",
    alignItems:"center",
    justifyContent:"center"
  },
  dateArrowText:{
    fontSize:26,
    lineHeight:28,
    color:"#343752",
    fontWeight:"700"
  },
  dateMonthTitle:{
    fontSize:16,
    fontWeight:"900",
    color:"#20223F"
  },
  dateWeekRow:{
    flexDirection:"row",
    marginBottom:4
  },
  dateWeekText:{
    width:"14.2857%",
    textAlign:"center",
    fontSize:11,
    fontWeight:"800",
    color:"#84889F",
    paddingVertical:6
  },
  dateSunday:{color:"#E06C78"},
  dateSaturday:{color:"#4B79C6"},
  dateGrid:{
    flexDirection:"row",
    flexWrap:"wrap"
  },
  dateCell:{
    width:"14.2857%",
    aspectRatio:1,
    borderRadius:999,
    alignItems:"center",
    justifyContent:"center",
    marginVertical:2
  },
  dateCellText:{
    fontSize:13,
    fontWeight:"700",
    color:"#30334D"
  },
  dateCellSelectedText:{
    color:"#FFFFFF",
    fontWeight:"900"
  },
  dateTodayButton:{
    marginTop:14,
    borderRadius:14,
    paddingVertical:12,
    alignItems:"center"
  },
  dateTodayText:{
    fontSize:12,
    fontWeight:"900"
  },
  todayEmpty:{
    flexDirection:"row",
    alignItems:"center",
    gap:11,
    paddingVertical:4
  },
  todayIconBox:{
    width:46,
    height:46,
    borderRadius:15,
    alignItems:"center",
    justifyContent:"center"
  },
  todayIcon:{fontSize:22},
  todayEmptyTitle:{
    fontSize:13,
    fontWeight:"900",
    color:"#292C48",
    marginBottom:2
  },
  todayPlanRow:{
    minHeight:58,
    flexDirection:"row",
    alignItems:"center",
    gap:10,
    paddingVertical:8,
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:"#ECEEF6"
  },
  todayTimeBox:{
    minWidth:58,
    paddingHorizontal:8,
    paddingVertical:8,
    borderRadius:12,
    alignItems:"center"
  },
  todayTime:{fontSize:10,fontWeight:"900"},
  todayPlanTitle:{fontSize:13,fontWeight:"900",color:"#20223F"},
  todayPlanDetail:{marginTop:3,fontSize:10,color:"#8589A5"},
  todayAddButton:{
    marginTop:11,
    minHeight:40,
    borderRadius:13,
    alignItems:"center",
    justifyContent:"center"
  },
  todayAddText:{fontSize:11,fontWeight:"900"},
  manageGroupHeader:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    minHeight:50
  },
  manageGroupTitle:{fontSize:16,fontWeight:"900",color:"#1B1D3A"},
  manageGroupSubtitle:{
    marginTop:3,
    fontSize:10,
    lineHeight:15,
    color:"#8A8EAA"
  },
  manageChevron:{
    marginLeft:10,
    fontSize:18,
    fontWeight:"900",
    color:"#8A8EAA"
  },
  manageGroupBody:{paddingTop:10},
  segmentWrap:{
    flexDirection:"row",
    padding:4,
    borderRadius:18,
    marginBottom:13
  },
  segmentButton:{
    flex:1,
    minHeight:42,
    borderRadius:14,
    alignItems:"center",
    justifyContent:"center"
  },
  segmentText:{
    fontSize:12,
    fontWeight:"900",
    color:"#6E728D"
  },
  segmentTextActive:{
    color:"#FFFFFF"
  },
  homeTripDivider:{
    height:StyleSheet.hairlineWidth,
    backgroundColor:"#ECEEF6",
    marginVertical:14
  },
  homeTripSectionHeader:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10
  },
  homeTripSectionTitle:{
    fontSize:14,
    fontWeight:"900",
    color:"#20223F"
  },
  homeTripActionHint:{
    marginTop:2,
    fontSize:10,
    lineHeight:15,
    color:"#8A8EAA"
  },
  homePeopleCount:{
    paddingHorizontal:9,
    paddingVertical:5,
    borderRadius:999
  },
  homePeopleCountText:{
    fontSize:10,
    fontWeight:"900"
  },
  homePeopleList:{
    marginTop:10,
    gap:4
  },
  homePersonRow:{
    minHeight:70,flexDirection:"row",alignItems:"center",gap:11,paddingVertical:10,paddingHorizontal:11,
    borderWidth:1,borderColor:"#ECEEF6",backgroundColor:"#F9FAFD",borderRadius:17,marginBottom:7
  },
  avatarButton:{
    width:44,
    height:44,
    borderRadius:22,
    alignItems:"center",
    justifyContent:"center",
    overflow:"hidden"
  },
  avatarImage:{
    width:"100%",
    height:"100%"
  },
  avatarInitial:{
    fontSize:17,
    fontWeight:"900"
  },
  homePersonName:{
    flexShrink:1,
    fontSize:13,
    fontWeight:"900",
    color:"#30334D"
  },
  homePersonPhotoHint:{
    marginTop:2,
    fontSize:10,
    color:"#8A8EAA",
    fontWeight:"700"
  },
  homePersonDeleteButton:{minWidth:54,minHeight:38,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:"#FFF2F4",borderWidth:1,borderColor:"#F3D7DC",paddingHorizontal:10},
  homePersonDeleteText:{
    color:"#D94B5C",
    fontSize:10,
    fontWeight:"900"
  },
  homePersonAddRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:8,
    marginTop:10
  },
  homePersonAddButton:{
    minWidth:64,
    minHeight:48,
    borderRadius:14,
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:12
  },
  homePersonAddButtonText:{
    color:"#FFFFFF",
    fontSize:12,
    fontWeight:"900"
  },
  homeTripDeleteButton:{
    minHeight:42,
    borderRadius:13,
    borderWidth:1,
    borderColor:"#F0C9CE",
    backgroundColor:"#FFF6F7",
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:12
  },
  homeTripDeleteConfirm:{
    backgroundColor:"#FFE8EB",
    borderColor:"#E15467"
  },
  homeTripDeleteText:{
    color:"#D94B5C",
    fontSize:11,
    fontWeight:"900"
  },
  homeTripDeleteConfirmText:{
    color:"#C73549",
    fontSize:11,
    fontWeight:"900"
  },
  profileEditorRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:14,
    marginBottom:8
  },
  profileAvatarButton:{
    width:76,
    height:76,
    borderRadius:38,
    alignItems:"center",
    justifyContent:"center",
    overflow:"hidden"
  },
  profileAvatarImage:{
    width:"100%",
    height:"100%"
  },
  profileAvatarInitial:{
    fontSize:28,
    fontWeight:"900"
  },
  profilePhotoTitle:{
    fontSize:14,
    fontWeight:"900",
    color:"#20223F"
  },
  profilePhotoHint:{
    marginTop:3,
    color:"#8A8EAA",
    fontSize:10,
    lineHeight:15
  },
  profilePhotoActions:{
    flexDirection:"row",
    alignItems:"center",
    gap:8,
    marginTop:9
  },
  profilePhotoAction:{
    minHeight:34,
    borderWidth:1,
    borderRadius:11,
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:11
  },
  profilePhotoActionText:{
    fontSize:10,
    fontWeight:"900"
  },
  profilePhotoRemove:{
    minHeight:34,
    borderRadius:11,
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:10,
    backgroundColor:"#FFF2F4"
  },
  profilePhotoRemoveText:{
    color:"#D94B5C",
    fontSize:10,
    fontWeight:"900"
  },
  homeExpenseRow:{
    minHeight:56,
    flexDirection:"row",
    alignItems:"center",
    gap:10,
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:"#ECEEF6",
    paddingVertical:10
  },
  homeExpenseAmount:{
    maxWidth:"42%",
    fontSize:14,
    fontWeight:"900",
    color:"#20223F"
  },
  homeQuickRow:{
    flexDirection:"row",
    gap:9,
    marginTop:13
  },
  homeQuickButton:{
    flex:1,
    minHeight:44,
    borderRadius:14,
    alignItems:"center",
    justifyContent:"center"
  },
  homeQuickButtonPrimary:{
    color:"#FFFFFF",
    fontSize:12,
    fontWeight:"900"
  },
  homeQuickButtonSecondary:{
    fontSize:12,
    fontWeight:"900"
  },
  manageIntro:{
    paddingHorizontal:4,
    paddingTop:2,
    paddingBottom:14
  },
  manageTitle:{
    fontSize:24,
    fontWeight:"900",
    letterSpacing:-0.5,
    color:"#1B1D3A"
  },
  manageSubtitle:{
    marginTop:5,
    fontSize:12,
    lineHeight:18,
    color:"#8589A5",
    fontWeight:"700"
  },
  tabs:{
    position:"absolute",
    left:10,
    right:10,
    bottom:8,
    flexDirection:"row",
    backgroundColor:"#FFFFFF",
    padding:6,
    borderRadius:22,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:7},
    shadowOpacity:0.14,
    shadowRadius:18,
    elevation:8
  },
  tabsTiny:{
    padding:4,
    borderRadius:19
  },
  tab:{
    flex:1,
    alignItems:"center",
    justifyContent:"center",
    paddingVertical:11,
    paddingHorizontal:2,
    borderRadius:16
  },
  tabActive:{
    backgroundColor:"#EEEEFF"
  },
  tabText:{
    color:"#8A8EAA",
    fontSize:10.5,
    fontWeight:"800"
  },
  tripRow:{
    flexDirection:"row",
    gap:9,
    alignItems:"center"
  },
  tripItemWrap:{
    alignItems:"center",
    gap:5
  },
  tripChip:{
    backgroundColor:"#F1F2F8",
    paddingHorizontal:13,
    paddingVertical:10,
    borderRadius:999
  },
  tripChipActive:{
    backgroundColor:"#5C5CE2"
  },
  tripChipActiveText:{
    color:"#FFFFFF",
    fontWeight:"900"
  },
  tripDeleteButton:{
    paddingHorizontal:12,
    paddingVertical:7,
    borderRadius:999,
    backgroundColor:"#FFF0F2",
    minWidth:52,
    alignItems:"center"
  },
  tripDeleteText:{
    fontSize:11,
    fontWeight:"900",
    color:"#E15467"
  },
  tripDeleteConfirmButton:{
    backgroundColor:"#E15467"
  },
  tripDeleteConfirmText:{color:"#FFFFFF"},
  selectedTripDelete:{
    marginTop:14,
    width:"100%",
    paddingVertical:13,
    borderRadius:15,
    backgroundColor:"#FFF0F2",
    alignItems:"center"
  },
  selectedTripDeleteText:{
    color:"#E15467",
    fontWeight:"900",
    fontSize:13
  },
  selectedTripDeleteConfirm:{
    backgroundColor:"#E15467"
  },
  selectedTripDeleteConfirmText:{color:"#FFFFFF"},

  topUtility:{
    minHeight:42,
    marginHorizontal:0,
    marginTop:6,
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"flex-end",
    gap:8
  },
  decorateShortcut:{paddingHorizontal:10,paddingVertical:7,borderRadius:999,borderWidth:1,borderColor:"transparent"},
  decorateShortcutText:{
    fontSize:11,
    fontWeight:"900"
  },
  themeGrid:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:10
  },
  themeOption:{
    width:"47%",
    minHeight:78,
    borderRadius:16,
    padding:10,
    borderWidth:1,
    borderColor:"#ECEEF6",
    position:"relative"
  },
  themeDot:{
    width:18,
    height:18,
    borderRadius:9,
    marginBottom:5
  },
  themeEmoji:{
    position:"absolute",
    right:10,
    top:8,
    fontSize:18
  },
  themeName:{
    fontSize:14,
    fontWeight:"900",
    color:"#20223F"
  },
  themeSelected:{
    fontSize:10,
    fontWeight:"900",
    marginTop:4
  },
  decorSectionTitle:{
    marginTop:14,
    marginBottom:7,
    fontSize:13,
    fontWeight:"900",
    color:"#353753"
  },
  decorChoiceRow:{
    flexDirection:"row",
    gap:8
  },
  decorChoice:{
    flex:1,
    minHeight:60,
    borderRadius:16,
    borderWidth:1,
    borderColor:"#E9EAF2",
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:6
  },
  cardPreview:{
    flex:1,
    minHeight:82,
    backgroundColor:"#FFFFFF",
    borderWidth:1,
    borderColor:"#E9EAF2",
    alignItems:"center",
    justifyContent:"center",
    paddingHorizontal:6,
    shadowColor:"#20234A",
    shadowOffset:{width:0,height:5},
    shadowRadius:12
  },
  decorChoiceEmoji:{
    fontSize:18,
    marginBottom:3
  },
  decorChoiceText:{
    fontSize:11,
    fontWeight:"900",
    color:"#5B5F7D",
    textAlign:"center"
  },
  stackOnCompact:{
    flexDirection:"column",
    alignItems:"stretch"
  },
  themeOptionCompact:{
    width:"100%"
  },
  checkProgressRow:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between"
  },
  checkReset:{fontSize:11,fontWeight:"800"},
  checkProgressTrack:{height:7,borderRadius:99,overflow:"hidden",marginTop:9,marginBottom:12},
  checkProgressFill:{height:"100%",borderRadius:99},
  checkList:{gap:7},
  checkItemRow:{
    flexDirection:"row",alignItems:"center",minHeight:45,backgroundColor:"#F8F9FC",
    borderRadius:13,paddingHorizontal:10,paddingVertical:7
  },
  checkBox:{
    width:24,height:24,borderRadius:8,borderWidth:1.5,borderColor:"#CDD0DE",
    alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF"
  },
  checkBoxText:{color:"#FFFFFF",fontSize:14,fontWeight:"900"},
  checkTextWrap:{flex:1,paddingHorizontal:10,paddingVertical:4},
  checkItemText:{fontSize:13,fontWeight:"700",color:"#353753"},
  checkItemDone:{textDecorationLine:"line-through",color:"#9A9DAF"},
  checkDelete:{paddingHorizontal:5,paddingVertical:7},
  checkDeleteText:{fontSize:10,fontWeight:"800",color:"#E15467"},
  checkAddRow:{flexDirection:"row",gap:8,marginTop:12},
  checkInput:{
    flex:1,minHeight:44,borderRadius:13,borderWidth:1,borderColor:"#E2E4ED",
    backgroundColor:"#FFFFFF",paddingHorizontal:11,fontSize:12,color:"#20223F"
  },
  checkAddButton:{minWidth:62,borderRadius:13,alignItems:"center",justifyContent:"center",paddingHorizontal:12},
  checkAddButtonText:{color:"#FFFFFF",fontSize:12,fontWeight:"900"},
  primaryButton:{
    paddingVertical:13,
    borderRadius:15,
    alignItems:"center"
  },
  primaryButtonText:{
    color:"#FFFFFF",
    fontSize:13,
    fontWeight:"900"
  },

  emptyText:{
    fontSize:12,
    lineHeight:18,
    color:"#8D91A7",
    textAlign:"center",
    paddingVertical:12
  },
  secondaryWideButton:{
    marginTop:9,
    paddingVertical:13,
    borderRadius:15,
    borderWidth:1.5,
    alignItems:"center",
    backgroundColor:"#FFFFFF"
  },
  secondaryWideButtonText:{
    fontSize:13,
    fontWeight:"900"
  },
  restoreBox:{
    marginTop:12,
    padding:12,
    borderRadius:16
  },
  restoreGuide:{
    fontSize:11,
    lineHeight:17,
    color:"#676B87",
    marginBottom:8
  },
  restoreInput:{
    minHeight:130,
    maxHeight:220,
    backgroundColor:"#FFFFFF",
    borderRadius:13,
    borderWidth:1,
    borderColor:"#E3E5EE",
    paddingHorizontal:11,
    paddingVertical:10,
    fontSize:11,
    color:"#20223F",
    textAlignVertical:"top"
  },
  restoreButton:{
    marginTop:9,
    paddingVertical:13,
    borderRadius:13,
    alignItems:"center"
  },
  backupNote:{
    marginTop:10,
    fontSize:10,
    lineHeight:15,
    color:"#9699AB"
  },
});
