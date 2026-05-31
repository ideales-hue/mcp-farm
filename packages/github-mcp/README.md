# @mcp-farm/github

MCP server for **GitHub** — manage repositories, issues, pull requests, branches, files, Actions workflows, and releases from any MCP-compatible AI assistant.

Supports both **GitHub.com** and **GitHub Enterprise Server**.

## Installation

```bash
npm install -g @mcp-farm/github
# or use directly with npx:
npx @mcp-farm/github
```

## Prerequisites

A GitHub Personal Access Token (classic or fine-grained) from [github.com/settings/tokens](https://github.com/settings/tokens).

**Required scopes (classic token):**
- `repo` — full repository access
- `workflow` — trigger GitHub Actions
- `read:org` — list org repos

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | Personal Access Token or GitHub App installation token |
| `GITHUB_BASE_URL` | ❌ | GitHub Enterprise Server API URL, e.g. `https://github.yourorg.com/api/v3` |

## Claude Desktop Setup

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

For GitHub Enterprise:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "GITHUB_BASE_URL": "https://github.yourorg.com/api/v3"
      }
    }
  }
}
```

## Available Tools

### Repositories
| Tool | Description |
|------|-------------|
| `list_repos` | List repos for authenticated user or an org |
| `get_repo` | Get repo details |
| `create_repo` | Create a new repository |
| `search_repos` | Search repos using GitHub search syntax |

### Issues
| Tool | Description |
|------|-------------|
| `list_issues` | List issues (filterable by state, label, assignee) |
| `get_issue` | Get a specific issue |
| `create_issue` | Create a new issue |
| `update_issue` | Update title, body, state, labels, assignees |
| `add_issue_comment` | Add a comment |

### Pull Requests
| Tool | Description |
|------|-------------|
| `list_pull_requests` | List PRs (filterable by state, base, head) |
| `get_pull_request` | Get PR details including diff stats |
| `create_pull_request` | Create a PR |
| `merge_pull_request` | Merge (merge commit, squash, or rebase) |
| `list_pr_reviews` | List reviews on a PR |

### Branches & Commits
| Tool | Description |
|------|-------------|
| `list_branches` | List branches |
| `create_branch` | Create a branch from a ref |
| `list_commits` | List commits on a branch or path |

### Files & Contents
| Tool | Description |
|------|-------------|
| `get_file_content` | Read a file from the repo |
| `create_or_update_file` | Write or update a file (creates a commit) |

### GitHub Actions
| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows |
| `list_workflow_runs` | List recent runs |
| `trigger_workflow` | Trigger a `workflow_dispatch` workflow |

### Releases
| Tool | Description |
|------|-------------|
| `list_releases` | List releases |
| `create_release` | Create a release with tag and notes |

### Search & Misc
| Tool | Description |
|------|-------------|
| `search_code` | Search for code across repos |
| `list_collaborators` | List repository collaborators |

## Example Prompts

- *"List all open PRs in myorg/backend that target main"*
- *"Create a bug report issue in myorg/frontend with the label 'critical'"*
- *"What failed in the last CI run on the develop branch?"*
- *"Trigger the deploy workflow on the release/v2 branch"*
- *"Show me what changed in src/api/ over the last 20 commits"*
