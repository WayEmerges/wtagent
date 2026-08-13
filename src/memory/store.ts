import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";

export function workspaceHash(cwd = process.cwd()): string {
  return createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16);
}

export function memoryWorkspaceDir(memoryRoot: string, cwd = process.cwd()): string {
  return join(memoryRoot, workspaceHash(cwd));
}

export function memoryFilePath(memoryRoot: string, cwd = process.cwd()): string {
  return join(memoryWorkspaceDir(memoryRoot, cwd), "MEMORY.md");
}

export function sessionMemoryPath(
  memoryRoot: string,
  sessionId: string,
  cwd = process.cwd(),
): string {
  return join(memoryWorkspaceDir(memoryRoot, cwd), "sessions", `${sessionId}.md`);
}

export function ensureMemoryDirs(memoryRoot: string, cwd = process.cwd()): void {
  mkdirSync(join(memoryWorkspaceDir(memoryRoot, cwd), "sessions"), { recursive: true });
}

/** Append a dated compaction section to MEMORY.md (and optional per-session file). */
export function appendMemorySection(args: {
  memoryRoot: string;
  sessionId: string;
  body: string;
  cwd?: string;
}): { memoryPath: string } {
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
  } catch {
    /* session appendix is optional */
  }
  return { memoryPath };
}

/** Last `injectChars` characters of MEMORY.md for prompt injection. */
export function readMemoryInject(memoryRoot: string, injectChars: number, cwd = process.cwd()): string {
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
  } catch {
    return "";
  }
}
