import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { sessionTitle } from "../sessions/store.js";
export function SessionPicker({ sessions, selected, }) {
    if (sessions.length === 0) {
        return (_jsx(Box, { paddingX: 2, children: _jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, italic: true, children: "No saved sessions for this workspace" }) }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 2, children: [_jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, children: "Resume session" }) }), sessions.map((s, i) => {
                const active = i === selected;
                const when = s.updatedAt.replace("T", " ").slice(0, 16);
                const line = `${when}  ${sessionTitle(s)}`;
                return (_jsxs(Box, { width: "100%", flexDirection: "row", alignItems: "center", children: [_jsx(Box, { width: 1, backgroundColor: active ? "cyan" : undefined, children: _jsx(Text, { children: " " }) }), _jsx(Box, { width: 2, children: _jsx(Text, { color: active ? "cyan" : undefined, dimColor: !active, children: active ? "→ " : "  " }) }), _jsx(Text, { bold: active, dimColor: !active, wrap: "truncate", children: line })] }, s.id));
            })] }));
}
//# sourceMappingURL=session-picker.js.map