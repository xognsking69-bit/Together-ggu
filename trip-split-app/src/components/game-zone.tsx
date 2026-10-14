import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Person } from "../types";

type Props = {
  people: Person[];
  meId: string;
  accent?: string;
  accentSoft?: string;
  onUsePayer: (payerId: string, participantIds: string[]) => void;
};

type GameMode = "roulette" | "race" | "bomb" | "card";

const animals = ["🐰","🐻","🐱","🐶","🦊","🐼","🐸","🐵","🐯","🐨"];

function pickFair(ids: string[]) {
  return ids[Math.floor(Math.random() * ids.length)];
}

export default function GameZone({ people, meId, accent="#5C5CE2", accentSoft="#EEEEFF", onUsePayer }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(people.map((p) => p.id));
  const [mode, setMode] = useState<GameMode>("roulette");
  const [resultId, setResultId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [racePhaseText, setRacePhaseText] = useState("START를 눌러주세요");
  const [bombHolderId, setBombHolderId] = useState<string | null>(null);
  const [bombText, setBombText] = useState("START를 눌러주세요");
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [cardLoserId, setCardLoserId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wheelRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = current.filter((id) => people.some((p) => p.id === id));
      const missing = people.filter((p) => !valid.includes(p.id)).map((p) => p.id);
      return [...valid, ...missing];
    });
  }, [people]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      wheelRotation.stopAnimation();
    };
  }, [wheelRotation]);

  const selectedPeople = people.filter((p) => selectedIds.includes(p.id));
  const resultPerson = people.find((p) => p.id === resultId);

  const wheelLabels = useMemo(() => {
    const count = selectedPeople.length || 1;
    return selectedPeople.map((person, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius = 76;
      return {
        person,
        left: 101 + Math.cos(angle) * radius,
        top: 101 + Math.sin(angle) * radius,
      };
    });
  }, [selectedPeople]);

  function togglePerson(id: string) {
    if (running) return;
    setResultId(null);
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function validate() {
    return selectedPeople.length >= 2;
  }

  function startRoulette() {
    if (!validate() || running) return;

    setMode("roulette");
    setResultId(null);
    setRunning(true);

    const ids = selectedPeople.map((p) => p.id);
    const finalId = pickFair(ids);
    const winnerIndex = ids.indexOf(finalId);
    const section = 360 / ids.length;

    // 포인터가 선택된 참가자 중앙에 오도록 최종 각도 계산.
    const targetWithinCircle = (360 - winnerIndex * section) % 360;
    const extraTurns = 6 + Math.floor(Math.random() * 3);
    const finalDegrees = extraTurns * 360 + targetWithinCircle;

    wheelRotation.setValue(0);

    Animated.timing(wheelRotation, {
      toValue: finalDegrees,
      duration: 3600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setResultId(finalId);
      setRunning(false);
    });
  }

  function startRace() {
    if (!validate() || running) return;

    setMode("race");
    setResultId(null);
    setRunning(true);
    setRacePhaseText("출발! 아직 모두 비슷해요");

    const ids = selectedPeople.map((p) => p.id);
    const lastId = pickFair(ids);

    const initial: Record<string, number> = {};
    ids.forEach((id) => (initial[id] = 2));
    setProgress(initial);

    let tick = 0;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      tick += 1;

      setProgress((prev) => {
        const next = { ...prev };

        if (tick <= 18) {
          // 초반/중반: 모두 같은 기준선 주변 ±2% 안에서 움직여
          // 누가 꼴찌인지 거의 알 수 없게 유지.
          const base = Math.min(80, 4 + tick * 4.1);

          ids.forEach((id) => {
            const jitter = Math.random() * 4 - 2;
            const previous = prev[id] || 0;
            next[id] = Math.max(previous + 1, Math.min(82, base + jitter));
          });

          if (tick === 9) setRacePhaseText("접전 중! 아직 아무도 몰라요");
          if (tick === 16) setRacePhaseText("막판 스퍼트 준비!");
        } else if (tick === 19) {
          // 결승 직전에도 거의 동일.
          ids.forEach((id) => {
            next[id] = 87 + Math.random() * 2.5;
          });
          setRacePhaseText("결승선이 코앞이에요!");
        } else if (tick === 20) {
          ids.forEach((id) => {
            next[id] = 93 + Math.random() * 2;
          });
          setRacePhaseText("마지막 순간!");
        } else if (tick === 21) {
          // 마지막 순간에만 꼴찌가 드러남.
          ids.forEach((id) => {
            next[id] = id === lastId ? 96 : 100;
          });
          setRacePhaseText("🏁 결승선 통과!");
        } else {
          ids.forEach((id) => {
            next[id] = 100;
          });
        }

        return next;
      });

      if (tick >= 22) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;

        setTimeout(() => {
          setResultId(lastId);
          setRunning(false);
          setRacePhaseText("레이스 종료");
        }, 250);
      }
    }, 180);
  }


  function startBomb() {
    if (!validate() || running) return;

    setMode("bomb");
    setResultId(null);
    setRunning(true);
    setBombText("💣 폭탄이 돌아가는 중...");
    setRevealedCardId(null);
    setCardLoserId(null);

    const ids = selectedPeople.map((p) => p.id);
    const finalId = pickFair(ids);
    let hops = 0;
    const totalHops = 16 + Math.floor(Math.random() * 7);

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      hops += 1;

      if (hops < totalHops) {
        const randomId = ids[Math.floor(Math.random() * ids.length)];
        setBombHolderId(randomId);

        if (hops === Math.floor(totalHops * 0.55)) {
          setBombText("⏱️ 점점 빨라져요!");
        }

        if (hops === totalHops - 3) {
          setBombText("😱 곧 터져요!");
        }
      } else {
        setBombHolderId(finalId);

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;

        setTimeout(() => {
          setBombText("💥 펑!");
          setResultId(finalId);
          setRunning(false);
        }, 450);
      }
    }, 170);
  }

  function startCards() {
    if (!validate() || running) return;

    setMode("card");
    setResultId(null);
    setRunning(false);
    setRevealedCardId(null);

    const ids = selectedPeople.map((p) => p.id);
    setCardLoserId(pickFair(ids));
  }

  function revealCard(personId: string) {
    if (!cardLoserId || resultId) return;

    setRevealedCardId(personId);

    if (personId === cardLoserId) {
      setTimeout(() => {
        setResultId(personId);
      }, 250);
    }
  }

  const wheelRotate = wheelRotation.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
    extrapolate: "extend",
  });

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.title}>🎮 오늘은 누가 살까?</Text>
        <Text style={styles.helper}>
          확률 조절 없이 참가자 모두 같은 확률로 뽑혀요.
        </Text>

        <Text style={styles.sectionTitle}>게임 참가자</Text>
        <View style={styles.chips}>
          {people.map((person) => {
            const selected = selectedIds.includes(person.id);

            return (
              <Pressable
                key={person.id}
                onPress={() => togglePerson(person.id)}
                style={[styles.chip, selected && styles.chipSelected, selected && {backgroundColor:accent}]}
              >
                <Text style={selected ? styles.chipSelectedText : styles.chipText}>
                  {person.id === meId ? `나 · ${person.name}` : person.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selectedPeople.length < 2 && (
          <Text style={styles.warning}>게임은 2명 이상 선택해주세요.</Text>
        )}
      </View>

      <View style={styles.gamePicker}>
        {[
          ["roulette", "🎡 룰렛"],
          ["race", "🏁 꼴찌 레이스"],
          ["bomb", "💣 폭탄"],
          ["card", "🎴 카드"],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => {
              if (running) return;
              setMode(value as GameMode);
              setResultId(null);
              if (value === "card") {
                setCardLoserId(null);
                setRevealedCardId(null);
              }
            }}
            style={[
              styles.gamePickerButton,
              mode === value && styles.gamePickerActive, mode === value && {backgroundColor:accent},
            ]}
          >
            <Text
              style={
                mode === value
                  ? styles.gamePickerActiveText
                  : styles.gamePickerText
              }
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "roulette" && (
        <View style={styles.card}>
          <Text style={styles.gameTitle}>🎡 완전 랜덤 룰렛</Text>
          <Text style={styles.helper}>
            돌림판이 실제로 회전한 뒤 포인터에 걸린 사람이 당첨돼요.
          </Text>

          <View style={styles.wheelStage}>
            <View style={styles.pointer}>
              <Text style={styles.pointerText}>▼</Text>
            </View>

            <Animated.View
              style={[
                styles.wheel,
                {
                  transform: [{ rotate: wheelRotate }],
                },
              ]}
            >
              <View style={styles.wheelCenter}>
                <Text style={styles.wheelCenterText}>🎯</Text>
              </View>

              {wheelLabels.map(({ person, left, top }, index) => (
                <View
                  key={person.id}
                  style={[
                    styles.wheelLabel,
                    {
                      left: left - 32,
                      top: top - 14,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={styles.wheelLabelText}>
                    {animals[index % animals.length]} {person.name}
                  </Text>
                </View>
              ))}
            </Animated.View>
          </View>

          <Pressable
            disabled={running || selectedPeople.length < 2}
            onPress={startRoulette}
            style={[
              styles.startButton,
              {backgroundColor:accent},
              (running || selectedPeople.length < 2) && styles.disabled,
            ]}
          >
            <Text style={styles.startText}>
              {running ? "룰렛 회전 중..." : "룰렛 START"}
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "race" && (
        <View style={styles.card}>
          <Text style={styles.gameTitle}>🏁 랜덤 꼴찌 레이스</Text>
          <Text style={styles.helper}>
            초반에는 모두 접전으로 달리고, 마지막 순간에만 꼴찌가 드러나요.
          </Text>

          <View style={styles.raceStatus}>
            <Text style={styles.raceStatusText}>{racePhaseText}</Text>
          </View>

          <View style={{ marginTop: 14 }}>
            {selectedPeople.map((person, index) => {
              const pct = Math.max(0, Math.min(100, progress[person.id] || 0));

              return (
                <View key={person.id} style={styles.raceRow}>
                  <Text style={styles.raceName} numberOfLines={1}>
                    {person.id === meId ? `나 · ${person.name}` : person.name}
                  </Text>

                  <View style={styles.track}>
                    <View style={styles.trackLine} />

                    <View
                      style={[
                        styles.runnerWrap,
                        {
                          left: `${Math.min(92, pct * 0.92)}%`,
                        },
                      ]}
                    >
                      <Text style={styles.runnerEmoji}>
                        {animals[index % animals.length]}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.finish}>🏁</Text>
                </View>
              );
            })}
          </View>

          <Pressable
            disabled={running || selectedPeople.length < 2}
            onPress={startRace}
            style={[
              styles.startButton,
              {backgroundColor:accent},
              (running || selectedPeople.length < 2) && styles.disabled,
            ]}
          >
            <Text style={styles.startText}>
              {running ? "레이스 진행 중..." : "레이스 START"}
            </Text>
          </Pressable>
        </View>
      )}


      {mode === "bomb" && (
        <View style={styles.card}>
          <Text style={styles.gameTitle}>💣 랜덤 폭탄 돌리기</Text>
          <Text style={styles.helper}>
            폭탄이 참가자 사이를 빠르게 이동하다가 완전 랜덤으로 한 사람에게 멈춰요.
          </Text>

          <View style={styles.bombArena}>
            <Text style={styles.bombBig}>{running ? "💣" : resultId ? "💥" : "💣"}</Text>
            <Text style={styles.bombStatus}>{bombText}</Text>

            <View style={styles.bombPeople}>
              {selectedPeople.map((person) => {
                const holding = bombHolderId === person.id;
                return (
                  <View
                    key={person.id}
                    style={[
                      styles.bombPerson,
                      holding && styles.bombPersonActive,
                    ]}
                  >
                    <Text style={styles.bombPersonEmoji}>
                      {holding ? "💣" : "🙂"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.bombPersonName,
                        holding && styles.bombPersonNameActive,
                      ]}
                    >
                      {person.id === meId ? `나 · ${person.name}` : person.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Pressable
            disabled={running || selectedPeople.length < 2}
            onPress={startBomb}
            style={[
              styles.startButton,
              {backgroundColor:accent},
              (running || selectedPeople.length < 2) && styles.disabled,
            ]}
          >
            <Text style={styles.startText}>
              {running ? "폭탄 이동 중..." : "폭탄 START"}
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "card" && (
        <View style={styles.card}>
          <Text style={styles.gameTitle}>🎴 랜덤 카드 뽑기</Text>
          <Text style={styles.helper}>
            참가자 수만큼 카드를 만들고, 딱 한 장만 벌칙 카드예요. 벌칙 카드는 매번 완전 랜덤으로 정해져요.
          </Text>

          {!cardLoserId && (
            <Pressable
              disabled={selectedPeople.length < 2}
              onPress={startCards}
              style={[
                styles.startButton,
                {backgroundColor:accent},
                selectedPeople.length < 2 && styles.disabled,
              ]}
            >
              <Text style={styles.startText}>카드 섞기</Text>
            </Pressable>
          )}

          {cardLoserId && (
            <>
              <Text style={styles.cardGuide}>
                이름을 눌러 카드를 한 장씩 확인하세요.
              </Text>

              <View style={styles.cardGrid}>
                {selectedPeople.map((person) => {
                  const opened =
                    revealedCardId === person.id ||
                    resultId === person.id;
                  const isLose =
                    opened && person.id === cardLoserId;

                  return (
                    <Pressable
                      key={person.id}
                      onPress={() => revealCard(person.id)}
                      style={[
                        styles.drawCard,
                        opened && styles.drawCardOpen,
                        isLose && styles.drawCardLose,
                      ]}
                    >
                      <Text style={styles.drawCardEmoji}>
                        {opened ? (isLose ? "💸" : "✨") : "🎴"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.drawCardName,
                          isLose && styles.drawCardLoseText,
                        ]}
                      >
                        {person.id === meId ? `나 · ${person.name}` : person.name}
                      </Text>
                      <Text
                        style={[
                          styles.drawCardResult,
                          isLose && styles.drawCardLoseText,
                        ]}
                      >
                        {opened ? (isLose ? "당첨!" : "통과") : "뒤집기"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}

      {resultPerson && !running && (
        <View style={[styles.resultCard,{backgroundColor:accentSoft,borderColor:accent}]}>
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={styles.resultTitle}>{resultPerson.name} 당첨!</Text>
          <Text style={styles.resultText}>
            게임 결과는 {resultPerson.name}! 이 결과를 바로 지출 기록에 연결할 수 있어요.
          </Text>

          <Pressable
            onPress={() => onUsePayer(resultPerson.id, selectedIds)}
            style={[styles.expenseButton,{backgroundColor:accent}]}
          >
            <Text style={styles.expenseButtonText}>
              이 결과로 지출 기록하기
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setResultId(null);
              setRacePhaseText("START를 눌러주세요");
              setBombHolderId(null);
              setBombText("START를 눌러주세요");
              setRevealedCardId(null);
              setCardLoserId(null);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>다시 하기</Text>
          </Pressable>
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
    shadowOpacity:0.06,
    shadowRadius:14,
    elevation:2
  },
  title:{
    fontSize:21,
    fontWeight:"900",
    letterSpacing:-0.4,
    color:"#20223F"
  },
  helper:{
    fontSize:12,
    color:"#8589A5",
    marginTop:5,
    lineHeight:18
  },
  sectionTitle:{
    fontSize:13,
    fontWeight:"800",
    color:"#8589A5",
    marginTop:16,
    marginBottom:8
  },
  chips:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:8
  },
  chip:{
    backgroundColor:"#F0F2F8",
    paddingHorizontal:12,
    paddingVertical:9,
    borderRadius:999
  },
  chipSelected:{
    backgroundColor:"#5C5CE2"
  },
  chipText:{
    color:"#20223F"
  },
  chipSelectedText:{
    color:"#FFFFFF",
    fontWeight:"800"
  },
  warning:{
    color:"#E15467",
    fontSize:12,
    fontWeight:"700",
    marginTop:10
  },
  gamePicker:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:8,
    marginBottom:12
  },
  gamePickerButton:{
    width:"48%",
    backgroundColor:"#FFFFFF",
    borderWidth:1,
    borderColor:"#E5E7F0",
    paddingVertical:13,
    borderRadius:14,
    alignItems:"center"
  },
  gamePickerActive:{
    backgroundColor:"#5C5CE2"
  },
  gamePickerText:{
    fontWeight:"800",
    color:"#20223F"
  },
  gamePickerActiveText:{
    fontWeight:"800",
    color:"#FFFFFF"
  },
  gameTitle:{
    fontSize:17,
    fontWeight:"900",
    color:"#20223F",
    marginBottom:4
  },

  wheelStage:{
    height:250,
    alignItems:"center",
    justifyContent:"center",
    marginTop:8
  },
  wheel:{
    width:220,
    height:220,
    borderRadius:110,
    borderWidth:10,
    borderColor:"#5C5CE2",
    backgroundColor:"#F7F8FD",
    position:"relative",
    overflow:"hidden"
  },
  wheelCenter:{
    position:"absolute",
    left:75,
    top:75,
    width:50,
    height:50,
    borderRadius:25,
    backgroundColor:"#5C5CE2",
    alignItems:"center",
    justifyContent:"center",
    zIndex:5
  },
  wheelCenterText:{
    fontSize:24
  },
  wheelLabel:{
    position:"absolute",
    width:64,
    height:28,
    alignItems:"center",
    justifyContent:"center"
  },
  wheelLabelText:{
    fontSize:10,
    fontWeight:"900",
    color:"#20223F",
    textAlign:"center"
  },
  pointer:{
    position:"absolute",
    top:5,
    zIndex:20,
    width:42,
    height:42,
    borderRadius:21,
    backgroundColor:"#5C5CE2",
    alignItems:"center",
    justifyContent:"center"
  },
  pointerText:{
    color:"#FFFFFF",
    fontSize:22,
    fontWeight:"900"
  },

  startButton:{
    backgroundColor:"#5C5CE2",
    borderRadius:16,
    paddingVertical:14,
    alignItems:"center",
    marginTop:12
  },
  disabled:{
    opacity:0.35
  },
  startText:{
    color:"#FFFFFF",
    fontWeight:"900",
    fontSize:15
  },

  raceStatus:{
    marginTop:12,
    backgroundColor:"#F7F8FD",
    borderRadius:12,
    paddingVertical:9,
    paddingHorizontal:12,
    alignItems:"center"
  },
  raceStatusText:{
    fontSize:12,
    fontWeight:"800",
    color:"#20223F"
  },
  raceRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:8,
    marginBottom:13
  },
  raceName:{
    width:82,
    fontSize:11,
    fontWeight:"800"
  },
  track:{
    flex:1,
    height:30,
    position:"relative",
    justifyContent:"center"
  },
  trackLine:{
    height:5,
    backgroundColor:"#E5E7F0",
    borderRadius:999,
    width:"100%"
  },
  runnerWrap:{
    position:"absolute",
    top:1,
    marginLeft:-8
  },
  runnerEmoji:{
    fontSize:23
  },
  finish:{
    fontSize:18
  },


  bombArena:{
    marginTop:14,
    padding:14,
    backgroundColor:"#F7F8FD",
    borderRadius:16,
    alignItems:"center"
  },
  bombBig:{
    fontSize:44
  },
  bombStatus:{
    fontSize:13,
    fontWeight:"900",
    marginTop:4,
    color:"#20223F"
  },
  bombPeople:{
    width:"100%",
    flexDirection:"row",
    flexWrap:"wrap",
    gap:8,
    marginTop:14,
    justifyContent:"center"
  },
  bombPerson:{
    width:"30%",
    minWidth:82,
    paddingVertical:10,
    paddingHorizontal:6,
    borderRadius:13,
    backgroundColor:"#FFFFFF",
    borderWidth:1,
    borderColor:"#E5E7F0",
    alignItems:"center"
  },
  bombPersonActive:{
    backgroundColor:"#5C5CE2",
    borderColor:"#5C5CE2",
    transform:[{scale:1.05}]
  },
  bombPersonEmoji:{
    fontSize:22
  },
  bombPersonName:{
    marginTop:3,
    fontSize:10,
    fontWeight:"800",
    color:"#20223F"
  },
  bombPersonNameActive:{
    color:"#FFFFFF"
  },
  cardGuide:{
    textAlign:"center",
    fontSize:12,
    fontWeight:"800",
    color:"#8589A5",
    marginTop:14
  },
  cardGrid:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:10,
    justifyContent:"center",
    marginTop:12
  },
  drawCard:{
    width:"46%",
    minHeight:118,
    backgroundColor:"#5C5CE2",
    borderRadius:16,
    alignItems:"center",
    justifyContent:"center",
    padding:10,
    borderWidth:2,
    borderColor:"#5C5CE2"
  },
  drawCardOpen:{
    backgroundColor:"#F7F8FD",
    borderColor:"#E5E7F0"
  },
  drawCardLose:{
    backgroundColor:"#FFF0F2",
    borderColor:"#E15467"
  },
  drawCardEmoji:{
    fontSize:31
  },
  drawCardName:{
    marginTop:6,
    fontSize:12,
    fontWeight:"900",
    color:"#FFFFFF"
  },
  drawCardResult:{
    marginTop:4,
    fontSize:11,
    fontWeight:"800",
    color:"#FFFFFF"
  },
  drawCardLoseText:{
    color:"#E15467"
  },

  resultCard:{
    backgroundColor:"#EFEFFF",
    borderWidth:1,
    borderColor:"#D9DAFF",
    borderRadius:24,
    padding:18,
    alignItems:"center",
    marginBottom:12
  },
  resultEmoji:{
    fontSize:38
  },
  resultTitle:{
    fontSize:24,
    fontWeight:"900",
    marginTop:4
  },
  resultText:{
    fontSize:13,
    color:"#8589A5",
    marginTop:6,
    textAlign:"center",
    lineHeight:19
  },
  expenseButton:{
    width:"100%",
    backgroundColor:"#5C5CE2",
    paddingVertical:14,
    borderRadius:14,
    alignItems:"center",
    marginTop:16
  },
  expenseButtonText:{
    color:"#FFFFFF",
    fontWeight:"900"
  },
  retryButton:{
    paddingVertical:11,
    paddingHorizontal:16,
    marginTop:5
  },
  retryText:{
    fontWeight:"800",
    color:"#8589A5"
  }
});
