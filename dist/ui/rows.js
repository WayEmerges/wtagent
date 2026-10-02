import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { USER_MSG_BG } from "./chrome.js";
import { MarkdownView } from "./markdown.js";
import { wrapWords } from "./wrap.js";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const COLLAPSE_LINES = 6;
export function SpinnerGlyph() {
    const [i, setI] = useState(0);
    useEffect(() => {
        const t = setInterval(() => {
            setI((n) => (n + 1) % SPINNER_FRAMES.length);
        }, 80);
        return () => {
            clearInterval(t);
        };
    }, []);
    return _jsx(Text, { color: "cyan", children: SPINNER_FRAMES[i] });
}
function UserPromptBox({ text }) {
    const { columns: width } = useWindowSize();
    const boxWidth = Math.max(20, width - 2);
    const inner = Math.max(8, boxWidth - 1 - 5);
    const lines = wrapWords(text, inner);
    return (_jsx(Box, { flexDirection: "column", backgroundColor: USER_MSG_BG, paddingLeft: 1, paddingRight: 5, paddingY: 1, marginX: 1, width: boxWidth, flexShrink: 0, children: lines.map((line, idx) => (_jsx(Text, { wrap: "wrap", children: line }, idx))) }));
}
function toolTitle(row) {
    if (row.summary && row.summary.length > 0) {
        return row.summary;
    }
    if (row.name === "read_file" && row.path) {
        return `Read ${row.path}`;
    }
    if (row.name === "edit_file" || row.name === "write_file") {
        const plus = row.added !== undefined ? ` +${row.added}` : "";
        const minus = row.removed !== undefined ? ` -${row.removed}` : "";
        return `${row.name === "write_file" ? "Wrote" : "Edited"} ${row.path ?? row.args}${plus}${minus}`;
    }
    if (row.name === "grep") {
        return `Grep ${row.detail ? JSON.stringify(row.detail) : row.args}`;
    }
    if (row.name === "run_shell") {
        return `$ ${(row.detail ?? row.args).slice(0, 100)}`;
    }
    return `${row.name} ${row.args}`.trim();
}
function ToolCard({ row }) {
    const glyph = row.status === "running" ? (_jsx(SpinnerGlyph, {})) : row.status === "done" ? (_jsx(Text, { color: "green", children: "\u2713" })) : (_jsx(Text, { color: "red", children: "\u2717" }));
    const title = toolTitle(row);
    const output = row.output ?? (row.detail && row.detail.includes("\n") ? row.detail : undefined);
    const lines = output ? output.split("\n") : [];
    const expanded = Boolean(row.expanded);
    const showCollapse = lines.length > COLLAPSE_LINES;
    const visible = expanded || !showCollapse ? lines : lines.slice(0, 2);
    const hidden = showCollapse && !expanded ? lines.length - visible.length : 0;
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsxs(Box, { children: [glyph, _jsxs(Text, { children: [" ", title] }), row.status === "error" && row.detail && !row.detail.includes("\n") ? (_jsxs(Text, { color: "red", children: ["  ", row.detail.slice(0, 60)] })) : null] }), visible.length > 0 ? (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [visible.map((line, i) => (_jsx(Text, { dimColor: true, wrap: "truncate-end", children: line.slice(0, 120) }, i))), hidden > 0 ? (_jsxs(Text, { dimColor: true, children: ["\u2026 ", hidden, " lines hidden \u00B7 ctrl+o to expand"] })) : null, expanded && showCollapse ? _jsx(Text, { dimColor: true, children: "\u2026 ctrl+o to collapse" }) : null] })) : null] }));
}
export function RowView({ row }) {
    if (row.kind === "user") {
        return _jsx(UserPromptBox, { text: row.text });
    }
    if (row.kind === "assistant") {
        if (row.text.trim().length === 0) {
            return _jsx(Text, { dimColor: true, children: " " });
        }
        return _jsx(MarkdownView, { text: row.text });
    }
    if (row.kind === "tool") {
        return _jsx(ToolCard, { row: row });
    }
    if (row.kind === "error") {
        return _jsx(Text, { color: "red", children: row.text });
    }
    return (_jsx(Text, { dimColor: true, italic: true, children: row.text }));
}
//# sourceMappingURL=rows.js.map