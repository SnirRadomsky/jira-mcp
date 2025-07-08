# JIRA MCP Server for Cursor

A Model Context Protocol (MCP) server that integrates JIRA with Cursor AI, allowing you to interact with JIRA issues directly from Cursor.

## Features

- Get details about JIRA issues
- Search JIRA issues using JQL
- Create new JIRA issues
- Update existing JIRA issues
- Docker support for containerized execution
- Restart capability via MCP configuration
- Default JIRA project configuration via environment variable

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your JIRA credentials (see Configuration section below)

## Configuration

The following environment variables can be configured in the `env` file:

- `JIRA_BASE_URL`: Your Atlassian JIRA instance URL
- `JIRA_EMAIL`: Your JIRA account email
- `JIRA_API_TOKEN`: Your JIRA API token
- `DEFAULT_JIRA_PROJECT`: Default project key to use when creating issues (optional, currently set to "IDO")
- `PORT`: Port for the server to listen on
- `NODE_ENV`: Node environment (development/production)

## Usage

### Start the MCP server

#### Using Node.js directly:
```
npm start
```

Or for development with auto-restart:
```
npm run dev
```

#### Using Docker:
```
./docker-mcp-launcher.sh
```

### Configure Cursor

The global MCP configuration file is located at `~/.cursor/mcp.json` and has already been configured. It includes both the Docker launcher and restart options.

### Restarting the MCP Server

The MCP server can be restarted using the configured restart command in the MCP configuration. If needed, you can also manually restart it:

```
./restart-mcp.sh
```

### Available Tools

#### Get Issue Details

Gets detailed information about a specific JIRA issue.

Example in Cursor:
```
Can you get me the details for FLOP-2912?
```

#### Search Issues with JQL

Search for JIRA issues using JQL (JIRA Query Language).

Example in Cursor:
```
Find all in-progress issues in the FLOP project
```

#### Create a New Issue

Create a new JIRA issue with the specified properties. The `project_key` parameter is optional if `DEFAULT_JIRA_PROJECT` is set in the environment.

Example in Cursor:
```
Create a new bug in the FLOP project with the title "Login fails on Safari" and description "Users are unable to log in when using Safari browser version 16.0."
```

Or, using the default project:
```
Create a new bug with the title "Login fails on Safari" and description "Users are unable to log in when using Safari browser version 16.0."
```

#### Update an Issue

Update an existing JIRA issue with new values.

Example in Cursor:
```
Update FLOP-2912 to set the status to "Done"
```

## Testing

You can test the MCP server using the MCP Inspector:

### List available tools
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/list
```

### Get issue details
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_get_issue --tool-arg issue_key=FLOP-2912
```

### Search issues
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_search --tool-arg jql="project = FLOP AND status = 'In Progress'" --tool-arg max_results=3
```

### Create an issue
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_create_issue --tool-arg project_key=FLOP --tool-arg summary="Test issue from MCP" --tool-arg description="This is a test issue created via the JIRA MCP server"
```

Or using the default project:
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_create_issue --tool-arg summary="Test issue from MCP" --tool-arg description="This is a test issue created via the JIRA MCP server"
```

### Update an issue
```
npx @modelcontextprotocol/inspector --cli node src/index.js --method tools/call --tool-name jira_update_issue --tool-arg issue_key=FLOP-2912 --tool-arg status="Done"
```

## Docker

The MCP server can be run in a Docker container using the provided `Dockerfile` and `docker-compose.yml` files.

### Building and starting the container
```
docker-compose up --build -d
```

### Stopping the container
```
docker-compose down
```

### Viewing logs
```
docker logs jira-mcp
```

## Using with Cursor

Once the MCP server is running, you can use it in Cursor by:

1. Making sure Cursor is properly configured with the global MCP configuration
2. Accessing the Cursor AI and asking it to perform JIRA operations, like:
   - "Get details for FLOP-2912"
   - "Search for in-progress issues in the FLOP project"
   - "Create a new bug ticket in the FLOP project"
   - "Update the status of FLOP-2912 to 'Done'"

When Cursor wants to use one of the JIRA tools, it will ask for your approval before executing. You can review and approve the tool call to proceed.