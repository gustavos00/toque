import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { login } from "../src/api";
import { Button, colors, fonts, Input, Message } from "../src/components/ui";

export default function LoginScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Toque</Text>
      <Text style={styles.lead}>Household chores, logged by tapping an NFC tag.</Text>
      <View style={styles.field}>
        <Input
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
      </View>
      <Message text={error} />
      <Button title="Sign in" onPress={submit} disabled={busy || !password} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  title: { fontFamily: fonts.serif, fontSize: 44, color: colors.text, letterSpacing: -0.5 },
  lead: { fontSize: 16, color: colors.soft, marginTop: 8, marginBottom: 40 },
  field: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    marginBottom: 20,
  },
  input: { textAlign: "left", paddingVertical: 16 },
});
