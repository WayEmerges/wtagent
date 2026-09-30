import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "../config/load.js";

const MAX_OUT = 64_000;

export type ShellJob = {
  id: string;
  command: string;
  outputPath: string;
  startedAt: number;
  pid?: number;
  exitCode?: number | null;
  done: boolean;
  buffer: string;
  child?: ChildProcess;
};

const jobs = new Map<string, ShellJob>();
let jobSeq = 0;

function shellDir(): string {
  const dir = join(configDir(), "shell");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function nextShellId(): string {
  jobSeq += 1;
  return `sh-${Date.now().toString(16)}-${jobSeq}`;
}

function pushOut(job: ShellJob, chunk: string): void {
  job.buffer += chunk;
  if (job.buffer.length > MAX_OUT) {
    job.buffer = `${job.buffer.slice(0, MAX_OUT)}\n[truncated]`;
  }
  try {
    appendFileSync(job.outputPath, chunk, "utf8");
  } catch {
    // ignore disk errors mid-stream
  }
}

function startJob(command: string): ShellJob {
  const id = nextShellId();
  const outputPath = join(shellDir(), `${id}.log`);
  writeFileSync(outputPath, "", "utf8");
  const job: ShellJob = {
    id,
    command,
    outputPath,
    startedAt: Date.now(),
    done: false,
    buffer: "",
  };
  const child = spawn(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  job.child = child;
  job.pid = child.pid;
  child.stdout?.on("data", (d: Buffer) => {
    pushOut(job, d.toString("utf8"));
  });
  child.stderr?.on("data", (d: Buffer) => {
    pushOut(job, d.toString("utf8"));
  });
  child.on("error", (e) => {
    pushOut(job, `\n[spawn error] ${e.message}\n`);
    job.done = true;
    job.exitCode = 1;
  });
  child.on("close", (code) => {
    job.done = true;
    job.exitCode = code;
  });
  jobs.set(id, job);
  return job;
}

function formatJobStatus(job: ShellJob): string {
  const elapsed = Date.now() - job.startedAt;
  const header = [
    `shell_id=${job.id}`,
    `pid=${job.pid ?? "?"}`,
    `done=${job.done}`,
    `exit=${job.exitCode ?? "running"}`,
    `elapsed_ms=${elapsed}`,
    `output_file=${job.outputPath}`,
  ].join(" ");
  const body = job.buffer.trim() || "(no output yet)";
  return `${header}\n${body}`;
}

export async function runShellTool(
  command: string,
  blockUntilMs = 30_000,
): Promise<{ text: string; shellId: string; backgrounded: boolean }> {
  const job = startJob(command);
  const waitMs = Math.max(0, blockUntilMs);

  if (waitMs === 0) {
    // Give the process a tick to fail-fast on spawn errors.
    await new Promise((r) => setTimeout(r, 50));
    return {
      text: formatJobStatus(job),
      shellId: job.id,
      backgrounded: !job.done,
    };
  }

  const deadline = Date.now() + waitMs;
  while (!job.done && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!job.done) {
    return {
      text: `${formatJobStatus(job)}\n[backgrounded — use await_shell with shell_id=${job.id}]`,
      shellId: job.id,
      backgrounded: true,
    };
  }

  const body = job.buffer.trim() || "(no output)";
  return {
    text: `exit ${job.exitCode ?? "?"}\nshell_id=${job.id}\n${body}`,
    shellId: job.id,
    backgrounded: false,
  };
}

export async function awaitShellTool(opts: {
  shellId?: string;
  blockUntilMs?: number;
  pattern?: string;
}): Promise<string> {
  const blockUntilMs = opts.blockUntilMs ?? 30_000;
  const maxBlock = Math.min(Math.max(0, blockUntilMs), 7_140_000);

  if (!opts.shellId) {
    await new Promise((r) => setTimeout(r, maxBlock));
    return `slept ${maxBlock}ms`;
  }

  let job = jobs.get(opts.shellId);
  if (!job && existsSync(join(shellDir(), `${opts.shellId}.log`))) {
    const outputPath = join(shellDir(), `${opts.shellId}.log`);
    const buffer = readFileSync(outputPath, "utf8");
    return `shell_id=${opts.shellId} (historical)\n${buffer.trim() || "(empty)"}`;
  }
  if (!job) {
    throw new Error(`unknown shell_id: ${opts.shellId}`);
  }

  const re = opts.pattern ? new RegExp(opts.pattern, "m") : undefined;
  const deadline = Date.now() + maxBlock;

  while (Date.now() < deadline) {
    job = jobs.get(opts.shellId) ?? job;
    if (re && re.test(job.buffer)) {
      return formatJobStatus(job);
    }
    if (job.done) {
      return formatJobStatus(job);
    }
    if (maxBlock === 0) {
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return formatJobStatus(job);
}

export function getShellJob(id: string): ShellJob | undefined {
  return jobs.get(id);
}
