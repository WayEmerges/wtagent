import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
const MAX_READ = 200_000;
const READ_TIMEOUT_MS = 8_000;
export function resolvePath(p) {
    return resolve(process.cwd(), p);
}
export async function readFileTool(path, opts) {
    const abs = resolvePath(path);
    const st = await stat(abs);
    if (st.isDirectory()) {
        throw new Error(`${path} is a directory — use list_dir`);
    }
    if (st.size === 0) {
        return "";
    }
    const full = await new Promise((resolvePromise, reject) => {
        const chunks = [];
        const stream = createReadStream(abs, { start: 0, end: Math.max(0, MAX_READ - 1) });
        const timer = setTimeout(() => {
            stream.destroy();
            reject(new Error(`read timed out: ${path}`));
        }, READ_TIMEOUT_MS);
        stream.on("data", (chunk) => {
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
    const offset = opts?.offset;
    const limit = opts?.limit;
    if (offset === undefined && limit === undefined) {
        return full;
    }
    const lines = full.split("\n");
    const start = Math.max(0, (offset ?? 1) - 1);
    const end = limit !== undefined ? start + Math.max(0, limit) : lines.length;
    const slice = lines.slice(start, end);
    const pad = String(Math.max(1, end)).length;
    const numbered = slice.map((line, i) => `${String(start + i + 1).padStart(pad, " ")}|${line}`);
    const more = end < lines.length ? `\n…[${lines.length - end} more lines]` : "";
    return `${numbered.join("\n")}${more}`;
}
export async function listDirTool(path) {
    const abs = resolvePath(path);
    const entries = await readdir(abs, { withFileTypes: true });
    const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => `${e.isDirectory() ? "dir " : "file"} ${e.name}`);
    return lines.join("\n") || "(empty)";
}
export async function pathExists(path) {
    try {
        await stat(resolvePath(path));
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=read.js.map