import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolvePath } from "./read.js";

function compactDiff(path: string, before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines: string[] = [`--- ${path}`, `+++ ${path}`];
  const max = Math.min(Math.max(a.length, b.length), 80);
  let shown = 0;
  for (let i = 0; i < max && shown < 12; i++) {
    if (a[i] === b[i]) {
      continue;
    }
    if (a[i] !== undefined) {
      lines.push(`- ${a[i]}`);
      shown += 1;
    }
    if (b[i] !== undefined && shown < 12) {
      lines.push(`+ ${b[i]}`);
      shown += 1;
    }
  }
  return lines.join("\n");
}

export async function writeFileTool(path: string, content: string): Promise<string> {
  const abs = resolvePath(path);
  let before = "";
  try {
    before = await readFile(abs, "utf8");
  } catch {
    before = "";
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  return compactDiff(path, before, content);
}

export async function editFileTool(path: string, search: string, replace: string): Promise<string> {
  const abs = resolvePath(path);
  const before = await readFile(abs, "utf8");
  if (!before.includes(search)) {
    throw new Error(`search string not found in ${path}`);
  }
  const after = before.replace(search, replace);
  await writeFile(abs, after, "utf8");
  return compactDiff(path, before, after);
}
