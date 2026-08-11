import { Box, Text, useStdout } from "ink";
import { marked, type Token, type Tokens } from "marked";

type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function sameStyle(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code;
}

function wrapRuns(runs: Run[], width: number): Run[][] {
  const w = Math.max(8, width);
  const lines: Run[][] = [];
  let line: Run[] = [];
  let col = 0;

  function newline() {
    if (line.length > 0) {
      lines.push(line);
    }
    line = [];
    col = 0;
  }

  function add(run: Run) {
    if (run.text.length === 0) {
      return;
    }
    const last = line[line.length - 1];
    if (last && sameStyle(last, run)) {
      last.text += run.text;
    } else {
      line.push({ ...run });
    }
    col += run.text.length;
  }

  for (const run of runs) {
    const parts = run.text.replace(/\s+/g, " ").split(/ /);
    for (let p = 0; p < parts.length; p++) {
      const word = parts[p] ?? "";
      if (p > 0) {
        if (col === 0) {
          // skip space at start of line
        } else if (col + 1 + word.length > w) {
          newline();
        } else {
          add({ ...run, text: " " });
        }
      }
      if (word.length === 0) {
        continue;
      }
      if (col === 0 && word.length > w) {
        let rest = word;
        while (rest.length > w) {
          add({ ...run, text: rest.slice(0, w) });
          newline();
          rest = rest.slice(w);
        }
        add({ ...run, text: rest });
        continue;
      }
      if (col > 0 && col + word.length > w) {
        newline();
      }
      add({ ...run, text: word });
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines.length > 0 ? lines : [[{ text: " " }]];
}

function inlineRuns(tokens: Token[] | undefined): Run[] {
  if (!tokens || tokens.length === 0) {
    return [];
  }
  const runs: Run[] = [];
  for (const t of tokens) {
    if (t.type === "text") {
      const tx = t as Tokens.Text;
      if (tx.tokens && tx.tokens.length > 0) {
        runs.push(...inlineRuns(tx.tokens));
      } else {
        runs.push({ text: tx.text.replace(/\s+/g, " ") });
      }
    } else if (t.type === "strong") {
      for (const r of inlineRuns((t as Tokens.Strong).tokens)) {
        runs.push({ ...r, bold: true });
      }
    } else if (t.type === "em") {
      for (const r of inlineRuns((t as Tokens.Em).tokens)) {
        runs.push({ ...r, italic: true });
      }
    } else if (t.type === "codespan") {
      runs.push({ text: (t as Tokens.Codespan).text, code: true });
    } else if (t.type === "br") {
      runs.push({ text: " " });
    } else if (t.type === "link") {
      const link = t as Tokens.Link;
      runs.push(...inlineRuns(link.tokens));
    }
  }
  return runs;
}

function firstParagraphRuns(tokens: Token[] | undefined): Run[] {
  if (!tokens) {
    return [];
  }
  for (const t of tokens) {
    if (t.type === "paragraph" || t.type === "text") {
      const p = t as Tokens.Paragraph | Tokens.Text;
      if (p.tokens) {
        return inlineRuns(p.tokens);
      }
      return [{ text: p.text.replace(/\s+/g, " ") }];
    }
  }
  return [];
}

function restBlocks(tokens: Token[] | undefined): Token[] {
  if (!tokens) {
    return [];
  }
  let skipped = false;
  const rest: Token[] = [];
  for (const t of tokens) {
    if (!skipped && (t.type === "paragraph" || t.type === "text")) {
      skipped = true;
      continue;
    }
    if (t.type === "space") {
      continue;
    }
    rest.push(t);
  }
  return rest;
}

function RunsView({ runs, width }: { runs: Run[]; width: number }) {
  const lines = wrapRuns(runs, width);
  return (
    <Box flexDirection="column" width={width}>
      {lines.map((line, i) => (
        <Box key={i} width={width} flexShrink={0}>
          <Text wrap="truncate">
            {line.map((r, j) => (
              <Text
                key={`${i}-${j}`}
                bold={r.bold}
                italic={r.italic}
                color={r.code ? "cyan" : undefined}
                wrap="truncate"
              >
                {r.text}
              </Text>
            ))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function headingColor(depth: number): string {
  if (depth <= 1) {
    return "white";
  }
  if (depth === 2) {
    return "yellow";
  }
  return "cyan";
}

function ListView({ list, width, grouped }: { list: Tokens.List; width: number; grouped: boolean }) {
  const start = typeof list.start === "number" ? list.start : 1;
  const last = start + list.items.length - 1;
  const numW = list.ordered ? String(last).length + 2 : 2;

  return (
    <Box flexDirection="column" width={width} marginTop={grouped ? 0 : 1}>
      {list.items.map((item, i) => {
        const n = list.ordered ? `${String(start + i).padStart(String(last).length, " ")}. ` : "• ";
        const runs = firstParagraphRuns(item.tokens);
        const nested = restBlocks(item.tokens);
        const textW = Math.max(8, width - numW);
        return (
          <Box key={i} flexDirection="column" width={width} marginTop={i === 0 ? 0 : 0}>
            <Box flexDirection="row" width={width}>
              <Box width={numW} flexShrink={0}>
                <Text color="cyan">{n}</Text>
              </Box>
              <RunsView runs={runs.length > 0 ? runs : [{ text: item.text.replace(/\s+/g, " ") }]} width={textW} />
            </Box>
            {nested.length > 0 ? (
              <Box flexDirection="column" marginLeft={numW} width={textW}>
                {nested.map((t, j) => (
                  <Block key={j} token={t} width={textW} grouped={t.type === "list"} />
                ))}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function Block({ token, width, grouped }: { token: Token; width: number; grouped: boolean }) {
  if (token.type === "space") {
    return null;
  }

  if (token.type === "heading") {
    const h = token as Tokens.Heading;
    const label = h.text.replace(/\s+/g, " ");
    return (
      <Box marginTop={grouped ? 0 : 1} width={width}>
        <Text bold color={headingColor(h.depth)} wrap="truncate">
          {label}
        </Text>
      </Box>
    );
  }

  if (token.type === "paragraph" || token.type === "text") {
    const p = token as Tokens.Paragraph | Tokens.Text;
    const runs = p.tokens ? inlineRuns(p.tokens) : [{ text: p.text.replace(/\s+/g, " ") }];
    return (
      <Box marginTop={grouped ? 0 : 1} width={width}>
        <RunsView runs={runs} width={width} />
      </Box>
    );
  }

  if (token.type === "list") {
    return <ListView list={token as Tokens.List} width={width} grouped={grouped} />;
  }

  if (token.type === "code") {
    const c = token as Tokens.Code;
    const lang = c.lang?.trim() || "";
    const lines = c.text.replace(/\n$/, "").split("\n");
    const inner = Math.max(8, width - 2);
    return (
      <Box flexDirection="column" width={width} marginTop={1} paddingX={1} borderStyle="single" borderColor="gray">
        {lang ? <Text dimColor>{lang}</Text> : null}
        {lines.map((line, i) => (
          <Text key={i} wrap="truncate">
            {line.length === 0 ? " " : line.length > inner ? `${line.slice(0, inner - 1)}…` : line}
          </Text>
        ))}
      </Box>
    );
  }

  if (token.type === "blockquote") {
    const q = token as Tokens.Blockquote;
    return (
      <Box flexDirection="column" marginTop={grouped ? 0 : 1} paddingLeft={2} width={width}>
        {q.tokens.filter((t) => t.type !== "space").map((t, i) => (
          <Block key={i} token={t} width={Math.max(8, width - 2)} grouped={i > 0} />
        ))}
      </Box>
    );
  }

  if (token.type === "hr") {
    return (
      <Box marginTop={1} width={width}>
        <Text dimColor>{"─".repeat(Math.max(3, Math.min(width, 40)))}</Text>
      </Box>
    );
  }

  return null;
}

function closeOpenFence(src: string): string {
  const n = src.split("```").length - 1;
  if (n % 2 === 1) {
    return `${src}\n\`\`\``;
  }
  return src;
}

export function MarkdownView({ text }: { text: string }) {
  const { stdout } = useStdout();
  const width = Math.max(24, stdout.columns - 8);
  let tokens: Token[] = [];
  try {
    tokens = marked.lexer(closeOpenFence(text), { gfm: true });
  } catch {
    tokens = [
      {
        type: "paragraph",
        raw: text,
        text,
        tokens: [{ type: "text", raw: text, text }],
      } as Tokens.Paragraph,
    ];
  }

  const visible = tokens.filter((t) => t.type !== "space");

  return (
    <Box flexDirection="column" width={width}>
      {visible.map((token, i) => {
        const prev = visible[i - 1];
        const grouped = Boolean(
          prev?.type === "heading" && (token.type === "list" || token.type === "paragraph"),
        );
        return <Block key={i} token={token} width={width} grouped={grouped || i === 0} />;
      })}
    </Box>
  );
}
