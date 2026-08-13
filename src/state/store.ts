import { create } from "zustand";
import {
  autoEnabled,
  loadConfig,
  modelChoices,
  resolveModelKey,
  writeLastModel,
  type LoadedConfig,
} from "../config/load.js";
import { friendlyLlmError, type TokenUsage } from "../llm/stream.js";
import { runAgentTurn } from "../llm/turn.js";
import { compactSession, summarizerModelKey } from "../memory/compact.js";
import { routeTurn } from "../orchestrator/route.js";
import {
  latestSession,
  listSessions,
  newSessionId,
  persistTurn,
  readSession,
  type SavedSession,
} from "../sessions/store.js";
import type { TranscriptRow } from "../ui/rows.js";
import { SLASH_COMMANDS } from "../ui/slash-palette.js";
import { AGENT_MODES, type AgentMode } from "./session.js";

const HELP_TEXT = SLASH_COMMANDS.map(
  (c) => `${c.name}  ${c.summary}${c.implemented ? "" : "  (not implemented)"}`,
).join("\n");

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let turnAbort: AbortController | null = null;

export type ShellDecision = "allow" | "deny" | "yolo";

let shellWait: ((d: ShellDecision) => void) | null = null;

function abortTurn() {
  turnAbort?.abort();
  turnAbort = null;
  if (shellWait) {
    shellWait("deny");
    shellWait = null;
  }
}

const initialConfig = loadConfig();

export type SessionStore = {
  rows: TranscriptRow[];
  mode: AgentMode;
  streamingId: string | null;
  config: LoadedConfig;
  modelKey: string;
  /** Concrete model used for the active/last Auto-routed turn. */
  resolvedModelKey: string | null;
  modelPickerOpen: boolean;
  sessionPickerOpen: boolean;
  sessionId: string;
  sessionCreatedAt: string;
  initialPrompt?: string;
  usage: TokenUsage | null;
  usageApprox: boolean;
  yolo: boolean;
  pendingShell: { command: string } | null;
  cycleMode: () => void;
  addNotice: (text: string) => void;
  addError: (text: string) => void;
  clearChat: () => void;
  submitUser: (text: string) => void;
  cancelStream: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  selectModel: (key: string) => void;
  openSessionPicker: () => void;
  closeSessionPicker: () => void;
  selectSession: (id: string) => void;
  loadSession: (session: SavedSession) => void;
  resumeLatest: () => boolean;
  applyFlagModel: (flag?: string) => void;
  applyFlagMode: (flag?: string) => void;
  applyFlagYolo: (on: boolean) => void;
  resolveShell: (d: ShellDecision) => void;
  setInitialPrompt: (text: string) => void;
  consumeInitialPrompt: () => string | undefined;
  runCommand: (name: string, exit: () => void) => void;
};

