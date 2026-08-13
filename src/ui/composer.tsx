import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { useEffect, useState } from "react";
import { modelChoices } from "../config/load.js";
import { listSessions } from "../sessions/store.js";
import { useStore } from "../state/store.js";
import { ModelPicker } from "./model-picker.js";
import { SessionPicker } from "./session-picker.js";
import { filterSlash, SlashPalette, SLASH_COMMANDS } from "./slash-palette.js";

const MIN_INNER_LINES = 3;
const GLYPH = " → ";
const CONT = "   ";
const COMPOSER_BG = "#1f1f1f";

type VisLine = { text: string; start: number };

function Caret({ ch }: { ch: string }) {
  return (
    <Text backgroundColor="white" color="black">
      {ch.length > 0 ? ch : " "}
    </Text>
  );
}

function useTerminalFocus(): boolean {
  const [focused, setFocused] = useState(true);
  const { stdin } = useStdin();
  const { stdout } = useStdout();

  useEffect(() => {
    stdout.write("\x1b[?1004h");
    const onData = (chunk: Buffer | string) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (s.includes("\x1b[I")) {
        setFocused(true);
      }
      if (s.includes("\x1b[O")) {
        setFocused(false);
      }
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
      stdout.write("\x1b[?1004l");
    };
  }, [stdin, stdout]);

  return focused;
}

function Placeholder({ text, caret }: { text: string; caret: boolean }) {
  if (!caret || text.length === 0) {
    return (
      <Text dimColor wrap="truncate">
        {text}
      </Text>
    );
  }
  return (
    <Text wrap="truncate">
      <Text backgroundColor="white" color="black">
        {text.slice(0, 1)}
      </Text>
      <Text dimColor>{text.slice(1)}</Text>
    </Text>
  );
}

/** Word-wrap with original-string offsets for cursor mapping. */
function layoutLines(text: string, width: number): VisLine[] {
  const w = Math.max(1, width);
  if (text.length === 0) {
    return [{ text: "", start: 0 }];
  }
  const out: VisLine[] = [];
  const parts = text.split("\n");
  let offset = 0;

  for (let pi = 0; pi < parts.length; pi++) {
    const para = parts[pi]!;
    const paraStart = offset;

    if (para.length === 0) {
      out.push({ text: "", start: paraStart });
    } else {
      const words: { word: string; start: number }[] = [];
      let i = 0;
      while (i < para.length) {
        while (i < para.length && para[i] === " ") {
          i++;
        }
        if (i >= para.length) {
          break;
        }
        const ws = i;
        while (i < para.length && para[i] !== " ") {
          i++;
        }
        words.push({ word: para.slice(ws, i), start: paraStart + ws });
      }

      let cur = "";
      let curStart = paraStart;
      for (let wi = 0; wi < words.length; wi++) {
        const { word, start } = words[wi]!;
        if (cur.length === 0) {
          if (word.length > w) {
            for (let c = 0; c < word.length; c += w) {
              out.push({ text: word.slice(c, c + w), start: start + c });
            }
            cur = "";
          } else {
            cur = word;
            curStart = start;
          }
          continue;
        }
        if (cur.length + 1 + word.length <= w) {
          cur = `${cur} ${word}`;
        } else {
          out.push({ text: cur, start: curStart });
          if (word.length > w) {
            for (let c = 0; c < word.length; c += w) {
              out.push({ text: word.slice(c, c + w), start: start + c });
            }
            cur = "";
          } else {
            cur = word;
            curStart = start;
          }
        }
      }
      if (cur.length > 0 || words.length === 0) {
        out.push({ text: cur, start: curStart });
      }
    }

    offset += para.length;
    if (pi < parts.length - 1) {
      offset += 1;
    }
  }

  return out.length > 0 ? out : [{ text: "", start: 0 }];
}

function lineIndexForCursor(lines: VisLine[], cursor: number, textLen: number): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const nextStart = i + 1 < lines.length ? lines[i + 1]!.start : textLen + 1;
    if (cursor >= line.start && cursor < nextStart) {
      return i;
    }
  }
  return Math.max(0, lines.length - 1);
}

function clampCursor(n: number, len: number): number {
  return Math.max(0, Math.min(len, n));
}

function wordLeft(text: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && /\s/.test(text[i - 1]!)) {
    i--;
  }
  while (i > 0 && !/\s/.test(text[i - 1]!)) {
    i--;
  }
  return i;
}

function wordRight(text: string, cursor: number): number {
  let i = cursor;
  while (i < text.length && !/\s/.test(text[i]!)) {
    i++;
  }
  while (i < text.length && /\s/.test(text[i]!)) {
    i++;
  }
  return i;
}

