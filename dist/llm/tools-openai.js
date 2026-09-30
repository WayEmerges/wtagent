import { loadMcpTools, mcpToolName } from "../tools/mcp.js";
const READ_TOOLS = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read a file in the workspace. Optional offset (1-based line) and limit (line count). Do not list the directory first when you know the path.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    offset: { type: "number", description: "1-based start line" },
                    limit: { type: "number", description: "max lines to return" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "list_dir",
            description: "List a directory only when you do not know which file to open.",
            parameters: {
                type: "object",
                properties: { path: { type: "string", description: "Directory path, default ." } },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "grep",
            description: "Search file contents for a regex pattern. Optional path, context lines, head_limit.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { type: "string" },
                    path: { type: "string" },
                    context: { type: "number", description: "lines of context around each match" },
                    head_limit: { type: "number" },
                },
                required: ["pattern"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "glob",
            description: "Find files by glob pattern.",
            parameters: {
                type: "object",
                properties: { pattern: { type: "string" } },
                required: ["pattern"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "webfetch",
            description: "Fetch a URL and return readable page text (strips HTML). Prefer this over run_shell/curl.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string" },
                    timeout: { type: "number" },
                },
                required: ["url"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for up-to-date information. Requires webSearch config. Returns titles, URLs, snippets.",
            parameters: {
                type: "object",
                properties: {
                    search_term: { type: "string" },
                    explanation: { type: "string" },
                },
                required: ["search_term"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_lints",
            description: "Read linter/typecheck diagnostics for paths you edited (tsc/eslint when available).",
            parameters: {
                type: "object",
                properties: {
                    paths: { type: "array", items: { type: "string" } },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "todo_write",
            description: "Create or update a structured todo list for multi-step work.",
            parameters: {
                type: "object",
                properties: {
                    todos: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                content: { type: "string" },
                                status: {
                                    type: "string",
                                    enum: ["pending", "in_progress", "completed", "cancelled"],
                                },
                            },
                            required: ["id", "status"],
                        },
                    },
                    merge: { type: "boolean" },
                },
                required: ["todos", "merge"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "await_shell",
            description: "Wait on a background shell job by shell_id, or sleep block_until_ms when shell_id omitted. Optional regex pattern.",
            parameters: {
                type: "object",
                properties: {
                    shell_id: { type: "string" },
                    block_until_ms: { type: "number" },
                    pattern: { type: "string" },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "fetch_mcp_resource",
            description: "Read a resource from a configured MCP server.",
            parameters: {
                type: "object",
                properties: {
                    server: { type: "string" },
                    uri: { type: "string" },
                },
                required: ["server", "uri"],
            },
        },
    },
];
const WRITE_TOOLS = [
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write a file (create or overwrite). Agent mode only.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    content: { type: "string" },
                },
                required: ["path", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "edit_file",
            description: "Replace old_string with new_string in a file. old_string must be unique unless replace_all is true.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    old_string: { type: "string" },
                    new_string: { type: "string" },
                    search: { type: "string", description: "Alias for old_string" },
                    replace: { type: "string", description: "Alias for new_string" },
                    replace_all: { type: "boolean" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "delete_file",
            description: "Delete a file. Agent mode only.",
            parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "edit_notebook",
            description: "Edit or insert a Jupyter notebook cell.",
            parameters: {
                type: "object",
                properties: {
                    target_notebook: { type: "string" },
                    cell_idx: { type: "number" },
                    is_new_cell: { type: "boolean" },
                    cell_language: { type: "string" },
                    old_string: { type: "string" },
                    new_string: { type: "string" },
                },
                required: [
                    "target_notebook",
                    "cell_idx",
                    "is_new_cell",
                    "cell_language",
                    "old_string",
                    "new_string",
                ],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "run_shell",
            description: "Run a shell command. Use block_until_ms (default 30000); set 0 to background and then await_shell. Requires approval unless yolo.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string" },
                    block_until_ms: { type: "number" },
                },
                required: ["command"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "switch_mode",
            description: "Request switching interaction mode to plan or agent (user may confirm).",
            parameters: {
                type: "object",
                properties: {
                    target_mode_id: { type: "string", enum: ["plan", "agent", "ask"] },
                    explanation: { type: "string" },
                },
                required: ["target_mode_id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "task",
            description: "Launch a local subagent for a complex subtask. subagent_type: explore (read-only) or general (full tools).",
            parameters: {
                type: "object",
                properties: {
                    description: { type: "string" },
                    prompt: { type: "string" },
                    subagent_type: { type: "string" },
                    resume: { type: "string" },
                    run_in_background: { type: "boolean" },
                },
                required: ["description", "prompt"],
            },
        },
    },
];
export const WRITE_TOOL_NAMES = new Set([
    "write_file",
    "edit_file",
    "delete_file",
    "edit_notebook",
    "run_shell",
    "switch_mode",
    "task",
]);
export const PARALLEL_SAFE_TOOLS = new Set([
    "read_file",
    "list_dir",
    "grep",
    "glob",
    "webfetch",
    "web_search",
    "read_lints",
    "await_shell",
    "fetch_mcp_resource",
    "todo_write",
]);
let mcpCache = null;
let mcpCacheKey = "";
export async function refreshMcpTools(config) {
    const key = JSON.stringify(config.mcpServers);
    if (key === mcpCacheKey && mcpCache) {
        return;
    }
    mcpCacheKey = key;
    const listed = await loadMcpTools(config.mcpServers);
    mcpCache = listed.map((t) => ({
        type: "function",
        function: {
            name: mcpToolName(t.server, t.name),
            description: `[mcp:${t.server}] ${t.description}`,
            parameters: t.inputSchema,
        },
    }));
}
export function openaiTools(mode) {
    const mcp = mcpCache ?? [];
    if (mode === "Agent") {
        return [...READ_TOOLS, ...WRITE_TOOLS, ...mcp];
    }
    return [...READ_TOOLS, ...mcp];
}
//# sourceMappingURL=tools-openai.js.map