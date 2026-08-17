import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { sessionTitle } from "../sessions/store.js";
export function SessionPicker({ sessions, selected, }) {
    if (sessions.length === 0) {
        return (_jsx(Box, { paddingX: 1, children: _jsx(Text, { dimColor: true, italic: true, children: "No saved sessions for this workspace" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, borderStyle: "round", borderColor: "gray", children: [_jsx(Text, { dimColor: true, children: "Resume session" }), sessions.map((s, i) => {
                const active = i === selected;
                const when = s.updatedAt.replace("T", " ").slice(0, 16);
                const line = `${when}  ${sessionTitle(s)}`;
                return (_jsx(Box, { children: _jsx(Text, { inverse: active, children: line }) }, s.id));
            })] }));
}
//# sourceMappingURL=session-picker.js.map