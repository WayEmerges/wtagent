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

That installs into `~/.local/share/wtagent`, puts `wtagent` on `~/.local/bin`, and creates `~/.waytech-agent/config.json` if you do not already have one. Edit that config with **your** server `baseURL` and model id.

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

## Config example

See `config.json.example`. Shape:

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

`brain`, `coder`, and `summarizer` may share the same upstream model id. Replace `baseURL` / `model` with **your** server values. Design notes: `docs/PHASE-I-IMPLEMENTATION.md`.

## License

MIT
