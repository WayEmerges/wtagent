import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useApp, useInput, usePaste, useStdin, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { modelChoices } from "../config/load.js";
import { listSessions } from "../sessions/store.js";
import { useStore } from "../state/store.js";
import { copyText, pasteText } from "./clipboard.js";
import { deleteRange, deleteSelectionOr, hasSelection, insertText, layoutLines, lineEnd, lineHome, lineIndexForCursor, lineRuns, moveCursor, moveGrapheme, moveVertical, sanitizeInsert, selRange, wordLeft, wordRight, } from "./draft.js";
import { ModelPicker } from "./model-picker.js";
import { SessionPicker } from "./session-picker.js";
import { filterSlash, SlashPalette, SLASH_COMMANDS } from "./slash-palette.js";
const MIN_INNER_LINES = 3;
const GLYPH = " → ";
const CONT = "   ";
const COMPOSER_BG = "#1f1f1f";
function CaretText({ text, col, showCaret, lineStart, selStart, selEnd, }) {
    const hasSel = selEnd > selStart;
    if (!showCaret && !hasSel) {
        return _jsx(Text, { wrap: "truncate", children: text.length === 0 ? " " : text });
    }
    if (showCaret && !hasSel) {
        const at = col >= text.length ? " " : (text[col] ?? " ");
        const before = col > 0 ? text.slice(0, Math.min(col, text.length)) : "";
        const after = col >= text.length ? "" : text.slice(col + 1);
        return (_jsxs(Text, { wrap: "truncate", children: [before, _jsx(Text, { backgroundColor: "white", color: "black", children: at }), after] }));
    }
    const runs = lineRuns({
        text,
        lineStart,
        cursor: showCaret ? lineStart + col : -1,
        selStart,
        selEnd,
        showCaret,
    });
    return (_jsx(Text, { wrap: "truncate", children: runs.map((run, ri) => run.kind === "plain" ? (_jsx(Text, { children: run.text }, ri)) : (_jsx(Text, { backgroundColor: "white", color: "black", children: run.text }, ri))) }));
}
function useTerminalFocus() {
    const [focused, setFocused] = useState(true);
    const { stdin } = useStdin();
    const { stdout } = useStdout();
    useEffect(() => {
        stdout.write("\x1b[?1004h");
        const onData = (chunk) => {
            const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            if (s.includes("\x1b[I")) {
                setFocused(true);
            }
            if (s.includes("\x1b[O")) {
                setFocused(false);
            }
        };
        stdin.on("data", onData);
        return () => {
            stdin.off("data", onData);
            stdout.write("\x1b[?1004l");
        };
    }, [stdin, stdout]);
    return focused;
}
function Placeholder({ text, caret }) {
    if (!caret || text.length === 0) {
        return (_jsx(Text, { dimColor: true, wrap: "truncate", children: text }));
    }
    return (_jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { backgroundColor: "white", color: "black", children: text.slice(0, 1) }), _jsx(Text, { dimColor: true, children: text.slice(1) })] }));
}
function isFocusNoise(input) {
    return input === "\x1b[I" || input === "\x1b[O" || input === "[I" || input === "[O";
}
export function Composer() {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const focused = useTerminalFocus();
    const [draft, setDraftState] = useState({ value: "", cursor: 0, selAnchor: null });
    const { value, cursor, selAnchor } = draft;
    const width = stdout.columns;
    const boxWidth = Math.max(20, width - 4);
    const innerWidth = Math.max(8, boxWidth - 4 - GLYPH.length);
    const placeholder = width < 80 ? "Ask a question..." : "Enter a command or ask a question...";
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [paletteIndex, setPaletteIndex] = useState(0);
    const [pickerIndex, setPickerIndex] = useState(0);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(null);
    const [liveDraft, setLiveDraft] = useState("");
    const pendingShell = useStore((s) => s.pendingShell);
    const modelPickerOpen = useStore((s) => s.modelPickerOpen);
    const sessionPickerOpen = useStore((s) => s.sessionPickerOpen);
    const modelKey = useStore((s) => s.modelKey);
    const config = useStore((s) => s.config);
    const choices = modelChoices(config);
    const sessions = sessionPickerOpen ? listSessions(process.cwd()) : [];
    const draftRef = useRef({ value: "", cursor: 0, selAnchor: null });
    const historyRef = useRef([]);
    const historyIndexRef = useRef(null);
    const liveDraftRef = useRef("");
    const paletteOpenRef = useRef(false);
    const paletteIndexRef = useRef(0);
    const innerWidthRef = useRef(innerWidth);
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
    liveDraftRef.current = liveDraft;
    paletteOpenRef.current = paletteOpen;
    paletteIndexRef.current = paletteIndex;
    innerWidthRef.current = innerWidth;
    const matches = filterSlash(value);
    const draftActive = !pendingShell && !modelPickerOpen && !sessionPickerOpen;
    useEffect(() => {
        if (sessionPickerOpen) {
            setPickerIndex(0);
        }
    }, [sessionPickerOpen]);
    useEffect(() => {
        if (!modelPickerOpen) {
            return;
        }
        const list = modelChoices(useStore.getState().config);
        const current = useStore.getState().modelKey;
        const i = Math.max(0, list.findIndex((c) => c.key === current));
        setPickerIndex(i);
    }, [modelPickerOpen]);
    function paint(next) {
        const prev = draftRef.current;
        if (prev.value === next.value && prev.cursor === next.cursor && prev.selAnchor === next.selAnchor) {
            return;
        }
        draftRef.current = next;
        setDraftState(next);
    }
    function clearHistoryBrowse() {
        if (historyIndexRef.current === null) {
            return;
        }
        historyIndexRef.current = null;
        setHistoryIndex(null);
    }
    function setDraft(next, nextCursor) {
        paint({
            value: next,
            cursor: nextCursor ?? next.length,
            selAnchor: null,
        });
    }
    function remember(text) {
        const nextHist = [...historyRef.current, text];
        historyRef.current = nextHist;
        historyIndexRef.current = null;
        liveDraftRef.current = "";
        setHistory(nextHist);
        setHistoryIndex(null);
        setLiveDraft("");
    }
    function runSlash(line) {
        remember(line);
        useStore.getState().runCommand(line, exit);
        setDraft("");
        paletteOpenRef.current = false;
        setPaletteOpen(false);
    }
    function insertChunk(raw) {
        const chunk = sanitizeInsert(raw);
        if (chunk.length === 0) {
            return;
        }
        const wasEmpty = draftRef.current.value.length === 0;
        const next = insertText(draftRef.current, chunk);
        paint(next);
        clearHistoryBrowse();
        if (wasEmpty && next.value.startsWith("/")) {
            paletteOpenRef.current = true;
            paletteIndexRef.current = 0;
            setPaletteOpen(true);
            setPaletteIndex(0);
        }
    }
    function copySelection() {
        const d = draftRef.current;
        if (!hasSelection(d)) {
            return false;
        }
        const { start, end } = selRange(d);
        return copyText(d.value.slice(start, end));
    }
    usePaste((text) => {
        insertChunk(text);
    }, { isActive: draftActive });
    useInput((input, key) => {
        if (isFocusNoise(input)) {
            return;
        }
        if (pendingShell) {
            if (input === "y" || input === "Y") {
                useStore.getState().resolveShell("allow");
                return;
            }
            if (input === "n" || input === "N" || key.escape) {
                useStore.getState().resolveShell("deny");
                return;
            }
            if (input === "s" || input === "S") {
                useStore.getState().resolveShell("yolo");
                return;
            }
            return;
        }
        if (sessionPickerOpen) {
            if (key.escape) {
                useStore.getState().closeSessionPicker();
                return;
            }
            if (key.upArrow) {
                setPickerIndex((i) => (i - 1 + sessions.length) % Math.max(sessions.length, 1));
                return;
            }
            if (key.downArrow || key.tab) {
                setPickerIndex((i) => (i + 1) % Math.max(sessions.length, 1));
                return;
            }
            if (key.return) {
                const session = sessions[pickerIndex];
                if (session) {
                    useStore.getState().selectSession(session.id);
                }
                return;
            }
            return;
        }
        if (modelPickerOpen) {
            if (key.escape) {
                useStore.getState().closeModelPicker();
                return;
            }
            if (key.upArrow) {
                setPickerIndex((i) => (i - 1 + choices.length) % Math.max(choices.length, 1));
                return;
            }
            if (key.downArrow || key.tab) {
                setPickerIndex((i) => (i + 1) % Math.max(choices.length, 1));
                return;
            }
            if (key.return) {
                const choice = choices[pickerIndex];
                if (choice) {
                    useStore.getState().selectModel(choice.key);
                }
                return;
            }
            return;
        }
        const liveMatches = filterSlash(draftRef.current.value);
        if (key.escape) {
            if (paletteOpenRef.current) {
                paletteOpenRef.current = false;
                setPaletteOpen(false);
            }
            else if (hasSelection(draftRef.current)) {
                paint({ ...draftRef.current, selAnchor: null });
            }
            else {
                useStore.getState().cancelStream();
            }
            return;
        }
        if (key.shift && key.tab) {
            useStore.getState().cycleMode();
            return;
        }
        if (key.tab) {
            const slashMode = paletteOpenRef.current || draftRef.current.value.startsWith("/");
            if (slashMode && liveMatches.length > 0) {
                if (!paletteOpenRef.current) {
                    paletteOpenRef.current = true;
                    paletteIndexRef.current = 0;
                    setPaletteOpen(true);
                    setPaletteIndex(0);
                }
                else {
                    setPaletteIndex((i) => {
                        const n = (i + 1) % liveMatches.length;
                        paletteIndexRef.current = n;
                        return n;
                    });
                }
            }
            return;
        }
        if (key.ctrl && input === "c") {
            if (copySelection()) {
                paint({ ...draftRef.current, selAnchor: null });
                return;
            }
            if (useStore.getState().streamingId) {
                useStore.getState().cancelStream();
                return;
            }
            exit();
            return;
        }
        if (key.ctrl && input === "d") {
            if (draftRef.current.value.length === 0) {
                exit();
                return;
            }
            paint(deleteSelectionOr(draftRef.current, "delete"));
            return;
        }
        if (key.ctrl && (input === "v" || input === "V")) {
            const clip = pasteText();
            if (clip) {
                insertChunk(clip);
            }
            return;
        }
        if (key.ctrl && input === "a") {
            const cur = draftRef.current;
            if (cur.value.length === 0) {
                return;
            }
            paint({ value: cur.value, cursor: cur.value.length, selAnchor: 0 });
            return;
        }
        if (key.ctrl && input === "e") {
            const d = draftRef.current;
            paint(moveCursor(d, d.value.length, Boolean(key.shift)));
            return;
        }
        if (key.ctrl && input === "k") {
            const d = draftRef.current;
            const end = lineEnd(d.value, d.cursor, innerWidthRef.current);
            paint(deleteRange(d, d.cursor, end));
            return;
        }
        if (key.ctrl && input === "u") {
            const d = draftRef.current;
            const start = lineHome(d.value, d.cursor, innerWidthRef.current);
            paint(deleteRange(d, start, d.cursor));
            return;
        }
        if (key.ctrl && input === "w") {
            const d = draftRef.current;
            if (hasSelection(d)) {
                paint(deleteSelectionOr(d, "backspace"));
                return;
            }
            paint(deleteRange(d, wordLeft(d.value, d.cursor), d.cursor));
            return;
        }
        const newline = (key.return && key.shift) || (key.ctrl && input === "j");
        if (newline) {
            insertChunk("\n");
            return;
        }
        const extend = Boolean(key.shift);
        const d = draftRef.current;
        if (key.leftArrow) {
            clearHistoryBrowse();
            const next = key.ctrl || key.meta ? wordLeft(d.value, d.cursor) : moveGrapheme(d.value, d.cursor, -1);
            paint(moveCursor(d, next, extend));
            return;
        }
        if (key.rightArrow) {
            clearHistoryBrowse();
            const next = key.ctrl || key.meta ? wordRight(d.value, d.cursor) : moveGrapheme(d.value, d.cursor, 1);
            paint(moveCursor(d, next, extend));
            return;
        }
        if (key.home) {
            clearHistoryBrowse();
            paint(moveCursor(d, lineHome(d.value, d.cursor, innerWidthRef.current), extend));
            return;
        }
        if (key.end) {
            clearHistoryBrowse();
            paint(moveCursor(d, lineEnd(d.value, d.cursor, innerWidthRef.current), extend));
            return;
        }
        if (key.upArrow) {
            if (paletteOpenRef.current && liveMatches.length > 0) {
                setPaletteIndex((i) => {
                    const n = (i - 1 + liveMatches.length) % liveMatches.length;
                    paletteIndexRef.current = n;
                    return n;
                });
                return;
            }
            const moved = moveVertical(d.value, d.cursor, innerWidthRef.current, -1);
            if (moved !== null) {
                paint(moveCursor(d, moved, extend));
                return;
            }
            if (extend) {
                paint(moveCursor(d, 0, true));
                return;
            }
            const hist = historyRef.current;
            if (hist.length === 0) {
                return;
            }
            if (historyIndexRef.current === null) {
                liveDraftRef.current = d.value;
                setLiveDraft(d.value);
                const next = hist.length - 1;
                historyIndexRef.current = next;
                setHistoryIndex(next);
                setDraft(hist[next] ?? "");
            }
            else if (historyIndexRef.current > 0) {
                const next = historyIndexRef.current - 1;
                historyIndexRef.current = next;
                setHistoryIndex(next);
                setDraft(hist[next] ?? "");
            }
            return;
        }
        if (key.downArrow) {
            if (paletteOpenRef.current && liveMatches.length > 0) {
                setPaletteIndex((i) => {
                    const n = (i + 1) % liveMatches.length;
                    paletteIndexRef.current = n;
                    return n;
                });
                return;
            }
            const moved = moveVertical(d.value, d.cursor, innerWidthRef.current, 1);
            if (moved !== null) {
                paint(moveCursor(d, moved, extend));
                return;
            }
            if (extend) {
                paint(moveCursor(d, d.value.length, true));
                return;
            }
            if (historyIndexRef.current === null) {
                return;
            }
            const hist = historyRef.current;
            if (historyIndexRef.current < hist.length - 1) {
                const next = historyIndexRef.current + 1;
                historyIndexRef.current = next;
                setHistoryIndex(next);
                setDraft(hist[next] ?? "");
            }
            else {
                historyIndexRef.current = null;
                setHistoryIndex(null);
                setDraft(liveDraftRef.current);
            }
            return;
        }
        if (key.return) {
            if (paletteOpenRef.current && liveMatches.length > 0) {
                const cmd = liveMatches[Math.min(paletteIndexRef.current, liveMatches.length - 1)];
                if (cmd) {
                    runSlash(cmd.name);
                }
                return;
            }
            const trimmed = d.value.trim();
            if (trimmed.startsWith("/")) {
                const token = trimmed.split(/\s/)[0] ?? trimmed;
                const known = SLASH_COMMANDS.find((c) => c.name === token);
                runSlash(known ? `${known.name}${trimmed.slice(token.length)}` : trimmed);
                return;
            }
            if (trimmed.length > 0) {
                remember(trimmed);
                useStore.getState().submitUser(trimmed);
                setDraft("");
            }
            return;
        }
        if (key.backspace || key.delete) {
            const next = deleteSelectionOr(d, key.delete ? "delete" : "backspace");
            paint(next);
            clearHistoryBrowse();
            if (next.value.length === 0) {
                paletteOpenRef.current = false;
                setPaletteOpen(false);
            }
            return;
        }
        if (key.ctrl || key.meta) {
            return;
        }
        if (input) {
            insertChunk(input);
        }
    });
    const showPlaceholder = value.length === 0;
    const allLines = showPlaceholder ? [{ text: placeholder, start: 0 }] : layoutLines(value, innerWidth);
    const cursorLine = showPlaceholder ? 0 : lineIndexForCursor(allLines, cursor, value.length);
    const boxHeight = MIN_INNER_LINES;
    let start = Math.max(0, allLines.length - boxHeight);
    if (cursorLine < start) {
        start = cursorLine;
    }
    if (cursorLine >= start + boxHeight) {
        start = cursorLine - boxHeight + 1;
    }
    const visible = allLines.slice(start, start + boxHeight);
    const extra = boxHeight - visible.length;
    const padTop = Math.floor(extra / 2);
    const padBottom = extra - padTop;
    const selection = selRange({ value, cursor, selAnchor });
    return (_jsxs(Box, { flexDirection: "column", width: width, marginTop: 1, marginBottom: 1, flexShrink: 0, children: [sessionPickerOpen ? (_jsx(SessionPicker, { sessions: sessions, selected: pickerIndex })) : modelPickerOpen ? (_jsx(ModelPicker, { choices: choices, selected: pickerIndex, current: modelKey })) : paletteOpen ? (_jsx(SlashPalette, { matches: matches, selected: Math.min(paletteIndex, Math.max(0, matches.length - 1)) })) : null, _jsxs(Box, { flexDirection: "column", width: boxWidth, height: boxHeight + 2, flexShrink: 0, marginLeft: 0, marginRight: 4, paddingX: 1, paddingY: 0, borderStyle: "round", borderColor: "white", justifyContent: "flex-start", alignItems: "flex-start", backgroundColor: COMPOSER_BG, children: [Array.from({ length: padTop }, (_, i) => (_jsx(Text, { children: " " }, `pad-top-${i}`))), visible.map((line, i) => {
                        const abs = start + i;
                        const glyph = abs === 0 ? GLYPH : CONT;
                        const onCaretLine = !showPlaceholder && focused && abs === cursorLine;
                        return (_jsxs(Box, { width: innerWidth + GLYPH.length, flexShrink: 0, children: [_jsx(Box, { width: GLYPH.length, flexShrink: 0, children: _jsx(Text, { children: glyph }) }), showPlaceholder ? (_jsx(Placeholder, { text: line.text, caret: focused })) : (_jsx(CaretText, { text: line.text, col: Math.max(0, cursor - line.start), lineStart: line.start, selStart: selection.start, selEnd: selection.end, showCaret: onCaretLine }))] }, `line-${abs}`));
                    }), Array.from({ length: padBottom }, (_, i) => (_jsx(Text, { children: " " }, `pad-bot-${i}`)))] })] }));
}
//# sourceMappingURL=composer.js.map