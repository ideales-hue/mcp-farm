# @mcp-farm/jira

MCP server for **Atlassian Jira** — search and manage issues, sprints, and projects from any MCP-compatible AI assistant.

## Installation

```bash
npm install -g @mcp-farm/jira
# or use directly with npx (no install needed):
npx @mcp-farm/jira
```

## Prerequisites

1. An Atlassian account with access to your Jira instance
2. An [Atlassian API Token](https://id.atlassian.com/manage-profile/security/api-tokens)

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | ✅ | Your Jira instance URL, e.g. `https://your-org.atlassian.net` |
| `JIRA_EMAIL` | ✅ | Your Atlassian account email |
| `JIRA_API_TOKEN` | ✅ | Your Atlassian API token |

## Claude Desktop Setup

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/jira"],
      "env": {
        "JIRA_BASE_URL": "https://your-org.atlassian.net",
        "JIRA_EMAIL": "you@yourorg.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_issues` | Search issues using JQL |
| `get_issue` | Get a full issue by key (e.g. FOO-123) |
| `create_issue` | Create a new issue |
| `update_issue` | Update fields or transition status |
| `add_comment` | Add a comment to an issue |
| `list_projects` | List all accessible projects |
| `get_sprint_issues` | Get issues in a board's active sprint |

## Example Prompts

- *"Show me all open critical bugs in the PLATFORM project"*
- *"Create a story in the APP project for the new login flow"*
- *"What's in the current sprint for board 42?"*
- *"Move FOO-456 to 'In Review' and assign it to me"*

## Required API Token Scopes

The token needs the following Jira scopes:
- `read:jira-work`
- `write:jira-work` (for create/update)
- `read:jira-user`
