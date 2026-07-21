import { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { translatePhrase } from "@/src/api/gemini";
import { isFakeGemini } from "@/src/api/geminiFake";
import { addVocabularyEntry } from "@/src/db/repos/vocabulary";
import { refreshDueCount } from "@/src/srs/dueStore";
import { useSettingsStore } from "@/src/store/settings";
import { Badge, Button } from "@/src/ui/components";
import { toast } from "@/src/ui/toast";
import { colors, font, radius, space } from "@/src/ui/theme";
import type { PhraseKind, PhraseTranslation } from "@shadowtube/shared";

type Props = {
  visible: boolean;
  /** Выделенный отрезок. */
  phrase: string;
  /** Предложение целиком — контекст для модели и для карточки. */
  context: string;
  apiKey: string | null;
  sourceVideoId?: string;
  chunkIdx?: number;
  startSec?: number;
  endSec?: number;
  onClose: () => void;
  onReplay?: () => void;
};

const KIND_LABEL: Record<PhraseKind, string | null> = {
  idiom: "идиома",
  phrasal: "фразовый глагол",
  collocation: "устойчивое сочетание",
  plain: null,
};

export function PhraseSheet({
  visible,
  phrase,
  context,
  apiKey,
  sourceVideoId,
  chunkIdx,
  startSec,
  endSec,
  onClose,
  onReplay,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhraseTranslation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const geminiModel = useSettingsStore((s) => s.geminiModel);

  useEffect(() => {
    if (!visible || !phrase) return;

    let cancelled = false;
    setResult(null);
    setError(null);

    if (!apiKey && !isFakeGemini()) {
      setError("Добавьте Gemini API key в Настройках");
      return;
    }

    setLoading(true);
    translatePhrase(apiKey ?? "", phrase, context, geminiModel)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[ShadowTube] phrase translation failed", {
          phrase,
          model: geminiModel,
          error: e instanceof Error ? e.message : String(e),
        });
        setError(e instanceof Error ? e.message : "Ошибка перевода");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, phrase, context, apiKey, geminiModel]);

  const handleSave = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      const { created } = await addVocabularyEntry({
        text: phrase,
        context,
        translation: result.ru,
        definitionEn: result.definitionEn,
        literal: result.literal,
        note: result.note,
        kind: "phrase",
        sourceVideoId,
        chunkIdx,
        startSec,
        endSec,
      });
      if (created) refreshDueCount();
      toast[created ? "success" : "info"](
        created ? `«${phrase}» — в словаре` : `«${phrase}» уже в словаре`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const kindLabel = result ? KIND_LABEL[result.kind] : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
              <Text style={styles.phrase}>{phrase}</Text>
              {kindLabel ? <Badge label={kindLabel} color={colors.warning} /> : null}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {result ? (
              <>
                <Text style={styles.translation}>{result.ru}</Text>

                {result.literal ? (
                  <Text style={styles.literal}>дословно: {result.literal}</Text>
                ) : null}

                {result.definitionEn ? (
                  <View style={styles.block}>
                    <Text style={styles.blockLabel}>по-английски</Text>
                    <Text style={styles.definition}>{result.definitionEn}</Text>
                  </View>
                ) : null}

                {result.note ? (
                  <View style={[styles.block, styles.noteBlock]}>
                    <Text style={styles.note}>{result.note}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockLabel}>в предложении</Text>
              <Text style={styles.context}>{context}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {onReplay ? (
              <Button title="🔁 Ещё раз" onPress={onReplay} style={styles.actionSide} />
            ) : null}
            <Button
              title="＋ В словарь"
              variant="primary"
              onPress={handleSave}
              disabled={!result}
              loading={saving}
              style={styles.actionMain}
            />
          </View>
          <Button title="Закрыть" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
    maxHeight: "80%",
    gap: space.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: space.md,
  },
  scroll: { flexGrow: 0 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.sm,
  },
  phrase: { ...font.title, color: colors.text, fontWeight: "700", flexShrink: 1 },
  translation: { ...font.display, color: colors.accent, marginBottom: space.xs },
  literal: { ...font.small, color: colors.textFaint, fontStyle: "italic" },
  block: { marginTop: space.lg },
  blockLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: space.xs,
  },
  definition: { ...font.body, color: colors.text },
  noteBlock: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: radius.sm,
    padding: space.md,
  },
  note: { ...font.small, color: colors.textMuted },
  context: { ...font.small, color: colors.textMuted },
  error: { ...font.small, color: colors.danger, marginVertical: space.md },
  loader: { marginVertical: space.lg },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  actionSide: { flex: 1 },
  actionMain: { flex: 1.4 },
});
