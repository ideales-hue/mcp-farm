#!/usr/bin/env node
/**
 * @mcp-farm/splunk
 * MCP server for Splunk Enterprise / Splunk Cloud
 *
 * Environment variables:
 *   SPLUNK_BASE_URL  — e.g. https://splunk.yourorg.com:8089
 *   SPLUNK_TOKEN     — Splunk HEC/API token (recommended)
 *   SPLUNK_USERNAME  — Splunk username (if using basic auth)
 *   SPLUNK_PASSWORD  — Splunk password (if using basic auth)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.SPLUNK_BASE_URL?.replace(/\/$/, "");
const TOKEN = process.env.SPLUNK_TOKEN;
const USERNAME = process.env.SPLUNK_USERNAME;
const PASSWORD = process.env.SPLUNK_PASSWORD;

if (!BASE_URL) {
  console.error("[mcp-farm/splunk] Missing required env var: SPLUNK_BASE_URL");
  process.exit(1);
}

if (!TOKEN && (!USERNAME || !PASSWORD)) {
  console.error(
    "[mcp-farm/splunk] Provide either SPLUNK_TOKEN or SPLUNK_USERNAME + SPLUNK_PASSWORD"
  );
  process.exit(1);
}

function getAuthHeader(): string {
  if (TOKEN) return `Bearer ${TOKEN}`;
  return "Basic " + Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
}

const HEADERS = {
  Authorization: getAuthHeader(),
  "Content-Type": "application/json",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function splunkGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}&output_mode=json`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Splunk API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function splunkPost<T>(path: string, body: URLSearchParams | string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type":
        body instanceof URLSearchParams
          ? "application/x-www-form-urlencoded"
          : "application/json",
    },
    body: body instanceof URLSearchParams ? body.toString() : body,
  });
  if (!res.ok) throw new Error(`Splunk API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Search helpers ───────────────────────────────────────────────────────────

type SearchJob = { sid: string };
type SearchStatus = { entry: { content: { dispatchState: string; resultCount: number } }[] };
type SearchResults = { results: unknown[] };

async function runSearch(
  query: string,
  earliest: string,
  latest: string,
  maxResults: number
): Promise<unknown[]> {
  // Create search job
  const job = await splunkPost<SearchJob>(
    "/services/search/jobs?output_mode=json",
    new URLSearchParams({
      search: query.startsWith("search ") ? query : `search ${query}`,
      earliest_time: earliest,
      latest_time: latest,
      max_count: String(maxResults),
    })
  );

  // Poll until done
  const sid = job.sid;
  let done = false;
  let attempts = 0;

  while (!done && attempts < 60) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await splunkGet<SearchStatus>(
      `/services/search/jobs/${sid}?`
    );
    const state = status.entry?.[0]?.content?.dispatchState;
    if (state === "DONE" || state === "FAILED") done = true;
    attempts++;
  }

  // Fetch results
  const results = await splunkGet<SearchResults>(
    `/services/search/jobs/${sid}/results?count=${maxResults}&`
  );

  return results.results ?? [];
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/splunk",
  version: "1.0.0",
});

// ── Tool: run_spl_search ──────────────────────────────────────────────────────
server.tool(
  "run_spl_search",
  "Run a Splunk SPL search query and return results",
  {
    query: z.string().describe("SPL query, e.g. 'index=main error | stats count by host'"),
    earliest: z.string().optional().default("-24h").describe("Earliest time (e.g. -1h, -7d, 2024-01-01T00:00:00)"),
    latest: z.string().optional().default("now").describe("Latest time"),
    maxResults: z.number().optional().default(100).describe("Maximum results to return"),
  },
  async ({ query, earliest, latest, maxResults }) => {
    const results = await runSearch(query, earliest!, latest!, maxResults!);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: results.length, results }, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get_saved_searches ──────────────────────────────────────────────────
server.tool(
  "list_saved_searches",
  "List all saved searches and alerts in Splunk",
  {
    app: z.string().optional().describe("Filter by Splunk app name"),
  },
  async ({ app }) => {
    const appPath = app ? `/servicesNS/-/${app}` : "/services";
    const data = await splunkGet<{ entry: unknown[] }>(
      `${appPath}/saved/searches?count=200&`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data.entry, null, 2) }],
    };
  }
);

// ── Tool: run_saved_search ────────────────────────────────────────────────────
server.tool(
  "run_saved_search",
  "Dispatch (run) a saved Splunk search by name",
  {
    searchName: z.string().describe("Name of the saved search"),
    app: z.string().optional().default("search").describe("Splunk app containing the search"),
  },
  async ({ searchName, app }) => {
    const result = await splunkPost<{ sid: string }>(
      `/servicesNS/nobody/${app}/saved/searches/${encodeURIComponent(searchName)}/dispatch?output_mode=json`,
      new URLSearchParams({})
    );
    return {
      content: [
        {
          type: "text",
          text: `Search dispatched. SID: ${result.sid}. Use run_spl_search to retrieve results.`,
        },
      ],
    };
  }
);

// ── Tool: get_alerts ─────────────────────────────────────────────────────────
server.tool(
  "get_alerts",
  "Get fired Splunk alerts (notable events / triggered alerts)",
  {
    severity: z
      .enum(["critical", "high", "medium", "low", "info"])
      .optional()
      .describe("Filter by severity"),
    hours: z.number().optional().default(24).describe("Look-back window in hours"),
    maxResults: z.number().optional().default(50),
  },
  async ({ severity, hours, maxResults }) => {
    let query = `search index=_audit action=alert_fired earliest=-${hours}h`;
    if (severity) query += ` severity=${severity}`;
    query += " | table _time, alert_name, severity, host, source";

    const results = await runSearch(query, `-${hours}h`, "now", maxResults!);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// ── Tool: get_indexes ─────────────────────────────────────────────────────────
server.tool(
  "list_indexes",
  "List all Splunk indexes and their current sizes / event counts",
  {},
  async () => {
    const data = await splunkGet<{ entry: unknown[] }>(
      "/services/data/indexes?count=200&"
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data.entry, null, 2) }],
    };
  }
);

// ── Tool: get_summary ─────────────────────────────────────────────────────────
server.tool(
  "get_field_summary",
  "Get field summary stats for a Splunk search (unique values, coverage, etc.)",
  {
    index: z.string().describe("Index to summarize"),
    sourcetype: z.string().optional(),
    earliest: z.string().optional().default("-24h"),
  },
  async ({ index, sourcetype, earliest }) => {
    let query = `search index=${index}`;
    if (sourcetype) query += ` sourcetype=${sourcetype}`;

    const results = await runSearch(
      `${query} earliest=${earliest} | fieldsummary`,
      earliest!,
      "now",
      200
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// ── Tool: get_splunk_health ────────────────────────────────────────────────────
server.tool(
  "get_splunk_health",
  "Get the health status of Splunk components (indexers, search heads, etc.)",
  {},
  async () => {
    const data = await splunkGet("/services/server/health/splunkd?");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/splunk] Server running");
