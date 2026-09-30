import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig } from "../config/load.js";

type JsonRpcMsg = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type McpSession = {
  name: string;
  child: ChildProcessWithoutNullStreams;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  buffer: string;
  tools: McpTool[];
};

const sessions = new Map<string, McpSession>();

function send(session: McpSession, method: string, params?: unknown): Promise<unknown> {
  const id = session.nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    session.pending.set(id, { resolve, reject });
    session.child.stdin.write(`${JSON.stringify(msg)}\n`);
  });
}

function onLine(session: McpSession, line: string): void {
  let msg: JsonRpcMsg;
  try {
    msg = JSON.parse(line) as JsonRpcMsg;
  } catch {
    return;
  }
  if (msg.id === undefined) {
    return;
  }
  const pending = session.pending.get(msg.id);
  if (!pending) {
    return;
  }
  session.pending.delete(msg.id);
  if (msg.error) {
    pending.reject(new Error(msg.error.message ?? "mcp error"));
  } else {
    pending.resolve(msg.result);
  }
}

async function ensureSession(name: string, cfg: McpServerConfig): Promise<McpSession> {
  const existing = sessions.get(name);
  if (existing && !existing.child.killed) {
    return existing;
  }
  if (!cfg.command) {
    throw new Error(`mcp server ${name}: command is required`);
  }
  const child = spawn(cfg.command, cfg.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(cfg.env ?? {}) },
    cwd: process.cwd(),
  }) as ChildProcessWithoutNullStreams;

  const session: McpSession = {
    name,
    child,
    nextId: 1,
    pending: new Map(),
    buffer: "",
    tools: [],
  };

  child.stdout.on("data", (d: Buffer) => {
    session.buffer += d.toString("utf8");
    let idx: number;
    while ((idx = session.buffer.indexOf("\n")) >= 0) {
      const line = session.buffer.slice(0, idx).trim();
      session.buffer = session.buffer.slice(idx + 1);
      if (line) {
        onLine(session, line);
      }
    }
  });
  child.on("exit", () => {
    sessions.delete(name);
    for (const p of session.pending.values()) {
      p.reject(new Error(`mcp server ${name} exited`));
    }
    session.pending.clear();
  });

  sessions.set(name, session);

  await send(session, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "wtagent", version: "0.3.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const listed = (await send(session, "tools/list", {})) as { tools?: McpTool[] };
  session.tools = listed.tools ?? [];
  return session;
}

export async function loadMcpTools(
  servers: Record<string, McpServerConfig>,
): Promise<
  Array<{
    server: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>
> {
  const out: Array<{
    server: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];
  for (const [server, cfg] of Object.entries(servers)) {
    try {
      const session = await ensureSession(server, cfg);
      for (const t of session.tools) {
        out.push({
          server,
          name: t.name,
          description: t.description ?? `MCP tool ${t.name} from ${server}`,
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
        });
      }
    } catch {
      // skip broken servers at startup/list time
    }
  }
  return out;
}

export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

export function parseMcpToolName(name: string): { server: string; tool: string } | undefined {
  if (!name.startsWith("mcp__")) {
    return undefined;
  }
  const rest = name.slice("mcp__".length);
  const idx = rest.indexOf("__");
  if (idx <= 0) {
    return undefined;
  }
  return { server: rest.slice(0, idx), tool: rest.slice(idx + 2) };
}

export async function callMcpTool(
  servers: Record<string, McpServerConfig>,
  server: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const cfg = servers[server];
  if (!cfg) {
    throw new Error(`unknown mcp server: ${server}`);
  }
  const session = await ensureSession(server, cfg);
  const result = (await send(session, "tools/call", {
    name: tool,
    arguments: args,
  })) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  const text = (result.content ?? [])
    .map((c) => (c.type === "text" ? c.text ?? "" : JSON.stringify(c)))
    .join("\n")
    .trim();
  if (result.isError) {
    throw new Error(text || "mcp tool error");
  }
  return text || "(empty mcp result)";
}

export async function fetchMcpResource(
  servers: Record<string, McpServerConfig>,
  server: string,
  uri: string,
): Promise<string> {
  const cfg = servers[server];
  if (!cfg) {
    throw new Error(`unknown mcp server: ${server}`);
  }
  const session = await ensureSession(server, cfg);
  const result = (await send(session, "resources/read", { uri })) as {
    contents?: Array<{ text?: string; uri?: string; mimeType?: string }>;
  };
  const texts = (result.contents ?? []).map((c) => c.text ?? JSON.stringify(c));
  return texts.join("\n") || "(empty resource)";
}
