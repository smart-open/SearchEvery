#!/usr/bin/env bash
set -euo pipefail

# SearchEvery - One-click Build Script (Unix)
# 1) Kills lingering processes to avoid file locks
# 2) Builds the app with Tauri (produces installers under src-tauri/target/release/bundle)

cd "$(dirname "$0")"

# Kill possible running executables (ignore errors)
pkill -f "SearchEvery" || true
pkill -f "search-everywhere-tauri" || true

echo "Building with Tauri..."
npx tauri build

echo
echo "Build succeeded. Installers are located at:"
echo "  $(pwd)/src-tauri/target/release/bundle/msi"
echo "  $(pwd)/src-tauri/target/release/bundle/nsis"