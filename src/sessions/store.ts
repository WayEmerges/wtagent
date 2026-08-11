import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { configDir } from "../config/load.js";
import type { AgentMode } from "../state/session.js";
import type { TranscriptRow } from "../ui/rows.js";

export type SavedSession = {
  id: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  modelKey: string;
  mode: AgentMode;
  rows: TranscriptRow[];
};

export function sessionsDir(): string {
  return join(configDir(), "sessions");
}

export function workspaceKey(cwd = process.cwd()): string {
  return resolve(cwd);
}

export function newSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${stamp}-${Math.random().toString(16).slice(2, 8)}`;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function parseRow(v: unknown): TranscriptRow | undefined {
  const o = asRecord(v);
  if (!o || typeof o.id !== "string" || typeof o.kind !== "string") {
    return undefined;
  }
  if (o.kind === "user" || o.kind === "assistant" || o.kind === "notice" || o.kind === "error") {
    return { id: o.id, kind: o.kind, text: typeof o.text === "string" ? o.text : "" };
  }
  if (o.kind === "tool") {
    const status =
      o.status === "done" || o.status === "error" || o.status === "running" ? o.status : "done";
    return {
      id: o.id,
      kind: "tool",
      name: typeof o.name === "string" ? o.name : "tool",
      args: typeof o.args === "string" ? o.args : "",
      status: status === "running" ? "done" : status,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    };
  }
  return undefined;
}

function parseSession(raw: unknown): SavedSession | undefined {
  const o = asRecord(raw);
  if (!o || typeof o.id !== "string" || typeof o.workspace !== "string") {
    return undefined;
  }
  const mode: AgentMode =
    o.mode === "Plan" || o.mode === "Ask" || o.mode === "Agent" ? o.mode : "Agent";
  const rows = Array.isArray(o.rows)
    ? o.rows.map(parseRow).filter((r): r is TranscriptRow => r !== undefined)
    : [];
  return {
    id: o.id,
    workspace: o.workspace,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    modelKey: typeof o.modelKey === "string" ? o.modelKey : "main",
    mode,
    rows,
  };
}

export function sessionTitle(session: SavedSession): string {
  const user = session.rows.find((r) => r.kind === "user");
  const text = user && user.kind === "user" ? user.text.replace(/\s+/g, " ").trim() : "";
  return (text || "(empty)").slice(0, 72);
}

export function writeSession(session: SavedSession): void {
  mkdirSync(sessionsDir(), { recursive: true });
  const path = join(sessionsDir(), `${session.id}.json`);
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export function readSession(id: string): SavedSession | undefined {
  const path = join(sessionsDir(), `${id}.json`);
  try {
    return parseSession(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

export function listSessions(workspace?: string): SavedSession[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const ws = workspace ? workspaceKey(workspace) : undefined;
  const out: SavedSession[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const s = readSession(name.slice(0, -5));
    if (!s) {
      continue;
    }
    if (ws && s.workspace !== ws) {
      continue;
    }
    out.push(s);
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export function latestSession(workspace?: string): SavedSession | undefined {
  return listSessions(workspace)[0];
}

export function persistTurn(args: {
  id: string;
  createdAt: string;
  modelKey: string;
  mode: AgentMode;
  rows: TranscriptRow[];
}): void {
  const rows = args.rows.filter((r) => !(r.kind === "tool" && r.status === "running"));
  writeSession({
    id: args.id,
    workspace: workspaceKey(),
    createdAt: args.createdAt,
    updatedAt: new Date().toISOString(),
    modelKey: args.modelKey,
    mode: args.mode,
    rows,
  });
}

export function printSessionList(): void {
  const sessions = listSessions(process.cwd());
  if (sessions.length === 0) {
    console.log(`No sessions for ${workspaceKey()}`);
    return;
  }
  console.log(`Sessions for ${workspaceKey()}`);
  sessions.forEach((s, i) => {
    const when = s.updatedAt.replace("T", " ").slice(0, 16);
    console.log(`${String(i + 1).padStart(3)}  ${when}  ${s.id}  ${sessionTitle(s)}`);
  });
}
