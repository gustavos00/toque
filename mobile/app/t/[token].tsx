// Opened by the Universal Link https://<domain>/t/<token> (or toque://t/<token>): a small
// popup "<task> · Feito / Adiar". The scan is only recorded when the user taps "Feito".

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { syncReminderNotifications } from "../../src/notifications";
import {
  fetchTagScanInfo,
  postTagAction,
  type ScanResult,
  type TagScanInfo,
} from "../../src/scan";

export default function TagPopup() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [info, setInfo] = useState<TagScanInfo | null | undefined>(undefined);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTagScanInfo(token)
      .then(setInfo)
      .catch((e: Error) => {
        setInfo(null);
        setError(e.message);
      });
  }, [token]);

  async function act(action: "done" | "snooze") {
    setBusy(true);
    setError(null);
    try {
      setResult(await postTagAction(token, action));
      void syncReminderNotifications();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const title = result?.title ?? info?.taskName ?? info?.tagLabel ?? "Etiqueta";
  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        {info === undefined ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>
              {error ??
                result?.message ??
                (info === null
                  ? "Etiqueta desconhecida."
                  : info.canScan
                    ? "O que queres fazer?"
                    : "Esta etiqueta não tem uma tarefa ativa.")}
            </Text>
            {result || !info?.canScan ? (
              <Pressable style={styles.primary} onPress={close}>
                <Text style={styles.primaryText}>Fechar</Text>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <Pressable
                  style={[styles.secondary, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => act("snooze")}
                >
                  <Text style={styles.secondaryText}>Adiar</Text>
                </Pressable>
                <Pressable
                  style={[styles.primary, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => act("done")}
                >
                  <Text style={styles.primaryText}>Feito</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: "700" },
  message: { fontSize: 17, color: "#5b5b61" },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  primary: {
    flex: 1,
    backgroundColor: "#007ea6",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  secondary: {
    flex: 1,
    backgroundColor: "#e5e5ea",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  secondaryText: { fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
