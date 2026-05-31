#!/usr/bin/env node
/**
 * @mcp-farm/dynatrace
 * MCP server for Dynatrace Observability Platform
 *
 * Environment variables:
 *   DYNATRACE_BASE_URL  — e.g. https://your-env.live.dynatrace.com
 *   DYNATRACE_API_TOKEN — API token with required scopes (see README)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.DYNATRACE_BASE_URL?.replace(/\/$/, "");
const API_TOKEN = process.env.DYNATRACE_API_TOKEN;

if (!BASE_URL || !API_TOKEN) {
  console.error(
    "[mcp-farm/dynatrace] Missing required env vars: DYNATRACE_BASE_URL, DYNATRACE_API_TOKEN"
  );
  process.exit(1);
}

const HEADERS = {
  Authorization: `Api-Token ${API_TOKEN}`,
  "Content-Type": "application/json",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function dtGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Dynatrace API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function dtPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Dynatrace API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/dynatrace",
  version: "1.0.0",
});

// ── Tool: get_problems ────────────────────────────────────────────────────────
server.tool(
  "get_problems",
  "Get active and recent Dynatrace problems (incidents/anomalies)",
  {
    status: z
      .enum(["OPEN", "RESOLVED", "ALL"])
      .optional()
      .default("OPEN")
      .describe("Problem status filter"),
    from: z.string().optional().default("now-2h").describe("Time range start (e.g. now-2h, now-1d)"),
    to: z.string().optional().default("now"),
    impactLevel: z
      .enum(["APPLICATION", "SERVICE", "INFRASTRUCTURE", "ENVIRONMENT"])
      .optional(),
    severityLevel: z
      .enum(["AVAILABILITY", "ERROR", "PERFORMANCE", "RESOURCE_CONTENTION", "CUSTOM_ALERT"])
      .optional(),
    maxResults: z.number().optional().default(50),
  },
  async ({ status, from, to, impactLevel, severityLevel, maxResults }) => {
    const params = new URLSearchParams({
      from: from!,
      to: to!,
      pageSize: String(maxResults),
    });

    if (status !== "ALL") params.set("status", status!);
    if (impactLevel) params.set("impactLevel", impactLevel);
    if (severityLevel) params.set("severityLevel", severityLevel);

    const data = await dtGet<{ problems: unknown[]; totalCount: number }>(
      `/v2/problems?${params}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: data.totalCount, problems: data.problems },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: get_problem_details ─────────────────────────────────────────────────
server.tool(
  "get_problem_details",
  "Get detailed information about a specific Dynatrace problem",
  {
    problemId: z.string().describe("Dynatrace problem ID (e.g. -1234567890123456789_V2)"),
  },
  async ({ problemId }) => {
    const problem = await dtGet(`/v2/problems/${problemId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(problem, null, 2) }],
    };
  }
);

// ── Tool: query_metrics ───────────────────────────────────────────────────────
server.tool(
  "query_metrics",
  "Query Dynatrace metrics using the metrics API (V2)",
  {
    metricSelector: z
      .string()
      .describe(
        "Metric selector expression, e.g. 'builtin:service.response.time:avg:names'"
      ),
    from: z.string().optional().default("now-2h"),
    to: z.string().optional().default("now"),
    resolution: z
      .string()
      .optional()
      .default("1m")
      .describe("Resolution (e.g. 1m, 5m, 1h)"),
    entitySelector: z
      .string()
      .optional()
      .describe("Entity selector, e.g. 'type(SERVICE),tag(production)'"),
  },
  async ({ metricSelector, from, to, resolution, entitySelector }) => {
    const params = new URLSearchParams({
      metricSelector,
      from: from!,
      to: to!,
      resolution: resolution!,
    });
    if (entitySelector) params.set("entitySelector", entitySelector);

    const data = await dtGet(`/v2/metrics/query?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list_entities ───────────────────────────────────────────────────────
server.tool(
  "list_entities",
  "List monitored entities in Dynatrace (services, hosts, applications, etc.)",
  {
    entitySelector: z
      .string()
      .describe(
        "Entity selector expression, e.g. 'type(SERVICE)', 'type(HOST),tag(production)'"
      ),
    from: z.string().optional().default("now-3d"),
    fields: z
      .string()
      .optional()
      .default("+tags,+properties,+fromRelationships,+toRelationships")
      .describe("Additional fields to include"),
    limit: z.number().optional().default(50),
  },
  async ({ entitySelector, from, fields, limit }) => {
    const params = new URLSearchParams({
      entitySelector,
      from: from!,
      fields: fields!,
      pageSize: String(limit),
    });

    const data = await dtGet<{ entities: unknown[]; totalCount: number }>(
      `/v2/entities?${params}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: data.totalCount, entities: data.entities },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: run_dql ─────────────────────────────────────────────────────────────
server.tool(
  "run_dql",
  "Execute a Dynatrace Query Language (DQL) query via the Grail data lakehouse",
  {
    query: z.string().describe("DQL query string"),
    from: z.string().optional().default("now-2h"),
    to: z.string().optional().default("now"),
    maxResults: z.number().optional().default(1000),
  },
  async ({ query, from, to, maxResults }) => {
    const result = await dtPost<{
      state: string;
      requestToken?: string;
      result?: { records: unknown[] };
    }>("/v2/logs/search", {
      query,
      from: from!,
      to: to!,
      limit: maxResults,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: get_slo ────────────────────────────────────────────────────────────
server.tool(
  "list_slos",
  "List Dynatrace SLOs (Service Level Objectives) and their current status",
  {
    from: z.string().optional().default("now-1d"),
    to: z.string().optional().default("now"),
    sloSelector: z.string().optional().describe("Filter SLOs by name (partial match)"),
    enabled: z.boolean().optional(),
  },
  async ({ from, to, sloSelector, enabled }) => {
    const params = new URLSearchParams({ from: from!, to: to!, pageSize: "100" });
    if (sloSelector) params.set("sloSelector", `name("${sloSelector}")`);
    if (enabled !== undefined) params.set("enabledSlos", enabled ? "true" : "false");

    const data = await dtGet<{ slos: unknown[]; totalCount: number }>(`/v2/slo?${params}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: data.totalCount, slos: data.slos },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: get_events ─────────────────────────────────────────────────────────
server.tool(
  "get_events",
  "Get Dynatrace events (deployments, config changes, custom events)",
  {
    from: z.string().optional().default("now-2h"),
    to: z.string().optional().default("now"),
    eventType: z
      .enum([
        "CUSTOM_ANNOTATION",
        "CUSTOM_CONFIGURATION",
        "CUSTOM_DEPLOYMENT",
        "CUSTOM_INFO",
        "MARKED_FOR_TERMINATION",
      ])
      .optional(),
    entitySelector: z.string().optional(),
    limit: z.number().optional().default(50),
  },
  async ({ from, to, eventType, entitySelector, limit }) => {
    const params = new URLSearchParams({
      from: from!,
      to: to!,
      pageSize: String(limit),
    });
    if (eventType) params.set("eventType", eventType);
    if (entitySelector) params.set("entitySelector", entitySelector);

    const data = await dtGet<{ events: unknown[]; totalCount: number }>(
      `/v2/events?${params}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ total: data.totalCount, events: data.events }, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get_logs ────────────────────────────────────────────────────────────
server.tool(
  "search_logs",
  "Search Dynatrace log monitoring for log lines matching a query",
  {
    query: z.string().describe("Log search query (e.g. 'error AND status:500')"),
    from: z.string().optional().default("now-1h"),
    to: z.string().optional().default("now"),
    limit: z.number().optional().default(100),
  },
  async ({ query, from, to, limit }) => {
    const params = new URLSearchParams({
      query,
      from: from!,
      to: to!,
      limit: String(limit),
    });

    const data = await dtGet(`/v2/logs/search?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/dynatrace] Server running");
