# wtagent

CLI binary: **`wtagent`**

An open-source interactive TUI for talking to **your** locally hosted OpenAI-compatible models (Ollama, llama.cpp, vLLM, LM Studio, LiteLLM, and similar).

**Not affiliated with Anysphere, Cursor, or the Cursor CLI.** This is an independent lookalike of the *interaction style* (layout, keybindings, slash commands), not a clone of Cursor’s source or cloud product.

## Requirements

- Node.js 22+ (npm comes with it)
- Linux or macOS

## Install

On this machine or any other:

```bash
curl -fsSL https://raw.githubusercontent.com/WayEmerges/wtagent/main/install.sh | bash
```

That installs into `~/.local/share/wtagent`, puts `wtagent` on `~/.local/bin`, and seeds `~/.waytech-agent/config.json` from `config.json.example` (placeholder `YOUR_HOST` baseURLs). Reinstalls merge any *missing* keys (e.g. `brain` / `coder` / `summarizer` / `auto`) into an existing config without overwriting your real `baseURL` values. Replace `YOUR_HOST` with your server.

From a local checkout:

```bash
bash install.sh
```

Config path can be overridden with `WTAGENT_CONFIG`. Env overrides (win over file):

- `WTAGENT_BASE_URL`
- `WTAGENT_API_KEY`
- `WTAGENT_MODEL` (upstream model id **or** config key)

## Run

```bash
npm run build
npm link
wtagent
```

```bash
wtagent
wtagent "initial prompt"
wtagent -p "prompt"
wtagent --model <id>
wtagent --mode plan|ask|agent
wtagent --list-models
wtagent --workspace <dir>
wtagent resume
wtagent ls
```

## Phase I — Auto, GPU lease, memory

### Auto

Select **Auto** in `/model` (or `"defaultModel": "auto"`) when `auto.fallback` points at a real model key. Each turn is routed to `brain` / `coder` (or your role keys) via mode + heuristics; optional `auto.orchestrator` can refine. The picker stays on Auto; the footer shows `auto → coder` (etc.).

### GPU lease

Inference is serialized with a process-local lease (optional lockfile at `lease.lockPath`). Default adapter is `noop` — mutex only; you keep the right weights loaded on the host. Cancel always releases the lease.

### Memory compaction

When estimated prompt tokens reach `contextLength × memory.threshold` (default 0.75), wtagent:

1. Summarizes the session (summarizer model, or fallback)
2. Appends to `~/.waytech-agent/memory/{workspaceHash}/MEMORY.md`
3. Clears the live transcript (default `keepRecentMessages: 0`)
4. Injects a bounded tail of `MEMORY.md` into later system prompts

Force with `/compact`. Set a low `contextLength` or `memory.threshold` to test.

### Skills (prompt packs)

Toggleable instruction packs injected into the system prompt. Bundled **caveman** = terse replies.

```text
/skill list
/caveman          # on (full)
/caveman lite|full|ultra
/caveman off
/skill on <id>
```

Add your own: `~/.waytech-agent/skills/<id>.md` then `/skill on <id>`. Active skills persist in `~/.waytech-agent/state.json`.

## Config example

See `config.json.example`. Shape:

```json
{
  "defaultModel": "auto",
  "auto": {
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
    "brain": {
      "name": "Brain",
      "baseURL": "http://YOUR_HOST:8001/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["chat", "plan"],
      "contextLength": 32768
    },
    "coder": {
      "name": "Coder",
      "baseURL": "http://YOUR_HOST:8001/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["agent", "code"],
      "contextLength": 32768
    },
    "summarizer": {
      "name": "Summarizer",
      "baseURL": "http://YOUR_HOST:8001/v1",
      "apiKey": "local",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
      "roles": ["summarize"],
      "contextLength": 32768
    }
  }
}
```

`brain`, `coder`, and `summarizer` may share the same upstream model id. Replace `YOUR_HOST` (and model id if needed) with **your** server values. Design notes: `docs/PHASE-I-IMPLEMENTATION.md`.

## License

MIT
