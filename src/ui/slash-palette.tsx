import { Box, Text } from "ink";
import { listSkills } from "../skills/load.js";

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

export function allSlashCommands(): SlashCommand[] {
  const extra: SlashCommand[] = [];
  try {
    for (const skill of listSkills()) {
      const name = `/${skill.id}`;
      if (SLASH_COMMANDS.some((c) => c.name === name)) {
        continue;
      }
      extra.push({
        name,
        summary: skill.description || `Toggle skill ${skill.id}`,
        implemented: true,
      });
    }
  } catch {
    /* palette still works without skill files */
  }
  return extra.length > 0 ? [...SLASH_COMMANDS, ...extra] : SLASH_COMMANDS;
}

export function filterSlash(draft: string): SlashCommand[] {
  const token = (draft.trim().split(/\s/)[0] ?? "").toLowerCase();
  if (!token.startsWith("/")) {
    return allSlashCommands();
  }
  return allSlashCommands().filter((c) => c.name.startsWith(token));
}

export function slashTokenAt(
  text: string,
  cursor: number,
): { start: number; end: number; token: string } | null {
  const c = Math.max(0, Math.min(cursor, text.length));
  let start = c;
  while (start > 0 && !/\s/.test(text[start - 1]!)) {
    start--;
  }
  let end = start;
  while (end < text.length && !/\s/.test(text[end]!)) {
    end++;
  }
  const token = text.slice(start, end);
  if (!token.startsWith("/")) {
    return null;
  }
  return { start, end, token };
}

const CAVEMAN_ARG = /^(on|off|normal|toggle|lite|full|ultra)$/i;
const MODE_ARG = /^(plan|ask|agent)$/i;
const SKILL_ONE = /^(list|ls|status|add)$/i;
const SKILL_ONOFF = /^(on|off)$/i;
const SKILL_ACTION = /^(on|off|toggle|lite|full|ultra)$/i;

/** Commands that open a picker or exit — keep leftover text, do not auto-send. */
export const SLASH_HOLD_REST = new Set(["/model", "/resume", "/quit", "/exit"]);

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) {
    i++;
  }
  return i;
}

function readWord(text: string, i: number): { word: string; start: number; end: number } | null {
  const start = skipWs(text, i);
  if (start >= text.length) {
    return null;
  }
  let end = start;
  while (end < text.length && !/\s/.test(text[end]!)) {
    end++;
  }
  return { word: text.slice(start, end), start, end };
}

function knownSlashName(name: string): boolean {
  const n = name.toLowerCase();
  if (n === "/skills") {
    return true;
  }
  return allSlashCommands().some((c) => c.name === n);
}

function consumeSlashAt(text: string, start: number): { command: string; end: number } | null {
  const head = readWord(text, start);
  if (!head || !head.word.startsWith("/")) {
    return null;
  }
  const name = head.word.toLowerCase();
  if (!knownSlashName(name)) {
    return null;
  }
  let end = head.end;
  if (name === "/caveman") {
    const arg = readWord(text, end);
    if (arg && CAVEMAN_ARG.test(arg.word)) {
      end = arg.end;
    }
  } else if (name === "/skill" || name === "/skills") {
    const a0 = readWord(text, end);
    if (a0) {
      if (SKILL_ONE.test(a0.word)) {
        end = a0.end;
      } else if (SKILL_ONOFF.test(a0.word)) {
        end = a0.end;
        const a1 = readWord(text, end);
        if (a1) {
          end = a1.end;
        }
      } else {
        end = a0.end;
        const a1 = readWord(text, end);
        if (a1 && SKILL_ACTION.test(a1.word)) {
          end = a1.end;
        }
      }
    }
  } else if (name === "/mode") {
    const arg = readWord(text, end);
    if (arg && MODE_ARG.test(arg.word)) {
      end = arg.end;
    }
  }
  return { command: text.slice(head.start, end).trim(), end };
}

/** Pull a /command out of a line that also has normal prompt text. */
export function splitInlineSlash(text: string): { command: string; rest: string } | null {
  let last: { command: string; from: number; to: number } | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "/") {
      continue;
    }
    if (i > 0 && !/\s/.test(text[i - 1]!)) {
      continue;
    }
    const consumed = consumeSlashAt(text, i);
    if (consumed) {
      last = { command: consumed.command, from: i, to: consumed.end };
      i = consumed.end - 1;
    }
  }
  if (!last) {
    return null;
  }
  const rest = `${text.slice(0, last.from)} ${text.slice(last.to)}`.replace(/\s+/g, " ").trim();
  return { command: last.command, rest };
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
