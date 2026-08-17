import { APIError } from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getClient } from "./client.js";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export class ToolsUnsupportedError extends Error {
  constructor() {
    super("tools unsupported");
    this.name = "ToolsUnsupportedError";
  }
}

export function friendlyLlmError(err: unknown, baseURL: string): string {
  const hint = `is the server up?`;
  if (err instanceof APIError) {
    if (err.status === 401) {
      return `401 from ${baseURL} — check apiKey`;
    }
    if (err.status === 404) {
      return `404 from ${baseURL} — check baseURL and model id`;
    }
    const one = (err.message || String(err.status)).split("\n")[0];
    return `${err.status ?? "error"} from ${baseURL}: ${one}`;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const blob = `${raw} ${cause}`;
  if (
    blob.includes("ECONNREFUSED") ||
    blob.includes("ENOTFOUND") ||
    blob.includes("EHOSTUNREACH") ||
    blob.includes("fetch failed") ||
    blob.includes("other side closed")
  ) {
    return `Could not reach ${baseURL} — ${hint}`;
  }
  if (blob.includes("Timeout") || blob.includes("timed out") || blob.includes("aborted")) {
    return `No response from ${baseURL} within 30s — ${hint}`;
  }
  return `Request failed (${baseURL}): ${raw.split("\n")[0]}`;
}

export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

type AccumTool = { id: string; name: string; arguments: string };

export async function streamChat(args: {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "none";
  onDelta: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const client = getClient(args.baseURL, args.apiKey);
  const ac = new AbortController();
  const connectTimer = setTimeout(() => {
    ac.abort();
  }, 30_000);

  const onUserAbort = () => {
    ac.abort();
  };
  args.signal?.addEventListener("abort", onUserAbort);

  const apiMessages = args.messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool" as const, tool_call_id: m.tool_call_id ?? "", content: m.content };
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages: apiMessages,
      stream: true,
    };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      if (args.toolChoice) {
        body.tool_choice = args.toolChoice;
      }
    }

    type ChunkStream = AsyncIterable<{
      choices: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      } | null;
    }>;

    let stream: ChunkStream;
    try {
      stream = (await client.chat.completions.create(
        { ...body, stream_options: { include_usage: true } } as never,
        { signal: ac.signal },
      )) as unknown as ChunkStream;
    } catch (err) {
      if (err instanceof APIError && err.status === 400) {
        try {
          stream = (await client.chat.completions.create(body as never, {
            signal: ac.signal,
          })) as unknown as ChunkStream;
        } catch (err2) {
          if (args.tools && err2 instanceof APIError && err2.status === 400) {
            throw new ToolsUnsupportedError();
          }
          throw err2;
        }
      } else {
        throw err;
      }
    }
    clearTimeout(connectTimer);

    let text = "";
    const acc = new Map<number, AccumTool>();
    const IDLE_MS = 90_000;
    const bumpIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        ac.abort();
      }, IDLE_MS);
    };
    bumpIdle();

    for await (const chunk of stream) {
      bumpIdle();
      if (args.signal?.aborted) {
        break;
      }
      const delta = chunk.choices[0]?.delta;
      const piece = delta?.content;
      if (typeof piece === "string" && piece.length > 0) {
        text += piece;
        args.onDelta(piece);
      }
      const tcs = delta?.tool_calls;
      if (tcs) {
        for (const tc of tcs) {
          const idx = tc.index ?? 0;
          const cur = acc.get(idx) ?? { id: "", name: "", arguments: "" };
          if (tc.id) {
            cur.id = tc.id;
          }
          if (tc.function?.name) {
            cur.name += tc.function.name;
          }
          if (tc.function?.arguments) {
            cur.arguments += tc.function.arguments;
          }
          acc.set(idx, cur);
        }
      }
      const usage = chunk.usage;
      if (usage && args.onUsage) {
        args.onUsage({
          prompt: usage.prompt_tokens ?? 0,
          completion: usage.completion_tokens ?? 0,
          total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        });
      }
    }

    const toolCalls: ToolCall[] = [...acc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, t], i) => ({
        id: t.id || `call-${i}`,
        name: t.name,
        arguments: t.arguments,
      }))
      .filter((t) => t.name.length > 0);

    return { text, toolCalls };
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    clearTimeout(connectTimer);
    args.signal?.removeEventListener("abort", onUserAbort);
  }
}
