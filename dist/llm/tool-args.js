/** Clear error returned to the model when tool arguments are not valid JSON. */
export const INVALID_TOOL_ARGS_MSG = "invalid tool arguments: JSON was truncated or malformed. Retry with complete valid JSON. For large files prefer edit_file, or write smaller chunks via write_file.";
export function parseToolArguments(raw) {
    try {
        return { ok: true, args: JSON.parse(raw || "{}") };
    }
    catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { ok: false, error: detail };
    }
}
/** Best-effort path from args, including truncated JSON like `{"path": "foo.py"`. */
export function peekToolPath(raw) {
    const parsed = parseToolArguments(raw);
    if (parsed.ok) {
        const path = parsed.args.path;
        if (typeof path === "string" && path.trim().length > 0) {
            return path;
        }
        const notebook = parsed.args.target_notebook;
        if (typeof notebook === "string" && notebook.trim().length > 0) {
            return notebook;
        }
        return undefined;
    }
    const m = /"path"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(raw || "");
    if (!m) {
        return undefined;
    }
    try {
        return JSON.parse(`"${m[1]}"`);
    }
    catch {
        return m[1];
    }
}
/**
 * Replace malformed function.arguments with "{}" so the next chat request
 * does not 400 on the server's JSON parse of tool_calls.
 */
export function apiSafeToolCall(call) {
    if (parseToolArguments(call.arguments).ok) {
        return call;
    }
    return { ...call, arguments: "{}" };
}
//# sourceMappingURL=tool-args.js.map