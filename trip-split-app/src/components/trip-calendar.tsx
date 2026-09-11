import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Expense, Person } from "../types";

export type TripPlan = {
  id: string;
  date: string;
  type: "flight" | "hotel" | "activity";
  title: string;
  time?: string;
  detail?: string;
};

type Props = {
  expenses: Expense[];
  people: Person[];
  initialDate?: string;
  startDate?: string;
  endDate?: string;
  plans?: TripPlan[];
  accent?: string;
  accentSoft?: string;
  onAddForDate: (date: string) => void;
  onAddPlan?: (date: string) => void;
  onDeletePlan?: (id: string) => void;
};

const won = (value: number) =>
  `${Math.round(value || 0).toLocaleString("ko-KR")}원`;

const pad = (n: number) => String(n).padStart(2, "0");

function keyOf(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function dayDiff(from?: string, to?: string) {
  if (!from || !to) return null;
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.floor((b-a)/86400000);
}

function planIcon(type:TripPlan["type"]) {
  if (type==="flight") return "✈️";
  if (type==="hotel") return "🏨";
  return "📍";
}

function planLabel(type:TripPlan["type"]) {
  if (type==="flight") return "항공";
  if (type==="hotel") return "숙소";
  return "일정";
}

export default function TripCalendar({
  expenses,
  people,
  initialDate,
  startDate,
  endDate,
  plans = [],
  accent = "#5C5CE2",
  accentSoft = "#EEEEFF",
  onAddForDate,
  onAddPlan,
  onDeletePlan,
}: Props) {
  const initial = initialDate
    ? new Date(`${initialDate}T12:00:00`)
    : new Date();

  const [cursor, setCursor] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().slice(0, 10)
  );

  useEffect(()=>{
    if (!initialDate) return;
    const d = new Date(`${initialDate}T12:00:00`);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(initialDate);
  }, [initialDate]);

  const expenseMap = useMemo(() => {
    const map: Record<string,{ total:number; count:number }> = {};
    expenses.forEach((expense) => {
      if (!map[expense.date]) map[expense.date] = { total:0, count:0 };
      map[expense.date].total += expense.krwAmount;
      map[expense.date].count += 1;
    });
    return map;
  }, [expenses]);

  const planMap = useMemo(() => {
    const map:Record<string,TripPlan[]> = {};
    plans.forEach(plan=>{
      if (!map[plan.date]) map[plan.date]=[];
      map[plan.date].push(plan);
    });
    Object.values(map).forEach(items=>{
      items.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
    });
    return map;
  }, [plans]);

  const selectedExpenses = useMemo(
    () => expenses.filter((e) => e.date === selectedDate),
    [expenses, selectedDate]
  );
  const selectedPlans = useMemo(
    () => planMap[selectedDate] || [],
    [planMap, selectedDate]
  );

  const selectedTotal = useMemo(
    () => selectedExpenses.reduce((sum, e) => sum + e.krwAmount, 0),
    [selectedExpenses]
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = Array.from({ length:42 }, (_,index)=>{
    let cellYear=year;
    let cellMonth=month;
    let day=0;
    let otherMonth=false;

    if (index < firstDay) {
      day = prevMonthDays - firstDay + index + 1;
      cellMonth -= 1;
      otherMonth = true;
      if (cellMonth < 0) {
        cellMonth=11;
        cellYear -= 1;
      }
    } else if (index >= firstDay + daysInMonth) {
      day = index - (firstDay + daysInMonth) + 1;
      cellMonth += 1;
      otherMonth = true;
      if (cellMonth > 11) {
        cellMonth=0;
        cellYear += 1;
      }
    } else {
      day = index-firstDay+1;
    }

    const date=keyOf(cellYear,cellMonth,day);
    return {date,day,otherMonth,info:expenseMap[date],plans:planMap[date]||[]};
  });

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`);
  const weekNames = ["일","월","화","수","목","금","토"];

  const selectedTripDay = startDate && selectedDate >= startDate && (!endDate || selectedDate <= endDate)
    ? (dayDiff(startDate,selectedDate) ?? 0) + 1
    : null;

  function moveMonth(delta:number) {
    setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+delta,1));
  }

  function inTripRange(date:string) {
    if (!startDate) return false;
    if (!endDate) return date===startDate;
    return date>=startDate && date<=endDate;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{year}년 {month+1}월</Text>
          <Text style={styles.helper}>
            {startDate && endDate
              ? `${startDate.replace(/-/g,".")} ~ ${endDate.replace(/-/g,".")}`
              : "여행 날짜를 선택하면 일정이 달력에 표시돼요."}
          </Text>
        </View>
        <View style={styles.nav}>
          <Pressable style={styles.navButton} onPress={()=>moveMonth(-1)}>
            <Text style={styles.navText}>‹</Text>
          </Pressable>
          <Pressable style={styles.navButton} onPress={()=>moveMonth(1)}>
            <Text style={styles.navText}>›</Text>
          </Pressable>
        </View>
      </View>

      {Boolean(startDate && endDate) && (
        <View style={[styles.bookingSummary,{backgroundColor:accentSoft}]}>
          <View style={styles.bookingDate}>
            <Text style={[styles.bookingLabel,{color:accent}]}>출발</Text>
            <Text style={styles.bookingValue}>{startDate!.slice(5).replace("-","/")}</Text>
          </View>
          <View style={styles.bookingLine}>
            <View style={[styles.bookingDot,{backgroundColor:accent}]}/>
            <View style={[styles.bookingTrack,{backgroundColor:accent}]}/>
            <Text style={styles.bookingNights}>
              {Math.max(0,dayDiff(startDate!,endDate!) ?? 0)}박
            </Text>
            <View style={[styles.bookingTrack,{backgroundColor:accent}]}/>
            <View style={[styles.bookingDot,{backgroundColor:accent}]}/>
          </View>
          <View style={[styles.bookingDate,{alignItems:"flex-end"}]}>
            <Text style={[styles.bookingLabel,{color:accent}]}>귀국</Text>
            <Text style={styles.bookingValue}>{endDate!.slice(5).replace("-","/")}</Text>
          </View>
        </View>
      )}

      <View style={styles.weekRow}>
        {weekNames.map((name,i)=>(
          <Text
            key={name}
            style={[
              styles.weekText,
              i===0&&styles.sunday,
              i===6&&styles.saturday
            ]}
          >{name}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map(cell=>{
          const selected=cell.date===selectedDate;
          const range=inTripRange(cell.date);
          const tripDay = range && startDate ? (dayDiff(startDate,cell.date) ?? 0)+1 : null;
          const isStart=cell.date===startDate;
          const isEnd=cell.date===endDate;

          return (
            <Pressable
              key={cell.date}
              style={[
                styles.day,
                cell.otherMonth&&styles.otherMonth,
                range&&{backgroundColor:accentSoft},
                selected&&{borderWidth:2,borderColor:accent},
              ]}
              onPress={()=>{
                setSelectedDate(cell.date);
                const d=new Date(`${cell.date}T12:00:00`);
                setCursor(new Date(d.getFullYear(),d.getMonth(),1));
              }}
            >
              <View style={styles.dayTop}>
                <Text style={[styles.dayNumber,range&&{color:accent,fontWeight:"900"}]}>{cell.day}</Text>
                {Boolean(tripDay) && (
                  <Text style={[styles.tripDayBadge,{color:accent}]}>
                    {tripDay}일차
                  </Text>
                )}
              </View>

              {(isStart || isEnd) && (
                <Text numberOfLines={1} style={[styles.rangeLabel,{color:accent}]}>
                  {isStart ? "출발" : "귀국"}
                </Text>
              )}

              {!!cell.plans.length && (
                <View style={styles.planDots}>
                  {cell.plans.slice(0,3).map(p=>(
                    <Text key={p.id} style={styles.planDotText}>{planIcon(p.type)}</Text>
                  ))}
                </View>
              )}

              {cell.info && (
                <Text numberOfLines={1} style={styles.dayAmount}>
                  {Math.round(cell.info.total).toLocaleString("ko-KR")}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider}/>

      <View style={styles.selectedHeader}>
        <View style={styles.flex}>
          <View style={styles.selectedTitleRow}>
            <Text style={styles.selectedTitle}>
              {selectedDateObj.getMonth()+1}월 {selectedDateObj.getDate()}일 ({weekNames[selectedDateObj.getDay()]})
            </Text>
            {Boolean(selectedTripDay) && (
              <View style={[styles.selectedTripBadge,{backgroundColor:accentSoft}]}>
                <Text style={[styles.selectedTripBadgeText,{color:accent}]}>여행 {selectedTripDay}일차</Text>
              </View>
            )}
          </View>
          <Text style={styles.helper}>
            일정 {selectedPlans.length}개 · 지출 {won(selectedTotal)} / {selectedExpenses.length}건
          </Text>
        </View>
      </View>

      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>오늘의 일정</Text>
        {Boolean(onAddPlan) && (
          <Pressable
            onPress={()=>onAddPlan?.(selectedDate)}
            style={[styles.smallAction,{backgroundColor:accentSoft}]}
          >
            <Text style={[styles.smallActionText,{color:accent}]}>＋ 일정 추가</Text>
          </Pressable>
        )}
      </View>

      {!selectedPlans.length ? (
        <View style={[styles.noPlanCard,{backgroundColor:accentSoft}]}>
          <Text style={styles.noPlanEmoji}>🧳</Text>
          <View style={styles.flex}>
            <Text style={styles.noPlanTitle}>
              {selectedTripDay ? `여행 ${selectedTripDay}일차` : "선택한 날짜"}
            </Text>
            <Text style={styles.noPlanText}>
              아직 등록된 일정이 없어요. 항공편·숙소·관광 일정을 추가해보세요.
            </Text>
          </View>
        </View>
      ) : (
        selectedPlans.map(plan=>(
          <View key={plan.id} style={styles.planCard}>
            <View style={[styles.planIconWrap,{backgroundColor:accentSoft}]}>
              <Text style={styles.planIcon}>{planIcon(plan.type)}</Text>
            </View>
            <View style={styles.flex}>
              <View style={styles.planTop}>
                <Text style={[styles.planType,{color:accent}]}>{planLabel(plan.type)}</Text>
                {!!plan.time && <Text style={styles.planTime}>{plan.time}</Text>}
              </View>
              <Text style={styles.planTitle}>{plan.title}</Text>
              {!!plan.detail && <Text style={styles.planDetail}>{plan.detail}</Text>}
            </View>
            {Boolean(onDeletePlan) && (
              <Pressable onPress={()=>onDeletePlan?.(plan.id)} style={styles.planDelete}>
                <Text style={styles.planDeleteText}>×</Text>
              </Pressable>
            )}
          </View>
        ))
      )}

      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>지출</Text>
        <Pressable
          style={[styles.smallAction,{backgroundColor:accent}]}
          onPress={()=>onAddForDate(selectedDate)}
        >
          <Text style={styles.addText}>＋ 지출 추가</Text>
        </Pressable>
      </View>

      {!selectedExpenses.length ? (
        <Text style={styles.empty}>이 날짜에는 아직 지출이 없어요.</Text>
      ) : (
        selectedExpenses.map(expense=>{
          const payer=people.find(p=>p.id===expense.payerId)?.name||"?";
          return (
            <View key={expense.id} style={styles.expenseRow}>
              <View style={styles.flex}>
                <Text style={styles.expenseTitle}>{expense.title}</Text>
                <Text style={styles.expenseMeta}>
                  {expense.category} · {payer} 결제 · {expense.participantIds.length}명
                </Text>
              </View>
              <Text style={styles.expenseAmount}>{won(expense.krwAmount)}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles=StyleSheet.create({
  card:{
    backgroundColor:"#FFFFFF",
    borderWidth:1,
    borderColor:"#E5E7F0",
    borderRadius:22,
    padding:14,
    marginBottom:12,
  },
  header:{
    flexDirection:"row",
    justifyContent:"space-between",
    alignItems:"center",
    marginBottom:12,
  },
  title:{
    fontSize:19,
    fontWeight:"900",
    letterSpacing:-0.35,
    color:"#20223F",
  },
  helper:{
    fontSize:12,
    color:"#8589A5",
    marginTop:3,
  },
  nav:{flexDirection:"row",gap:6},
  navButton:{
    width:34,height:34,borderRadius:11,
    backgroundColor:"#F0F2F8",
    alignItems:"center",justifyContent:"center",
  },
  navText:{fontSize:23,lineHeight:24,fontWeight:"700"},
  bookingSummary:{
    borderRadius:16,
    paddingHorizontal:12,
    paddingVertical:10,
    flexDirection:"row",
    alignItems:"center",
    marginBottom:12,
  },
  bookingDate:{width:58},
  bookingLabel:{fontSize:9,fontWeight:"900"},
  bookingValue:{fontSize:13,fontWeight:"900",color:"#20223F",marginTop:2},
  bookingLine:{flex:1,flexDirection:"row",alignItems:"center",paddingHorizontal:6},
  bookingDot:{width:7,height:7,borderRadius:4},
  bookingTrack:{height:1,flex:1,opacity:0.45},
  bookingNights:{fontSize:9,color:"#6D718A",fontWeight:"800",paddingHorizontal:5},
  weekRow:{flexDirection:"row",marginBottom:5},
  weekText:{
    width:`${100/7}%`,
    textAlign:"center",
    fontSize:11,
    color:"#8589A5",
    fontWeight:"700",
  },
  sunday:{color:"#DE6C78"},
  saturday:{color:"#4B79C6"},
  grid:{flexDirection:"row",flexWrap:"wrap"},
  day:{
    width:`${100/7}%`,
    minHeight:72,
    borderWidth:StyleSheet.hairlineWidth,
    borderColor:"#E5E7F0",
    padding:4,
  },
  otherMonth:{opacity:0.30},
  dayTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  dayNumber:{fontSize:11,fontWeight:"700",color:"#30334D"},
  tripDayBadge:{fontSize:7,fontWeight:"900"},
  rangeLabel:{fontSize:8,fontWeight:"900",marginTop:4},
  planDots:{flexDirection:"row",gap:1,marginTop:4},
  planDotText:{fontSize:9},
  dayAmount:{fontSize:8,fontWeight:"800",marginTop:4,color:"#555A76"},
  divider:{
    height:StyleSheet.hairlineWidth,
    backgroundColor:"#E5E7F0",
    marginVertical:14,
  },
  selectedHeader:{flexDirection:"row",alignItems:"center"},
  selectedTitleRow:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},
  selectedTitle:{fontSize:15,fontWeight:"900",color:"#20223F"},
  selectedTripBadge:{paddingHorizontal:7,paddingVertical:4,borderRadius:999},
  selectedTripBadgeText:{fontSize:9,fontWeight:"900"},
  sectionTitleRow:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    marginTop:15,
    marginBottom:8,
  },
  sectionTitle:{fontSize:13,fontWeight:"900",color:"#343752"},
  smallAction:{paddingHorizontal:9,paddingVertical:7,borderRadius:11},
  smallActionText:{fontSize:10,fontWeight:"900"},
  addText:{fontSize:10,fontWeight:"900",color:"#FFFFFF"},
  noPlanCard:{
    borderRadius:15,
    padding:12,
    flexDirection:"row",
    alignItems:"center",
    gap:10,
  },
  noPlanEmoji:{fontSize:23},
  noPlanTitle:{fontSize:12,fontWeight:"900",color:"#292C48"},
  noPlanText:{fontSize:10,lineHeight:15,color:"#757991",marginTop:2},
  planCard:{
    minHeight:74,
    borderWidth:1,
    borderColor:"#E7E9F1",
    borderRadius:16,
    padding:11,
    flexDirection:"row",
    alignItems:"center",
    gap:10,
    marginBottom:8,
    backgroundColor:"#FFFFFF",
  },
  planIconWrap:{
    width:42,height:42,borderRadius:13,
    alignItems:"center",justifyContent:"center",
  },
  planIcon:{fontSize:20},
  planTop:{flexDirection:"row",alignItems:"center",gap:8},
  planType:{fontSize:9,fontWeight:"900"},
  planTime:{fontSize:10,fontWeight:"800",color:"#6D718A"},
  planTitle:{fontSize:13,fontWeight:"900",color:"#20223F",marginTop:2},
  planDetail:{fontSize:10,lineHeight:15,color:"#8589A5",marginTop:2},
  planDelete:{width:28,height:28,borderRadius:14,alignItems:"center",justifyContent:"center"},
  planDeleteText:{fontSize:18,color:"#A3A6B6"},
  empty:{color:"#8589A5",fontSize:12,marginTop:6},
  expenseRow:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    gap:8,
    paddingVertical:10,
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:"#E5E7F0",
  },
  flex:{flex:1},
  expenseTitle:{fontSize:14,fontWeight:"800"},
  expenseMeta:{fontSize:11,color:"#8589A5",marginTop:2},
  expenseAmount:{fontSize:13,fontWeight:"800"},
});
