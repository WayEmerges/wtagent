import { Box, Text, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { USER_MSG_BG } from "./chrome.js";
import { MarkdownView } from "./markdown.js";
import { wrapWords } from "./wrap.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const COLLAPSE_LINES = 6;

export type TranscriptRow =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | {
      id: string;
      kind: "tool";
      name: string;
      args: string;
      status: "running" | "done" | "error";
      detail?: string;
      output?: string;
      path?: string;
      summary?: string;
      added?: number;
      removed?: number;
      collapsedHint?: string;
      shellId?: string;
      expanded?: boolean;
    }
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
  const { columns: width } = useWindowSize();
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

function toolTitle(row: Extract<TranscriptRow, { kind: "tool" }>): string {
  if (row.summary && row.summary.length > 0) {
    return row.summary;
  }
  if (row.name === "read_file" && row.path) {
    return `Read ${row.path}`;
  }
  if (row.name === "edit_file" || row.name === "write_file") {
    const plus = row.added !== undefined ? ` +${row.added}` : "";
    const minus = row.removed !== undefined ? ` -${row.removed}` : "";
    return `${row.name === "write_file" ? "Wrote" : "Edited"} ${row.path ?? row.args}${plus}${minus}`;
  }
  if (row.name === "grep") {
    return `Grep ${row.detail ? JSON.stringify(row.detail) : row.args}`;
  }
  if (row.name === "run_shell") {
    return `$ ${(row.detail ?? row.args).slice(0, 100)}`;
  }
  return `${row.name} ${row.args}`.trim();
}

function ToolCard({ row }: { row: Extract<TranscriptRow, { kind: "tool" }> }) {
  const glyph =
    row.status === "running" ? (
      <SpinnerGlyph />
    ) : row.status === "done" ? (
      <Text color="green">✓</Text>
    ) : (
      <Text color="red">✗</Text>
    );

  const title = toolTitle(row);
  const output = row.output ?? (row.detail && row.detail.includes("\n") ? row.detail : undefined);
  const lines = output ? output.split("\n") : [];
  const expanded = Boolean(row.expanded);
  const showCollapse = lines.length > COLLAPSE_LINES;
  const visible = expanded || !showCollapse ? lines : lines.slice(0, 2);
  const hidden = showCollapse && !expanded ? lines.length - visible.length : 0;

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Box>
        {glyph}
        <Text> {title}</Text>
        {row.status === "error" && row.detail && !row.detail.includes("\n") ? (
          <Text color="red">  {row.detail.slice(0, 60)}</Text>
        ) : null}
      </Box>
      {visible.length > 0 ? (
        <Box flexDirection="column" marginLeft={2}>
          {visible.map((line, i) => (
            <Text key={i} dimColor wrap="truncate-end">
              {line.slice(0, 120)}
            </Text>
          ))}
          {hidden > 0 ? (
            <Text dimColor>
              … {hidden} lines hidden · ctrl+o to expand
            </Text>
          ) : null}
          {expanded && showCollapse ? <Text dimColor>… ctrl+o to collapse</Text> : null}
        </Box>
      ) : null}
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
    return <ToolCard row={row} />;
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
