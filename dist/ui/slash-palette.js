import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useWindowSize } from "ink";
import { listSkills } from "../skills/load.js";
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
export function allSlashCommands() {
    const extra = [];
    try {
        for (const skill of listSkills()) {
            const name = `/${skill.id}`;
            if (SLASH_COMMANDS.some((c) => c.name === name)) {
                continue;
            }
            extra.push({
                name,
                summary: skill.description || `Toggle skill ${skill.id}`,
                implemented: true,
            });
        }
    }
    catch {
        /* palette still works without skill files */
    }
    return extra.length > 0 ? [...SLASH_COMMANDS, ...extra] : SLASH_COMMANDS;
}
export function filterSlash(draft) {
    const token = (draft.trim().split(/\s/)[0] ?? "").toLowerCase();
    if (!token.startsWith("/")) {
        return allSlashCommands();
    }
    return allSlashCommands().filter((c) => c.name.startsWith(token));
}
export function slashTokenAt(text, cursor) {
    const c = Math.max(0, Math.min(cursor, text.length));
    let start = c;
    while (start > 0 && !/\s/.test(text[start - 1])) {
        start--;
    }
    let end = start;
    while (end < text.length && !/\s/.test(text[end])) {
        end++;
    }
    const token = text.slice(start, end);
    if (!token.startsWith("/")) {
        return null;
    }
    return { start, end, token };
}
const CAVEMAN_ARG = /^(on|off|normal|toggle|lite|full|ultra)$/i;
const MODE_ARG = /^(plan|ask|agent)$/i;
const SKILL_ONE = /^(list|ls|status|add)$/i;
const SKILL_ONOFF = /^(on|off)$/i;
const SKILL_ACTION = /^(on|off|toggle|lite|full|ultra)$/i;
/** Commands that open a picker or exit — keep leftover text, do not auto-send. */
export const SLASH_HOLD_REST = new Set(["/model", "/resume", "/quit", "/exit"]);
function skipWs(text, i) {
    while (i < text.length && /\s/.test(text[i])) {
        i++;
    }
    return i;
}
function readWord(text, i) {
    const start = skipWs(text, i);
    if (start >= text.length) {
        return null;
    }
    let end = start;
    while (end < text.length && !/\s/.test(text[end])) {
        end++;
    }
    return { word: text.slice(start, end), start, end };
}
function knownSlashName(name) {
    const n = name.toLowerCase();
    if (n === "/skills") {
        return true;
    }
    return allSlashCommands().some((c) => c.name === n);
}
function consumeSlashAt(text, start) {
    const head = readWord(text, start);
    if (!head || !head.word.startsWith("/")) {
        return null;
    }
    const name = head.word.toLowerCase();
    if (!knownSlashName(name)) {
        return null;
    }
    let end = head.end;
    if (name === "/caveman") {
        const arg = readWord(text, end);
        if (arg && CAVEMAN_ARG.test(arg.word)) {
            end = arg.end;
        }
    }
    else if (name === "/skill" || name === "/skills") {
        const a0 = readWord(text, end);
        if (a0) {
            if (SKILL_ONE.test(a0.word)) {
                end = a0.end;
            }
            else if (SKILL_ONOFF.test(a0.word)) {
                end = a0.end;
                const a1 = readWord(text, end);
                if (a1) {
                    end = a1.end;
                }
            }
            else {
                end = a0.end;
                const a1 = readWord(text, end);
                if (a1 && SKILL_ACTION.test(a1.word)) {
                    end = a1.end;
                }
            }
        }
    }
    else if (name === "/mode") {
        const arg = readWord(text, end);
        if (arg && MODE_ARG.test(arg.word)) {
            end = arg.end;
        }
    }
    return { command: text.slice(head.start, end).trim(), end };
}
/** Pull a /command out of a line that also has normal prompt text. */
export function splitInlineSlash(text) {
    let last = null;
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "/") {
            continue;
        }
        if (i > 0 && !/\s/.test(text[i - 1])) {
            continue;
        }
        const consumed = consumeSlashAt(text, i);
        if (consumed) {
            last = { command: consumed.command, from: i, to: consumed.end };
            i = consumed.end - 1;
        }
    }
    if (!last) {
        return null;
    }
    const rest = `${text.slice(0, last.from)} ${text.slice(last.to)}`.replace(/\s+/g, " ").trim();
    return { command: last.command, rest };
}
const LABEL_COLS = 24;
function truncateDesc(text, max) {
    const n = text.trim();
    if (n.length === 0 || max <= 0)
        return "";
    if (n.length <= max)
        return n;
    const words = n.split(/\s+/);
    let out = "";
    for (const word of words) {
        const next = out.length === 0 ? word : `${out} ${word}`;
        if (next.length + 1 > max) {
            return out.length > 0 ? `${out}…` : `${word.slice(0, Math.max(0, max - 1))}…`;
        }
        out = next;
    }
    return out;
}
export function SlashPalette({ matches, selected, }) {
    const { columns: width } = useWindowSize();
    if (matches.length === 0) {
        return (_jsx(Box, { paddingX: 2, flexDirection: "column", children: _jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, children: "No matches" }) }) }));
    }
    return (_jsx(Box, { flexDirection: "column", paddingX: 2, children: matches.map((cmd, i) => {
            const active = i === selected;
            const descBudget = Math.max(0, width - 4 - 3 - LABEL_COLS - 2);
            return (_jsxs(Box, { width: "100%", flexDirection: "row", alignItems: "center", children: [_jsx(Box, { width: 1, backgroundColor: active ? "cyan" : undefined, children: _jsx(Text, { children: " " }) }), _jsx(Box, { width: 2, children: _jsx(Text, { color: active ? "cyan" : undefined, dimColor: !active, children: active ? "→ " : "  " }) }), _jsx(Box, { width: LABEL_COLS, marginRight: 2, children: _jsx(Text, { bold: active, dimColor: !active, wrap: "truncate", children: cmd.name }) }), _jsx(Box, { flexGrow: 1, children: _jsx(Text, { bold: active, dimColor: !active, wrap: "truncate", children: truncateDesc(`${cmd.summary}${cmd.implemented ? "" : "  (not implemented)"}`, descBudget) }) })] }, cmd.name));
        }) }));
}
//# sourceMappingURL=slash-palette.js.map