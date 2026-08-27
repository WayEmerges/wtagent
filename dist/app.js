import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box } from "ink";
import { useEffect } from "react";
import { useStore } from "./state/store.js";
import { ApprovalCard } from "./ui/approval.js";
import { Composer } from "./ui/composer.js";
import { Footer } from "./ui/footer.js";
import { SetupCard } from "./ui/setup-card.js";
import { ActivityLine, Transcript } from "./ui/transcript.js";
import { useTerminalLayout } from "./ui/use-terminal-layout.js";
export function App() {
    const needsSetup = useStore((s) => s.config.missing || Boolean(s.config.invalid));
    const { layoutKey, suspended } = useTerminalLayout();
    useEffect(() => {
        const first = useStore.getState().consumeInitialPrompt();
        if (first) {
            useStore.getState().submitUser(first);
        }
    }, []);
    if (suspended) {
        return _jsx(Box, {});
    }
    return (_jsxs(Box, { flexDirection: "column", children: [needsSetup ? _jsx(SetupCard, {}) : _jsx(Transcript, { layoutKey: layoutKey }), _jsx(ActivityLine, {}), _jsx(ApprovalCard, {}), _jsx(Composer, {}), _jsx(Footer, {})] }, layoutKey));
}
//# sourceMappingURL=app.js.map