export function Composer() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const focused = useTerminalFocus();
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const width = stdout.columns;
  const boxWidth = Math.max(20, width - 4);
  const innerWidth = Math.max(8, boxWidth - 2 - GLYPH.length);
  const placeholder = width < 80 ? "Ask a question..." : "Enter a command or ask a question...";

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [liveDraft, setLiveDraft] = useState("");
  const pendingShell = useStore((s) => s.pendingShell);
  const modelPickerOpen = useStore((s) => s.modelPickerOpen);
  const sessionPickerOpen = useStore((s) => s.sessionPickerOpen);
  const modelKey = useStore((s) => s.modelKey);
  const config = useStore((s) => s.config);
  const choices = modelChoices(config);
  const sessions = sessionPickerOpen ? listSessions(process.cwd()) : [];

  const matches = filterSlash(value);

  useEffect(() => {
    if (sessionPickerOpen) {
      setPickerIndex(0);
    }
  }, [sessionPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen) {
      return;
    }
    const list = modelChoices(useStore.getState().config);
    const current = useStore.getState().modelKey;
    const i = Math.max(
      0,
      list.findIndex((c) => c.key === current),
    );
    setPickerIndex(i);
  }, [modelPickerOpen]);

  useEffect(() => {
    setPaletteIndex(0);
  }, [value]);

  function setDraft(next: string, nextCursor?: number) {
    setValue(next);
    setCursor(clampCursor(nextCursor ?? next.length, next.length));
  }

  function remember(text: string) {
    setHistory((prev) => [...prev, text]);
    setHistoryIndex(null);
    setLiveDraft("");
  }

  function runSlash(line: string) {
    remember(line);
    useStore.getState().runCommand(line, exit);
    setDraft("");
    setPaletteOpen(false);
  }

  useInput((input, key) => {
    if (input === "\x1b[I" || input === "\x1b[O" || input === "[I" || input === "[O") {
      return;
    }
    if (pendingShell) {
      if (input === "y" || input === "Y") {
        useStore.getState().resolveShell("allow");
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        useStore.getState().resolveShell("deny");
        return;
      }
      if (input === "s" || input === "S") {
        useStore.getState().resolveShell("yolo");
        return;
      }
      return;
    }

    if (sessionPickerOpen) {
      if (key.escape) {
        useStore.getState().closeSessionPicker();
        return;
      }
      if (key.upArrow) {
        setPickerIndex((i) => (i - 1 + sessions.length) % Math.max(sessions.length, 1));
        return;
      }
      if (key.downArrow || key.tab) {
        setPickerIndex((i) => (i + 1) % Math.max(sessions.length, 1));
        return;
      }
      if (key.return) {
        const session = sessions[pickerIndex];
        if (session) {
          useStore.getState().selectSession(session.id);
        }
        return;
      }
      return;
    }

    if (modelPickerOpen) {
      if (key.escape) {
        useStore.getState().closeModelPicker();
        return;
      }
      if (key.upArrow) {
        setPickerIndex((i) => (i - 1 + choices.length) % Math.max(choices.length, 1));
        return;
      }
      if (key.downArrow || key.tab) {
        setPickerIndex((i) => (i + 1) % Math.max(choices.length, 1));
        return;
      }
      if (key.return) {
        const choice = choices[pickerIndex];
        if (choice) {
          useStore.getState().selectModel(choice.key);
        }
        return;
      }
      return;
    }

    if (key.escape) {
      if (paletteOpen) {
        setPaletteOpen(false);
      } else {
        useStore.getState().cancelStream();
      }
      return;
    }

    if (key.shift && key.tab) {
      useStore.getState().cycleMode();
      return;
    }

    if (key.tab) {
      const slashMode = paletteOpen || value.startsWith("/");
      if (slashMode && matches.length > 0) {
        if (!paletteOpen) {
          setPaletteOpen(true);
          setPaletteIndex(0);
        } else {
          setPaletteIndex((i) => (i + 1) % matches.length);
        }
      }
      return;
    }

    if (key.ctrl && (input === "c" || input === "d")) {
      exit();
      return;
    }

    const newline = (key.return && key.shift) || (key.ctrl && input === "j");
    if (newline) {
      const next = value.slice(0, cursor) + "\n" + value.slice(cursor);
      setDraft(next, cursor + 1);
      setHistoryIndex(null);
      return;
    }

    if (key.leftArrow) {
      setHistoryIndex(null);
      if (key.ctrl || key.meta) {
        setCursor(wordLeft(value, cursor));
      } else {
        setCursor((c) => Math.max(0, c - 1));
      }
      return;
    }

    if (key.rightArrow) {
      setHistoryIndex(null);
      if (key.ctrl || key.meta) {
        setCursor(wordRight(value, cursor));
      } else {
        setCursor((c) => Math.min(value.length, c + 1));
      }
      return;
    }

    if (key.home) {
      setHistoryIndex(null);
      setCursor(0);
      return;
    }

    if (key.end) {
      setHistoryIndex(null);
      setCursor(value.length);
      return;
    }

    if (key.upArrow) {
      if (paletteOpen && matches.length > 0) {
        setPaletteIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (history.length === 0) {
        return;
      }
      if (historyIndex === null) {
        setLiveDraft(value);
        const next = history.length - 1;
        setHistoryIndex(next);
        setDraft(history[next] ?? "");
      } else if (historyIndex > 0) {
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setDraft(history[next] ?? "");
      }
      return;
    }

    if (key.downArrow) {
      if (paletteOpen && matches.length > 0) {
        setPaletteIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (historyIndex === null) {
        return;
      }
      if (historyIndex < history.length - 1) {
        const next = historyIndex + 1;
        setHistoryIndex(next);
        setDraft(history[next] ?? "");
      } else {
        setHistoryIndex(null);
        setDraft(liveDraft);
      }
      return;
    }

    if (key.return) {
      if (paletteOpen && matches.length > 0) {
        const cmd = matches[Math.min(paletteIndex, matches.length - 1)];
        if (cmd) {
          runSlash(cmd.name);
        }
        return;
      }
      const trimmed = value.trim();
      if (trimmed.startsWith("/")) {
        const token = trimmed.split(/\s/)[0] ?? trimmed;
        const known = SLASH_COMMANDS.find((c) => c.name === token);
        // Keep args for commands like `/caveman full` or `/skill list`
        runSlash(known ? `${known.name}${trimmed.slice(token.length)}` : trimmed);
        return;
      }
      if (trimmed.length > 0) {
        remember(trimmed);
        useStore.getState().submitUser(trimmed);
        setDraft("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (key.delete) {
        if (cursor >= value.length) {
          return;
        }
        const next = value.slice(0, cursor) + value.slice(cursor + 1);
        setDraft(next, cursor);
      } else if (cursor > 0) {
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        setDraft(next, cursor - 1);
      }
      setHistoryIndex(null);
      if (value.length <= 1) {
        setPaletteOpen(false);
      }
      return;
    }

    if (key.ctrl || key.meta) {
      return;
    }

    if (input) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      setDraft(next, cursor + input.length);
      setHistoryIndex(null);
      if (value.length === 0 && input === "/") {
        setPaletteOpen(true);
        setPaletteIndex(0);
      }
    }
  });

  const showPlaceholder = value.length === 0;
  const allLines = showPlaceholder ? [{ text: placeholder, start: 0 }] : layoutLines(value, innerWidth);
  const cursorLine = showPlaceholder ? 0 : lineIndexForCursor(allLines, cursor, value.length);
  const boxHeight = MIN_INNER_LINES;
  let start = Math.max(0, allLines.length - boxHeight);
  if (cursorLine < start) {
    start = cursorLine;
  }
  if (cursorLine >= start + boxHeight) {
    start = cursorLine - boxHeight + 1;
  }
  const visible = allLines.slice(start, start + boxHeight);
  const extra = boxHeight - visible.length;
  const padTop = Math.floor(extra / 2);
  const padBottom = extra - padTop;

  return (
    <Box flexDirection="column" width={width} marginTop={1} marginBottom={1} flexShrink={0}>
      {sessionPickerOpen ? (
        <SessionPicker sessions={sessions} selected={pickerIndex} />
      ) : modelPickerOpen ? (
        <ModelPicker choices={choices} selected={pickerIndex} current={modelKey} />
      ) : paletteOpen ? (
        <SlashPalette matches={matches} selected={paletteIndex} />
      ) : null}
      <Box
        flexDirection="column"
        width={boxWidth}
        height={boxHeight}
        flexShrink={0}
        marginLeft={0}
        marginRight={4}
        paddingX={1}
        paddingY={0}
        justifyContent="flex-start"
        alignItems="flex-start"
        backgroundColor={COMPOSER_BG}
      >
        {Array.from({ length: padTop }, (_, i) => (
          <Text key={`pad-top-${i}`}> </Text>
        ))}
        {visible.map((line, i) => {
          const abs = start + i;
          const glyph = abs === 0 ? GLYPH : CONT;
          const onCaretLine = !showPlaceholder && focused && abs === cursorLine;
          const col = onCaretLine
            ? Math.max(0, Math.min(line.text.length, cursor - line.start))
            : -1;
          const before = col >= 0 ? line.text.slice(0, col) : line.text;
          const at = col >= 0 ? line.text.slice(col, col + 1) : "";
          const after = col >= 0 ? line.text.slice(col + 1) : "";

          return (
            <Box key={`line-${abs}`} width={innerWidth + GLYPH.length} flexShrink={0}>
              <Box width={GLYPH.length} flexShrink={0}>
                <Text>{glyph}</Text>
              </Box>
              {showPlaceholder ? (
                <Placeholder text={line.text} caret={focused} />
              ) : onCaretLine ? (
                <Text wrap="truncate">
                  {before}
                  <Caret ch={at} />
                  {after}
                </Text>
              ) : (
                <Text wrap="truncate">{line.text.length === 0 ? " " : line.text}</Text>
              )}
            </Box>
          );
        })}
        {Array.from({ length: padBottom }, (_, i) => (
          <Text key={`pad-bot-${i}`}> </Text>
        ))}
      </Box>
    </Box>
  );
}
