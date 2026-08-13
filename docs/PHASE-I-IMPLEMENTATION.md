# Phase I — AUTO orchestrator, GPU lease, persistent memory

**Audience:** an LLM (or human) implementing this in the `wtagent` repo.  
**Repo:** `/home/thinktech/wtagent` (CLI binary `wtagent`).  
**Constraint:** do not invent a parallel product; extend this codebase. Do not integrate OpenClaw for Phase I.

---

## 1. Mission

Ship a Cursor-like local agent workflow where:

1. **AUTO** classifies each user turn and routes it to the correct role-model.
2. **GPU lease** ensures only one heavy model owns the GPUs at a time (no concurrent VRAM fights, no Docker recreate churn as the happy path).
3. **Summarizer + markdown memory** compact the session before context OOM, and persist that summary for later turns/sessions.

Baseline roles (config keys are examples; keep them configurable):

| Role key (example) | Purpose |
|--------------------|---------|
| `router` / orchestrator | Cheap classify → which role handles this turn |
| `brain` / `main` | Q&A, codebase questions, planning, general answers |
| `coder` | Agent tool loop: edit, shell, build |
| `summarizer` | Compress session → markdown persistent memory |

Hardware context (do not hardcode device IDs in app logic; document assumptions):

- Dual 32GB Radeon Pro cards, vLLM behind OpenAI-compatible `/v1`
- Typical pattern today: one AWQ ~32B fits on one GPU; remainder is KV/context
- Inference may stay in a long-lived Docker/vLLM process; `wtagent` orchestrates *which model is active*

---

## 2. Non-goals (Phase I)

- OpenClaw / multi-channel gateways
- Keeping all three heavy models loaded at once
- Spinning Docker containers up/down per role switch (allowed only as an optional *adapter*, not the default)
- Cloud Cursor SDK / `cursor-agent` backends
- Perfect ML routing; heuristics + small router are enough
- Rewriting the TUI look-and-feel

---

## 3. Current codebase (ground truth)

Read these before changing anything:

| Area | Path | Notes |
|------|------|--------|
| Config | `src/config/load.ts` | Already has `auto.orchestrator`, `auto.fallback`, `models.*.roles`, `contextLength`. Auto choice is **disabled**. |
| Config example | `config.json.example` | Shows `auto`, `router`, `main`, `coder`. Extend with `summarizer`, lease, memory paths. |
| Turn loop | `src/llm/turn.ts` | Single `modelKey` per turn; tool loop; no lease; no compaction. |
| Stream / usage | `src/llm/stream.js` + `estimateTokens` | Footer already can show usage vs `contextLength`. |
| Store / AUTO | `src/state/store.ts` | Auto selectable when `auto.fallback` resolves; routes each turn. |
| Sessions | `src/sessions/store.ts` | JSON sessions under `~/.waytech-agent/sessions/`. |
| UI | `src/ui/*` | Model picker, footer context bar, slash palette. |

**Do not** leave Auto as a dead stub once Phase I lands. Enable it end-to-end.

---

## 4. Target architecture

```
User turn
   │
   ▼
┌─────────────────┐
│ AUTO router     │  (heuristics and/or tiny orchestrator model)
│ → role key      │  brain | coder | summarizer | (passthrough)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GPU lease       │  acquire(role) → ensureActiveModel(role) → run → release
│ (process mutex) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Inference       │  OpenAI-compatible baseURL(s) from config
│ (vLLM / etc.)   │  Prefer weight swap / unload-load API over container recreate
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Context watchdog│  if usage >= threshold → lease summarizer → write MEMORY.md
│                 │  → shrink live history → resume with brain/coder as needed
└─────────────────┘
```

### Separation of concerns

1. **`src/orchestrator/`** — route turn → role model key (no GPU I/O).
2. **`src/gpu/`** (or `src/lease/`) — exclusive lease + “ensure this model is the active backend”.
3. **`src/memory/`** — compaction trigger, summarizer prompt, markdown append, history trim.
4. **`src/llm/turn.ts` + `src/state/store.ts`** — wire the above into the existing agent loop; keep UI thin.

