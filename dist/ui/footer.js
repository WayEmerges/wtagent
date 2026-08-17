import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { Box, Text, useStdout } from "ink";
import { memo, useMemo } from "react";
import { useStore } from "../state/store.js";
function gitBranch(cwd) {
    try {
        const out = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out.length > 0 ? out : undefined;
    }
    catch {
        return undefined;
    }
}
function shortModelId(id) {
    const parts = id.split("/");
    return parts[parts.length - 1] && parts[parts.length - 1].length > 0
        ? parts[parts.length - 1]
        : id;
}
function formatCount(n) {
    if (n >= 100_000) {
        return `${Math.round(n / 1000)}k`;
    }
    if (n >= 10_000) {
        return `${(n / 1000).toFixed(1)}k`;
    }
    return String(n);
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
    const dir = basename(cwd);
    const branch = useMemo(() => gitBranch(cwd), [cwd]);
    const modeColor = mode === "Plan" ? "yellow" : mode === "Ask" ? "blue" : undefined;
    const effectiveKey = modelKey === "auto" && resolvedModelKey ? resolvedModelKey : modelKey;
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
    const modelShown = modelKey === "auto"
        ? resolvedModelKey
            ? stdout.columns < 90
                ? `auto→${resolvedModelKey}`
                : `auto → ${resolvedModelKey} · ${label}`
            : "auto"
        : stdout.columns < 90
            ? label
            : `${modelKey} · ${label}`;
    return (_jsxs(Box, { paddingLeft: 3, children: [_jsx(Text, { color: modeColor, children: mode }), _jsxs(Text, { dimColor: true, children: [" · ", modelShown, tokenBit ? ` · ${tokenBit}` : "", " · ", dir, branch ? ` · ${branch}` : ""] })] }));
});
//# sourceMappingURL=footer.js.map