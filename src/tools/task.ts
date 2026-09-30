import type { LoadedConfig } from "../config/load.js";
import type { AgentMode } from "../state/session.js";
import { streamChat, type ChatMessage } from "../llm/stream.js";
import { openaiTools } from "../llm/tools-openai.js";

export type TaskResult = {
  text: string;
  agentId: string;
};

const agents = new Map<string, { messages: ChatMessage[]; mode: AgentMode }>();
let taskSeq = 0;

function nextAgentId(): string {
  taskSeq += 1;
  return `task-${Date.now().toString(16)}-${taskSeq}`;
}

export async function taskTool(opts: {
  config: LoadedConfig;
  modelKey: string;
  description: string;
  prompt: string;
  subagentType?: string;
  resume?: string;
  signal?: AbortSignal;
}): Promise<TaskResult> {
  const { executeTool } = await import("./run.js");
  const entry = opts.config.models[opts.modelKey];
  if (!entry) {
    throw new Error(`no model ${opts.modelKey}`);
  }

  const type = (opts.subagentType ?? "general").toLowerCase();
  const mode: AgentMode = type === "explore" || type === "ask" ? "Ask" : "Agent";

  let agentId = opts.resume?.trim() || "";
  let messages: ChatMessage[];
  if (agentId && agents.has(agentId)) {
    messages = agents.get(agentId)!.messages;
    messages.push({ role: "user", content: opts.prompt });
  } else {
    agentId = nextAgentId();
    messages = [
      {
        role: "system",
        content: [
          `You are a ${type} subagent (${opts.description}). Mode: ${mode}.`,
          "Use tools to complete the task. Return a concise final answer with findings.",
          "Do not ask the user questions — decide and act.",
        ].join(" "),
      },
      { role: "user", content: opts.prompt },
    ];
  }

  let lastText = "";
  for (let i = 0; i < 12; i++) {
    if (opts.signal?.aborted) {
      break;
    }
    const result = await streamChat({
      baseURL: entry.baseURL,
      apiKey: entry.apiKey,
      model: entry.model,
      messages,
      tools: openaiTools(mode),
      signal: opts.signal,
      onDelta: () => {},
    });
    lastText = result.text;
    if (result.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: result.text });
      break;
    }
    messages.push({
      role: "assistant",
      content: result.text,
      tool_calls: result.toolCalls,
    });
    for (const call of result.toolCalls) {
      const exec = await executeTool(call.name, call.arguments, mode, {
        config: opts.config,
        modelKey: opts.modelKey,
        signal: opts.signal,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: exec.text.slice(0, 24_000),
      });
    }
  }

  agents.set(agentId, { messages, mode });
  return { text: lastText || "(subagent finished with no text)", agentId };
}
