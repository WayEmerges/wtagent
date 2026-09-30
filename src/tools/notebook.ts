import { readFile, writeFile } from "node:fs/promises";
import { resolvePath } from "./read.js";

type NotebookCell = {
  cell_type: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
};

type Notebook = {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
};

function cellSource(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
}

function toSourceLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const parts = text.split("\n");
  return parts.map((line, i) => (i === parts.length - 1 ? line : `${line}\n`));
}

export async function editNotebookTool(opts: {
  targetNotebook: string;
  cellIdx: number;
  isNewCell: boolean;
  cellLanguage: string;
  oldString: string;
  newString: string;
}): Promise<string> {
  const abs = resolvePath(opts.targetNotebook);
  let nb: Notebook;
  try {
    nb = JSON.parse(await readFile(abs, "utf8")) as Notebook;
  } catch {
    if (!opts.isNewCell) {
      throw new Error(`notebook not found: ${opts.targetNotebook}`);
    }
    nb = {
      cells: [],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };
  }
  if (!Array.isArray(nb.cells)) {
    nb.cells = [];
  }

  const lang = opts.cellLanguage || "python";
  const cellType = lang === "markdown" ? "markdown" : lang === "raw" ? "raw" : "code";

  if (opts.isNewCell) {
    const idx = Math.max(0, Math.min(opts.cellIdx, nb.cells.length));
    const cell: NotebookCell = {
      cell_type: cellType,
      source: toSourceLines(opts.newString),
      metadata: cellType === "code" ? { language: lang } : {},
      outputs: cellType === "code" ? [] : undefined,
      execution_count: cellType === "code" ? null : undefined,
    };
    nb.cells.splice(idx, 0, cell);
  } else {
    const cell = nb.cells[opts.cellIdx];
    if (!cell) {
      throw new Error(`cell_idx ${opts.cellIdx} out of range (len=${nb.cells.length})`);
    }
    const src = cellSource(cell);
    if (opts.oldString.length > 0) {
      if (!src.includes(opts.oldString)) {
        throw new Error(`old_string not found in cell ${opts.cellIdx}`);
      }
      const count = src.split(opts.oldString).length - 1;
      if (count > 1) {
        throw new Error(`old_string found ${count} times in cell ${opts.cellIdx}; make it unique`);
      }
      cell.source = toSourceLines(src.replace(opts.oldString, opts.newString));
    } else {
      cell.source = toSourceLines(opts.newString);
    }
  }

  await writeFile(abs, `${JSON.stringify(nb, null, 2)}\n`, "utf8");
  return `edited notebook ${opts.targetNotebook} cell ${opts.cellIdx}`;
}
