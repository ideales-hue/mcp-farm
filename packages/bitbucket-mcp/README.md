# @mcp-farm/bitbucket

MCP server for **Bitbucket Cloud** and **Bitbucket Server / Data Center** — manage repos, pull requests, branches, commits, pipelines, and projects from any MCP-compatible AI assistant.

Auto-detects Cloud vs Server based on `BITBUCKET_BASE_URL`.

## Installation

```bash
npm install -g @mcp-farm/bitbucket
# or use directly with npx:
npx @mcp-farm/bitbucket
```

## Prerequisites

### Bitbucket Cloud
Create an **App Password** at [bitbucket.org/account/settings/app-passwords](https://bitbucket.org/account/settings/app-passwords) with:
- `Repositories: Read, Write`
- `Pull requests: Read, Write`
- `Pipelines: Read, Write` (if using Pipelines tools)

### Bitbucket Server / Data Center
Create a **Personal Access Token** in your profile settings under *Manage account → Personal access tokens*.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BITBUCKET_BASE_URL` | ❌ | Default: `https://api.bitbucket.org/2.0`. For Server: `https://bitbucket.yourorg.com/rest/api/1.0` |
| `BITBUCKET_USERNAME` | ✅ (Cloud) | Bitbucket username or email |
| `BITBUCKET_APP_PASSWORD` | ✅ (Cloud) | App password |
| `BITBUCKET_TOKEN` | ✅ (Server) | Personal Access Token |

## Claude Desktop Setup

### Bitbucket Cloud
```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/bitbucket"],
      "env": {
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

### Bitbucket Server / Data Center
```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/bitbucket"],
      "env": {
        "BITBUCKET_BASE_URL": "https://bitbucket.yourorg.com/rest/api/1.0",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

## Available Tools

### Repositories
| Tool | Description |
|------|-------------|
| `list_repos` | List repos in a workspace or project |
| `get_repo` | Get repository details |
| `create_repo` | Create a new repository |

### Pull Requests
| Tool | Description |
|------|-------------|
| `list_pull_requests` | List PRs by state |
| `get_pull_request` | Get PR details |
| `create_pull_request` | Create a PR |
| `merge_pull_request` | Merge a PR (merge commit, squash, fast-forward) |
| `add_pr_comment` | Comment on a PR |
| `approve_pull_request` | Approve a PR |

### Branches & Commits
| Tool | Description |
|------|-------------|
| `list_branches` | List branches (with optional filter) |
| `create_branch` | Create a branch |
| `list_commits` | List commits on a branch |

### Files & Source
| Tool | Description |
|------|-------------|
| `get_file_content` | Read a file's content |
| `list_directory` | Browse the file tree |

### Pipelines (Cloud only)
| Tool | Description |
|------|-------------|
| `list_pipelines` | List recent pipeline runs |
| `trigger_pipeline` | Trigger a pipeline on a branch |

### Workspaces & Projects
| Tool | Description |
|------|-------------|
| `list_workspaces` | List Cloud workspaces |
| `list_projects` | List projects in a workspace |

## Example Prompts

- *"Show all open PRs in the myworkspace/backend repo"*
- *"Create a PR from feature/login to main in myworkspace/frontend"*
- *"What pipelines are currently running in myworkspace/api?"*
- *"Trigger the deployment pipeline on the release branch"*
- *"List all branches in myproject/myrepo that contain 'hotfix'"*
