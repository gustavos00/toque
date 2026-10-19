import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { createTag, deleteTag, fetchTags, fetchTasks, updateTag } from "../../src/api";
import { Button, colors, Empty, Field, Input, LoadState, Row, Screen, Section, Segmented } from "../../src/components/ui";
import { useApi } from "../../src/useApi";
import type { TagDto } from "../../../src/shared/api";

const ACTIONS = [
  { value: "start", label: "Normal" },
  { value: "complete", label: "Concluir" },
] as const;

export default function TagsScreen() {
  const { data: tags, error, loading, reload } = useApi(fetchTags);
  const { data: tasks } = useApi(fetchTasks);
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const taskName = (id: string | null) => tasks?.find((t) => t.id === id)?.name;

  async function run(fn: () => Promise<unknown>) {
    setMessage(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha");
    }
  }

  function confirmDelete(tag: TagDto) {
    Alert.alert("Apagar tag?", `“${tag.label}” deixa de funcionar.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => run(() => deleteTag(tag.id)) },
    ]);
  }

  return (
    <Screen title="Tags">
      <LoadState loading={loading} error={error} hasData={!!tags} onRetry={reload} />
      <Section title="Nova tag">
        <Field label="Nome">
          <Input value={label} onChangeText={setLabel} placeholder="ex.: Porta da cozinha" maxLength={80} />
        </Field>
      </Section>
      <Button
        title="Criar tag"
        disabled={!label.trim()}
        onPress={() => run(async () => { await createTag({ label, taskId: null, action: "start" }); setLabel(""); })}
      />
      {message ? <Text style={{ color: colors.danger, marginTop: 8 }}>{message}</Text> : null}
      {tags ? (
        <View style={{ marginTop: 24 }}>
          <Section>
            {tags.length === 0 ? (
              <Empty title="Sem tags" description="Cria uma tag e grava-a num autocolante NFC." />
            ) : (
              tags.map((tag) => (
                <View key={tag.id}>
                  <Row
                    title={tag.label}
                    subtitle={`${taskName(tag.taskId) ?? "Sem tarefa"}${tag.action === "complete" ? " · concluir" : ""}`}
                    onPress={() => setOpenId(openId === tag.id ? null : tag.id)}
                  />
                  {openId === tag.id ? (
                    <View style={{ padding: 8 }}>
                      <Text style={{ color: colors.muted, paddingHorizontal: 8 }}>Ao ler:</Text>
                      <Segmented
                        value={tag.action}
                        options={ACTIONS}
                        onChange={(action) => run(() => updateTag(tag.id, { action }))}
                      />
                      <Text style={{ color: colors.muted, paddingHorizontal: 8 }}>Tarefa:</Text>
                      <View style={{ padding: 8, gap: 4 }}>
                        <Chip text="Sem tarefa" active={tag.taskId === null} onPress={() => run(() => updateTag(tag.id, { taskId: null }))} />
                        {tasks?.map((t) => (
                          <Chip key={t.id} text={t.name} active={tag.taskId === t.id} onPress={() => run(() => updateTag(tag.id, { taskId: t.id }))} />
                        ))}
                      </View>
                      <Text selectable style={{ color: colors.muted, padding: 8, fontSize: 12 }}>{tag.url}</Text>
                      <Button title="Gravar / associar etiqueta NFC" onPress={() => router.push(`/tag/${tag.id}/associar`)} tone="plain" />
                      <Button title="Apagar tag" tone="danger" onPress={() => confirmDelete(tag)} />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </Section>
        </View>
      ) : null}
    </Screen>
  );
}

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ padding: 10, borderRadius: 10, backgroundColor: active ? colors.primary : "#e5e5ea" }}>
      <Text style={{ color: active ? "#fff" : colors.text }}>{text}</Text>
    </Pressable>
  );
}
