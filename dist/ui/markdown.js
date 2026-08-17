import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from "ink";
import { marked } from "marked";
function sameStyle(a, b) {
    return a.bold === b.bold && a.italic === b.italic && a.code === b.code;
}
function wrapRuns(runs, width) {
    const w = Math.max(8, width);
    const lines = [];
    let line = [];
    let col = 0;
    function newline() {
        if (line.length > 0) {
            lines.push(line);
        }
        line = [];
        col = 0;
    }
    function add(run) {
        if (run.text.length === 0) {
            return;
        }
        const last = line[line.length - 1];
        if (last && sameStyle(last, run)) {
            last.text += run.text;
        }
        else {
            line.push({ ...run });
        }
        col += run.text.length;
    }
    for (const run of runs) {
        const parts = run.text.replace(/\s+/g, " ").split(/ /);
        for (let p = 0; p < parts.length; p++) {
            const word = parts[p] ?? "";
            if (p > 0) {
                if (col === 0) {
                    // skip space at start of line
                }
                else if (col + 1 + word.length > w) {
                    newline();
                }
                else {
                    add({ ...run, text: " " });
                }
            }
            if (word.length === 0) {
                continue;
            }
            if (col === 0 && word.length > w) {
                let rest = word;
                while (rest.length > w) {
                    add({ ...run, text: rest.slice(0, w) });
                    newline();
                    rest = rest.slice(w);
                }
                add({ ...run, text: rest });
                continue;
            }
            if (col > 0 && col + word.length > w) {
                newline();
            }
            add({ ...run, text: word });
        }
    }
    if (line.length > 0) {
        lines.push(line);
    }
    return lines.length > 0 ? lines : [[{ text: " " }]];
}
function inlineRuns(tokens) {
    if (!tokens || tokens.length === 0) {
        return [];
    }
    const runs = [];
    for (const t of tokens) {
        if (t.type === "text") {
            const tx = t;
            if (tx.tokens && tx.tokens.length > 0) {
                runs.push(...inlineRuns(tx.tokens));
            }
            else {
                runs.push({ text: tx.text.replace(/\s+/g, " ") });
            }
        }
        else if (t.type === "strong") {
            for (const r of inlineRuns(t.tokens)) {
                runs.push({ ...r, bold: true });
            }
        }
        else if (t.type === "em") {
            for (const r of inlineRuns(t.tokens)) {
                runs.push({ ...r, italic: true });
            }
        }
        else if (t.type === "codespan") {
            runs.push({ text: t.text, code: true });
        }
        else if (t.type === "br") {
            runs.push({ text: " " });
        }
        else if (t.type === "link") {
            const link = t;
            runs.push(...inlineRuns(link.tokens));
        }
    }
    return runs;
}
function firstParagraphRuns(tokens) {
    if (!tokens) {
        return [];
    }
    for (const t of tokens) {
        if (t.type === "paragraph" || t.type === "text") {
            const p = t;
            if (p.tokens) {
                return inlineRuns(p.tokens);
            }
            return [{ text: p.text.replace(/\s+/g, " ") }];
        }
    }
    return [];
}
function restBlocks(tokens) {
    if (!tokens) {
        return [];
    }
    let skipped = false;
    const rest = [];
    for (const t of tokens) {
        if (!skipped && (t.type === "paragraph" || t.type === "text")) {
            skipped = true;
            continue;
        }
        if (t.type === "space") {
            continue;
        }
        rest.push(t);
    }
    return rest;
}
function RunsView({ runs, width }) {
    const lines = wrapRuns(runs, width);
    return (_jsx(Box, { flexDirection: "column", width: width, children: lines.map((line, i) => (_jsx(Box, { width: width, flexShrink: 0, children: _jsx(Text, { wrap: "truncate", children: line.map((r, j) => (_jsx(Text, { bold: r.bold, italic: r.italic, color: r.code ? "cyan" : undefined, wrap: "truncate", children: r.text }, `${i}-${j}`))) }) }, i))) }));
}
function headingColor(depth) {
    if (depth <= 1) {
        return "white";
    }
    if (depth === 2) {
        return "yellow";
    }
    return "cyan";
}
function ListView({ list, width, grouped }) {
    const start = typeof list.start === "number" ? list.start : 1;
    const last = start + list.items.length - 1;
    const numW = list.ordered ? String(last).length + 2 : 2;
    return (_jsx(Box, { flexDirection: "column", width: width, marginTop: grouped ? 0 : 1, children: list.items.map((item, i) => {
            const n = list.ordered ? `${String(start + i).padStart(String(last).length, " ")}. ` : "• ";
            const runs = firstParagraphRuns(item.tokens);
            const nested = restBlocks(item.tokens);
            const textW = Math.max(8, width - numW);
            return (_jsxs(Box, { flexDirection: "column", width: width, marginTop: i === 0 ? 0 : 0, children: [_jsxs(Box, { flexDirection: "row", width: width, children: [_jsx(Box, { width: numW, flexShrink: 0, children: _jsx(Text, { color: "cyan", children: n }) }), _jsx(RunsView, { runs: runs.length > 0 ? runs : [{ text: item.text.replace(/\s+/g, " ") }], width: textW })] }), nested.length > 0 ? (_jsx(Box, { flexDirection: "column", marginLeft: numW, width: textW, children: nested.map((t, j) => (_jsx(Block, { token: t, width: textW, grouped: t.type === "list" }, j))) })) : null] }, i));
        }) }));
}
function Block({ token, width, grouped }) {
    if (token.type === "space") {
        return null;
    }
    if (token.type === "heading") {
        const h = token;
        const label = h.text.replace(/\s+/g, " ");
        return (_jsx(Box, { marginTop: grouped ? 0 : 1, width: width, children: _jsx(Text, { bold: true, color: headingColor(h.depth), wrap: "truncate", children: label }) }));
    }
    if (token.type === "paragraph" || token.type === "text") {
        const p = token;
        const runs = p.tokens ? inlineRuns(p.tokens) : [{ text: p.text.replace(/\s+/g, " ") }];
        return (_jsx(Box, { marginTop: grouped ? 0 : 1, width: width, children: _jsx(RunsView, { runs: runs, width: width }) }));
    }
    if (token.type === "list") {
        return _jsx(ListView, { list: token, width: width, grouped: grouped });
    }
    if (token.type === "code") {
        const c = token;
        const lang = c.lang?.trim() || "";
        const lines = c.text.replace(/\n$/, "").split("\n");
        const inner = Math.max(8, width - 2);
        return (_jsxs(Box, { flexDirection: "column", width: width, marginTop: 1, paddingX: 1, borderStyle: "single", borderColor: "gray", children: [lang ? _jsx(Text, { dimColor: true, children: lang }) : null, lines.map((line, i) => (_jsx(Text, { wrap: "truncate", children: line.length === 0 ? " " : line.length > inner ? `${line.slice(0, inner - 1)}…` : line }, i)))] }));
    }
    if (token.type === "blockquote") {
        const q = token;
        return (_jsx(Box, { flexDirection: "column", marginTop: grouped ? 0 : 1, paddingLeft: 2, width: width, children: q.tokens.filter((t) => t.type !== "space").map((t, i) => (_jsx(Block, { token: t, width: Math.max(8, width - 2), grouped: i > 0 }, i))) }));
    }
    if (token.type === "hr") {
        return (_jsx(Box, { marginTop: 1, width: width, children: _jsx(Text, { dimColor: true, children: "─".repeat(Math.max(3, Math.min(width, 40))) }) }));
    }
    return null;
}
function closeOpenFence(src) {
    const n = src.split("```").length - 1;
    if (n % 2 === 1) {
        return `${src}\n\`\`\``;
    }
    return src;
}
export function MarkdownView({ text }) {
    const { stdout } = useStdout();
    const width = Math.max(24, stdout.columns - 8);
    let tokens = [];
    try {
        tokens = marked.lexer(closeOpenFence(text), { gfm: true });
    }
    catch {
        tokens = [
            {
                type: "paragraph",
                raw: text,
                text,
                tokens: [{ type: "text", raw: text, text }],
            },
        ];
    }
    const visible = tokens.filter((t) => t.type !== "space");
    return (_jsx(Box, { flexDirection: "column", width: width, children: visible.map((token, i) => {
            const prev = visible[i - 1];
            const grouped = Boolean(prev?.type === "heading" && (token.type === "list" || token.type === "paragraph"));
            return _jsx(Block, { token: token, width: width, grouped: grouped || i === 0 }, i);
        }) }));
}
//# sourceMappingURL=markdown.js.map