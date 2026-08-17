import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useStore } from "../state/store.js";
export function ApprovalCard() {
    const pending = useStore((s) => s.pendingShell);
    if (!pending) {
        return null;
    }
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, paddingX: 1, borderStyle: "single", borderColor: "yellow", children: [_jsx(Text, { color: "yellow", children: "run_shell" }), _jsx(Text, { children: pending.command }), _jsx(Text, { dimColor: true, children: "[y] allow  [n] deny  [s] allow for this session" })] }));
}
//# sourceMappingURL=approval.js.map