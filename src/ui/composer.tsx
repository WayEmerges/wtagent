import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { useEffect, useState } from "react";
import { modelChoices } from "../config/load.js";
import { listSessions } from "../sessions/store.js";
import { useStore } from "../state/store.js";
import { ModelPicker } from "./model-picker.js";
import { SessionPicker } from "./session-picker.js";
import { filterSlash, SlashPalette, SLASH_COMMANDS } from "./slash-palette.js";
import { wrapWords } from "./wrap.js";

const MIN_INNER_LINES = 3;
const GLYPH = " → ";
const CONT = "   ";
const COMPOSER_BG = "#1f1f1f";

function Caret() {
  return (
    <Text backgroundColor="white" color="black">
      {" "}
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

function wrapLines(text: string, innerWidth: number): string[] {
  return wrapWords(text, innerWidth);
}

export function Composer() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const focused = useTerminalFocus();
  const [value, setValue] = useState("");
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

  function remember(text: string) {
    setHistory((prev) => [...prev, text]);
    setHistoryIndex(null);
    setLiveDraft("");
  }

  function runSlash(line: string) {
    remember(line);
    useStore.getState().runCommand(line, exit);
    setValue("");
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
      setValue(value + "\n");
      setHistoryIndex(null);
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
        setValue(history[next] ?? "");
      } else if (historyIndex > 0) {
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setValue(history[next] ?? "");
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
        setValue(history[next] ?? "");
      } else {
        setHistoryIndex(null);
        setValue(liveDraft);
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
        setValue("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      const next = value.slice(0, -1);
      setValue(next);
      setHistoryIndex(null);
      if (next.length === 0) {
        setPaletteOpen(false);
      }
      return;
    }

    if (key.leftArrow || key.rightArrow) {
      return;
    }

    if (key.ctrl || key.meta) {
      return;
    }

    if (input) {
      const next = value + input;
      setValue(next);
      setHistoryIndex(null);
      if (value.length === 0 && input === "/") {
        setPaletteOpen(true);
        setPaletteIndex(0);
      }
    }
  });

  const showPlaceholder = value.length === 0;
  const allLines = showPlaceholder ? [placeholder] : wrapLines(value, innerWidth);
  const start = Math.max(0, allLines.length - MIN_INNER_LINES);
  const visible = allLines.slice(start);
  const boxHeight = MIN_INNER_LINES;
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
          const isLast = i === visible.length - 1;
          return (
            <Box key={`line-${abs}`} width={innerWidth + GLYPH.length} flexShrink={0}>
              <Box width={GLYPH.length} flexShrink={0}>
                <Text>{glyph}</Text>
              </Box>
              {showPlaceholder ? (
                <Placeholder text={line} caret={focused} />
              ) : (
                <>
                  <Text wrap="truncate">{line.length === 0 ? " " : line}</Text>
                  {isLast && focused ? <Caret /> : null}
                </>
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
