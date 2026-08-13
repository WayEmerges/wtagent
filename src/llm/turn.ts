import type { LoadedConfig, ModelEntry } from "../config/load.js";
import { getGpuLease } from "../gpu/lease.js";
import {
  compactSession,
  isContextOomError,
  memoryInjectBlock,
  shouldCompact,
} from "../memory/compact.js";
import { buildSkillsInject } from "../skills/load.js";
import type { AgentMode } from "../state/session.js";
import { executeTool } from "../tools/run.js";
import type { TranscriptRow } from "../ui/rows.js";
import { openaiTools } from "./tools-openai.js";
import {
  parseXmlToolCalls,
  stripXmlToolCalls,
  xmlToolSystem,
} from "./tools-xml.js";
import {
  estimateTokens,
  streamChat,
  ToolsUnsupportedError,
  type ChatMessage,
  type ToolCall,
} from "./stream.js";

const MAX_ITERS = 20;

const xmlByServer = new Map<string, boolean>();

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function systemPrompt(
  mode: AgentMode,
  xml: boolean,
  memoryDigest: string,
  skillsDigest: string,
): string {
  const lines = [
    `You are a coding assistant. Working directory: ${process.cwd()}. Mode: ${mode}.`,
    "Use Markdown: headings, lists, fenced code.",
  ];
  if (mode !== "Agent") {
    lines.push("You may read files. Do not write files or run shell commands.");
  }
  if (xml) {
    lines.push(xmlToolSystem(mode));
  } else {
    lines.push("Call tools when you need the workspace. Prefer list_dir or glob to list files.");
  }
  if (skillsDigest.trim().length > 0) {
    lines.push(skillsDigest);
  }
  if (memoryDigest.trim().length > 0) {
    lines.push(`Persistent memory from prior sessions:\n${memoryDigest}`);
  }
  return lines.join("\n\n");
}

function historyMessages(
  rows: TranscriptRow[],
  mode: AgentMode,
  xml: boolean,
  memoryDigest: string,
  skillsDigest: string,
): ChatMessage[] {
  const out: ChatMessage[] = [
    { role: "system", content: systemPrompt(mode, xml, memoryDigest, skillsDigest) },
  ];
  for (const row of rows) {
    if (row.kind === "user") {
      out.push({ role: "user", content: row.text });
    } else if (row.kind === "assistant" && row.text.length > 0) {
      out.push({ role: "assistant", content: row.text });
    }
  }
  return out;
}

