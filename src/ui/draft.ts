export type VisLine = { text: string; start: number };

export type Draft = {
  value: string;
  cursor: number;
  selAnchor: number | null;
};

export function clampCursor(n: number, len: number): number {
  return Math.max(0, Math.min(len, n));
}

export function sanitizeInsert(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/\x1b\[[0-9;]*[A-Za-z~]?/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function selRange(draft: Draft): { start: number; end: number } {
  if (draft.selAnchor === null || draft.selAnchor === draft.cursor) {
    return { start: draft.cursor, end: draft.cursor };
  }
  return {
    start: Math.min(draft.selAnchor, draft.cursor),
    end: Math.max(draft.selAnchor, draft.cursor),
  };
}

export function hasSelection(draft: Draft): boolean {
  const { start, end } = selRange(draft);
  return end > start;
}

export function moveGrapheme(text: string, cursor: number, dir: -1 | 1): number {
  if (dir < 0) {
    if (cursor <= 0) {
      return 0;
    }
    let i = cursor - 1;
    const c = text.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
      const prev = text.charCodeAt(i - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) {
        i--;
      }
    }
    return i;
  }
  if (cursor >= text.length) {
    return text.length;
  }
  let i = cursor + 1;
  const c = text.charCodeAt(cursor);
  if (c >= 0xd800 && c <= 0xdbff && i < text.length) {
    const next = text.charCodeAt(i);
    if (next >= 0xdc00 && next <= 0xdfff) {
      i++;
    }
  }
  return i;
}

export function wordLeft(text: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && /\s/.test(text[i - 1]!)) {
    i--;
  }
  while (i > 0 && !/\s/.test(text[i - 1]!)) {
    i--;
  }
  return i;
}

export function wordRight(text: string, cursor: number): number {
  let i = cursor;
  while (i < text.length && !/\s/.test(text[i]!)) {
    i++;
  }
  while (i < text.length && /\s/.test(text[i]!)) {
    i++;
  }
  return i;
}

/** Wrap without dropping spaces so the caret maps 1:1 onto visible text. */
export function layoutLines(text: string, width: number): VisLine[] {
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
      for (let i = 0; i < para.length; i += w) {
        out.push({ text: para.slice(i, i + w), start: paraStart + i });
      }
    }
    offset += para.length;
    if (pi < parts.length - 1) {
      offset += 1;
    }
  }

  return out.length > 0 ? out : [{ text: "", start: 0 }];
}

export function lineIndexForCursor(lines: VisLine[], cursor: number, textLen: number): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const nextStart = i + 1 < lines.length ? lines[i + 1]!.start : textLen + 1;
    if (cursor >= line.start && cursor < nextStart) {
      return i;
    }
  }
  return Math.max(0, lines.length - 1);
}

export function moveVertical(text: string, cursor: number, width: number, dir: -1 | 1): number | null {
  const lines = layoutLines(text, width);
  const li = lineIndexForCursor(lines, cursor, text.length);
  const next = li + dir;
  if (next < 0 || next >= lines.length) {
    return null;
  }
  const col = cursor - lines[li]!.start;
  const dest = lines[next]!;
  return dest.start + Math.min(col, dest.text.length);
}

export function lineHome(text: string, cursor: number, width: number): number {
  const lines = layoutLines(text, width);
  const li = lineIndexForCursor(lines, cursor, text.length);
  return lines[li]!.start;
}

export function lineEnd(text: string, cursor: number, width: number): number {
  const lines = layoutLines(text, width);
  const li = lineIndexForCursor(lines, cursor, text.length);
  const line = lines[li]!;
  return line.start + line.text.length;
}

export function insertText(draft: Draft, chunk: string): Draft {
  const { start, end } = selRange(draft);
  const value = draft.value.slice(0, start) + chunk + draft.value.slice(end);
  return { value, cursor: start + chunk.length, selAnchor: null };
}

export function deleteSelectionOr(draft: Draft, mode: "backspace" | "delete"): Draft {
  if (hasSelection(draft)) {
    const { start, end } = selRange(draft);
    return {
      value: draft.value.slice(0, start) + draft.value.slice(end),
      cursor: start,
      selAnchor: null,
    };
  }
  if (mode === "backspace") {
    if (draft.cursor <= 0) {
      return draft;
    }
    const from = moveGrapheme(draft.value, draft.cursor, -1);
    return {
      value: draft.value.slice(0, from) + draft.value.slice(draft.cursor),
      cursor: from,
      selAnchor: null,
    };
  }
  if (draft.cursor >= draft.value.length) {
    return draft;
  }
  const to = moveGrapheme(draft.value, draft.cursor, 1);
  return {
    value: draft.value.slice(0, draft.cursor) + draft.value.slice(to),
    cursor: draft.cursor,
    selAnchor: null,
  };
}

export function deleteRange(draft: Draft, from: number, to: number): Draft {
  const start = clampCursor(Math.min(from, to), draft.value.length);
  const end = clampCursor(Math.max(from, to), draft.value.length);
  return {
    value: draft.value.slice(0, start) + draft.value.slice(end),
    cursor: start,
    selAnchor: null,
  };
}

export function moveCursor(draft: Draft, next: number, extend: boolean): Draft {
  const cursor = clampCursor(next, draft.value.length);
  if (extend) {
    return {
      ...draft,
      cursor,
      selAnchor: draft.selAnchor ?? draft.cursor,
    };
  }
  return { ...draft, cursor, selAnchor: null };
}

export type TextRun = { text: string; kind: "plain" | "sel" | "caret" };

export function lineRuns(args: {
  text: string;
  lineStart: number;
  cursor: number;
  selStart: number;
  selEnd: number;
  showCaret: boolean;
}): TextRun[] {
  const { text, lineStart, cursor, selStart, selEnd, showCaret } = args;
  const caretAtEnd = showCaret && cursor === lineStart + text.length;
  const runs: TextRun[] = [];

  const push = (chunk: string, kind: TextRun["kind"]) => {
    if (chunk.length === 0) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.text += chunk;
      return;
    }
    runs.push({ text: chunk, kind });
  };

  for (let i = 0; i < text.length; i++) {
    const abs = lineStart + i;
    const ch = text[i]!;
    if (showCaret && abs === cursor) {
      push(ch, "caret");
    } else if (abs >= selStart && abs < selEnd) {
      push(ch, "sel");
    } else {
      push(ch, "plain");
    }
  }

  if (caretAtEnd) {
    push(" ", "caret");
  } else if (text.length === 0 && !showCaret) {
    push(" ", "plain");
  }

  return runs.length > 0 ? runs : [{ text: " ", kind: "plain" }];
}
