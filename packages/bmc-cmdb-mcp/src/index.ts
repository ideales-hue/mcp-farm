#!/usr/bin/env node
/**
 * @mcp-farm/bmc-cmdb
 * MCP server for BMC Atrium CMDB
 *
 * Environment variables:
 *   CMDB_BASE_URL  — e.g. https://remedy.yourorg.com
 *   CMDB_USERNAME  — CMDB/Remedy username
 *   CMDB_PASSWORD  — CMDB/Remedy password
 *   CMDB_PORT      — REST API port (default: 8008)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.CMDB_BASE_URL?.replace(/\/$/, "");
const USERNAME = process.env.CMDB_USERNAME;
const PASSWORD = process.env.CMDB_PASSWORD;
const PORT = process.env.CMDB_PORT ?? "8008";

if (!BASE_URL || !USERNAME || !PASSWORD) {
  console.error(
    "[mcp-farm/bmc-cmdb] Missing required env vars: CMDB_BASE_URL, CMDB_USERNAME, CMDB_PASSWORD"
  );
  process.exit(1);
}

const API_BASE = `${BASE_URL}:${PORT}/api/arsys/v1`;
let authToken: string | null = null;

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  if (authToken) return authToken;
  const res = await fetch(`${API_BASE}/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: USERNAME!, password: PASSWORD! }),
  });
  if (!res.ok) throw new Error(`CMDB auth failed: ${res.status}`);
  authToken = await res.text();
  setTimeout(() => { authToken = null; }, 50 * 60 * 1000);
  return authToken;
}

async function cmdbGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `AR-JWT ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`CMDB API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function cmdbPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `AR-JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CMDB API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/bmc-cmdb",
  version: "1.0.0",
});

// ── Tool: search_cis ──────────────────────────────────────────────────────────
server.tool(
  "search_cis",
  "Search Configuration Items (CIs) in the CMDB by class, name, or status",
  {
    ciClass: z
      .string()
      .optional()
      .describe("CI class name, e.g. BMC_ComputerSystem, BMC_ApplicationService"),
    name: z.string().optional().describe("CI name (partial match supported)"),
    status: z
      .enum(["Deployed", "In Repair", "Decommissioned", "End Of Life", "Ordered", "Being Assembled"])
      .optional(),
    limit: z.number().optional().default(25),
  },
  async ({ ciClass, name, status, limit }) => {
    const conditions: string[] = [];
    if (name) conditions.push(`'Name' LIKE "%${name}%"`);
    if (status) conditions.push(`'Status' = "${status}"`);

    const form = ciClass
      ? `AST:${ciClass.replace("BMC_", "")}`
      : "BMC.CORE:BMC_BaseElement";

    const q = conditions.length ? conditions.join(" AND ") : "'Status' = \"Deployed\"";

    const data = await cmdbGet(
      `/entry/${encodeURIComponent(form)}?q=${encodeURIComponent(q)}&limit=${limit}&fields=values(Name,Status,Description,InstanceId,ClassId,TokenId)`
    );

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_ci ──────────────────────────────────────────────────────────────
server.tool(
  "get_ci",
  "Get full details for a specific Configuration Item by its Instance ID",
  {
    instanceId: z.string().describe("CI Instance ID (e.g. OI-A1B2C3D4)"),
    ciClass: z.string().optional().default("BMC.CORE:BMC_BaseElement"),
  },
  async ({ instanceId, ciClass }) => {
    const form = ciClass!.includes(":") ? ciClass! : `BMC.CORE:${ciClass}`;
    const data = await cmdbGet(
      `/entry/${encodeURIComponent(form)}?q=${encodeURIComponent(`'InstanceId' = "${instanceId}"`)}&expand=all`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_ci_relationships ─────────────────────────────────────────────────
server.tool(
  "get_ci_relationships",
  "Get all relationships for a CI (upstream and downstream dependencies)",
  {
    instanceId: z.string().describe("Source CI Instance ID"),
    relationshipType: z
      .string()
      .optional()
      .describe("Filter by relationship type, e.g. BMC_Impact, BMC_Dependency"),
    direction: z
      .enum(["both", "outbound", "inbound"])
      .optional()
      .default("both"),
  },
  async ({ instanceId, relationshipType, direction }) => {
    const conditions = [`'Source Instance Id' = "${instanceId}"`];
    if (direction === "inbound")
      conditions[0] = `'Destination Instance Id' = "${instanceId}"`;

    if (relationshipType)
      conditions.push(`'Relationship Type' = "${relationshipType}"`);

    let results: unknown[] = [];

    if (direction !== "inbound") {
      const outbound = await cmdbGet<{ entries: unknown[] }>(
        `/entry/BMC.CORE:BMC_BaseRelationship?q=${encodeURIComponent(conditions.join(" AND "))}&limit=200`
      );
      results = [...results, ...(outbound.entries ?? [])];
    }

    if (direction !== "outbound") {
      const inbound = await cmdbGet<{ entries: unknown[] }>(
        `/entry/BMC.CORE:BMC_BaseRelationship?q=${encodeURIComponent(`'Destination Instance Id' = "${instanceId}"`)}&limit=200`
      );
      results = [...results, ...(inbound.entries ?? [])];
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// ── Tool: get_ci_audit_log ────────────────────────────────────────────────────
server.tool(
  "get_ci_audit_log",
  "Get the audit history for a CI showing all changes over time",
  {
    instanceId: z.string().describe("CI Instance ID"),
    limit: z.number().optional().default(50),
  },
  async ({ instanceId, limit }) => {
    const data = await cmdbGet(
      `/entry/BMC.CORE:BMC_AuditLog?q=${encodeURIComponent(`'ObjectInstanceId' = "${instanceId}"`)}&limit=${limit}&sort=ModifiedDate.desc`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list_ci_classes ─────────────────────────────────────────────────────
server.tool(
  "list_ci_classes",
  "List all available CI classes in the CMDB",
  {},
  async () => {
    const data = await cmdbGet("/entry/BMC.CORE:BMC_ClassInformation?limit=200");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: create_ci ───────────────────────────────────────────────────────────
server.tool(
  "create_ci",
  "Create a new Configuration Item in the CMDB",
  {
    ciClass: z.string().describe("CI class, e.g. BMC_ComputerSystem"),
    name: z.string().describe("CI name"),
    description: z.string().optional(),
    status: z
      .enum(["Deployed", "Ordered", "Being Assembled"])
      .optional()
      .default("Deployed"),
    attributes: z
      .record(z.string())
      .optional()
      .describe("Additional class-specific attributes"),
  },
  async ({ ciClass, name, description, status, attributes }) => {
    const values: Record<string, string> = {
      Name: name,
      Status: status!,
      ...attributes,
    };
    if (description) values.Description = description;

    const form = ciClass.includes(":") ? ciClass : `AST:${ciClass}`;
    const result = await cmdbPost(`/entry/${encodeURIComponent(form)}`, { values });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/bmc-cmdb] Server running");
