#!/usr/bin/env bash
# Install wtagent (Linux / macOS).
#   curl -fsSL https://raw.githubusercontent.com/WayEmerges/wtagent/main/install.sh | bash
set -euo pipefail

REPO="${WTAGENT_REPO:-WayEmerges/wtagent}"
REF="${WTAGENT_REF:-main}"
INSTALL_ROOT="${WTAGENT_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/wtagent}"
BIN_DIR="${WTAGENT_BIN:-$HOME/.local/bin}"
CONFIG_DIR="${WTAGENT_CONFIG_DIR:-$HOME/.waytech-agent}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "wtagent installer: missing '$1'" >&2
    exit 1
  fi
}

node_major() {
  local v
  v="$(node -v 2>/dev/null || true)"
  v="${v#v}"
  echo "${v%%.*}"
}

ensure_path() {
  mkdir -p "$BIN_DIR"
  case ":$PATH:" in
    *":$BIN_DIR:"*) return 0 ;;
  esac
  local line='export PATH="$HOME/.local/bin:$PATH"'
  local rc
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$rc" ] && grep -q '.local/bin' "$rc" 2>/dev/null; then
      return 0
    fi
  done
  if [ -f "$HOME/.zshrc" ]; then
    rc="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    rc="$HOME/.bashrc"
  else
    rc="$HOME/.profile"
  fi
  printf '\n# wtagent\n%s\n' "$line" >> "$rc"
  echo "Added ~/.local/bin to PATH in $rc (open a new terminal if 'wtagent' is not found)."
}

write_wrapper() {
  local root="$1"
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/wtagent" <<EOF
#!/bin/sh
exec node "$root/dist/index.js" "\$@"
EOF
  chmod +x "$BIN_DIR/wtagent"
}

seed_config() {
  mkdir -p "$CONFIG_DIR"
  if [ ! -f "$CONFIG_DIR/config.json" ]; then
    if [ -f "$1/config.json.example" ]; then
      cp "$1/config.json.example" "$CONFIG_DIR/config.json"
      echo "Wrote $CONFIG_DIR/config.json — edit baseURL and model for your server."
    fi
  fi
}

echo "Installing wtagent…"

need curl
need tar
need node
need npm

major="$(node_major)"
if [ -z "$major" ] || [ "$major" -lt 22 ]; then
  echo "wtagent installer: Node.js 22+ is required (found $(node -v 2>/dev/null || echo none))." >&2
  exit 1
fi

tmp="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT

src=""
# Local tree when running: bash install.sh  (not curl | bash)
if [ -f "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/package.json" ]; then
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "Using local source $src"
  mkdir -p "$tmp/src"
  tar -C "$src" --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -C "$tmp/src" -xf -
  src="$tmp/src"
else
  url="https://github.com/${REPO}/archive/refs/heads/${REF}.tar.gz"
  echo "Downloading $url"
  if ! curl -fsSL "$url" | tar -xz -C "$tmp"; then
    echo "wtagent installer: download failed. Check $REPO and that the repo is public (or set WTAGENT_REPO)." >&2
    exit 1
  fi
  src="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

if [ ! -f "$src/package.json" ]; then
  echo "wtagent installer: package.json missing in source" >&2
  exit 1
fi

echo "Installing dependencies…"
(
  cd "$src"
  npm install
  npm run build
)

if [ ! -f "$src/dist/index.js" ]; then
  echo "wtagent installer: build did not produce dist/index.js" >&2
  exit 1
fi
chmod +x "$src/dist/index.js"

ver="$(node -p "require('$src/package.json').version" 2>/dev/null || echo 0.0.0)"
dest="$INSTALL_ROOT/versions/$ver"
mkdir -p "$INSTALL_ROOT/versions"
rm -rf "$dest"
mkdir -p "$dest"
tar -C "$src" --exclude=.git -cf - . | tar -C "$dest" -xf -

ln -sfn "$dest" "$INSTALL_ROOT/current"
write_wrapper "$INSTALL_ROOT/current"
seed_config "$dest"
ensure_path

echo
echo "wtagent $ver installed."
echo "  binary:  $BIN_DIR/wtagent"
echo "  files:   $INSTALL_ROOT/current"
echo "  config:  $CONFIG_DIR/config.json"
echo
echo "Run:  wtagent"
