import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import fg from "fast-glob";
import { resolvePath } from "./read.js";
function rg(pattern, cwd, opts) {
    const args = ["-n", "--hidden", "--glob", "!node_modules", "--glob", "!.git"];
    const ctx = opts?.context ?? 0;
    if (ctx > 0) {
        args.push("-C", String(ctx));
    }
    args.push(pattern);
    return new Promise((resolve, reject) => {
        const child = spawn("rg", args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => {
            out += d.toString("utf8");
        });
        child.stderr.on("data", (d) => {
            err += d.toString("utf8");
        });
        child.on("error", (e) => {
            reject(e);
        });
        child.on("close", (code) => {
            if (code === 0 || code === 1) {
                let text = out.trim() || "(no matches)";
                const limit = opts?.headLimit;
                if (limit && limit > 0) {
                    const lines = text.split("\n");
                    if (lines.length > limit) {
                        text = `${lines.slice(0, limit).join("\n")}\n[truncated ${lines.length - limit} more lines]`;
                    }
                }
                resolve(text);
            }
            else {
                reject(new Error(err.trim() || `rg exit ${code}`));
            }
        });
    });
}
async function walkGrep(pattern, cwd, opts) {
    const re = new RegExp(pattern);
    const hits = [];
    const ctx = opts?.context ?? 0;
    const limit = opts?.headLimit ?? 200;
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git") {
                continue;
            }
            const abs = join(dir, e.name);
            if (e.isDirectory()) {
                await walk(abs);
                continue;
            }
            try {
                const st = await stat(abs);
                if (st.size > 1_000_000) {
                    continue;
                }
                const text = await readFile(abs, "utf8");
                const lines = text.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (re.test(lines[i] ?? "")) {
                        const rel = relative(cwd, abs);
                        if (ctx > 0) {
                            const from = Math.max(0, i - ctx);
                            const to = Math.min(lines.length - 1, i + ctx);
                            for (let j = from; j <= to; j++) {
                                hits.push(`${rel}:${j + 1}:${lines[j]}`);
                            }
                            hits.push("--");
                        }
                        else {
                            hits.push(`${rel}:${i + 1}:${lines[i]}`);
                        }
                        if (hits.length >= limit) {
                            return;
                        }
                    }
                }
            }
            catch {
                // skip
            }
        }
    }
    await walk(cwd);
    return hits.join("\n") || "(no matches)";
}
export async function grepTool(pattern, path, opts) {
    const cwd = path ? resolvePath(path) : process.cwd();
    try {
        return await rg(pattern, cwd, opts);
    }
    catch {
        return walkGrep(pattern, cwd, opts);
    }
}
export async function globTool(pattern) {
    const matches = await fg(pattern, {
        cwd: process.cwd(),
        dot: false,
        ignore: ["**/node_modules/**", "**/.git/**"],
        onlyFiles: true,
    });
    return matches.join("\n") || "(no matches)";
}
//# sourceMappingURL=grep.js.map