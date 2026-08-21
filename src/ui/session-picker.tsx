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
      <Box paddingX={2}>
        <Box paddingLeft={3}>
          <Text dimColor italic>
            No saved sessions for this workspace
          </Text>
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box paddingLeft={3}>
        <Text dimColor>Resume session</Text>
      </Box>
      {sessions.map((s, i) => {
        const active = i === selected;
        const when = s.updatedAt.replace("T", " ").slice(0, 16);
        const line = `${when}  ${sessionTitle(s)}`;
        return (
          <Box key={s.id} width="100%" flexDirection="row" alignItems="center">
            <Box width={1} backgroundColor={active ? "cyan" : undefined}>
              <Text> </Text>
            </Box>
            <Box width={2}>
              <Text color={active ? "cyan" : undefined} dimColor={!active}>
                {active ? "→ " : "  "}
              </Text>
            </Box>
            <Text bold={active} dimColor={!active} wrap="truncate">
              {line}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