---

## 5. GPU lease — exact behavior

### What it is

A **process-local exclusive lock** (and optional cross-process lock via file lock under `~/.waytech-agent/`) that:

1. Serializes heavy inference so only one role “owns” the GPUs.
2. Before inference for role R, calls an **ensure-active** hook so the backend is serving R’s upstream model id.
3. After the turn (or after idle timeout), **releases** so another role can acquire.

### API contract (implement something equivalent)

```ts
type LeaseRole = string; // config model key, e.g. "brain" | "coder" | "summarizer"

type GpuLease = {
  acquire(role: LeaseRole, signal?: AbortSignal): Promise<LeaseHandle>;
};

type LeaseHandle = {
  role: LeaseRole;
  release(): Promise<void>;
};
```

Rules:

- Nested acquire of the **same** role may be re-entrant (refcount) or no-op hold; document choice. Prefer refcount.
- Acquire of a **different** role while held must **wait** (queue), not fail hard, unless aborted.
- On abort/cancel stream: release the lease (always, in `finally`).
- Router / orchestrator classification should **not** take the heavy GPU lease if it uses CPU/heuristics or a dedicated always-on tiny endpoint. If the orchestrator model shares the same GPU backend, it must take the lease too (document in config).

### Ensure-active adapters (pluggable)

Config-driven; default = **noop** (assume operator already loaded the right model — matches today’s single-model vLLM).

Phase I must ship at least:

| Adapter | Behavior |
|---------|----------|
| `noop` | Lease is mutex only; no backend calls. |
| `http` | Optional hooks: `POST`/`GET` URLs for status, unload, load, or “set active model”. Timeouts + retries. |

Do **not** require Docker CLI in Phase I. If you add a `docker` adapter later, keep it behind the same interface.

**Critical:** lease mutex alone is valuable even when adapter is `noop` (prevents overlapping turns / future multi-client). Weight swapping can be operator-managed or added next.

### What success looks like

- Two rapid turns that would need different models never overlap inference.
- Switching roles never starts a second concurrent chat completion against a second loaded heavy model by accident.
- Cancel (`Esc` / abort) always frees the lease.

---

## 6. AUTO routing — exact behavior

### When `modelKey === "auto"`

For each **user** submit:

1. Determine target role/model key.
2. Run the turn with that resolved key (show resolved model in footer or a one-line notice).
3. Do not permanently overwrite user’s “Auto” selection; `lastModel` may stay `"auto"`.

### Routing priority (implement in this order)

1. **Explicit user override** — e.g. `/model coder` or a future `/role` — wins until switched back to Auto.
2. **Agent mode hint**
   - `Ask` / `Plan` → prefer `brain` (or first model with role `chat` / `plan`)
   - `Agent` + clear implementation intent → prefer `coder` (role `code` / `agent`)
3. **Heuristics** on the user text (cheap, no GPU): keywords like implement, fix, refactor, write tests → `coder`; explain, why, what is, review → `brain`.
4. **Orchestrator model** (optional): if `auto.orchestrator` is set and reachable, ask for a single-token/label answer: `brain` | `coder` | `summarizer`. Parse strictly; on failure use `auto.fallback`.
5. **Fallback** — `auto.fallback` (required when Auto enabled).

### Summarizer is not a normal AUTO target

Do not route ordinary questions to `summarizer`. Summarizer runs only from the **context watchdog** (or an explicit `/compact` slash command if you add one).

### Enable Auto in UI/config

- `modelChoices`: Auto `disabled: false` when config has `auto.fallback` resolving to a real model.
- Remove / replace `"Auto is disabled until Phase I"`.
- `--list-models` should not say disabled once enabled.

---

## 7. Context watchdog + persistent memory

### Trigger

