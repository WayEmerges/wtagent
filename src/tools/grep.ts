import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import fg from "fast-glob";
import { resolvePath } from "./read.js";

function rg(pattern: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", ["-n", "--hidden", "--glob", "!node_modules", pattern], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf8");
    });
    child.on("error", (e) => {
      reject(e);
    });
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve(out.trim() || "(no matches)");
      } else {
        reject(new Error(err.trim() || `rg exit ${code}`));
      }
    });
  });
}

async function walkGrep(pattern: string, cwd: string): Promise<string> {
  const re = new RegExp(pattern);
  const hits: string[] = [];
  async function walk(dir: string) {
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
            hits.push(`${relative(cwd, abs)}:${i + 1}:${lines[i]}`);
            if (hits.length >= 200) {
              return;
            }
          }
        }
      } catch {
        // skip
      }
    }
  }
  await walk(cwd);
  return hits.join("\n") || "(no matches)";
}

export async function grepTool(pattern: string, path?: string): Promise<string> {
  const cwd = path ? resolvePath(path) : process.cwd();
  try {
    return await rg(pattern, cwd);
  } catch {
    return walkGrep(pattern, cwd);
  }
}

export async function globTool(pattern: string): Promise<string> {
  const matches = await fg(pattern, {
    cwd: process.cwd(),
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
    onlyFiles: true,
  });
  return matches.join("\n") || "(no matches)";
}
