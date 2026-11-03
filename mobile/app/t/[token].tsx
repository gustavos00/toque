// Opened by the Universal Link https://<domain>/t/<token> (or toque://t/<token>): a small
// sheet "<task> · Done / Snooze". The scan is only recorded when the user taps "Done".

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, colors, fonts } from "../../src/components/ui";
import { syncReminderNotifications } from "../../src/notifications";
import {
  fetchTagScanInfo,
  postTagAction,
  type ScanResult,
  type TagScanInfo,
} from "../../src/scan";

export default function TagSheet() {
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
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const title = result?.title ?? info?.taskName ?? info?.tagLabel ?? "Tag";
  const message =
    error ??
    result?.message ??
    (info === null
      ? "This tag is not known."
      : info?.canScan
        ? "What would you like to do?"
        : "This tag has no active task.");

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        {info === undefined ? (
          <ActivityIndicator color={colors.soft} />
        ) : (
          <>
            {info?.tagLabel ? <Text style={styles.eyebrow}>{info.tagLabel}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            {result || !info?.canScan ? (
              <Button title="Close" tone="secondary" onPress={close} />
            ) : (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button title="Snooze" tone="secondary" disabled={busy} onPress={() => act("snooze")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Done" disabled={busy} onPress={() => act("done")} />
                </View>
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
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    padding: 24,
    paddingBottom: 36,
  },
  eyebrow: {
    fontSize: 12,
    color: colors.faint,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginBottom: 8 },
  message: { fontSize: 17, lineHeight: 24, color: colors.soft, marginBottom: 28 },
  row: { flexDirection: "row", gap: 12 },
});
