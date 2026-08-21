import { getGpuLease } from "../gpu/lease.js";
import { compactSession, isContextOomError, memoryInjectBlock, shouldCompact, } from "../memory/compact.js";
import { buildSkillsInject } from "../skills/load.js";
import { executeTool } from "../tools/run.js";
import { openaiTools } from "./tools-openai.js";
import { parseXmlToolCalls, stripXmlToolCalls, xmlToolSystem, } from "./tools-xml.js";
import { estimateTokens, streamChat, ToolsUnsupportedError, } from "./stream.js";
const MAX_ITERS = 20;
const xmlByServer = new Map();
function nextId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
const FILE_PACK_EACH = 20_000;
const FILE_PACK_TOTAL = 60_000;
const SOURCE_FILES_LEAD = "SOURCE FILES (verbatim from disk — this is the only code that exists):";
const ANSWER_FROM_FILES = [
    "When file contents are attached or in tool results, answer FROM that text.",
    "If the user asks to show, see, paste, or quote a method: copy the real function into a markdown fenced code block. Do not paraphrase it away.",
    "Use the real names that appear in the file. Never invent methods, line numbers, or example classes.",
    "If a name is not in the attached files, say it is not in the file. Do not write placeholder code.",
    "Never reply with only 'file read' / 'X read.' That is not an answer.",
].join(" ");
function withLineNumbers(text) {
    const lines = text.split("\n");
    const pad = String(Math.max(1, lines.length)).length;
    return lines.map((line, i) => `${String(i + 1).padStart(pad, " ")}|${line}`).join("\n");
}
function filePackFromRows(rows) {
    const byPath = new Map();
    for (const row of rows) {
        if (row.kind !== "tool" || row.name !== "read_file" || row.status !== "done" || !row.output) {
            continue;
        }
        const path = (row.path && row.path.length > 0 ? row.path : row.args.replace(/^path=/, "")).trim();
        if (path.length === 0) {
            continue;
        }
        byPath.set(path, row.output);
    }
    if (byPath.size === 0) {
        return "";
    }
    let budget = FILE_PACK_TOTAL;
    const parts = [];
    for (const [path, raw] of byPath) {
        let body = withLineNumbers(raw);
        if (body.length > FILE_PACK_EACH) {
            body = `${body.slice(0, FILE_PACK_EACH)}\n…[truncated]`;
        }
        if (body.length > budget) {
            body = `${body.slice(0, Math.max(0, budget))}\n…[truncated]`;
        }
        parts.push(`### ${path}\n\`\`\`\n${body}\n\`\`\``);
        budget -= body.length;
        if (budget < 1500) {
            break;
        }
    }
    return parts.join("\n\n");
}
function packHasPath(pack, path) {
    const base = path.split("/").pop() ?? path;
    return pack.includes(`### ${path}`) || pack.includes(`### ${base}`);
}
function groundedAsk(question, pack) {
    return [
        SOURCE_FILES_LEAD,
        pack,
        `Question: ${question}`,
        [
            "Rules:",
            "- Quote only identifiers that appear in SOURCE FILES.",
            "- Copy exact lines and include the line numbers shown (N|...).",
            "- If a name is not in SOURCE FILES, say it is not in the file. Do not invent example code.",
            "- Ignore earlier assistant messages if they conflict with SOURCE FILES.",
        ].join("\n"),
    ].join("\n\n");
}
function isGroundedAsk(msg) {
    return msg?.role === "user" && typeof msg.content === "string" && msg.content.startsWith(SOURCE_FILES_LEAD);
}
function ensureGroundedAsk(messages, question, pack) {
    if (pack.length === 0) {
        return;
    }
    const content = groundedAsk(question, pack);
    const last = messages[messages.length - 1];
    if (isGroundedAsk(last)) {
        messages[messages.length - 1] = { role: "user", content };
        return;
    }
    messages.push({ role: "user", content });
}
function inventedDefs(answer, pack) {
    if (pack.length === 0 || answer.trim().length === 0) {
        return [];
    }
    const names = [...answer.matchAll(/\b(?:def|class)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
    return [...new Set(names)].filter((name) => name.length > 2 && !pack.includes(name));
}
function toolGuidance(mode, xml, userText, filePack) {
    const named = mentionedPaths(userText);
    const missing = named.filter((p) => !packHasPath(filePack, p));
    const core = xml
        ? xmlToolSystem(mode)
        : "You have workspace tools. Call them yourself — never tell the user to type a tool name.";
    if (missing.length > 0) {
        return `${core}\nCall read_file once each for: ${missing.join(", ")}. Then answer from the contents. ${ANSWER_FROM_FILES}`;
    }
    if (filePack.length > 0) {
        return `${core}\nThe files are already attached. Do not call read_file again unless a newly named path is missing. ${ANSWER_FROM_FILES}`;
    }
    const namedBit = named.length > 0
        ? `The user named: ${named.join(", ")}. Call read_file once per path, then answer.`
        : "If the question is about workspace code, call read_file (or glob/grep if the path is unknown), then answer.";
    return `${core}\n${namedBit} Do not call list_dir first. After tool results, stop calling tools. ${ANSWER_FROM_FILES}`;
}
function mentionedPaths(text) {
    const found = [];
    const re = /(?:^|[\s`'"(])((?:\.\.?\/)?(?:[\w.-]+\/)+[\w.-]+|(?:\.\.?\/)?[\w.-]+\.[A-Za-z][\w.-]*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const p = m[1];
        if (!found.includes(p)) {
            found.push(p);
        }
    }
    return found.slice(0, 8);
}
function systemPrompt(mode, xml, memoryDigest, skillsDigest, userText = "", filePack = "") {
    const lines = [
        `You are a coding assistant. Working directory: ${process.cwd()}. Mode: ${mode}.`,
        "Use Markdown: headings, lists, fenced code.",
    ];
    if (mode !== "Agent") {
        lines.push("You may read files. Do not write files or run shell commands.");
    }
    lines.push(toolGuidance(mode, xml, userText, filePack));
    if (skillsDigest.trim().length > 0) {
        lines.push(skillsDigest);
    }
    if (memoryDigest.trim().length > 0) {
        lines.push(`Persistent memory from prior sessions:\n${memoryDigest}`);
    }
    lines.push(ANSWER_FROM_FILES);
    if (filePack.trim().length > 0) {
        lines.push("File contents are in the latest user message labeled SOURCE FILES. Quote only that text. Do not invent methods, line numbers, or example classes.");
    }
    return lines.join("\n\n");
}
function lastUserText(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row.kind === "user") {
            return row.text;
        }
    }
    return "";
}
function historyMessages(rows, mode, xml, memoryDigest, skillsDigest) {
    const pack = filePackFromRows(rows);
    const out = [
        { role: "system", content: systemPrompt(mode, xml, memoryDigest, skillsDigest, lastUserText(rows), pack) },
    ];
    for (const row of rows) {
        if (row.kind === "user") {
            out.push({ role: "user", content: row.text });
        }
        else if (row.kind === "assistant" && row.text.length > 0) {
            out.push({ role: "assistant", content: row.text });
        }
    }
    if (pack.length > 0) {
        out.push({ role: "user", content: groundedAsk(lastUserText(rows), pack) });
    }
    return out;
}
function toolKey(call) {
    try {
        const o = JSON.parse(call.arguments || "{}");
        if (call.name === "read_file" || call.name === "list_dir") {
            const path = String(o.path ?? "")
                .replace(/\\/g, "/")
                .replace(/^\.\//, "")
                .trim();
            return `${call.name}:${path}`;
        }
        return `${call.name}:${JSON.stringify(o)}`;
    }
    catch {
        return `${call.name}:${call.arguments}`;
    }
}
function isPlaceholderCall(call) {
    try {
        const o = JSON.parse(call.arguments || "{}");
        const path = String(o.path ?? "").trim();
        return path.length === 0 || path === "PATH" || path === "src/example.ts" || path === "__PATH__";
    }
    catch {
        return false;
    }
}
function shortArgs(raw) {
    try {
        const o = JSON.parse(raw);
        const bits = Object.entries(o)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`);
        return bits.join(" ");
    }
    catch {
        return raw.slice(0, 60);
    }
}
export async function runAgentTurn(args) {
    const entry = args.config.models[args.modelKey];
    if (!entry) {
        return;
    }
    const lease = getGpuLease(args.config);
    let handle = await lease.acquire(args.modelKey, args.signal);
    try {
        await runAgentTurnLocked(args, entry, {
            release: async () => {
                await handle.release();
            },
            reacquire: async () => {
                handle = await lease.acquire(args.modelKey, args.signal);
            },
        });
    }
    finally {
        await handle.release();
    }
}
async function runAgentTurnLocked(args, entry, leaseCtl) {
    let memoryDigest = memoryInjectBlock(args.config);
    let skillsDigest = buildSkillsInject();
    let compactedThisTurn = false;
    const rebuildMessages = (xml) => historyMessages(args.hooks.getRows(), args.mode, xml, memoryDigest, skillsDigest);
    const estimatePrompt = (messages) => messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    const maybeCompact = async (force) => {
        if (args.signal.aborted) {
            return false;
        }
        if (!args.config.memory.enabled && !force) {
            return false;
        }
        await leaseCtl.release();
        try {
            const result = await compactSession({
                config: args.config,
                sessionId: args.sessionId,
                rows: args.hooks.getRows(),
                asstId: args.asstId,
                signal: args.signal,
                force,
            });
            if (!result) {
                return false;
            }
            compactedThisTurn = true;
            memoryDigest = memoryInjectBlock(args.config);
            skillsDigest = buildSkillsInject();
            args.hooks.patchRows(() => [
                ...result.trimmedRows.filter((r) => r.id !== args.asstId),
                {
                    id: nextId(),
                    kind: "notice",
                    text: `Compacted session → ${result.memoryPath}`,
                },
                ...result.trimmedRows.filter((r) => r.id === args.asstId),
            ]);
            return true;
        }
        finally {
            await leaseCtl.reacquire();
        }
    };
    let xml = xmlByServer.get(entry.baseURL) === true;
    let messages = rebuildMessages(xml);
    let promptEst = estimatePrompt(messages);
    args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);
    if (shouldCompact({
        promptTokens: promptEst,
        contextLength: entry.contextLength,
        threshold: args.config.memory.threshold,
    })) {
        const did = await maybeCompact(false);
        if (did) {
            xml = xmlByServer.get(entry.baseURL) === true;
            messages = rebuildMessages(xml);
            promptEst = estimatePrompt(messages);
            args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);
        }
    }
    let outText = "";
    const onDelta = (chunk) => {
        outText += chunk;
        const completion = estimateTokens(outText);
        args.hooks.patchRows((rows) => rows.map((row) => row.id === args.asstId && row.kind === "assistant"
            ? { ...row, text: row.text + chunk }
            : row));
        args.hooks.setUsage({ prompt: promptEst, completion, total: promptEst + completion }, true);
    };
    const seenTools = new Set();
    let filesLoaded = false;
    let nudgedToAnswer = false;
    let groundingRetry = false;
    for (let iter = 0; iter < MAX_ITERS; iter++) {
        if (args.signal.aborted) {
            return;
        }
        const useXml = xmlByServer.get(entry.baseURL) === true;
        const liveRows = args.hooks.getRows();
        const filePack = filePackFromRows(liveRows);
        const userText = lastUserText(liveRows);
        const missing = mentionedPaths(userText).filter((p) => !packHasPath(filePack, p));
        if (messages[0]) {
            messages[0] = {
                role: "system",
                content: systemPrompt(args.mode, useXml, memoryDigest, skillsDigest, userText, filePack),
            };
        }
        if (filePack.length > 0) {
            ensureGroundedAsk(messages, userText, filePack);
        }
        promptEst = estimatePrompt(messages);
        if (shouldCompact({
            promptTokens: promptEst,
            contextLength: entry.contextLength,
            threshold: args.config.memory.threshold,
        })) {
            const did = await maybeCompact(false);
            if (did) {
                messages = rebuildMessages(useXml);
                promptEst = estimatePrompt(messages);
                args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);
                outText = "";
            }
        }
        const toolsOff = nudgedToAnswer ||
            groundingRetry ||
            (missing.length === 0 && (filesLoaded || filePack.length > 0));
        let result;
        try {
            result = await streamChat({
                baseURL: entry.baseURL,
                apiKey: entry.apiKey,
                model: entry.model,
                messages,
                tools: useXml || toolsOff ? undefined : openaiTools(args.mode),
                toolChoice: !useXml && toolsOff ? "none" : undefined,
                signal: args.signal,
                onDelta,
                onUsage: (usage) => {
                    args.hooks.setUsage(usage, false);
                },
            });
        }
        catch (err) {
            if (err instanceof ToolsUnsupportedError) {
                xmlByServer.set(entry.baseURL, true);
                continue;
            }
            if (isContextOomError(err) && !compactedThisTurn) {
                const did = await maybeCompact(true);
                if (did) {
                    messages = rebuildMessages(xmlByServer.get(entry.baseURL) === true);
                    promptEst = estimatePrompt(messages);
                    outText = "";
                    args.hooks.patchRows((rows) => rows.map((row) => row.id === args.asstId && row.kind === "assistant" ? { ...row, text: "" } : row));
                    continue;
                }
            }
            throw err;
        }
        const nativeCalls = result.toolCalls;
        let calls = nativeCalls;
        if (calls.length === 0) {
            calls = parseXmlToolCalls(result.text).filter((c) => !isPlaceholderCall(c));
            if (calls.length > 0) {
                const cleaned = stripXmlToolCalls(result.text);
                args.hooks.patchRows((rows) => rows.map((row) => row.id === args.asstId && row.kind === "assistant" ? { ...row, text: cleaned } : row));
                outText = cleaned;
            }
        }
        const fresh = calls.filter((c) => !isPlaceholderCall(c) && !seenTools.has(toolKey(c)));
        if (fresh.length === 0) {
            if (calls.length > 0 && !nudgedToAnswer) {
                nudgedToAnswer = true;
                filesLoaded = true;
                const pack = filePackFromRows(args.hooks.getRows());
                if (pack.length > 0) {
                    ensureGroundedAsk(messages, userText, pack);
                }
                else {
                    messages.push({
                        role: "user",
                        content: "Those files are already in the tool results above. Answer from that source. If asked to show a method, paste it in a markdown code fence. Do not say only that a file was read.",
                    });
                }
                continue;
            }
            const pack = filePackFromRows(args.hooks.getRows());
            const invented = inventedDefs(result.text, pack);
            if (pack.length > 0 && invented.length > 0 && !groundingRetry) {
                groundingRetry = true;
                messages.push({ role: "assistant", content: result.text });
                messages.push({
                    role: "user",
                    content: [
                        `Stop. These names do not appear in SOURCE FILES: ${invented.join(", ")}.`,
                        "Quote only functions/classes that appear in the attached files, with their line numbers.",
                        "If the user asked for something that is not there, say it does not exist.",
                        "Do not invent example or placeholder code.",
                    ].join(" "),
                });
                outText = "";
                args.hooks.patchRows((rows) => rows.map((row) => row.id === args.asstId && row.kind === "assistant" ? { ...row, text: "" } : row));
                continue;
            }
            return;
        }
        const xmlResults = nativeCalls.length === 0;
        messages.push({
            role: "assistant",
            content: xmlResults ? stripXmlToolCalls(result.text) : result.text,
            tool_calls: xmlResults ? undefined : fresh,
        });
        const resultChunks = [];
        for (const call of fresh) {
            if (args.signal.aborted) {
                return;
            }
            seenTools.add(toolKey(call));
            let parsed = {};
            try {
                parsed = JSON.parse(call.arguments || "{}");
            }
            catch {
                parsed = {};
            }
            if (call.name === "run_shell" && !args.hooks.yolo()) {
                const cmd = String(parsed.command ?? "");
                const decision = await args.hooks.waitShell(cmd);
                if (args.signal.aborted) {
                    return;
                }
                if (decision === "yolo") {
                    args.hooks.setYolo();
                }
                if (decision === "deny") {
                    const toolId = nextId();
                    args.hooks.patchRows((rows) => [
                        ...rows.filter((r) => r.id !== args.asstId),
                        {
                            id: toolId,
                            kind: "tool",
                            name: call.name,
                            args: shortArgs(call.arguments),
                            status: "error",
                            detail: "denied",
                        },
                        ...rows.filter((r) => r.id === args.asstId),
                    ]);
                    const denied = "User denied this shell command.";
                    resultChunks.push(denied);
                    if (!xmlResults) {
                        messages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: denied,
                        });
                    }
                    continue;
                }
            }
            const toolId = nextId();
            args.hooks.patchRows((rows) => {
                const asst = rows.filter((r) => r.id === args.asstId);
                const rest = rows.filter((r) => r.id !== args.asstId);
                return [
                    ...rest,
                    {
                        id: toolId,
                        kind: "tool",
                        name: call.name,
                        args: shortArgs(call.arguments),
                        status: "running",
                    },
                    ...asst,
                ];
            });
            let toolPath;
            try {
                const o = JSON.parse(call.arguments || "{}");
                if (typeof o.path === "string" && o.path.length > 0) {
                    toolPath = o.path;
                }
            }
            catch {
                toolPath = undefined;
            }
            const exec = await executeTool(call.name, call.arguments, args.mode);
            args.hooks.patchRows((rows) => rows.map((row) => row.id === toolId && row.kind === "tool"
                ? {
                    ...row,
                    status: exec.ok ? "done" : "error",
                    detail: exec.detail ?? exec.text.slice(0, 80),
                    path: toolPath,
                    output: call.name === "read_file" && exec.ok ? exec.text.slice(0, FILE_PACK_EACH) : row.output,
                }
                : row));
            const body = exec.text.slice(0, 24_000);
            resultChunks.push(body);
            if (!xmlResults) {
                messages.push({ role: "tool", tool_call_id: call.id, content: body });
            }
        }
        const packAfterTools = filePackFromRows(args.hooks.getRows());
        if (xmlResults) {
            if (packAfterTools.length > 0) {
                ensureGroundedAsk(messages, userText, packAfterTools);
            }
            else {
                messages.push({
                    role: "user",
                    content: `Tool results:\n${resultChunks.join("\n---\n")}\n\n${ANSWER_FROM_FILES}`,
                });
            }
        }
        else {
            ensureGroundedAsk(messages, userText, packAfterTools);
        }
        filesLoaded = filesLoaded || fresh.some((c) => c.name === "read_file");
        outText = "";
        args.hooks.patchRows((rows) => rows.map((row) => row.id === args.asstId && row.kind === "assistant" ? { ...row, text: "" } : row));
    }
    args.hooks.patchRows((rows) => [
        ...rows,
        { id: nextId(), kind: "notice", text: `Stopped after ${MAX_ITERS} tool iterations` },
    ]);
}
//# sourceMappingURL=turn.js.map