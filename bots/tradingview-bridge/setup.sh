#!/usr/bin/env bash
# Installs tradingview-mcp next to this folder and relaunches TradingView Desktop with the debug port. macOS/Linux.
set -euo pipefail
DIR="${1:-$HOME/tradingview-mcp}"
command -v node >/dev/null || { echo "Install Node.js 18+ first: https://nodejs.org"; exit 1; }
if [ ! -f "$DIR/package.json" ]; then
  git clone https://github.com/tradesdontlie/tradingview-mcp "$DIR"
fi
( cd "$DIR" && npm install )
if [[ "$OSTYPE" == darwin* ]]; then
  osascript -e 'quit app "TradingView"' || true; sleep 2
  open -a "TradingView" --args --remote-debugging-port=9222
fi
echo
echo "Add this to claude_desktop_config.json under mcpServers (merge, do not overwrite):"
echo "  \"tradingview\": { \"command\": \"node\", \"args\": [\"$DIR/src/server.js\"] }"
