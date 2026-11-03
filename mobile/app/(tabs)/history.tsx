import { useState } from "react";
import { fetchEvents } from "../../src/api";
import type { EventDto } from "../../../src/shared/api";
import { Button, Empty, LoadState, Row, Screen, Section } from "../../src/components/ui";
import { formatDayTime, formatEventSubject, formatEventType } from "../../src/format";
import { useApi } from "../../src/useApi";

export default function HistoryScreen() {
  const { data, error, loading, reload } = useApi(() => fetchEvents());
  const [extra, setExtra] = useState<EventDto[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const next = cursor === undefined ? (data?.nextBeforeId ?? null) : cursor;
  const events = [...(data?.events ?? []), ...extra];

  async function loadMore() {
    if (!next) return;
    const page = await fetchEvents(next);
    setExtra((prev) => [...prev, ...page.events]);
    setCursor(page.nextBeforeId);
  }

  return (
    <Screen title="History">
      <LoadState
        loading={loading}
        error={error}
        hasData={!!data}
        onRetry={() => {
          setExtra([]);
          setCursor(undefined);
          void reload();
        }}
      />
      {data ? (
        <>
          <Section>
            {events.length === 0 ? (
              <Empty title="Nothing logged yet" />
            ) : (
              events.map((e) => (
                <Row
                  key={e.id}
                  title={formatEventSubject(e)}
                  subtitle={formatEventType(e)}
                  value={formatDayTime(e.at)}
                />
              ))
            )}
          </Section>
          {next ? <Button title="Load more" onPress={loadMore} tone="secondary" /> : null}
        </>
      ) : null}
    </Screen>
  );
}
