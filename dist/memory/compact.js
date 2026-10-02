import { getGpuLease } from "../gpu/lease.js";
import { getClient } from "../llm/client.js";
import { thinkingTemplateKwargs } from "../llm/stream.js";
import { preferChatModel } from "../orchestrator/route.js";
import { appendMemorySection, readMemoryInject } from "./store.js";
export function summarizerModelKey(config) {
    const key = config.memory.summarizer;
    if (key && config.models[key]) {
        return key;
    }
    if (config.auto?.fallback && config.models[config.auto.fallback]) {
        return config.auto.fallback;
    }
    return preferChatModel(config);
}
export function shouldCompact(args) {
    const absolute = args.compactAtTokens;
    if (absolute !== undefined && absolute > 0) {
        return args.promptTokens >= absolute;
    }
    const ctx = args.contextLength;
    if (!ctx || ctx <= 0) {
        return false;
    }
    return args.promptTokens >= ctx * args.threshold;
}
export function isContextOomError(err) {
    const raw = err instanceof Error ? err.message : String(err);
    return /context length|context window|too many tokens|maximum context|max_tokens|out of memory|oom\b|prompt is too long|token limit/i.test(raw);
}
/** After summary: clear live history. keepRecentMessages<=0 clears all (keeps in-flight turn only). */
export function trimRowsForCompaction(rows, keepRecentMessages, asstId) {
    const keep = Math.max(0, Math.floor(keepRecentMessages));
    // Default / preferred: wipe transcript; only keep the active user+assistant if mid-turn.
    if (keep === 0) {
        if (!asstId) {
            return [];
        }
        const asst = rows.find((r) => r.id === asstId);
        let user;
        for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            if (r.id === asstId) {
                continue;
            }
            if (r.kind === "user") {
                user = r;
                break;
            }
        }
        return [...(user ? [user] : []), ...(asst ? [asst] : [])];
    }
    const contentIdxs = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.kind === "user") {
            contentIdxs.push(i);
        }
        else if (r.kind === "assistant" && (r.text.length > 0 || r.id === asstId)) {
            contentIdxs.push(i);
        }
    }
    if (contentIdxs.length <= keep) {
        return rows;
    }
    const start = contentIdxs[contentIdxs.length - keep];
    return rows.slice(start);
}
function rowsToDigestSource(rows) {
    const parts = [];
    for (const row of rows) {
        if (row.kind === "user") {
            parts.push(`User: ${row.text}`);
        }
        else if (row.kind === "assistant" && row.text.length > 0) {
            parts.push(`Assistant: ${row.text}`);
        }
        else if (row.kind === "tool") {
            parts.push(`Tool ${row.name} (${row.status}): ${row.detail ?? row.args}`);
        }
    }
    return parts.join("\n\n").slice(0, 100_000);
}
async function runSummarizer(args) {
    const client = getClient(args.entry.baseURL, args.entry.apiKey);
    const completion = await client.chat.completions.create({
        model: args.entry.model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
            {
                role: "system",
                content: "Compress this coding-agent session into a concise markdown bullet list. Include: goals, decisions, files touched, commands run, open TODOs, and useful facts. No preamble.",
            },
            { role: "user", content: args.transcript },
        ],
        // Summaries need content, not hidden reasoning.
        ...thinkingTemplateKwargs(false),
    }, { signal: args.signal });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    return text.length > 0 ? text : "- (empty summary)";
}
/**
 * Summarize session under GPU lease, append MEMORY.md, return trimmed rows.
 * Caller must not hold a conflicting lease (release first if role differs).
 */
export async function compactSession(args) {
    const { config } = args;
    if (!config.memory.enabled && !args.force) {
        return null;
    }
    const sumKey = summarizerModelKey(config);
    if (!sumKey || !config.models[sumKey]) {
        return null;
    }
    const entry = config.models[sumKey];
    const source = rowsToDigestSource(args.rows);
    if (source.trim().length === 0) {
        return null;
    }
    const lease = getGpuLease(config);
    const handle = await lease.acquire(sumKey, args.signal);
    let summary;
    try {
        summary = await runSummarizer({ entry, transcript: source, signal: args.signal });
    }
    finally {
        await handle.release();
    }
    const { memoryPath } = appendMemorySection({
        memoryRoot: config.memory.dir,
        sessionId: args.sessionId,
        body: summary,
    });
    const trimmed = trimRowsForCompaction(args.rows, config.memory.keepRecentMessages, args.asstId);
    return { memoryPath, summary, trimmedRows: trimmed };
}
export function memoryInjectBlock(config) {
    if (!config.memory.enabled) {
        return "";
    }
    return readMemoryInject(config.memory.dir, config.memory.injectChars);
}
//# sourceMappingURL=compact.js.map