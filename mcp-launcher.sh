#!/bin/bash

# Exit on any error
set -e 

# Store the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Define possible Node.js paths - you may need to adjust these
NODE_PATHS=(
  "/opt/homebrew/bin/node"  # Homebrew on Apple Silicon
  "/usr/local/bin/node"     # Homebrew on Intel Mac
  "/usr/bin/node"           # System Node.js
  "$HOME/.nvm/versions/node/v18.16.0/bin/node"  # Example NVM path (adjust version)
  "$HOME/.nvm/versions/node/v16.20.0/bin/node"  # Example NVM path (adjust version)
)

# Create a log file
LOGFILE="$PROJECT_DIR/mcp-server.log"
touch "$LOGFILE"
echo "--------------------------------------------" >> "$LOGFILE"
echo "Starting JIRA MCP Server at $(date)" >> "$LOGFILE"
echo "Current directory: $(pwd)" >> "$LOGFILE"

# Find the newest Node.js installation
NODE_PATH=""
for path in "${NODE_PATHS[@]}"; do
  if [ -x "$path" ]; then
    version=$("$path" --version | cut -d "v" -f 2 | cut -d "." -f 1)
    if [ "$version" -ge 14 ]; then
      NODE_PATH="$path"
      echo "Found Node.js at $NODE_PATH (version $($NODE_PATH --version))" >> "$LOGFILE"
      break
    fi
  fi
done

# Exit if no suitable Node.js found
if [ -z "$NODE_PATH" ]; then
  echo "ERROR: Could not find a suitable Node.js installation (v14 or newer)." >&2
  echo "ERROR: Could not find a suitable Node.js installation (v14 or newer)." >> "$LOGFILE"
  echo "Please install Node.js v14 or newer or adjust the NODE_PATHS in this script." >&2
  echo "Please install Node.js v14 or newer or adjust the NODE_PATHS in this script." >> "$LOGFILE"
  exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..." >&2
  echo "Installing dependencies..." >> "$LOGFILE"
  npm install >> "$LOGFILE" 2>&1
fi

# Ensure env is available (copy from example if not)
if [ ! -f "env" ] && [ -f "env.example" ]; then
  echo "Creating env from env.example" >&2
  echo "Creating env from env.example" >> "$LOGFILE"
  cp env.example env
fi

# Set environment variables
export NODE_ENV="production"
export DEBUG="mcp:*"

# Run the MCP server
echo "Starting MCP server..." >&2
echo "Starting MCP server with $NODE_PATH src/index.js" >> "$LOGFILE"
echo "--------------------------------------------" >> "$LOGFILE"

# Execute the Node.js script and redirect output to log file
exec "$NODE_PATH" src/index.js 2>> "$LOGFILE" | tee -a "$LOGFILE"