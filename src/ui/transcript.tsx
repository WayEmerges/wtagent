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

export const Transcript = memo(function Transcript() {
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
      <Static items={settled}>
        {(row) => (
          <Box key={row.id}>
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
  if (!streaming) {
    return null;
  }
  return (
    <Box>
      <SpinnerGlyph />
      <Text> Working...</Text>
    </Box>
  );
});
