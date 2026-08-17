const READ_TOOLS = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read a file in the workspace.",
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
            name: "list_dir",
            description: "List a directory.",
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
            description: "Search file contents for a pattern.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { type: "string" },
                    path: { type: "string" },
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
];
const WRITE_TOOLS = [
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write a file. Agent mode only.",
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
            description: "Replace the first occurrence of search with replace in a file.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    search: { type: "string" },
                    replace: { type: "string" },
                },
                required: ["path", "search", "replace"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "run_shell",
            description: "Run a shell command. Always requires user approval unless yolo.",
            parameters: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"],
            },
        },
    },
];
export function openaiTools(mode) {
    if (mode === "Agent") {
        return [...READ_TOOLS, ...WRITE_TOOLS];
    }
    return READ_TOOLS;
}
export const WRITE_TOOL_NAMES = new Set(["write_file", "edit_file", "run_shell"]);
//# sourceMappingURL=tools-openai.js.map