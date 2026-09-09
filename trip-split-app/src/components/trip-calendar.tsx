import React, { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Expense, Person } from "../types";

type Props = {
  expenses: Expense[];
  people: Person[];
  initialDate?: string;
  onAddForDate: (date: string) => void;
};

const won = (value: number) =>
  `${Math.round(value || 0).toLocaleString("ko-KR")}원`;

const pad = (n: number) => String(n).padStart(2, "0");

function keyOf(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function TripCalendar({
  expenses,
  people,
  initialDate,
  onAddForDate,
}: Props) {
  const initial = initialDate
    ? new Date(`${initialDate}T00:00:00`)
    : new Date();

  const [cursor, setCursor] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().slice(0, 10)
  );

  const expenseMap = useMemo(() => {
    const map: Record<
      string,
      { total: number; count: number }
    > = {};

    expenses.forEach((expense) => {
      if (!map[expense.date]) {
        map[expense.date] = { total: 0, count: 0 };
      }
      map[expense.date].total += expense.krwAmount;
      map[expense.date].count += 1;
    });

    return map;
  }, [expenses]);

  const selectedExpenses = useMemo(
    () => expenses.filter((e) => e.date === selectedDate),
    [expenses, selectedDate]
  );

  const selectedTotal = selectedExpenses.reduce(
    (sum, e) => sum + e.krwAmount,
    0
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = Array.from({ length: 42 }, (_, index) => {
    let cellYear = year;
    let cellMonth = month;
    let day = 0;
    let otherMonth = false;

    if (index < firstDay) {
      day = prevMonthDays - firstDay + index + 1;
      cellMonth -= 1;
      otherMonth = true;

      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
    } else if (index >= firstDay + daysInMonth) {
      day = index - (firstDay + daysInMonth) + 1;
      cellMonth += 1;
      otherMonth = true;

      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    } else {
      day = index - firstDay + 1;
    }

    const date = keyOf(cellYear, cellMonth, day);
    return {
      date,
      day,
      otherMonth,
      info: expenseMap[date],
    };
  });

  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
  const weekNames = ["일", "월", "화", "수", "목", "금", "토"];

  function moveMonth(delta: number) {
    setCursor(
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + delta,
        1
      )
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {year}년 {month + 1}월
          </Text>
          <Text style={styles.helper}>
            날짜별 지출을 한눈에 확인해요.
          </Text>
        </View>

        <View style={styles.nav}>
          <Pressable
            style={styles.navButton}
            onPress={() => moveMonth(-1)}
          >
            <Text style={styles.navText}>‹</Text>
          </Pressable>

          <Pressable
            style={styles.navButton}
            onPress={() => moveMonth(1)}
          >
            <Text style={styles.navText}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.weekRow}>
        {weekNames.map((name) => (
          <Text key={name} style={styles.weekText}>
            {name}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const selected = cell.date === selectedDate;

          return (
            <Pressable
              key={cell.date}
              style={[
                styles.day,
                cell.otherMonth && styles.otherMonth,
                selected && styles.selectedDay,
              ]}
              onPress={() => {
                setSelectedDate(cell.date);

                const d = new Date(`${cell.date}T00:00:00`);
                setCursor(
                  new Date(d.getFullYear(), d.getMonth(), 1)
                );
              }}
            >
              <Text style={styles.dayNumber}>
                {cell.day}
              </Text>

              {cell.info && (
                <>
                  <Text
                    numberOfLines={1}
                    style={styles.dayAmount}
                  >
                    {Math.round(
                      cell.info.total
                    ).toLocaleString("ko-KR")}
                  </Text>

                  <Text style={styles.dayCount}>
                    {cell.info.count}건
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider} />

      <View style={styles.selectedHeader}>
        <View>
          <Text style={styles.selectedTitle}>
            {selectedDateObj.getMonth() + 1}월{" "}
            {selectedDateObj.getDate()}일 (
            {weekNames[selectedDateObj.getDay()]})
          </Text>

          <Text style={styles.helper}>
            하루 총지출 {won(selectedTotal)} ·{" "}
            {selectedExpenses.length}건
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() => onAddForDate(selectedDate)}
        >
          <Text style={styles.addText}>+ 지출 추가</Text>
        </Pressable>
      </View>

      {!selectedExpenses.length ? (
        <Text style={styles.empty}>
          이 날짜에는 아직 지출이 없어요.
        </Text>
      ) : (
        selectedExpenses.map((expense) => {
          const payer =
            people.find((p) => p.id === expense.payerId)
              ?.name || "?";

          return (
            <View
              key={expense.id}
              style={styles.expenseRow}
            >
              <View style={styles.flex}>
                <Text style={styles.expenseTitle}>
                  {expense.title}
                </Text>

                <Text style={styles.expenseMeta}>
                  {expense.category} · {payer} 결제 ·{" "}
                  {expense.participantIds.length}명
                </Text>
              </View>

              <Text style={styles.expenseAmount}>
                {won(expense.krwAmount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17191C",
  },
  helper: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 3,
  },
  nav: {
    flexDirection: "row",
    gap: 6,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    fontSize: 23,
    lineHeight: 24,
    fontWeight: "700",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  weekText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  day: {
    width: `${100 / 7}%`,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    padding: 5,
  },
  otherMonth: {
    opacity: 0.32,
  },
  selectedDay: {
    borderWidth: 2,
    borderColor: "#111827",
    backgroundColor: "#F8F9FB",
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: "700",
  },
  dayAmount: {
    fontSize: 9,
    fontWeight: "800",
    marginTop: 7,
  },
  dayCount: {
    fontSize: 8,
    color: "#6B7280",
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 14,
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  addButton: {
    backgroundColor: "#F0F2F5",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
  },
  addText: {
    fontSize: 12,
    fontWeight: "800",
  },
  empty: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 12,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  flex: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  expenseMeta: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 13,
    fontWeight: "800",
  },
});
