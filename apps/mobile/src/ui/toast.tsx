/**
 * Тосты вместо Alert.alert.
 *
 * Alert — модальный: он прерывает сессию shadowing и требует тапа «ОК»
 * на каждое сохранение. Тост показывается поверх и гаснет сам.
 */
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { create } from "zustand";
import { colors, font, radius, space } from "./theme";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; text: string; kind: ToastKind };

type ToastState = {
  current: Toast | null;
  show: (text: string, kind?: ToastKind) => void;
  hide: () => void;
};

const DURATION_MS = 2200;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (text, kind = "success") =>
    set({ current: { id: Date.now(), text, kind } }),
  hide: () => set({ current: null }),
}));

/** Хелпер для вызова вне React-компонентов. */
export const toast = {
  success: (text: string) => useToastStore.getState().show(text, "success"),
  error: (text: string) => useToastStore.getState().show(text, "error"),
  info: (text: string) => useToastStore.getState().show(text, "info"),
};

const KIND_COLOR: Record<ToastKind, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.accent,
};

/** Монтируется один раз в корневом layout. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => hide());
    }, DURATION_MS);

    return () => clearTimeout(t);
  }, [current, opacity, hide]);

  if (!current) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={[styles.toast, { borderColor: KIND_COLOR[current.kind] }]}>
        <View style={[styles.dot, { backgroundColor: KIND_COLOR[current.kind] }]} />
        <Text style={styles.text} numberOfLines={2}>
          {current.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: space.xxl,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    maxWidth: "100%",
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  text: { ...font.small, color: colors.text, flexShrink: 1 },
});
