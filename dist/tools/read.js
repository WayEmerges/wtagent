import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
const MAX_READ = 200_000;
export function resolvePath(p) {
    return resolve(process.cwd(), p);
}
export async function readFileTool(path) {
    const abs = resolvePath(path);
    const buf = await readFile(abs);
    if (buf.length > MAX_READ) {
        return `${buf.subarray(0, MAX_READ).toString("utf8")}\n\n[truncated ${buf.length} bytes]`;
    }
    return buf.toString("utf8");
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