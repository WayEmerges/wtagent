import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const MAX_OUT = 64_000;
const DEFAULT_TIMEOUT_MS = 30_000;
function resolveScript() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, "..", "..", "tools", "webfetch", "webfetch.py"), // dist/tools → repo tools/
        join(here, "..", "tools", "webfetch", "webfetch.py"),
    ];
    for (const c of candidates) {
        if (existsSync(c)) {
            return c;
        }
    }
    return candidates[0];
}
export async function webfetchTool(url, timeoutSec) {
    const trimmed = url.trim();
    if (!trimmed) {
        throw new Error("url is required");
    }
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new Error(`invalid url: ${trimmed}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`unsupported url scheme: ${parsed.protocol}`);
    }
    const script = resolveScript();
    if (!existsSync(script)) {
        throw new Error(`webfetch script not found at ${script}`);
    }
    const timeout = typeof timeoutSec === "number" && Number.isFinite(timeoutSec) && timeoutSec > 0
        ? Math.floor(timeoutSec)
        : 15;
    // Prefer an explicit interpreter (venv) when set; otherwise rely on the script shebang.
    const python = process.env.WTAGENT_WEBFETCH_PYTHON?.trim();
    const cmd = python && python.length > 0 ? python : script;
    const args = python && python.length > 0 ? [script, trimmed, "--timeout", String(timeout)] : [trimmed, "--timeout", String(timeout)];
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });
        let out = "";
        const push = (d) => {
            out += d.toString("utf8");
            if (out.length > MAX_OUT) {
                out = `${out.slice(0, MAX_OUT)}\n[truncated]`;
            }
        };
        child.stdout.on("data", push);
        child.stderr.on("data", push);
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`webfetch timed out after ${DEFAULT_TIMEOUT_MS}ms`));
        }, DEFAULT_TIMEOUT_MS);
        child.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            const body = out.trim() || "(no output)";
            if (code !== 0) {
                reject(new Error(body));
                return;
            }
            resolve(body);
        });
    });
}
//# sourceMappingURL=webfetch.js.map