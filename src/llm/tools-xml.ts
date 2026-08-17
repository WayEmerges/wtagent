import { WRITE_TOOL_NAMES } from "./tools-openai.js";
import type { AgentMode } from "../state/session.js";
import type { ToolCall } from "./stream.js";

export function xmlToolSystem(mode: AgentMode): string {
  const extra =
    mode === "Agent"
      ? "You may also use write_file, edit_file, and run_shell."
      : "Do not use write_file, edit_file, or run_shell. Do not edit files.";
  return `When you need a tool, output only this XML (no extra prose in the same turn):
<tool_call>
<name>read_file</name>
<arg name="path">PATH</arg>
</tool_call>
Tools: read_file(path), list_dir(path), grep(pattern, path?), glob(pattern). ${extra}
Call each tool at most once per path. After tool results, answer — do not emit another tool_call. Never tell the user to type a tool name.`;
}

export function parseXmlToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /<tool_call>\s*<name>([^<]+)<\/name>([\s\S]*?)<\/tool_call>/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const name = m[1]?.trim() ?? "";
    const body = m[2] ?? "";
    const args: Record<string, string> = {};
    const argRe = /<arg name="([^"]+)">([\s\S]*?)<\/arg>/g;
    let a: RegExpExecArray | null;
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

export function stripXmlToolCalls(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

export function allowTool(name: string, mode: AgentMode): boolean {
  if (WRITE_TOOL_NAMES.has(name) && mode !== "Agent") {
    return false;
  }
  return true;
}
