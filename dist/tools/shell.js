import { spawn } from "node:child_process";
const MAX_OUT = 32_000;
export async function runShellTool(command) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            cwd: process.cwd(),
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
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
        child.on("error", (e) => {
            reject(e);
        });
        child.on("close", (code) => {
            const body = out.trim() || "(no output)";
            resolve(`exit ${code ?? "?"}\n${body}`);
        });
    });
}
//# sourceMappingURL=shell.js.map