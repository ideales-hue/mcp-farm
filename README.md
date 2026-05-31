# 🌾 MCP Farm — Enterprise Tool Integrations

**Model Context Protocol (MCP) servers for enterprise tooling.**  
Connect AI assistants (Claude, Cursor, Copilot, etc.) directly to your organization's core platforms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-1.0-blue.svg)](https://modelcontextprotocol.io)

---

## 📦 Available MCP Servers

| Package | Description | npm |
|---------|-------------|-----|
| [`@mcp-farm/confluence`](./packages/confluence-mcp) | Atlassian Confluence — spaces, pages, search | [![npm](https://img.shields.io/npm/v/@mcp-farm/confluence)](https://npmjs.com/package/@mcp-farm/confluence) |
| [`@mcp-farm/jira`](./packages/jira-mcp) | Atlassian Jira — issues, sprints, projects | [![npm](https://img.shields.io/npm/v/@mcp-farm/jira)](https://npmjs.com/package/@mcp-farm/jira) |
| [`@mcp-farm/github`](./packages/github-mcp) | GitHub — repos, issues, PRs, Actions, releases | [![npm](https://img.shields.io/npm/v/@mcp-farm/github)](https://npmjs.com/package/@mcp-farm/github) |
| [`@mcp-farm/bitbucket`](./packages/bitbucket-mcp) | Bitbucket Cloud & Server — repos, PRs, Pipelines | [![npm](https://img.shields.io/npm/v/@mcp-farm/bitbucket)](https://npmjs.com/package/@mcp-farm/bitbucket) |
| [`@mcp-farm/bmc-remedy`](./packages/bmc-remedy-mcp) | BMC Remedy — incidents, changes, work orders | [![npm](https://img.shields.io/npm/v/@mcp-farm/bmc-remedy)](https://npmjs.com/package/@mcp-farm/bmc-remedy) |
| [`@mcp-farm/bmc-cmdb`](./packages/bmc-cmdb-mcp) | BMC CMDB — CIs, relationships, asset discovery | [![npm](https://img.shields.io/npm/v/@mcp-farm/bmc-cmdb)](https://npmjs.com/package/@mcp-farm/bmc-cmdb) |
| [`@mcp-farm/splunk`](./packages/splunk-mcp) | Splunk — search, alerts, dashboards, indexes | [![npm](https://img.shields.io/npm/v/@mcp-farm/splunk)](https://npmjs.com/package/@mcp-farm/splunk) |
| [`@mcp-farm/dynatrace`](./packages/dynatrace-mcp) | Dynatrace — problems, entities, metrics, SLOs | [![npm](https://img.shields.io/npm/v/@mcp-farm/dynatrace)](https://npmjs.com/package/@mcp-farm/dynatrace) |

---

## 🚀 Quick Start

### Install a single server

```bash
npm install @mcp-farm/jira
```

### Install all servers

```bash
npm install @mcp-farm/confluence @mcp-farm/jira @mcp-farm/github @mcp-farm/bitbucket @mcp-farm/bmc-remedy @mcp-farm/bmc-cmdb @mcp-farm/splunk @mcp-farm/dynatrace
```

### Configure in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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
    },
    "confluence": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/confluence"],
      "env": {
        "CONFLUENCE_BASE_URL": "https://your-org.atlassian.net/wiki",
        "CONFLUENCE_EMAIL": "you@yourorg.com",
        "CONFLUENCE_API_TOKEN": "your-api-token"
      }
    },
    "splunk": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/splunk"],
      "env": {
        "SPLUNK_BASE_URL": "https://splunk.yourorg.com:8089",
        "SPLUNK_TOKEN": "your-splunk-hec-token"
      }
    },
    "dynatrace": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/dynatrace"],
      "env": {
        "DYNATRACE_BASE_URL": "https://your-env.live.dynatrace.com",
        "DYNATRACE_API_TOKEN": "your-dt-api-token"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token"
      }
    },
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/bitbucket"],
      "env": {
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      }
    },
    "bmc-remedy": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/bmc-remedy"],
      "env": {
        "REMEDY_BASE_URL": "https://remedy.yourorg.com",
        "REMEDY_USERNAME": "your-username",
        "REMEDY_PASSWORD": "your-password"
      }
    },
    "bmc-cmdb": {
      "command": "npx",
      "args": ["-y", "@mcp-farm/bmc-cmdb"],
      "env": {
        "CMDB_BASE_URL": "https://remedy.yourorg.com",
        "CMDB_USERNAME": "your-username",
        "CMDB_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## 🗺️ Architecture

```
mcp-farm/
├── packages/
│   ├── confluence-mcp/        # Atlassian Confluence MCP server
│   ├── jira-mcp/              # Atlassian Jira MCP server
│   ├── bmc-remedy-mcp/        # BMC Remedy ITSM MCP server
│   ├── bmc-cmdb-mcp/          # BMC CMDB MCP server
│   ├── splunk-mcp/            # Splunk MCP server
│   └── dynatrace-mcp/         # Dynatrace MCP server
├── shared/
│   ├── auth/                  # Shared auth helpers (Basic, Bearer, OAuth)
│   ├── utils/                 # Shared utilities (pagination, retry, errors)
│   └── types/                 # Shared TypeScript types
├── docs/                      # Extended documentation
└── scripts/                   # Dev & release scripts
```

Each package is:
- **Self-contained** — install just what you need
- **Zero-dependency runtime** (uses the MCP SDK only)
- **Typed** — full TypeScript definitions
- **Tested** — unit + integration test suites

---

## 🔐 Security & Credentials

All credentials are passed via environment variables — **never hard-coded**.

For production deployments, use a secrets manager:
- [HashiCorp Vault](https://www.vaultproject.io/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [Azure Key Vault](https://azure.microsoft.com/en-us/products/key-vault)

See [docs/security.md](./docs/security.md) for best practices.

---

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/your-org/mcp-farm.git
cd mcp-farm

# Install all dependencies
npm install

# Build all packages
npm run build

# Run all tests
npm test

# Run a specific server locally
cd packages/jira-mcp
npm run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full contribution guidelines.

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
