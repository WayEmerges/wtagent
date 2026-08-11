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
pnpm build
pnpm link --global
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

## Config example

See `config.json.example`. Shape:

```json
{
  "defaultModel": "auto",
  "auto": {
    "orchestrator": "router",
    "fallback": "main"
  },
  "models": {
    "main": {
      "name": "Local Main",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "local",
      "model": "actual-upstream-model-id",
      "contextLength": 32768,
      "roles": ["chat", "agent"]
    }
  }
}
```

Replace `baseURL` and `model` with values from **your** local server. This project does not assume Docker hostnames.

## License

MIT
