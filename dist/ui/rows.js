import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from "ink";
import { useEffect, useState } from "react";
import { MarkdownView } from "./markdown.js";
import { wrapWords } from "./wrap.js";
const USER_BOX_ROWS = 3;
const USER_BOX_BG = "#3a3a3a";
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
    const { stdout } = useStdout();
    const width = stdout.columns;
    const boxWidth = Math.max(20, width - 4);
    const inner = Math.max(8, boxWidth - 2 - 3);
    const lines = wrapWords(text, inner);
    const height = Math.max(USER_BOX_ROWS, lines.length + 2);
    return (_jsxs(Box, { flexDirection: "column", width: boxWidth, height: height, flexShrink: 0, marginRight: 4, paddingX: 1, justifyContent: "flex-start", backgroundColor: USER_BOX_BG, children: [_jsx(Text, { children: " " }), lines.map((line, idx) => (_jsxs(Text, { children: [idx === 0 ? " → " : "   ", line] }, idx))), _jsx(Text, { children: " " })] }));
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