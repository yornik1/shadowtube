import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  applyReview,
  listDue,
  type VocabularyRow,
} from "@/src/db/repos/vocabulary";
import { getStreakState, saveStreakState } from "@/src/db/repos/appState";
import { refreshDueCount } from "@/src/srs/dueStore";
import {
  DEFAULT_DAILY_GOAL,
  EMPTY_STREAK,
  registerReview,
  streakStatus,
  type StreakState,
} from "@/src/srs/streak";
import { buildCard } from "@/src/srs/cardModes";
import { formatDue, type Grade } from "@/src/srs/fsrs";
import { useSettingsStore } from "@/src/store/settings";
import { Button, EmptyState, ProgressBar } from "@/src/ui/components";
import { colors, font, radius, space } from "@/src/ui/theme";
import { e2eEvent } from "@/src/session/e2eLog";

/** Сколько карточек берём за один заход — очередь на весь словарь пугает. */
const QUEUE_LIMIT = 40;

const GRADES: { id: Grade; label: string; color: string }[] = [
  { id: "again", label: "Не помню", color: colors.danger },
  { id: "hard", label: "Трудно", color: colors.warning },
  { id: "easy", label: "Легко", color: colors.success },
];

export default function ReviewScreen() {
  const cardMode = useSettingsStore((s) => s.cardMode);
  const [queue, setQueue] = useState<VocabularyRow[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showRu, setShowRu] = useState(false);
  const [streak, setStreak] = useState<StreakState>(EMPTY_STREAK);
  const [loading, setLoading] = useState(true);
  /** Сколько карточек пройдено в этом заходе — для прогресса «3 / 12». */
  const [done, setDone] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [due, streakState] = await Promise.all([
      listDue(QUEUE_LIMIT),
      getStreakState(),
    ]);
    setQueue(due);
    setStreak(streakState);
    setDone(0);
    setShowAnswer(false);
    setShowRu(false);
    setLoading(false);
    e2eEvent("review_open", { due: due.length });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const current = queue[0];
  const status = streakStatus(streak, new Date(), DEFAULT_DAILY_GOAL);

  const grade = async (g: Grade) => {
    if (!current || busy.current) return;
    busy.current = true;
    try {
      e2eEvent("review_grade", { id: current.id, grade: g });
      await applyReview(current.id, g);

      const nextStreak = registerReview(streak, new Date(), DEFAULT_DAILY_GOAL);
      setStreak(nextStreak);
      await saveStreakState(nextStreak);

      setQueue((prev) => {
        const [head, ...rest] = prev;
        // «Не помню» — карточка возвращается в конец этого же захода,
        // а не через день: именно так забытое и закрепляется.
        return head && g === "again" ? [...rest, head] : rest;
      });
      setDone((d) => d + 1);
      setShowAnswer(false);
      setShowRu(false);
      refreshDueCount();

      if (queue.length <= 1) e2eEvent("review_done", { done: done + 1 });
    } finally {
      busy.current = false;
    }
  };

  const listenInContext = () => {
    if (!current?.sourceVideoId) return;
    const chunk = current.chunkIdx;
    router.push(
      chunk != null
        ? `/session/${current.sourceVideoId}?chunk=${chunk}`
        : `/session/${current.sourceVideoId}`,
    );
  };

  if (loading) {
    return <View style={styles.container} />;
  }

  if (!current) {
    return (
      <View style={styles.container}>
        <StreakHeader status={status} />
        <EmptyState
          emoji={status.goalMet ? "🎉" : "☕"}
          title={
            status.goalMet
              ? `Норма дня закрыта — ${status.doneToday} карточек`
              : "На сегодня всё"
          }
          hint={
            status.current > 0
              ? `Цепочка: ${status.current} ${plural(status.current)} подряд. Возвращайся завтра.`
              : "Сохраняй фразы во время сессии — они появятся здесь."
          }
          action={
            <Button
              title="К словарю"
              onPress={() => router.push("/(tabs)/vocabulary")}
            />
          }
        />
      </View>
    );
  }

  const face = buildCard(current, cardMode);
  const total = done + queue.length;

  return (
    <View style={styles.container}>
      <StreakHeader status={status} />

      <Text style={styles.queueCounter}>
        {done + 1} / {total}
      </Text>

      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardContent}
      >
        <Text style={styles.prompt}>{face.prompt}</Text>
        <Text style={styles.front}>{face.front}</Text>

        {showAnswer ? (
          <View style={styles.answer}>
            <Text style={styles.back}>{face.back}</Text>

            {face.fallbackRu ? (
              showRu ? (
                <Text style={styles.fallbackRu}>{face.fallbackRu}</Text>
              ) : (
                <Pressable onPress={() => setShowRu(true)} hitSlop={8}>
                  <Text style={styles.fallbackLink}>не понял → по-русски</Text>
                </Pressable>
              )
            ) : null}

            {face.backSecondary && face.backSecondary !== face.back ? (
              <Text style={styles.context}>{face.backSecondary}</Text>
            ) : null}

            <View style={styles.meta}>
              <Text style={styles.metaText}>
                повторов: {current.reps} · сейчас: {formatDue(current.dueAt)}
              </Text>
              {current.sourceVideoId ? (
                <Pressable onPress={listenInContext} hitSlop={8}>
                  <Text style={styles.listenLink}>▶ послушать в видео</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {showAnswer ? (
        <View style={styles.grades}>
          {GRADES.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => void grade(g.id)}
              style={({ pressed }) => [
                styles.gradeBtn,
                { borderColor: g.color },
                pressed && styles.gradePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={g.label}
            >
              <Text style={[styles.gradeText, { color: g.color }]}>{g.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.grades}>
          <Button
            title="Показать ответ"
            variant="primary"
            onPress={() => {
              e2eEvent("review_show_answer", { id: current.id });
              setShowAnswer(true);
            }}
            style={styles.revealBtn}
          />
        </View>
      )}
    </View>
  );
}

function StreakHeader({
  status,
}: {
  status: ReturnType<typeof streakStatus>;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.streak}>
          🔥 {status.current} {plural(status.current)}
        </Text>
        <Text style={styles.goalText}>
          {status.doneToday} / {status.goal} сегодня
        </Text>
      </View>
      <ProgressBar
        value={status.doneToday / status.goal}
        color={status.goalMet ? colors.success : colors.streak}
      />
      {status.atRisk ? (
        <Text style={styles.atRisk}>
          Цепочка сгорит в полночь — осталось {status.remaining}
        </Text>
      ) : null}
    </View>
  );
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  streak: { ...font.body, color: colors.streak, fontWeight: "700" },
  goalText: { ...font.small, color: colors.textMuted },
  atRisk: { ...font.caption, color: colors.warning },

  queueCounter: {
    ...font.caption,
    color: colors.textFaint,
    textAlign: "center",
    paddingTop: space.md,
  },

  cardScroll: { flex: 1 },
  cardContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.xl,
    gap: space.md,
  },
  prompt: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  front: {
    ...font.display,
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
  },
  answer: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.md,
    alignItems: "center",
  },
  back: {
    ...font.display,
    color: colors.accent,
    textAlign: "center",
  },
  fallbackLink: { ...font.small, color: colors.textFaint, textDecorationLine: "underline" },
  fallbackRu: { ...font.body, color: colors.textMuted },
  context: { ...font.small, color: colors.textMuted, textAlign: "center", fontStyle: "italic" },
  meta: { alignItems: "center", gap: space.xs, marginTop: space.sm },
  metaText: { ...font.caption, color: colors.textFaint },
  listenLink: { ...font.small, color: colors.accent },

  grades: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gradeBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  gradePressed: { opacity: 0.7 },
  gradeText: { ...font.small, fontWeight: "700" },
  revealBtn: { flex: 1 },
});