export const useStore = create<SessionStore>((set, get) => ({
  rows: [],
  mode: "Agent",
  streamingId: null,
  config: initialConfig,
  modelKey: resolveModelKey(initialConfig),
  resolvedModelKey: null,
  modelPickerOpen: false,
  sessionPickerOpen: false,
  sessionId: newSessionId(),
  sessionCreatedAt: new Date().toISOString(),
  initialPrompt: undefined,
  usage: null,
  usageApprox: false,
  yolo: false,
  pendingShell: null,

  cycleMode: () => {
    set((s) => {
      const i = AGENT_MODES.indexOf(s.mode);
      return { mode: AGENT_MODES[(i + 1) % AGENT_MODES.length] ?? "Agent" };
    });
  },

  addNotice: (text) => {
    set((s) => ({ rows: [...s.rows, { id: nextId(), kind: "notice", text }] }));
  },

  addError: (text) => {
    set((s) => ({ rows: [...s.rows, { id: nextId(), kind: "error", text }] }));
  },

  clearChat: () => {
    abortTurn();
    set({
      streamingId: null,
      pendingShell: null,
      resolvedModelKey: null,
      sessionId: newSessionId(),
      sessionCreatedAt: new Date().toISOString(),
      rows: [{ id: nextId(), kind: "notice", text: "New chat" }],
    });
  },

  submitUser: (text) => {
    if (get().streamingId) {
      get().addNotice(`queued: ${text}`);
      return;
    }

    const { config, modelKey, mode } = get();

    const userId = nextId();
    const asstId = nextId();
    abortTurn();
    turnAbort = new AbortController();
    const signal = turnAbort.signal;

    set((s) => ({
      streamingId: asstId,
      rows: [
        ...s.rows,
        { id: userId, kind: "user", text },
        { id: asstId, kind: "assistant", text: "" },
      ],
    }));

    void (async () => {
      let runKey = modelKey;
      if (modelKey === "auto") {
        if (!autoEnabled(config)) {
          set((s) => ({
            streamingId: null,
            rows: [
              ...s.rows.filter((row) => row.id !== asstId && row.id !== userId),
              {
                id: nextId(),
                kind: "error",
                text: "Auto is disabled — set auto.fallback to a configured model",
              },
            ],
          }));
          return;
        }
        const routed = await routeTurn({ config, mode, userText: text, signal });
        if (signal.aborted) {
          return;
        }
        runKey = routed.modelKey;
        set((s) => {
          const asst = s.rows.find((r) => r.id === asstId);
          const rest = s.rows.filter((r) => r.id !== asstId);
          return {
            resolvedModelKey: runKey,
            rows: [
              ...rest,
              {
                id: nextId(),
                kind: "notice",
                text: `Auto → ${runKey} (${routed.reason})`,
              },
              ...(asst ? [asst] : []),
            ],
          };
        });
      } else {
        set({ resolvedModelKey: null });
      }

      const entry = config.models[runKey];
      if (!entry) {
        set((s) => ({
          streamingId: null,
          rows: [
            ...s.rows.filter((row) => row.id !== asstId),
            {
              id: nextId(),
              kind: "error",
              text: config.missing
                ? `No config at ${config.path}`
                : `No model entry "${runKey}" — pick one with /model`,
            },
          ],
        }));
        return;
      }

      try {
        await runAgentTurn({
          config,
          modelKey: runKey,
          mode,
          asstId,
          sessionId: get().sessionId,
          signal,
          hooks: {
            getRows: () => get().rows,
            patchRows: (fn) => {
              set((s) => ({ rows: fn(s.rows) }));
            },
            setUsage: (usage, approx) => {
              set({ usage, usageApprox: approx });
            },
            yolo: () => get().yolo,
            setYolo: () => {
              set({ yolo: true, pendingShell: null });
            },
            waitShell: (command) =>
              new Promise<ShellDecision>((resolve) => {
                shellWait = resolve;
                set({ pendingShell: { command } });
              }),
          },
        });
        if (get().streamingId === asstId) {
          set({ streamingId: null, pendingShell: null });
        }
        const s = get();
        persistTurn({
          id: s.sessionId,
          createdAt: s.sessionCreatedAt,
          modelKey: s.modelKey,
          mode: s.mode,
          rows: s.rows,
        });
      } catch (err: unknown) {
        if (signal.aborted) {
          return;
        }
        set((s) => ({
          streamingId: null,
          pendingShell: null,
          rows: [
            ...s.rows.filter((row) => row.id !== asstId),
            { id: nextId(), kind: "error", text: friendlyLlmError(err, entry.baseURL) },
          ],
        }));
        const s = get();
        persistTurn({
          id: s.sessionId,
          createdAt: s.sessionCreatedAt,
          modelKey: s.modelKey,
          mode: s.mode,
          rows: s.rows,
        });
      }
    })();
  },

  cancelStream: () => {
    if (!get().streamingId) {
      return;
    }
    abortTurn();
    set({ streamingId: null, pendingShell: null });
    get().addNotice("Turn cancelled");
  },

  openModelPicker: () => {
    set({ modelPickerOpen: true });
  },

  closeModelPicker: () => {
    set({ modelPickerOpen: false });
  },

  openSessionPicker: () => {
    set({ sessionPickerOpen: true, modelPickerOpen: false });
  },

  closeSessionPicker: () => {
    set({ sessionPickerOpen: false });
  },

  loadSession: (session) => {
    abortTurn();
    set({
      sessionId: session.id,
      sessionCreatedAt: session.createdAt,
      rows: session.rows,
      mode: session.mode,
      modelKey: session.modelKey,
      resolvedModelKey: null,
      streamingId: null,
      pendingShell: null,
      sessionPickerOpen: false,
    });
  },

  selectSession: (id) => {
    const session = readSession(id);
    if (!session) {
      get().addNotice(`No session ${id}`);
      set({ sessionPickerOpen: false });
      return;
    }
    get().loadSession(session);
    get().addNotice(`Resumed ${id}`);
  },

  resumeLatest: () => {
    const session = latestSession(process.cwd());
    if (!session) {
      return false;
    }
    get().loadSession(session);
    return true;
  },

  selectModel: (key) => {
    if (key === "auto") {
      if (!autoEnabled(get().config)) {
        get().addNotice("Auto is disabled — set auto.fallback to a configured model");
        set({ modelPickerOpen: false });
        return;
      }
      try {
        writeLastModel("auto");
      } catch {
        get().addNotice("Could not write ~/.waytech-agent/state.json");
      }
      set({ modelKey: "auto", resolvedModelKey: null, modelPickerOpen: false });
      get().addNotice("Model: auto");
      return;
    }
    const entry = get().config.models[key];
    if (!entry) {
      get().addNotice(`Unknown model: ${key}`);
      set({ modelPickerOpen: false });
      return;
    }
    try {
      writeLastModel(key);
    } catch {
      get().addNotice("Could not write ~/.waytech-agent/state.json");
    }
    set({ modelKey: key, resolvedModelKey: null, modelPickerOpen: false });
    get().addNotice(`Model: ${key} (${entry.name})`);
  },

  applyFlagModel: (flag) => {
    if (!flag) {
      return;
    }
    const key = resolveModelKey(get().config, flag);
    set({ modelKey: key, resolvedModelKey: null });
  },

  applyFlagYolo: (on) => {
    set({ yolo: on });
  },

  resolveShell: (d) => {
    const fn = shellWait;
    shellWait = null;
    set({ pendingShell: null });
    fn?.(d);
  },

  applyFlagMode: (flag) => {
    if (!flag) {
      return;
    }
    const x = flag.toLowerCase();
    const mode: AgentMode | undefined =
      x === "plan" ? "Plan" : x === "ask" ? "Ask" : x === "agent" ? "Agent" : undefined;
    if (mode) {
      set({ mode });
    }
  },

  setInitialPrompt: (text) => {
    set({ initialPrompt: text });
  },

  consumeInitialPrompt: () => {
    const text = get().initialPrompt;
    if (text) {
      set({ initialPrompt: undefined });
    }
    return text;
  },

  runCommand: (name, exit) => {
    switch (name) {
      case "/quit":
      case "/exit":
        abortTurn();
        exit();
        return;
      case "/help":
        get().addNotice(HELP_TEXT);
        return;
      case "/clear":
        get().clearChat();
        return;
      case "/mode":
        get().cycleMode();
        return;
      case "/model":
        if (modelChoices(get().config).length <= 1 && get().config.missing) {
          get().addNotice("No models. Copy config.json.example first.");
          return;
        }
        get().openModelPicker();
        return;
      case "/resume":
        if (listSessions(process.cwd()).length === 0) {
          get().addNotice("No saved sessions for this workspace");
          return;
        }
        get().openSessionPicker();
        return;
      case "/config": {
        const { config, modelKey, resolvedModelKey } = get();
        const displayKey = modelKey === "auto" ? (resolvedModelKey ?? "auto") : modelKey;
        const entry = config.models[displayKey];
        const lines = [
          `config: ${config.path}`,
          `model: ${modelKey}${modelKey === "auto" && resolvedModelKey ? ` → ${resolvedModelKey}` : ""}`,
          `baseURL: ${entry?.baseURL ?? "(none)"}`,
        ];
        get().addNotice(lines.join("\n"));
        return;
      }
      case "/compact": {
        if (get().streamingId) {
          get().addNotice("Wait for the current turn to finish before /compact");
          return;
        }
        const sumKey = summarizerModelKey(get().config);
        if (!sumKey) {
          get().addNotice("No summarizer model configured");
          return;
        }
        void (async () => {
          try {
            const result = await compactSession({
              config: get().config,
              sessionId: get().sessionId,
              rows: get().rows,
              force: true,
            });
            if (!result) {
              get().addNotice("Nothing to compact");
              return;
            }
            set({
              rows: [
                ...result.trimmedRows,
                {
                  id: nextId(),
                  kind: "notice",
                  text: `Compacted session → ${result.memoryPath}`,
                },
              ],
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            get().addError(`Compact failed: ${msg}`);
          }
        })();
        return;
      }
      default:
        get().addNotice(`${name} is not implemented`);
    }
  },
}));
