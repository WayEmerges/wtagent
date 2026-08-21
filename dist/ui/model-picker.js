import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function ModelPicker({ choices, selected, current, }) {
    return (_jsxs(Box, { flexDirection: "column", paddingX: 2, children: [_jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, children: "Select model" }) }), choices.map((c, i) => {
                const active = i === selected;
                const mark = c.key === current ? "*" : " ";
                const name = `${mark} ${c.key}  ${c.label}`;
                const extra = c.disabled ? "  (disabled)" : c.baseURL ? `  ${c.baseURL}` : "";
                return (_jsxs(Box, { width: "100%", flexDirection: "row", alignItems: "center", children: [_jsx(Box, { width: 1, backgroundColor: active ? "cyan" : undefined, children: _jsx(Text, { children: " " }) }), _jsx(Box, { width: 2, children: _jsx(Text, { color: active ? "cyan" : undefined, dimColor: !active, children: active ? "→ " : "  " }) }), _jsxs(Text, { bold: active, dimColor: c.disabled && !active, wrap: "truncate", children: [name, extra] })] }, c.key));
            })] }));
}
//# sourceMappingURL=model-picker.js.map