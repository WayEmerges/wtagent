import { WRITE_TOOL_NAMES } from "./tools-openai.js";
export function xmlToolSystem(mode) {
    const extra = mode === "Agent"
        ? "You may also use write_file, edit_file, delete_file, edit_notebook, run_shell, await_shell, switch_mode, and task."
        : "Do not use write/edit/delete/shell/task tools. Do not edit files.";
    return `When you need a tool, output only this XML (no extra prose in the same turn):
<tool_call>
<name>read_file</name>
<arg name="path">PATH</arg>
</tool_call>
Tools: read_file(path, offset?, limit?), list_dir(path), grep(pattern, path?, context?, head_limit?), glob(pattern), webfetch(url, timeout?), web_search(search_term), read_lints(paths?), todo_write(todos, merge), await_shell(shell_id?, block_until_ms?, pattern?), fetch_mcp_resource(server, uri). ${extra}
You may call multiple independent read/search tools in one turn. After tool results, continue or answer. Never tell the user to type a tool name.`;
}
export function parseXmlToolCalls(text) {
    const calls = [];
    const re = /<tool_call>\s*<name>([^<]+)<\/name>([\s\S]*?)<\/tool_call>/g;
    let m;
    let i = 0;
    while ((m = re.exec(text)) !== null) {
        const name = m[1]?.trim() ?? "";
        const body = m[2] ?? "";
        const args = {};
        const argRe = /<arg name="([^"]+)">([\s\S]*?)<\/arg>/g;
        let a;
        while ((a = argRe.exec(body)) !== null) {
            args[a[1] ?? ""] = (a[2] ?? "").trim();
        }
        calls.push({
            id: `xml-${i++}`,
            name,
            arguments: JSON.stringify(args),
        });
    }
    return calls;
}
export function stripXmlToolCalls(text) {
    return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}
export function allowTool(name, mode) {
    if (name.startsWith("mcp__")) {
        return true;
    }
    if (WRITE_TOOL_NAMES.has(name) && mode !== "Agent") {
        return false;
    }
    return true;
}
//# sourceMappingURL=tools-xml.js.map