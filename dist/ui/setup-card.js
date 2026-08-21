import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useStore } from "../state/store.js";
export function SetupCard() {
    const config = useStore((s) => s.config);
    return (_jsx(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, justifyContent: "center", children: _jsxs(Box, { borderStyle: "round", borderColor: "yellow", paddingX: 2, paddingY: 1, flexDirection: "column", children: [_jsx(Text, { color: "yellow", children: "Setup" }), _jsx(Text, { children: " " }), config.invalid ? (_jsxs(Text, { color: "red", children: ["Invalid config: ", config.invalid] })) : (_jsx(Text, { children: "No config file yet. Copy the example, then edit URLs for your server." })), _jsx(Text, { children: " " }), _jsx(Text, { dimColor: true, children: config.path }), _jsx(Text, { children: " " }), _jsx(Text, { children: "mkdir -p ~/.waytech-agent" }), _jsx(Text, { children: "cp ~/Projects/wtagent/config.json.example ~/.waytech-agent/config.json" }), _jsx(Text, { children: " " }), _jsx(Text, { dimColor: true, children: "/quit to exit \u00B7 /help for commands" })] }) }));
}
//# sourceMappingURL=setup-card.js.map