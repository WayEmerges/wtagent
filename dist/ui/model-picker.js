import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function ModelPicker({ choices, selected, current, }) {
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, borderStyle: "round", borderColor: "gray", children: [_jsx(Text, { dimColor: true, children: "Select model" }), choices.map((c, i) => {
                const active = i === selected;
                const mark = c.key === current ? "*" : " ";
                const name = `${mark} ${c.key}  ${c.label}`;
                const extra = c.disabled ? "  (disabled)" : c.baseURL ? `  ${c.baseURL}` : "";
                return (_jsxs(Box, { children: [_jsx(Text, { inverse: active, dimColor: c.disabled && !active, children: name }), _jsx(Text, { dimColor: true, children: extra })] }, c.key));
            })] }));
}
//# sourceMappingURL=model-picker.js.map