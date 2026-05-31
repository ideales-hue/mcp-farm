# Security Guide

## Credential Management

### Never hard-code credentials

All MCP Farm servers read credentials **exclusively from environment variables**. Never commit credentials to source control.

### Recommended: Use a secrets manager

For production and team deployments, inject credentials from a secrets manager:

#### HashiCorp Vault
```bash
export JIRA_API_TOKEN=$(vault kv get -field=api_token secret/jira)
npx @mcp-farm/jira
```

#### AWS Secrets Manager
```bash
export JIRA_API_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id prod/jira/api-token --query SecretString --output text)
```

#### `.env` files (development only)
Use [dotenv](https://www.npmjs.com/package/dotenv) locally, and ensure `.env` is in `.gitignore`.

---

## Principle of Least Privilege

Each MCP server only needs read/write access to its own system. Use the minimum required permissions:

### Jira / Confluence
- Create a **dedicated service account** for MCP Farm
- Assign only necessary project permissions
- Use a **scoped API token** (not your personal admin token)

### BMC Remedy / CMDB
- Use a **read-only account** if only querying (recommended default)
- For write operations, create a dedicated integration account
- Audit all API access via Remedy audit logs

### Splunk
- Create a **dedicated Splunk role** with access to required indexes only
- Use a **token** scoped to the role (not username/password)
- Restrict token to specific source IPs if possible

### Dynatrace
- Generate an API token with only required scopes:
  - `problems.read`, `entities.read`, `metrics.read` (read only)
  - `events.ingest` only if writing events
- Tokens are revocable per-environment

---

## Network Security

- All MCP Farm servers communicate over **HTTPS** only
- Validate SSL certificates — do not disable TLS verification
- Consider deploying behind a **reverse proxy** with IP allowlisting for on-premises BMC/Splunk endpoints

---

## Audit & Compliance

- All API calls made by MCP servers appear in each system's own audit logs
- Tag your service accounts with `mcp-farm` for easy filtering
- Rotate API tokens on a schedule (quarterly recommended)

---

## Reporting Vulnerabilities

If you discover a security issue in MCP Farm, please email **security@your-org.com** rather than opening a public issue. See [SECURITY.md](../SECURITY.md).
