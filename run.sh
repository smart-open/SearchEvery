#!/usr/bin/env bash
set -euo pipefail

# SearchEvery - Dev Run Script (Unix)
# 1) Kills lingering processes to avoid file locks
# 2) Starts Tauri dev (auto-runs `npm run dev` for Vite frontend)

cd "$(dirname "$0")"

# Kill possible running executables (ignore errors)
pkill -f "SearchEvery" || true
pkill -f "search-everywhere-tauri" || true

exec npx tauri dev