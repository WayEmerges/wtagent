import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
export function workspaceHash(cwd = process.cwd()) {
    return createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16);
}
export function memoryWorkspaceDir(memoryRoot, cwd = process.cwd()) {
    return join(memoryRoot, workspaceHash(cwd));
}
export function memoryFilePath(memoryRoot, cwd = process.cwd()) {
    return join(memoryWorkspaceDir(memoryRoot, cwd), "MEMORY.md");
}
export function sessionMemoryPath(memoryRoot, sessionId, cwd = process.cwd()) {
    return join(memoryWorkspaceDir(memoryRoot, cwd), "sessions", `${sessionId}.md`);
}
export function ensureMemoryDirs(memoryRoot, cwd = process.cwd()) {
    mkdirSync(join(memoryWorkspaceDir(memoryRoot, cwd), "sessions"), { recursive: true });
}
/** Append a dated compaction section to MEMORY.md (and optional per-session file). */
export function appendMemorySection(args) {
    const cwd = args.cwd ?? process.cwd();
    ensureMemoryDirs(args.memoryRoot, cwd);
    const stamp = new Date().toISOString();
    const section = `\n## Compacted ${stamp} (session ${args.sessionId})\n\n${args.body.trim()}\n`;
    const memoryPath = memoryFilePath(args.memoryRoot, cwd);
    if (!existsSync(memoryPath)) {
        writeFileSync(memoryPath, `# Workspace memory\n\ncwd: ${resolve(cwd)}\n`, "utf8");
    }
    appendFileSync(memoryPath, section, "utf8");
    try {
        const sessionPath = sessionMemoryPath(args.memoryRoot, args.sessionId, cwd);
        mkdirSync(join(memoryWorkspaceDir(args.memoryRoot, cwd), "sessions"), { recursive: true });
        if (!existsSync(sessionPath)) {
            writeFileSync(sessionPath, `# Session ${args.sessionId}\n`, "utf8");
        }
        appendFileSync(sessionPath, section, "utf8");
    }
    catch {
        /* session appendix is optional */
    }
    return { memoryPath };
}
/** Last `injectChars` characters of MEMORY.md for prompt injection. */
export function readMemoryInject(memoryRoot, injectChars, cwd = process.cwd()) {
    const path = memoryFilePath(memoryRoot, cwd);
    if (!existsSync(path) || injectChars <= 0) {
        return "";
    }
    try {
        const full = readFileSync(path, "utf8");
        if (full.length <= injectChars) {
            return full.trim();
        }
        return full.slice(-injectChars).trim();
    }
    catch {
        return "";
    }
}
//# sourceMappingURL=store.js.map