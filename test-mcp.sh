#!/bin/bash

echo "Testing JIRA MCP Server..."
echo "Listing available tools..."

npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/list

echo ""
echo "Testing get_issue tool with a sample issue..."
echo "(This will fail if the issue doesn't exist, which is expected in a test)"

npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_get_issue --tool-arg issue_key=FLOP-1

echo ""
echo "Test completed."