import { WRITE_TOOL_NAMES } from "./tools-openai.js";
export function xmlToolSystem(mode) {
    const extra = mode === "Agent"
        ? "You may also use write_file, edit_file, and run_shell."
        : "Do not use write_file, edit_file, or run_shell. Do not edit files.";
    return `When you need a tool, output only this XML (no extra prose in the same turn):
<tool_call>
<name>list_dir</name>
<arg name="path">.</arg>
</tool_call>
Tools: read_file(path), list_dir(path), grep(pattern, path?), glob(pattern). ${extra}
You may emit multiple tool_call blocks. After results, answer the user.`;
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
    if (WRITE_TOOL_NAMES.has(name) && mode !== "Agent") {
        return false;
    }
    return true;
}
//# sourceMappingURL=tools-xml.js.map