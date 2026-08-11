import { execSync } from "node:child_process";
import { basename } from "node:path";
import { Box, Text, useStdout } from "ink";
import { useStore } from "../state/store.js";
import type { AgentMode } from "../state/session.js";

export type { AgentMode };

function gitBranch(cwd: string): string | undefined {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function shortModelId(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1] && parts[parts.length - 1]!.length > 0
    ? parts[parts.length - 1]!
    : id;
}

function formatCount(n: number): string {
  if (n >= 100_000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 10_000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function Footer() {
  const { stdout } = useStdout();
  const mode = useStore((s) => s.mode);
  const modelKey = useStore((s) => s.modelKey);
  const config = useStore((s) => s.config);
  const usage = useStore((s) => s.usage);
  const usageApprox = useStore((s) => s.usageApprox);
  const cwd = process.cwd();
  const dir = basename(cwd);
  const branch = gitBranch(cwd);
  const modeColor = mode === "Plan" ? "yellow" : mode === "Ask" ? "blue" : undefined;
  const entry = config.models[modelKey];
  const upstream = entry?.model ?? modelKey;
  const label = shortModelId(upstream);
  const ctx = entry?.contextLength;
  let tokenBit = "";
  if (usage) {
    const used = usage.total;
    const pct = ctx && ctx > 0 ? Math.min(100, Math.round((used / ctx) * 100)) : undefined;
    const tilde = usageApprox ? "~" : "";
    tokenBit =
      ctx && ctx > 0
        ? `${tilde}${formatCount(used)}/${formatCount(ctx)} ${pct}%`
        : `${tilde}${formatCount(used)} tok`;
  }

  const modelShown = stdout.columns < 90 ? label : `${modelKey} · ${label}`;

  return (
    <Box paddingLeft={3}>
      <Text color={modeColor}>{mode}</Text>
      <Text dimColor>
        {" · "}
        {modelShown}
        {tokenBit ? ` · ${tokenBit}` : ""}
        {" · "}
        {dir}
        {branch ? ` · ${branch}` : ""}
      </Text>
    </Box>
  );
}