Before sending a completion (and optionally after a tool iteration), estimate prompt tokens (existing `estimateTokens` / usage). If:

`promptTokens >= contextLength * threshold`  
(default threshold **0.75**, configurable)

then:

1. Acquire lease for `summarizer` (or `brain` if no summarizer configured).
2. Summarize: goals, decisions, files touched, commands run, open TODOs, useful facts.
3. Append to a markdown file (see paths below).
4. Trim in-memory transcript / messages to empty by default (`keepRecentMessages: 0` — clear all after summary; mid-turn keeps only the active user+assistant). Set `keepRecentMessages` > 0 to retain the last N content messages instead.
5. Release lease; continue the original turn with the role that was going to run (re-acquire as needed).
6. Surface a short notice in the TUI: `Compacted session → ~/.waytech-agent/memory/...`

### Markdown memory layout

Suggested paths (all under `~/.waytech-agent/` unless overridden):

```
memory/
  {workspaceHash}/
    MEMORY.md          # rolling persistent memory for this workspace
    sessions/
      {sessionId}.md   # optional per-session appendix
```

Each compaction appends a dated section:

```markdown
## Compacted 2026-08-13T05:40:00Z (session abc123)

- ...
```

On later turns in the same workspace, inject a bounded prefix from `MEMORY.md` into the system prompt or as a synthetic system/user context block (cap size, e.g. last **4k–8k** tokens worth of characters).

### OOM policy

- Prefer compaction **before** the request that would OOM.
- If the server still returns context/OOM errors, catch, compact once, retry **once**, then surface the error.

---

## 8. Config schema (extend, keep backward compatible)

Update `config.json.example` and `src/config/load.ts` types/parsing.

```json
{
  "defaultModel": "auto",
  "auto": {
    "orchestrator": "router",
    "fallback": "brain",
    "threshold": 0.75
  },
  "lease": {
    "adapter": "noop",
    "lockPath": "~/.waytech-agent/gpu.lock",
    "acquireTimeoutMs": 600000
  },
  "memory": {
    "enabled": true,
    "dir": "~/.waytech-agent/memory",
    "threshold": 0.75,
    "keepRecentMessages": 0,
    "summarizer": "summarizer",
    "injectChars": 12000
  },
  "models": {
    "router": {
      "name": "Router",
      "baseURL": "http://127.0.0.1:8081/v1",
      "apiKey": "local",
      "model": "small-router",
      "roles": ["orchestrator"],
      "contextLength": 8192
    },
    "brain": {
      "name": "Brain",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["chat", "plan"],
      "contextLength": 65536
    },
    "coder": {
      "name": "Coder",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["agent", "code"],
      "contextLength": 65536
    },
    "summarizer": {
      "name": "Summarizer",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["summarize"],
      "contextLength": 65536
    }
  }
}
```

Notes:

- `brain` and `coder` may share the same upstream model id initially; routing still matters for prompts/tools/policy and for future different weights.
- Same `baseURL` + different `model` ids is the signal for ensure-active adapters later.
- Missing `memory` / `lease` blocks → safe defaults (`memory.enabled` true only if summarizer or fallback exists; lease `noop`).

---

## 9. Implementation order (do this sequence)

Complete and verify each step before the next.

### Step A — Config + types

- Extend `LoadedConfig` / parsers.
- Update `config.json.example`.
- No behavior change yet except parsing.

**Done when:** `loadConfig()` returns lease/memory/auto fields; invalid configs fail softly with `invalid` message.

### Step B — GPU lease module

- Implement mutex (+ optional file lock).
- Wire `runAgentTurn` (or store submit path) to `acquire` / `release` in `try/finally`.
- Adapter `noop` only.

**Done when:** overlapping submits cannot run two completions at once; cancel releases lease.

### Step C — Enable AUTO routing

- Implement `src/orchestrator/route.ts` (heuristics + fallback; optional orchestrator call).
- Enable Auto in picker / store / `--list-models`.
- Resolve Auto → concrete model key before `runAgentTurn`.
- Show resolved role in UI (footer or notice).

