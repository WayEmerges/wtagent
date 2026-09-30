import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.on("error", (e) => {
      resolve({ code: 1, out: e.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, out });
    });
  });
}

export async function readLintsTool(paths?: string[]): Promise<string> {
  const cwd = process.cwd();
  const focus = (paths ?? []).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  const tsconfig = join(cwd, "tsconfig.json");
  if (existsSync(tsconfig)) {
    const r = await run("npx", ["--yes", "tsc", "--noEmit", "--pretty", "false"], cwd);
    let lines = r.out.split("\n").filter((l) => l.trim().length > 0);
    if (focus.length > 0) {
      lines = lines.filter((l) => focus.some((p) => l.includes(p)));
    }
    chunks.push(
      lines.length > 0
        ? `tsc:\n${lines.slice(0, 80).join("\n")}`
        : "tsc: no diagnostics" + (focus.length ? " for given paths" : ""),
    );
  }

  const eslintCfg = ["eslint.config.js", "eslint.config.mjs", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"].some(
    (f) => existsSync(join(cwd, f)),
  );
  if (eslintCfg) {
    const args = ["--yes", "eslint", "--format", "unix", ...(focus.length > 0 ? focus : ["."])];
    const r = await run("npx", args, cwd);
    const lines = r.out.split("\n").filter((l) => l.trim().length > 0).slice(0, 80);
    chunks.push(lines.length > 0 ? `eslint:\n${lines.join("\n")}` : "eslint: no diagnostics");
  }

  if (chunks.length === 0) {
    return "no tsc/eslint config found in workspace";
  }
  return chunks.join("\n\n");
}
