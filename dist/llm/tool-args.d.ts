import type { ToolCall } from "./stream.js";
/** Clear error returned to the model when tool arguments are not valid JSON. */
export declare const INVALID_TOOL_ARGS_MSG = "invalid tool arguments: JSON was truncated or malformed. Retry with complete valid JSON. For large files prefer edit_file, or write smaller chunks via write_file.";
export declare function parseToolArguments(raw: string | undefined): {
    ok: true;
    args: Record<string, unknown>;
} | {
    ok: false;
    error: string;
};
/** Best-effort path from args, including truncated JSON like `{"path": "foo.py"`. */
export declare function peekToolPath(raw: string | undefined): string | undefined;
/**
 * Replace malformed function.arguments with "{}" so the next chat request
 * does not 400 on the server's JSON parse of tool_calls.
 */
export declare function apiSafeToolCall(call: ToolCall): ToolCall;
