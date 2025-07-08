#!/bin/sh

# Start the MCP server in the background
node src/index.js &

# Keep the container running with a tail on the log
echo "Container is running. Press Ctrl+C to stop."
tail -f /dev/null