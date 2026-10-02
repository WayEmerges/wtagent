import type { ChatCompletionTool } from "openai/resources/chat/completions";
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
export declare class ToolsUnsupportedError extends Error {
    constructor();
}
export declare function friendlyLlmError(err: unknown, baseURL: string): string;
export type TokenUsage = {
    prompt: number;
    completion: number;
    total: number;
};
export declare function estimateTokens(text: string): number;
/** vLLM / Qwen3 chat-template switch for reasoning models. */
export declare function thinkingTemplateKwargs(enableThinking: boolean): Record<string, unknown>;
export declare function streamChat(args: {
    baseURL: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    tools?: ChatCompletionTool[];
    toolChoice?: "auto" | "none";
    /** When set, passed as chat_template_kwargs.enable_thinking (Qwen3/vLLM). */
    enableThinking?: boolean;
    onDelta: (text: string) => void;
    onUsage?: (usage: TokenUsage) => void;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    toolCalls: ToolCall[];
}>;
