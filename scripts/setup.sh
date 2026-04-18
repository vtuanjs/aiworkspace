#!/usr/bin/env bash
set -euo pipefail

# Bootstrap: install Rust, deps, env

echo "==> Checking Rust..."
if ! command -v rustup &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

echo "==> Checking Node..."
if ! command -v node &>/dev/null; then
  echo "Node.js is required. Install from https://nodejs.org"
  exit 1
fi

echo "==> Installing npm dependencies..."
npm install

echo "==> Done. Run 'npm run tauri dev' to start."
