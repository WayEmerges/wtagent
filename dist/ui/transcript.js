import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Static, Text } from "ink";
import { memo } from "react";
import { useStore } from "../state/store.js";
import { RowView, SpinnerGlyph } from "./rows.js";
function SettledBlock({ row }) {
    return (_jsxs(Box, { flexDirection: "column", children: [row.kind === "assistant" || row.kind === "error" ? _jsx(Text, { children: " " }) : null, row.kind === "assistant" ? _jsx(Text, { children: " " }) : null, _jsx(RowView, { row: row }), row.kind === "user" ? (_jsxs(_Fragment, { children: [_jsx(Text, { children: " " }), _jsx(Text, { children: " " })] })) : (_jsx(Text, { children: " " }))] }));
}
export const Transcript = memo(function Transcript({ layoutKey = 0 }) {
    const rows = useStore((s) => s.rows);
    const streamingId = useStore((s) => s.streamingId);
    const settled = rows.filter((row) => {
        if (row.id === streamingId) {
            return false;
        }
        if (row.kind === "tool" && row.status === "running") {
            return false;
        }
        return true;
    });
    const live = rows.filter((row) => row.id === streamingId || (row.kind === "tool" && row.status === "running"));
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Static, { items: settled, children: (row) => (_jsx(Box, { children: _jsx(SettledBlock, { row: row }) }, `${layoutKey}:${row.id}`)) }, layoutKey), live.map((row) => row.kind === "assistant" && row.text.length === 0 ? null : (_jsx(Box, { flexDirection: "column", children: _jsx(RowView, { row: row }) }, row.id)))] }));
});
export const ActivityLine = memo(function ActivityLine() {
    const streaming = useStore((s) => s.streamingId !== null);
    const running = useStore((s) => s.rows.find((r) => r.kind === "tool" && r.status === "running"));
    if (!streaming) {
        return null;
    }
    const label = running && running.kind === "tool" ? `${running.name} ${running.args}`.trim() : "Working...";
    return (_jsxs(Box, { children: [_jsx(SpinnerGlyph, {}), _jsxs(Text, { children: [" ", label] })] }));
});
//# sourceMappingURL=transcript.js.map