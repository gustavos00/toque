import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { createTag, deleteTag, fetchTags, fetchTasks, updateTag } from "../../src/api";
import {
  Button,
  Choice,
  colors,
  Empty,
  Field,
  Input,
  LoadState,
  Message,
  Row,
  Screen,
  Section,
  Segmented,
} from "../../src/components/ui";
import { formatDayTime } from "../../src/format";
import { useApi } from "../../src/useApi";
import type { TagDto } from "../../../src/shared/api";

const ACTIONS = [
  { value: "start", label: "Start" },
  { value: "complete", label: "Complete" },
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
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function confirmDelete(tag: TagDto) {
    Alert.alert("Delete tag?", `“${tag.label}” will stop working.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => run(() => deleteTag(tag.id)) },
    ]);
  }

  function describe(tag: TagDto): string {
    const task = taskName(tag.taskId) ?? "No task";
    return tag.action === "complete" ? `${task} · Completes` : task;
  }

  return (
    <Screen title="Tags">
      <LoadState loading={loading} error={error} hasData={!!tags} onRetry={reload} />
      {tags ? (
        <Section title="Tags">
          {tags.length === 0 ? (
            <Empty title="No tags yet" description="Create a tag and write it to an NFC sticker." />
          ) : (
            tags.map((tag) => (
              <View key={tag.id}>
                <Row
                  title={tag.label}
                  subtitle={describe(tag)}
                  value={tag.lastScannedAt ? formatDayTime(tag.lastScannedAt) : "Never tapped"}
                  onPress={() => setOpenId(openId === tag.id ? null : tag.id)}
                />
                {openId === tag.id ? (
                  <View style={{ paddingTop: 16, paddingBottom: 8 }}>
                    <Section title="When tapped">
                      <Segmented
                        value={tag.action}
                        options={ACTIONS}
                        onChange={(action) => run(() => updateTag(tag.id, { action }))}
                      />
                    </Section>
                    <Section title="Task">
                      <Choice
                        text="No task"
                        active={tag.taskId === null}
                        onPress={() => run(() => updateTag(tag.id, { taskId: null }))}
                      />
                      {tasks?.map((t) => (
                        <Choice
                          key={t.id}
                          text={t.name}
                          active={tag.taskId === t.id}
                          onPress={() => run(() => updateTag(tag.id, { taskId: t.id }))}
                        />
                      ))}
                    </Section>
                    <Text selectable style={{ color: colors.faint, fontSize: 13, marginBottom: 16 }}>
                      {tag.url}
                    </Text>
                    <Button
                      title="Write to NFC tag"
                      tone="secondary"
                      onPress={() => router.push(`/tag/${tag.id}/link`)}
                    />
                    <Button title="Delete tag" tone="danger" onPress={() => confirmDelete(tag)} />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>
      ) : null}
      <Section title="New tag">
        <Field label="Name">
          <Input value={label} onChangeText={setLabel} placeholder="e.g. Kitchen door" maxLength={80} />
        </Field>
      </Section>
      <Message text={message} />
      <Button
        title="Create tag"
        tone="secondary"
        disabled={!label.trim()}
        onPress={() =>
          run(async () => {
            await createTag({ label, taskId: null, action: "start" });
            setLabel("");
          })
        }
      />
    </Screen>
  );
}
