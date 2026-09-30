import { spawn } from "node:child_process";
const sessions = new Map();
function send(session, method, params) {
    const id = session.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
        session.pending.set(id, { resolve, reject });
        session.child.stdin.write(`${JSON.stringify(msg)}\n`);
    });
}
function onLine(session, line) {
    let msg;
    try {
        msg = JSON.parse(line);
    }
    catch {
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
    }
    else {
        pending.resolve(msg.result);
    }
}
async function ensureSession(name, cfg) {
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
    });
    const session = {
        name,
        child,
        nextId: 1,
        pending: new Map(),
        buffer: "",
        tools: [],
    };
    child.stdout.on("data", (d) => {
        session.buffer += d.toString("utf8");
        let idx;
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
    const listed = (await send(session, "tools/list", {}));
    session.tools = listed.tools ?? [];
    return session;
}
export async function loadMcpTools(servers) {
    const out = [];
    for (const [server, cfg] of Object.entries(servers)) {
        try {
            const session = await ensureSession(server, cfg);
            for (const t of session.tools) {
                out.push({
                    server,
                    name: t.name,
                    description: t.description ?? `MCP tool ${t.name} from ${server}`,
                    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
                });
            }
        }
        catch {
            // skip broken servers at startup/list time
        }
    }
    return out;
}
export function mcpToolName(server, tool) {
    return `mcp__${server}__${tool}`;
}
export function parseMcpToolName(name) {
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
export async function callMcpTool(servers, server, tool, args) {
    const cfg = servers[server];
    if (!cfg) {
        throw new Error(`unknown mcp server: ${server}`);
    }
    const session = await ensureSession(server, cfg);
    const result = (await send(session, "tools/call", {
        name: tool,
        arguments: args,
    }));
    const text = (result.content ?? [])
        .map((c) => (c.type === "text" ? c.text ?? "" : JSON.stringify(c)))
        .join("\n")
        .trim();
    if (result.isError) {
        throw new Error(text || "mcp tool error");
    }
    return text || "(empty mcp result)";
}
export async function fetchMcpResource(servers, server, uri) {
    const cfg = servers[server];
    if (!cfg) {
        throw new Error(`unknown mcp server: ${server}`);
    }
    const session = await ensureSession(server, cfg);
    const result = (await send(session, "resources/read", { uri }));
    const texts = (result.contents ?? []).map((c) => c.text ?? JSON.stringify(c));
    return texts.join("\n") || "(empty resource)";
}
//# sourceMappingURL=mcp.js.map