function shortArgs(raw: string): string {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const bits = Object.entries(o)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`);
    return bits.join(" ");
  } catch {
    return raw.slice(0, 60);
  }
}

export type TurnHooks = {
  getRows: () => TranscriptRow[];
  patchRows: (fn: (rows: TranscriptRow[]) => TranscriptRow[]) => void;
  setUsage: (usage: { prompt: number; completion: number; total: number }, approx: boolean) => void;
  waitShell: (command: string) => Promise<"allow" | "deny" | "yolo">;
  yolo: () => boolean;
  setYolo: () => void;
};

export async function runAgentTurn(args: {
  config: LoadedConfig;
  modelKey: string;
  mode: AgentMode;
  asstId: string;
  sessionId: string;
  signal: AbortSignal;
  hooks: TurnHooks;
}): Promise<void> {
  const entry = args.config.models[args.modelKey];
  if (!entry) {
    return;
  }

  const lease = getGpuLease(args.config);
  let handle = await lease.acquire(args.modelKey, args.signal);
  try {
    await runAgentTurnLocked(args, entry, {
      release: async () => {
        await handle.release();
      },
      reacquire: async () => {
        handle = await lease.acquire(args.modelKey, args.signal);
      },
    });
  } finally {
    await handle.release();
  }
}

type LeaseControl = {
  release: () => Promise<void>;
  reacquire: () => Promise<void>;
};

async function runAgentTurnLocked(
  args: {
    config: LoadedConfig;
    modelKey: string;
    mode: AgentMode;
    asstId: string;
    sessionId: string;
    signal: AbortSignal;
    hooks: TurnHooks;
  },
  entry: ModelEntry,
  leaseCtl: LeaseControl,
): Promise<void> {
  let memoryDigest = memoryInjectBlock(args.config);
  let skillsDigest = buildSkillsInject();
  let compactedThisTurn = false;

  const rebuildMessages = (xml: boolean): ChatMessage[] =>
    historyMessages(args.hooks.getRows(), args.mode, xml, memoryDigest, skillsDigest);

  const estimatePrompt = (messages: ChatMessage[]): number =>
    messages.reduce((n, m) => n + estimateTokens(m.content), 0);

  const maybeCompact = async (force: boolean): Promise<boolean> => {
    if (args.signal.aborted) {
      return false;
    }
    if (!args.config.memory.enabled && !force) {
      return false;
    }
    await leaseCtl.release();
    try {
      const result = await compactSession({
        config: args.config,
        sessionId: args.sessionId,
        rows: args.hooks.getRows(),
        asstId: args.asstId,
        signal: args.signal,
        force,
      });
      if (!result) {
        return false;
      }
      compactedThisTurn = true;
      memoryDigest = memoryInjectBlock(args.config);
      skillsDigest = buildSkillsInject();
      args.hooks.patchRows(() => [
        ...result.trimmedRows.filter((r) => r.id !== args.asstId),
        {
          id: nextId(),
          kind: "notice",
          text: `Compacted session → ${result.memoryPath}`,
        },
        ...result.trimmedRows.filter((r) => r.id === args.asstId),
      ]);
      return true;
    } finally {
      await leaseCtl.reacquire();
    }
  };

  let xml = xmlByServer.get(entry.baseURL) === true;
  let messages = rebuildMessages(xml);
  let promptEst = estimatePrompt(messages);
  args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);

  if (
    shouldCompact({
      promptTokens: promptEst,
      contextLength: entry.contextLength,
      threshold: args.config.memory.threshold,
    })
  ) {
    const did = await maybeCompact(false);
    if (did) {
      xml = xmlByServer.get(entry.baseURL) === true;
      messages = rebuildMessages(xml);
      promptEst = estimatePrompt(messages);
      args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);
    }
  }

  let outText = "";
  const onDelta = (chunk: string) => {
    outText += chunk;
    const completion = estimateTokens(outText);
    args.hooks.patchRows((rows) =>
      rows.map((row) =>
        row.id === args.asstId && row.kind === "assistant"
          ? { ...row, text: row.text + chunk }
          : row,
      ),
    );
    args.hooks.setUsage({ prompt: promptEst, completion, total: promptEst + completion }, true);
  };

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (args.signal.aborted) {
      return;
    }
    const useXml = xmlByServer.get(entry.baseURL) === true;
    if (useXml && messages[0]) {
      messages[0] = {
        role: "system",
        content: systemPrompt(args.mode, true, memoryDigest, skillsDigest),
      };
    }

    // Mid-loop watchdog (after tool results grow the prompt)
    promptEst = estimatePrompt(messages);
    if (
      shouldCompact({
        promptTokens: promptEst,
        contextLength: entry.contextLength,
        threshold: args.config.memory.threshold,
      })
    ) {
      const did = await maybeCompact(false);
      if (did) {
        messages = rebuildMessages(useXml);
        promptEst = estimatePrompt(messages);
        args.hooks.setUsage({ prompt: promptEst, completion: 0, total: promptEst }, true);
        outText = "";
      }
    }

    let result: { text: string; toolCalls: ToolCall[] };
    try {
      result = await streamChat({
        baseURL: entry.baseURL,
        apiKey: entry.apiKey,
        model: entry.model,
        messages,
        tools: useXml ? undefined : openaiTools(args.mode),
        signal: args.signal,
        onDelta,
        onUsage: (usage) => {
          args.hooks.setUsage(usage, false);
        },
      });
    } catch (err) {
      if (err instanceof ToolsUnsupportedError) {
        xmlByServer.set(entry.baseURL, true);
        continue;
      }
      if (isContextOomError(err) && !compactedThisTurn) {
        const did = await maybeCompact(true);
        if (did) {
          messages = rebuildMessages(xmlByServer.get(entry.baseURL) === true);
          promptEst = estimatePrompt(messages);
          outText = "";
          args.hooks.patchRows((rows) =>
            rows.map((row) =>
              row.id === args.asstId && row.kind === "assistant" ? { ...row, text: "" } : row,
            ),
          );
          continue;
        }
      }
      throw err;
    }

    const nativeCalls = result.toolCalls;
    let calls = nativeCalls;
    if (calls.length === 0) {
      calls = parseXmlToolCalls(result.text);
      if (calls.length > 0) {
        const cleaned = stripXmlToolCalls(result.text);
        args.hooks.patchRows((rows) =>
          rows.map((row) =>
            row.id === args.asstId && row.kind === "assistant" ? { ...row, text: cleaned } : row,
          ),
        );
        outText = cleaned;
      }
    }

    if (calls.length === 0) {
      return;
    }

    const xmlResults = nativeCalls.length === 0;
    messages.push({
      role: "assistant",
      content: xmlResults ? stripXmlToolCalls(result.text) : result.text,
      tool_calls: xmlResults ? undefined : calls,
    });

    const resultChunks: string[] = [];
    for (const call of calls) {
      if (args.signal.aborted) {
        return;
      }
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      if (call.name === "run_shell" && !args.hooks.yolo()) {
        const cmd = String(parsed.command ?? "");
        const decision = await args.hooks.waitShell(cmd);
        if (args.signal.aborted) {
          return;
        }
        if (decision === "yolo") {
          args.hooks.setYolo();
        }
        if (decision === "deny") {
          const toolId = nextId();
          args.hooks.patchRows((rows) => [
            ...rows.filter((r) => r.id !== args.asstId),
            {
              id: toolId,
              kind: "tool",
              name: call.name,
              args: shortArgs(call.arguments),
              status: "error",
              detail: "denied",
            },
            ...rows.filter((r) => r.id === args.asstId),
          ]);
          const denied = "User denied this shell command.";
          resultChunks.push(denied);
          if (!xmlResults) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: denied,
            });
          }
          continue;
        }
      }

      const toolId = nextId();
      args.hooks.patchRows((rows) => {
        const asst = rows.filter((r) => r.id === args.asstId);
        const rest = rows.filter((r) => r.id !== args.asstId);
        return [
          ...rest,
          {
            id: toolId,
            kind: "tool",
            name: call.name,
            args: shortArgs(call.arguments),
            status: "running",
          },
          ...asst,
        ];
      });

      const exec = await executeTool(call.name, call.arguments, args.mode);
      args.hooks.patchRows((rows) =>
        rows.map((row) =>
          row.id === toolId && row.kind === "tool"
            ? {
                ...row,
                status: exec.ok ? "done" : "error",
                detail: exec.detail ?? exec.text.slice(0, 80),
              }
            : row,
        ),
      );
      const body = exec.text.slice(0, 24_000);
      resultChunks.push(body);
      if (!xmlResults) {
        messages.push({ role: "tool", tool_call_id: call.id, content: body });
      }
    }

    if (xmlResults) {
      messages.push({
        role: "user",
        content: `Tool results:\n${resultChunks.join("\n---\n")}`,
      });
    }

    outText = "";
    args.hooks.patchRows((rows) =>
      rows.map((row) =>
        row.id === args.asstId && row.kind === "assistant" ? { ...row, text: "" } : row,
      ),
    );
  }

  args.hooks.patchRows((rows) => [
    ...rows,
    { id: nextId(), kind: "notice", text: `Stopped after ${MAX_ITERS} tool iterations` },
  ]);
}
