/**
 * Примитивы UI поверх токенов из theme.ts.
 *
 * Цель — чтобы кнопки, карточки и пустые состояния выглядели одинаково
 * на всех экранах и имели площадь тапа не меньше MIN_TOUCH.
 */
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, font, HIT_SLOP, MIN_TOUCH, radius, space } from "./theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "secondary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive }}
      style={({ pressed }) => [
        styles.btn,
        variantStyles[variant],
        pressed && !inactive && styles.btnPressed,
        inactive && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <Text
          style={[
            styles.btnText,
            variant === "ghost" && styles.btnTextGhost,
            variant === "primary" && styles.btnTextPrimary,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  if (!onPress && !onLongPress) {
    return <View style={[styles.card, style]}>{children}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/** Полоска прогресса 0..1. */
export function ProgressBar({
  value,
  color = colors.accent,
}: {
  value: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]}
      />
    </View>
  );
}

export function Badge({
  label,
  color = colors.accent,
}: {
  label: string;
  color?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  hint,
  action,
}: {
  emoji: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: "transparent" },
  danger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.danger,
  },
};

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: { opacity: 0.75 },
  btnDisabled: { opacity: 0.35 },
  btnText: { ...font.body, color: colors.text, fontWeight: "600" },
  btnTextPrimary: { fontWeight: "700" },
  btnTextGhost: { color: colors.textMuted, fontWeight: "500" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceRaised },

  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radius.pill },

  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: { ...font.caption, fontWeight: "700" },

  empty: {
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: {
    ...font.title,
    color: colors.text,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyHint: { ...font.small, color: colors.textMuted, textAlign: "center" },
  emptyAction: { marginTop: space.md, alignSelf: "stretch" },
});
