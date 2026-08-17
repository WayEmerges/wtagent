import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_READ = 200_000;
const READ_TIMEOUT_MS = 8_000;

export function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export async function readFileTool(path: string): Promise<string> {
  const abs = resolvePath(path);
  const st = await stat(abs);
  if (st.isDirectory()) {
    throw new Error(`${path} is a directory — use list_dir`);
  }
  if (st.size === 0) {
    return "";
  }
  return await new Promise<string>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(abs, { start: 0, end: Math.max(0, MAX_READ - 1) });
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error(`read timed out: ${path}`));
    }, READ_TIMEOUT_MS);
    stream.on("data", (chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString("utf8");
      resolvePromise(st.size > MAX_READ ? `${text}\n\n[truncated ${st.size} bytes]` : text);
    });
    stream.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function listDirTool(path: string): Promise<string> {
  const abs = resolvePath(path);
  const entries = await readdir(abs, { withFileTypes: true });
  const lines = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => `${e.isDirectory() ? "dir " : "file"} ${e.name}`);
  return lines.join("\n") || "(empty)";
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(resolvePath(path));
    return true;
  } catch {
    return false;
  }
}
