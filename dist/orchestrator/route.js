import { getGpuLease } from "../gpu/lease.js";
import { getClient } from "../llm/client.js";
const CODER_RE = /\b(implement|fix|refactor|write tests?|add tests?|create|patch|debug|build|compile|migrate|edit|change the code|update the code)\b/i;
const BRAIN_RE = /\b(explain|why\b|what is|what's|how does|how do|review|summarize|compare|difference|meaning|overview)\b/i;
const FILE_ASK_RE = /\b(read|look at|open|inspect|show me|check)\b|\b[\w.-]+\.[A-Za-z][\w.-]*\b|\b(?:[\w.-]+\/)+[\w.-]+\b/i;
/** Prefer chat/plan model (brain / main). */
export function preferChatModel(config) {
    if (config.models.brain) {
        return "brain";
    }
    if (config.models.main) {
        return "main";
    }
    for (const [key, m] of Object.entries(config.models)) {
        if (m.roles?.includes("chat") || m.roles?.includes("plan")) {
            return key;
        }
    }
    if (config.auto?.fallback && config.models[config.auto.fallback]) {
        return config.auto.fallback;
    }
    return Object.keys(config.models)[0];
}
/** Prefer code/agent model (coder). */
export function preferCoderModel(config) {
    if (config.models.coder) {
        return "coder";
    }
    for (const [key, m] of Object.entries(config.models)) {
        if (m.roles?.includes("code")) {
            return key;
        }
    }
    for (const [key, m] of Object.entries(config.models)) {
        if (m.roles?.includes("agent") && !m.roles.includes("chat")) {
            return key;
        }
    }
    for (const [key, m] of Object.entries(config.models)) {
        if (m.roles?.includes("agent")) {
            return key;
        }
    }
    return preferChatModel(config);
}
function fallbackKey(config) {
    if (config.auto?.fallback && config.models[config.auto.fallback]) {
        return config.auto.fallback;
    }
    return preferChatModel(config) ?? Object.keys(config.models)[0] ?? "auto";
}
function isSummarizerKey(config, key) {
    const m = config.models[key];
    return key === "summarizer" || Boolean(m?.roles?.includes("summarize"));
}
function parseOrchestratorLabel(text, config) {
    const raw = text.trim().toLowerCase();
    const token = raw.split(/[\s,.:;!?]+/)[0]?.replace(/[^a-z0-9_-]/g, "") ?? "";
    if (!token || token === "summarizer") {
        return undefined;
    }
    if (config.models[token] && !isSummarizerKey(config, token)) {
        return token;
    }
    if (token === "brain" || token === "chat" || token === "main" || token === "plan") {
        return preferChatModel(config);
    }
    if (token === "coder" || token === "code" || token === "agent") {
        return preferCoderModel(config);
    }
    return undefined;
}
async function askOrchestrator(config, userText, mode, signal) {
    const orchKey = config.auto?.orchestrator;
    if (!orchKey || !config.models[orchKey]) {
        return undefined;
    }
    const entry = config.models[orchKey];
    const lease = getGpuLease(config);
    const handle = await lease.acquire(orchKey, signal);
    try {
        const client = getClient(entry.baseURL, entry.apiKey);
        const completion = await client.chat.completions.create({
            model: entry.model,
            temperature: 0,
            max_tokens: 8,
            messages: [
                {
                    role: "system",
                    content: 'Classify the user turn. Reply with exactly one label: brain, coder. Never reply summarizer. Mode hint: ' +
                        mode,
                },
                { role: "user", content: userText.slice(0, 2000) },
            ],
        }, { signal });
        const text = completion.choices[0]?.message?.content ?? "";
        return parseOrchestratorLabel(text, config);
    }
    catch {
        return undefined;
    }
    finally {
        await handle.release();
    }
}
/**
 * Resolve Auto → concrete model key.
 * Priority: mode hint → text heuristics → optional orchestrator → fallback.
 * Summarizer is never chosen for ordinary turns.
 */
export async function routeTurn(args) {
    const { config, mode, userText, signal } = args;
    const fb = fallbackKey(config);
    if (mode === "Ask" || mode === "Plan") {
        const key = preferChatModel(config) ?? fb;
        return { modelKey: key, reason: `mode ${mode}` };
    }
    // Agent + clear implementation intent
    if (mode === "Agent" && CODER_RE.test(userText)) {
        const key = preferCoderModel(config) ?? fb;
        return { modelKey: key, reason: "agent + implement intent" };
    }
    // Heuristics
    if (CODER_RE.test(userText)) {
        const key = preferCoderModel(config) ?? fb;
        return { modelKey: key, reason: "heuristic coder" };
    }
    if (BRAIN_RE.test(userText) || (FILE_ASK_RE.test(userText) && !CODER_RE.test(userText))) {
        const key = preferChatModel(config) ?? fb;
        return { modelKey: key, reason: BRAIN_RE.test(userText) ? "heuristic brain" : "heuristic read/ask" };
    }
    // Optional orchestrator model
    const fromOrch = await askOrchestrator(config, userText, mode, signal);
    if (fromOrch && config.models[fromOrch] && !isSummarizerKey(config, fromOrch)) {
        return { modelKey: fromOrch, reason: "orchestrator" };
    }
    return { modelKey: fb, reason: "fallback" };
}
//# sourceMappingURL=route.js.map