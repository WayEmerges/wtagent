import type { LoadedConfig } from "../config/load.js";
import { allowTool } from "../llm/tools-xml.js";
import type { AgentMode } from "../state/session.js";
import { grepTool, globTool } from "./grep.js";
import { readLintsTool } from "./lints.js";
import { callMcpTool, fetchMcpResource, parseMcpToolName } from "./mcp.js";
import { editNotebookTool } from "./notebook.js";
import { listDirTool, readFileTool } from "./read.js";
import { awaitShellTool, runShellTool } from "./shell.js";
import { taskTool } from "./task.js";
import { todoWriteTool, getTodos, type TodoItem } from "./todo.js";
import { errResult, okResult, type ToolResult } from "./types.js";
import { webfetchTool } from "./webfetch.js";
import { webSearchTool } from "./websearch.js";
import { deleteFileTool, editFileTool, writeFileTool } from "./write.js";

export type ToolContext = {
  config: LoadedConfig;
  modelKey: string;
  signal?: AbortSignal;
  setMode?: (mode: AgentMode) => void;
  onTodos?: (items: TodoItem[]) => void;
  onTaskNotice?: (text: string) => void;
};

function bool(args: Record<string, unknown>, k: string): boolean {
  const v = args[k];
  return v === true || v === "true";
}

