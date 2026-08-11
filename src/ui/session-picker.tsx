import { Box, Text } from "ink";
import type { SavedSession } from "../sessions/store.js";
import { sessionTitle } from "../sessions/store.js";

export function SessionPicker({
  sessions,
  selected,
}: {
  sessions: SavedSession[];
  selected: number;
}) {
  if (sessions.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor italic>
          No saved sessions for this workspace
        </Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
      <Text dimColor>Resume session</Text>
      {sessions.map((s, i) => {
        const active = i === selected;
        const when = s.updatedAt.replace("T", " ").slice(0, 16);
        const line = `${when}  ${sessionTitle(s)}`;
        return (
          <Box key={s.id}>
            <Text inverse={active}>{line}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
