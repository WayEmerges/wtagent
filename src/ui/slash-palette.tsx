import { Box, Text } from "ink";

export type SlashCommand = {
  name: string;
  summary: string;
  implemented: boolean;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", summary: "Show commands", implemented: true },
  { name: "/mode", summary: "Cycle Agent / Plan / Ask", implemented: true },
  { name: "/clear", summary: "New chat, keep process", implemented: true },
  { name: "/quit", summary: "Exit", implemented: true },
  { name: "/exit", summary: "Exit", implemented: true },
  { name: "/model", summary: "Pick model", implemented: true },
  { name: "/resume", summary: "Resume a session", implemented: true },
  { name: "/compact", summary: "Summarize session into MEMORY.md", implemented: true },
  { name: "/skill", summary: "List/toggle prompt skills", implemented: true },
  { name: "/caveman", summary: "Terse mode on/off/lite/full/ultra", implemented: true },
  { name: "/copy", summary: "Copy last assistant message", implemented: true },
  { name: "/config", summary: "Show config path", implemented: true },
];

export function filterSlash(draft: string): SlashCommand[] {
  const token = draft.split(/\s/)[0] ?? "";
  if (!token.startsWith("/")) {
    return SLASH_COMMANDS;
  }
  const q = token.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

export function SlashPalette({
  matches,
  selected,
}: {
  matches: SlashCommand[];
  selected: number;
}) {
  if (matches.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor italic>
          No matching commands
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
      {matches.map((cmd, i) => {
        const active = i === selected;
        return (
          <Box key={cmd.name}>
            <Text inverse={active}>{cmd.name}</Text>
            <Text dimColor>
              {"  "}
              {cmd.summary}
              {cmd.implemented ? "" : "  (not implemented)"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
