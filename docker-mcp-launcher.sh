#!/bin/bash

# Exit on any error
set -e

# Store the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Create a log file
LOGFILE="$PROJECT_DIR/mcp-server.log"
touch "$LOGFILE"
echo "--------------------------------------------" >> "$LOGFILE"
echo "Starting JIRA MCP Server (Docker) at $(date)" >> "$LOGFILE"
echo "Current directory: $(pwd)" >> "$LOGFILE"

# Make sure the Docker container is running
echo "Checking Docker container status..." >> "$LOGFILE"
if ! docker ps -q -f name=jira-mcp >/dev/null; then
  echo "Container not running. Starting jira-mcp container..." >> "$LOGFILE"
  docker-compose up -d
  sleep 2 # Give it a moment to start
else
  echo "Container already running." >> "$LOGFILE"
fi

# Instead of attaching, use exec to connect to the container's stdio
echo "Connecting to container via exec..." >> "$LOGFILE"
exec docker exec -i jira-mcp node src/index.js 2>> "$LOGFILE"