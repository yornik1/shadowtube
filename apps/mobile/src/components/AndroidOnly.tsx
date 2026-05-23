import { View, Text, StyleSheet, Linking, Pressable } from "react-native";

export function AndroidOnly() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>ShadowTube</Text>
      <Text style={styles.body}>
        Приложение работает только на Android (Expo Go или эмулятор). В браузере
        web-версия не поддерживается.
      </Text>
      <Text style={styles.hint}>
        Запустите: pnpm start → Expo Go на телефоне или эмулятор (клавиша a
        после настройки adb).
      </Text>
      <Pressable
        style={styles.link}
        onPress={() =>
          Linking.openURL(
            "https://docs.expo.dev/get-started/expo-go/#android",
          )
        }
      >
        <Text style={styles.linkText}>Документация Expo Go →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#0f0f14",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 16 },
  body: { fontSize: 16, color: "#ccc", lineHeight: 24, marginBottom: 12 },
  hint: { fontSize: 14, color: "#888", lineHeight: 22 },
  link: { marginTop: 20 },
  linkText: { color: "#7eb8ff", fontSize: 15 },
});
