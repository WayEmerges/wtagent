import { allowTool } from "../llm/tools-xml.js";
import { grepTool, globTool } from "./grep.js";
import { listDirTool, readFileTool } from "./read.js";
import { runShellTool } from "./shell.js";
import { editFileTool, writeFileTool } from "./write.js";
export async function executeTool(name, rawArgs, mode) {
    if (!allowTool(name, mode)) {
        return { ok: false, text: `${name} is not available in ${mode} mode` };
    }
    let args = {};
    try {
        args = JSON.parse(rawArgs || "{}");
    }
    catch {
        return { ok: false, text: "invalid tool arguments" };
    }
    const str = (k) => String(args[k] ?? "");
    try {
        switch (name) {
            case "read_file":
                return { ok: true, text: await readFileTool(str("path")) };
            case "list_dir":
                return { ok: true, text: await listDirTool(str("path") || ".") };
            case "grep":
                return { ok: true, text: await grepTool(str("pattern"), str("path") || undefined) };
            case "glob":
                return { ok: true, text: await globTool(str("pattern")) };
            case "write_file": {
                const detail = await writeFileTool(str("path"), str("content"));
                return { ok: true, text: `wrote ${str("path")}`, detail };
            }
            case "edit_file": {
                const detail = await editFileTool(str("path"), str("search"), str("replace"));
                return { ok: true, text: `edited ${str("path")}`, detail };
            }
            case "run_shell":
                return { ok: true, text: await runShellTool(str("command")) };
            default:
                return { ok: false, text: `unknown tool: ${name}` };
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, text: msg };
    }
}
//# sourceMappingURL=run.js.map