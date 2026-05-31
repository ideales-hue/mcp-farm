# Configuration Reference

## Confluence

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFLUENCE_BASE_URL` | ✅ | e.g. `https://your-org.atlassian.net/wiki` |
| `CONFLUENCE_EMAIL` | ✅ | Atlassian account email |
| `CONFLUENCE_API_TOKEN` | ✅ | [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens) |

**Get an API token:** Log into Atlassian → Profile → Security → API tokens → Create API token

---

## Jira

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | ✅ | e.g. `https://your-org.atlassian.net` |
| `JIRA_EMAIL` | ✅ | Atlassian account email |
| `JIRA_API_TOKEN` | ✅ | [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens) |

Same API token works for both Jira and Confluence.

---

## BMC Remedy

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REMEDY_BASE_URL` | ✅ | — | e.g. `https://remedy.yourorg.com` |
| `REMEDY_USERNAME` | ✅ | — | Remedy username |
| `REMEDY_PASSWORD` | ✅ | — | Remedy password |
| `REMEDY_PORT` | ❌ | `8008` | Remedy REST API port |

**Auth:** The server exchanges username/password for a JWT token on first use and refreshes it every 50 minutes. This is standard Remedy REST API behavior (`/api/arsys/v1/jwt/login`).

**On-premises setup:** Ensure your Remedy server has the REST API plugin enabled. Contact your BMC admin if unsure.

---

## BMC CMDB

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CMDB_BASE_URL` | ✅ | — | Same as your Remedy server |
| `CMDB_USERNAME` | ✅ | — | CMDB/Remedy username |
| `CMDB_PASSWORD` | ✅ | — | CMDB/Remedy password |
| `CMDB_PORT` | ❌ | `8008` | REST API port |

CMDB uses the same AR System REST API as Remedy — they can share the same base URL and credentials.

---

## Splunk

| Variable | Required | Description |
|----------|----------|-------------|
| `SPLUNK_BASE_URL` | ✅ | e.g. `https://splunk.yourorg.com:8089` |
| `SPLUNK_TOKEN` | ✅ (recommended) | Splunk API token (Bearer auth) |
| `SPLUNK_USERNAME` | ✅ (alt) | Username if not using token |
| `SPLUNK_PASSWORD` | ✅ (alt) | Password if not using token |

**Create a Splunk token:**
1. Settings → Tokens → New Token
2. Assign a role with appropriate index access
3. Copy the token value

**Splunk Cloud:** Requires `SPLUNK_BASE_URL` to be your Search Head endpoint.

---

## Dynatrace

| Variable | Required | Description |
|----------|----------|-------------|
| `DYNATRACE_BASE_URL` | ✅ | e.g. `https://abc12345.live.dynatrace.com` |
| `DYNATRACE_API_TOKEN` | ✅ | Dynatrace API token with required scopes |

**Create a Dynatrace API token:**
1. Settings → Integration → Dynatrace API
2. Generate token with scopes:
   - `Read problems` (`problems.read`)
   - `Read entities` (`entities.read`)
   - `Read metrics` (`metrics.read`)
   - `Read logs` (`logs.read`) — for log search
   - `Read SLO` (`slo.read`)
   - `Read events` (`events.read`)
   - `Ingest events` (`events.ingest`) — only if needed

**Managed Dynatrace:** Use `https://your-server/e/{environment-id}` as the base URL.

---

## Environment File Example

For local development, create a `.env` file (add to `.gitignore`!):

```dotenv
# Atlassian
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@yourorg.com
JIRA_API_TOKEN=ATATT3x...

CONFLUENCE_BASE_URL=https://your-org.atlassian.net/wiki
CONFLUENCE_EMAIL=you@yourorg.com
CONFLUENCE_API_TOKEN=ATATT3x...

# BMC
REMEDY_BASE_URL=https://remedy.yourorg.com
REMEDY_USERNAME=svc_mcp
REMEDY_PASSWORD=secret
CMDB_BASE_URL=https://remedy.yourorg.com
CMDB_USERNAME=svc_mcp
CMDB_PASSWORD=secret

# Splunk
SPLUNK_BASE_URL=https://splunk.yourorg.com:8089
SPLUNK_TOKEN=eyJra...

# Dynatrace
DYNATRACE_BASE_URL=https://abc12345.live.dynatrace.com
DYNATRACE_API_TOKEN=dt0c01...
```
