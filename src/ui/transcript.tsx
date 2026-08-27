import { Box, Static, Text } from "ink";
import { memo } from "react";
import { useStore } from "../state/store.js";
import { RowView, SpinnerGlyph, type TranscriptRow } from "./rows.js";

function SettledBlock({ row }: { row: TranscriptRow }) {
  return (
    <Box flexDirection="column">
      {row.kind === "assistant" || row.kind === "error" ? <Text> </Text> : null}
      {row.kind === "assistant" ? <Text> </Text> : null}
      <RowView row={row} />
      {row.kind === "user" ? (
        <>
          <Text> </Text>
          <Text> </Text>
        </>
      ) : (
        <Text> </Text>
      )}
    </Box>
  );
}

export const Transcript = memo(function Transcript({ layoutKey = 0 }: { layoutKey?: number }) {
  const rows = useStore((s) => s.rows);
  const streamingId = useStore((s) => s.streamingId);
  const settled = rows.filter((row) => {
    if (row.id === streamingId) {
      return false;
    }
    if (row.kind === "tool" && row.status === "running") {
      return false;
    }
    return true;
  });
  const live = rows.filter(
    (row) =>
      row.id === streamingId || (row.kind === "tool" && row.status === "running"),
  );

  return (
    <Box flexDirection="column">
      <Static key={layoutKey} items={settled}>
        {(row) => (
          <Box key={`${layoutKey}:${row.id}`}>
            <SettledBlock row={row} />
          </Box>
        )}
      </Static>
      {live.map((row) =>
        row.kind === "assistant" && row.text.length === 0 ? null : (
          <Box key={row.id} flexDirection="column">
            <RowView row={row} />
          </Box>
        ),
      )}
    </Box>
  );
});

export const ActivityLine = memo(function ActivityLine() {
  const streaming = useStore((s) => s.streamingId !== null);
  const running = useStore((s) => s.rows.find((r) => r.kind === "tool" && r.status === "running"));
  if (!streaming) {
    return null;
  }
  const label =
    running && running.kind === "tool" ? `${running.name} ${running.args}`.trim() : "Working...";
  return (
    <Box>
      <SpinnerGlyph />
      <Text> {label}</Text>
    </Box>
  );
});