function num(args: Record<string, unknown>, k: string): number | undefined {
  const v = args[k];
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(args: Record<string, unknown>, k: string): string {
  return String(args[k] ?? "");
}

export async function executeTool(
  name: string,
  rawArgs: string,
  mode: AgentMode,
  ctx?: ToolContext,
): Promise<ToolResult> {
  const mcp = parseMcpToolName(name);
  if (mcp) {
    if (!ctx?.config) {
      return errResult("mcp tools require config context");
    }
    try {
      const args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
      const text = await callMcpTool(ctx.config.mcpServers, mcp.server, mcp.tool, args);
      return okResult(text, { summary: `mcp ${mcp.server}/${mcp.tool}` });
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  }

  if (!allowTool(name, mode)) {
    return errResult(`${name} is not available in ${mode} mode`);
  }
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return errResult("invalid tool arguments");
  }

  try {
    switch (name) {
      case "read_file": {
        const path = str(args, "path");
        const text = await readFileTool(path, {
          offset: num(args, "offset"),
          limit: num(args, "limit"),
        });
        return okResult(text, {
          path,
          output: text.slice(0, 20_000),
          summary: `Read ${path}`,
          detail: path,
        });
      }
      case "list_dir": {
        const path = str(args, "path") || ".";
        const text = await listDirTool(path);
        return okResult(text, { path, summary: `Listed ${path}` });
      }
      case "grep": {
        const pattern = str(args, "pattern");
        const text = await grepTool(pattern, str(args, "path") || undefined, {
          context: num(args, "context"),
          headLimit: num(args, "head_limit"),
        });
        return okResult(text, {
          summary: `Grep ${JSON.stringify(pattern)}`,
          detail: pattern,
          output: text.slice(0, 32_000),
          collapsedHint: `${text.split("\n").length} lines`,
        });
      }
      case "glob": {
        const pattern = str(args, "pattern");
        const text = await globTool(pattern);
        return okResult(text, { summary: `Glob ${pattern}`, detail: pattern });
      }
      case "webfetch": {
        const url = str(args, "url");
        const text = await webfetchTool(url, num(args, "timeout"));
        return okResult(text, {
          summary: `WebFetch ${url}`,
          detail: url,
          output: text.slice(0, 32_000),
          collapsedHint: `${text.split("\n").length} lines`,
        });
      }
      case "web_search": {
        const text = await webSearchTool(str(args, "search_term"), ctx?.config.webSearch);
        return okResult(text, {
          summary: `WebSearch ${str(args, "search_term")}`,
          output: text,
          collapsedHint: `${text.split("\n").length} lines`,
        });
      }
      case "read_lints": {
        const paths = Array.isArray(args.paths)
          ? args.paths.map((p) => String(p))
          : undefined;
        const text = await readLintsTool(paths);
        return okResult(text, { summary: "ReadLints", output: text });
      }
      case "todo_write": {
        const todos = Array.isArray(args.todos)
          ? (args.todos as Array<{ id: string; content?: string; status: TodoItem["status"] }>)
          : [];
        const text = todoWriteTool(todos, bool(args, "merge"));
        ctx?.onTodos?.(getTodos());
        return okResult(text, { summary: "Updated todos" });
      }
      case "await_shell": {
        const text = await awaitShellTool({
          shellId: str(args, "shell_id") || undefined,
          blockUntilMs: num(args, "block_until_ms"),
          pattern: str(args, "pattern") || undefined,
        });
        return okResult(text, {
          summary: `AwaitShell ${str(args, "shell_id") || "sleep"}`,
          shellId: str(args, "shell_id") || undefined,
          output: text,
          collapsedHint: `${text.split("\n").length} lines`,
        });
      }
      case "fetch_mcp_resource": {
        if (!ctx?.config) {
          return errResult("config required");
        }
        const text = await fetchMcpResource(
          ctx.config.mcpServers,
          str(args, "server"),
          str(args, "uri"),
        );
        return okResult(text, { summary: `MCP resource ${str(args, "uri")}` });
      }
      case "write_file": {
        const path = str(args, "path");
        const stats = await writeFileTool(path, str(args, "content"));
        return okResult(`wrote ${path}`, {
          path,
          detail: stats.detail,
          summary: `Wrote ${path}`,
          added: stats.added,
          removed: stats.removed,
          output: stats.detail,
        });
      }
      case "edit_file": {
        const path = str(args, "path");
        const oldString = str(args, "old_string") || str(args, "search");
        const newString =
          args.new_string !== undefined ? str(args, "new_string") : str(args, "replace");
        const stats = await editFileTool(path, oldString, newString, bool(args, "replace_all"));
        return okResult(`edited ${path}`, {
          path,
          detail: stats.detail,
          summary: `Edited ${path} +${stats.added} -${stats.removed}`,
          added: stats.added,
          removed: stats.removed,
          output: stats.detail,
        });
      }
      case "delete_file": {
        const path = str(args, "path");
        const text = await deleteFileTool(path);
        return okResult(text, { path, summary: `Deleted ${path}` });
      }
      case "edit_notebook": {
        const text = await editNotebookTool({
          targetNotebook: str(args, "target_notebook"),
          cellIdx: num(args, "cell_idx") ?? 0,
          isNewCell: bool(args, "is_new_cell"),
          cellLanguage: str(args, "cell_language"),
          oldString: str(args, "old_string"),
          newString: str(args, "new_string"),
        });
        return okResult(text, {
          path: str(args, "target_notebook"),
          summary: text,
        });
      }
      case "run_shell": {
        const command = str(args, "command");
        const block = num(args, "block_until_ms") ?? 30_000;
        const result = await runShellTool(command, block);
        const lines = result.text.split("\n").length;
        return okResult(result.text, {
          summary: result.backgrounded
            ? `$ ${command.slice(0, 80)} (background)`
            : `$ ${command.slice(0, 80)}`,
          detail: command,
          shellId: result.shellId,
          output: result.text,
          collapsedHint: `${lines} lines`,
        });
      }
      case "switch_mode": {
        const raw = str(args, "target_mode_id").toLowerCase();
        const next: AgentMode =
          raw === "plan" ? "Plan" : raw === "ask" ? "Ask" : raw === "agent" ? "Agent" : "Agent";
        ctx?.setMode?.(next);
        return okResult(`switched mode to ${next}`, {
          summary: `SwitchMode → ${next}`,
          detail: str(args, "explanation") || next,
        });
      }
      case "task": {
        if (!ctx?.config) {
          return errResult("config required for task");
        }
        const description = str(args, "description") || "subagent";
        const prompt = str(args, "prompt");
        const bg = bool(args, "run_in_background");
        if (bg) {
          const notice = `Task started (background): ${description}`;
          ctx.onTaskNotice?.(notice);
          void taskTool({
            config: ctx.config,
            modelKey: ctx.modelKey,
            description,
            prompt,
            subagentType: str(args, "subagent_type") || undefined,
            resume: str(args, "resume") || undefined,
            signal: ctx.signal,
          })
            .then((r) => {
              ctx.onTaskNotice?.(
                `Task done [${r.agentId}] ${description}: ${r.text.slice(0, 500)}`,
              );
            })
            .catch((e) => {
              ctx.onTaskNotice?.(
                `Task failed ${description}: ${e instanceof Error ? e.message : String(e)}`,
              );
            });
          return okResult(`background task started: ${description}`, {
            summary: `Task ${description} (bg)`,
          });
        }
        const result = await taskTool({
          config: ctx.config,
          modelKey: ctx.modelKey,
          description,
          prompt,
          subagentType: str(args, "subagent_type") || undefined,
          resume: str(args, "resume") || undefined,
          signal: ctx.signal,
        });
        return okResult(result.text, {
          summary: `Task ${description}`,
          detail: result.agentId,
          output: result.text,
          collapsedHint: `${result.text.split("\n").length} lines`,
        });
      }
      default:
        return errResult(`unknown tool: ${name}`);
    }
  } catch (err) {
    return errResult(err instanceof Error ? err.message : String(err));
  }
}