**Done when:** with Auto selected, Ask-style questions go to brain; “implement X” in Agent mode goes to coder; failures use fallback.

### Step D — Memory compaction

- Watchdog using `contextLength` + threshold.
- Summarizer call under lease.
- Append markdown; trim history; inject memory on later turns.
- Optional `/compact` slash command (nice-to-have in Phase I).

**Done when:** artificially low `contextLength` in config triggers compaction; `MEMORY.md` grows; session continues without OOM in the happy path.

### Step E — Polish + docs

- README short section: Auto, lease, memory paths.
- Slash help entries updated.
- Keep changes scoped; no drive-by refactors.

---

## 10. File touch list (expected)

Create:

- `src/gpu/lease.ts` (or `src/lease/gpu.ts`)
- `src/gpu/adapters/noop.ts` (+ optional `http.ts`)
- `src/orchestrator/route.ts`
- `src/memory/compact.ts`
- `src/memory/store.ts`
- `docs/PHASE-I-IMPLEMENTATION.md` (this file; update if design drifts)

Modify:

- `src/config/load.ts`
- `config.json.example`
- `src/llm/turn.ts`
- `src/state/store.ts`
- `src/ui/footer.tsx` (show Auto → resolved model)
- `src/ui/slash-palette.tsx` (if `/compact`)
- `README.md` (brief)

Avoid rewriting Ink UI components unless required for the above.

---

## 11. Testing checklist (manual is enough for Phase I)

1. Single model + `lease.adapter: noop` — existing agent chat still works.
2. Auto + heuristics — Ask vs Agent implement paths pick different config keys (even if same upstream model).
3. Spam Enter on two prompts — second waits; no overlapping streams.
4. Cancel mid-stream — next prompt works (lease not stuck).
5. Set `memory.threshold` to `0.01` and short `contextLength` — compaction runs; markdown file created; chat continues.
6. Resume session — memory inject does not blow context (bounded).
7. `pnpm build` succeeds; no new deps unless necessary (prefer Node builtins for file lock).

---

## 12. Coding rules for the implementing LLM

- Match existing style: TypeScript ESM, `.js` import suffixes, Zustand store, Ink TUI.
- Prefer small pure modules with clear exports over a god-file.
- Every async path that acquires a lease must `release` in `finally`.
- Do not break non-Auto single-model users.
- Do not commit secrets; config stays local under `~/.waytech-agent/`.
- Do not add OpenClaw, Docker orchestration, or cloud providers in Phase I.
- Do not create extra markdown docs beyond updating README + this file if needed.
- After implementation, run `pnpm build` and fix type errors.

---

## 13. Definition of done (Phase I)

- [x] Auto is selectable and routes turns to brain vs coder using heuristics + fallback (orchestrator model optional).
- [x] GPU lease serializes inference; cancel-safe; `noop` adapter default.
- [x] Context watchdog compacts via summarizer (or fallback) and appends workspace `MEMORY.md`.
- [x] Live history is cleared after compaction (default); later turns get a bounded memory inject.
- [x] `config.json.example` and README describe the new fields.
- [x] `pnpm build` / `npm run build` passes.

---

## 14. Out of scope follow-ups (do not do now unless blocked)

- Real vLLM weight-swap HTTP adapter tuned to the user’s Docker setup
- Cross-machine lease / Redis
- Multi-GPU pin maps in config
- Embedding-based memory retrieval
- OpenClaw as a channel frontend

When Phase I is done, the next doc should cover **ensure-active HTTP adapter** against the user’s long-lived vLLM container (load/unload without recreate).

---

## 15. Prompt stub for the implementing session

Paste this to start implementation:

> Implement Phase I as specified in `docs/PHASE-I-IMPLEMENTATION.md`. Follow the step order A→E. Do not integrate OpenClaw. Keep backward compatibility for single-model configs. Run `pnpm build` when done and summarize what changed.
