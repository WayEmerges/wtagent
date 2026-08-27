import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { USER_MSG_BG } from "./chrome.js";
import { MarkdownView } from "./markdown.js";
import { wrapWords } from "./wrap.js";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
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
export function RowView({ row }) {
    if (row.kind === "user") {
        return _jsx(UserPromptBox, { text: row.text });
    }
    if (row.kind === "assistant") {
        if (row.text.length === 0) {
            return _jsx(Text, { dimColor: true, children: " " });
        }
        return _jsx(MarkdownView, { text: row.text });
    }
    if (row.kind === "tool") {
        const glyph = row.status === "running" ? (_jsx(SpinnerGlyph, {})) : row.status === "done" ? (_jsx(Text, { color: "green", children: "\u2713" })) : (_jsx(Text, { color: "red", children: "\u2717" }));
        return (_jsxs(Box, { children: [glyph, _jsxs(Text, { children: [" ", row.name, " "] }), _jsx(Text, { dimColor: true, children: row.args }), row.detail ? _jsxs(Text, { dimColor: true, children: ["  ", row.detail] }) : null] }));
    }
    if (row.kind === "error") {
        return _jsx(Text, { color: "red", children: row.text });
    }
    return (_jsx(Text, { dimColor: true, italic: true, children: row.text }));
}
//# sourceMappingURL=rows.js.map