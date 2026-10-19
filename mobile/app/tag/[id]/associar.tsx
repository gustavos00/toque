// "Associar tag": read what a tag holds or write this tag's https URL to it (NFC).

import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchTags } from "../../../src/api";
import { isNfcAvailable, readTagUrl, writeTagUrl } from "../../../src/nfc";

export default function AssociateTag() {
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
      .catch(() => setStatus("Não foi possível carregar a etiqueta."));
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
      if (!found) return "A etiqueta está vazia.";
      return found === url
        ? "Esta etiqueta já aponta para esta tarefa."
        : `Tem: ${found}`;
    });
  const write = () =>
    run(async () => {
      if (!url) throw new Error("Sem URL para gravar");
      await writeTagUrl(url);
      return "Etiqueta gravada.";
    });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label || "Etiqueta"}</Text>
      {url ? (
        <Text selectable style={styles.url}>
          {url}
        </Text>
      ) : null}
      {nfc === false ? (
        <Text style={styles.url}>Este dispositivo não lê NFC.</Text>
      ) : (
        <>
          <Pressable style={styles.button} onPress={write} disabled={!url}>
            <Text style={styles.buttonText}>Gravar tag</Text>
          </Pressable>
          <Pressable style={styles.buttonAlt} onPress={read}>
            <Text style={styles.buttonAltText}>Ler tag</Text>
          </Pressable>
        </>
      )}
      {status ? <Text style={styles.url}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14 },
  title: { fontSize: 24, fontWeight: "700" },
  url: { fontSize: 15, color: "#5b5b61" },
  button: {
    backgroundColor: "#007ea6",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  buttonAlt: {
    backgroundColor: "#e5e5ea",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  buttonAltText: { fontSize: 17, fontWeight: "600" },
});
