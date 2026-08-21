import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { Box, Text, useStdout } from "ink";
import { memo, useMemo } from "react";
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

function displayPath(cwd: string): string {
  const home = homedir();
  if (cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

export const Footer = memo(function Footer() {
  const { stdout } = useStdout();
  const mode = useStore((s) => s.mode);
  const modelKey = useStore((s) => s.modelKey);
  const resolvedModelKey = useStore((s) => s.resolvedModelKey);
  const config = useStore((s) => s.config);
  const usage = useStore((s) => s.usage);
  const usageApprox = useStore((s) => s.usageApprox);
  const cwd = process.cwd();
  const pathLabel = displayPath(cwd);
  const branch = useMemo(() => gitBranch(cwd), [cwd]);
  const modeColor = mode === "Plan" ? "yellow" : mode === "Ask" ? "blue" : undefined;
  const effectiveKey =
    modelKey === "auto" && resolvedModelKey ? resolvedModelKey : modelKey;
  const entry = config.models[effectiveKey];
  const upstream = entry?.model ?? effectiveKey;
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

  const modelShown =
    modelKey === "auto"
      ? resolvedModelKey
        ? stdout.columns < 90
          ? `auto→${resolvedModelKey}`
          : `auto → ${resolvedModelKey} · ${label}`
        : "auto"
      : stdout.columns < 90
        ? label
        : `${modelKey} · ${label}`;

  return (
    <Box flexDirection="column" marginLeft={2} marginRight={1} marginTop={0}>
      <Box flexDirection="row" flexShrink={1}>
        <Text color={modeColor}>{mode}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{modelShown}</Text>
        {tokenBit ? <Text dimColor>{` · ${tokenBit}`}</Text> : null}
      </Box>
      <Box>
        <Text dimColor>
          {pathLabel}
          {branch ? ` · ${branch}` : ""}
        </Text>
      </Box>
    </Box>
  );
});
