import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export const SLASH_COMMANDS = [
    { name: "/help", summary: "Show commands", implemented: true },
    { name: "/mode", summary: "Cycle Agent / Plan / Ask", implemented: true },
    { name: "/clear", summary: "New chat, keep process", implemented: true },
    { name: "/quit", summary: "Exit", implemented: true },
    { name: "/exit", summary: "Exit", implemented: true },
    { name: "/model", summary: "Pick model", implemented: true },
    { name: "/resume", summary: "Resume a session", implemented: true },
    { name: "/compact", summary: "Summarize session into MEMORY.md", implemented: true },
    { name: "/skill", summary: "List/toggle prompt skills", implemented: true },
    { name: "/caveman", summary: "Terse mode on/off/lite/full/ultra", implemented: true },
    { name: "/copy", summary: "Copy last assistant message", implemented: true },
    { name: "/config", summary: "Show config path", implemented: true },
];
export function filterSlash(draft) {
    const token = draft.split(/\s/)[0] ?? "";
    if (!token.startsWith("/")) {
        return SLASH_COMMANDS;
    }
    const q = token.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}
export function SlashPalette({ matches, selected, }) {
    if (matches.length === 0) {
        return (_jsx(Box, { paddingX: 1, children: _jsx(Text, { dimColor: true, italic: true, children: "No matching commands" }) }));
    }
    return (_jsx(Box, { flexDirection: "column", paddingX: 1, borderStyle: "round", borderColor: "gray", children: matches.map((cmd, i) => {
            const active = i === selected;
            return (_jsxs(Box, { children: [_jsx(Text, { inverse: active, children: cmd.name }), _jsxs(Text, { dimColor: true, children: ["  ", cmd.summary, cmd.implemented ? "" : "  (not implemented)"] })] }, cmd.name));
        }) }));
}
//# sourceMappingURL=slash-palette.js.map