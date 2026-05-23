import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class DevErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ShadowTube] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Ошибка приложения</Text>
          <Text style={styles.message}>{e.message}</Text>
          {e.stack ? (
            <ScrollView style={styles.scroll}>
              <Text style={styles.stack}>{e.stack}</Text>
            </ScrollView>
          ) : null}
          <Text style={styles.hint}>
            Сфотографируйте экран или скопируйте текст. Также смотрите терминал
            Metro (pnpm start:clear) — там будет тот же stack.
          </Text>
          <Pressable
            style={styles.btn}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={styles.btnText}>Попробовать снова</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#1a0a0a",
    padding: 20,
    paddingTop: 56,
  },
  title: { color: "#ff6b6b", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  message: { color: "#fff", fontSize: 16, marginBottom: 12 },
  scroll: { flex: 1, marginBottom: 12 },
  stack: { color: "#aaa", fontSize: 11, fontFamily: "monospace" },
  hint: { color: "#888", fontSize: 13, marginBottom: 16 },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
