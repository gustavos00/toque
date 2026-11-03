// Read what an NFC tag holds, or write this tag's https URL to it.

import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { fetchTags } from "../../../src/api";
import { Button, colors, fonts } from "../../../src/components/ui";
import { isNfcAvailable, readTagUrl, writeTagUrl } from "../../../src/nfc";

export default function LinkTag() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [url, setUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [nfc, setNfc] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void isNfcAvailable().then(setNfc);
    fetchTags()
      .then((tags) => {
        const tag = tags.find((t) => t.id === id);
        setUrl(tag?.url ?? null);
        setLabel(tag?.label ?? "");
      })
      .catch(() => setStatus("Could not load the tag."));
  }, [id]);

  async function run(action: () => Promise<string>) {
    try {
      setStatus(await action());
    } catch (e) {
      // Cancelling the iOS NFC sheet also lands here.
      const message = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(message)) Alert.alert("NFC", message);
    }
  }

  const read = () =>
    run(async () => {
      const found = await readTagUrl();
      if (!found) return "The tag is empty.";
      return found === url ? "This tag already points to this task." : `It holds: ${found}`;
    });
  const write = () =>
    run(async () => {
      if (!url) throw new Error("No URL to write");
      await writeTagUrl(url);
      return "Tag written.";
    });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label || "Tag"}</Text>
      {url ? (
        <Text selectable style={styles.url}>
          {url}
        </Text>
      ) : null}
      {nfc === false ? (
        <Text style={styles.note}>This device cannot read NFC.</Text>
      ) : (
        <>
          <Button title="Write tag" onPress={write} disabled={!url} />
          <Button title="Read tag" tone="secondary" onPress={read} />
        </>
      )}
      {status ? <Text style={styles.note}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.bg },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginBottom: 8 },
  url: { fontSize: 13, color: colors.faint, marginBottom: 32 },
  note: { fontSize: 15, color: colors.soft, marginTop: 4 },
});
