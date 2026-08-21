import { Box, Text, useStdout } from "ink";
import { useEffect, useState } from "react";
import { USER_MSG_BG } from "./chrome.js";
import { MarkdownView } from "./markdown.js";
import { wrapWords } from "./wrap.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type TranscriptRow =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; name: string; args: string; status: "running" | "done" | "error"; detail?: string; output?: string; path?: string }
  | { id: string; kind: "notice"; text: string }
  | { id: string; kind: "error"; text: string };

export function SpinnerGlyph() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setI((n) => (n + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => {
      clearInterval(t);
    };
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[i]}</Text>;
}

function UserPromptBox({ text }: { text: string }) {
  const { stdout } = useStdout();
  const width = stdout.columns;
  const boxWidth = Math.max(20, width - 2);
  const inner = Math.max(8, boxWidth - 1 - 5);
  const lines = wrapWords(text, inner);

  return (
    <Box
      flexDirection="column"
      backgroundColor={USER_MSG_BG}
      paddingLeft={1}
      paddingRight={5}
      paddingY={1}
      marginX={1}
      width={boxWidth}
      flexShrink={0}
    >
      {lines.map((line, idx) => (
        <Text key={idx} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function RowView({ row }: { row: TranscriptRow }) {
  if (row.kind === "user") {
    return <UserPromptBox text={row.text} />;
  }

  if (row.kind === "assistant") {
    if (row.text.length === 0) {
      return <Text dimColor> </Text>;
    }
    return <MarkdownView text={row.text} />;
  }

  if (row.kind === "tool") {
    const glyph =
      row.status === "running" ? (
        <SpinnerGlyph />
      ) : row.status === "done" ? (
        <Text color="green">✓</Text>
      ) : (
        <Text color="red">✗</Text>
      );
    return (
      <Box>
        {glyph}
        <Text> {row.name} </Text>
        <Text dimColor>{row.args}</Text>
        {row.detail ? <Text dimColor>  {row.detail}</Text> : null}
      </Box>
    );
  }

  if (row.kind === "error") {
    return <Text color="red">{row.text}</Text>;
  }

  return (
    <Text dimColor italic>
      {row.text}
    </Text>
  );
}
