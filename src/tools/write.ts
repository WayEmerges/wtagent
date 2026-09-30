import { unlink } from "node:fs/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePath } from "./read.js";

export type DiffStats = {
  detail: string;
  added: number;
  removed: number;
};

export function diffStats(path: string, before: string, after: string): DiffStats {
  const a = before.split("\n");
  const b = after.split("\n");
  let added = 0;
  let removed = 0;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) {
      continue;
    }
    if (a[i] !== undefined && b[i] === undefined) {
      removed += 1;
    } else if (a[i] === undefined && b[i] !== undefined) {
      added += 1;
    } else if (a[i] !== b[i]) {
      removed += 1;
      added += 1;
    }
  }
  const lines: string[] = [`--- ${path}`, `+++ ${path}`];
  let shown = 0;
  for (let i = 0; i < Math.min(max, 200) && shown < 40; i++) {
    if (a[i] === b[i]) {
      continue;
    }
    if (a[i] !== undefined) {
      lines.push(`- ${a[i]}`);
      shown += 1;
    }
    if (b[i] !== undefined && shown < 40) {
      lines.push(`+ ${b[i]}`);
      shown += 1;
    }
  }
  return {
    detail: lines.join("\n"),
    added,
    removed,
  };
}

export async function writeFileTool(path: string, content: string): Promise<DiffStats> {
  const abs = resolvePath(path);
  let before = "";
  try {
    before = await readFile(abs, "utf8");
  } catch {
    before = "";
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  return diffStats(path, before, content);
}

export async function editFileTool(
  path: string,
  search: string,
  replace: string,
  replaceAll = false,
): Promise<DiffStats> {
  const abs = resolvePath(path);
  const before = await readFile(abs, "utf8");
  if (!search) {
    throw new Error("search/old_string is required");
  }
  if (!before.includes(search)) {
    throw new Error(`search string not found in ${path}`);
  }
  const count = before.split(search).length - 1;
  if (!replaceAll && count > 1) {
    throw new Error(
      `search string found ${count} times in ${path}; pass replace_all=true or make old_string unique`,
    );
  }
  const after = replaceAll ? before.split(search).join(replace) : before.replace(search, replace);
  await writeFile(abs, after, "utf8");
  return diffStats(path, before, after);
}

export async function deleteFileTool(path: string): Promise<string> {
  const abs = resolvePath(path);
  await unlink(abs);
  return `deleted ${path}`;
}
