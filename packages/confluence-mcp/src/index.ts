#!/usr/bin/env node
/**
 * @mcp-farm/confluence
 * MCP server for Atlassian Confluence
 *
 * Environment variables:
 *   CONFLUENCE_BASE_URL  — e.g. https://your-org.atlassian.net/wiki
 *   CONFLUENCE_EMAIL     — your Atlassian account email
 *   CONFLUENCE_API_TOKEN — API token from https://id.atlassian.com/manage-profile/security/api-tokens
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, "");
const EMAIL = process.env.CONFLUENCE_EMAIL;
const API_TOKEN = process.env.CONFLUENCE_API_TOKEN;

if (!BASE_URL || !EMAIL || !API_TOKEN) {
  console.error(
    "[mcp-farm/confluence] Missing required env vars: CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN"
  );
  process.exit(1);
}

const AUTH_HEADER =
  "Basic " + Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");

const HEADERS = {
  Authorization: AUTH_HEADER,
  "Content-Type": "application/json",
  Accept: "application/json",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function confGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api${path}`, { headers: HEADERS });
  if (!res.ok)
    throw new Error(`Confluence API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function confPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`Confluence API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function confPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api${path}`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`Confluence API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/confluence",
  version: "1.0.0",
});

// ── Tool: search_pages ────────────────────────────────────────────────────────
server.tool(
  "search_pages",
  "Search Confluence pages using CQL (Confluence Query Language) or plain text",
  {
    query: z.string().describe("Search query or CQL expression"),
    spaceKey: z.string().optional().describe("Limit search to a specific space key"),
    limit: z.number().optional().default(25).describe("Max results (default 25)"),
  },
  async ({ query, spaceKey, limit }) => {
    let cql = `text ~ "${query}" AND type = "page"`;
    if (spaceKey) cql += ` AND space.key = "${spaceKey}"`;

    const params = new URLSearchParams({
      cql,
      limit: String(limit),
      expand: "version,space",
    });

    const data = await confGet<{ results: unknown[]; totalSize: number }>(
      `/content/search?${params}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: data.totalSize, results: data.results },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: get_page ────────────────────────────────────────────────────────────
server.tool(
  "get_page",
  "Get a Confluence page by ID, including its full body content",
  {
    pageId: z.string().describe("Confluence page ID"),
    includeBody: z.boolean().optional().default(true),
  },
  async ({ pageId, includeBody }) => {
    const expand = ["version", "space", "ancestors"];
    if (includeBody) expand.push("body.storage");

    const page = await confGet(
      `/content/${pageId}?expand=${expand.join(",")}`
    );

    return {
      content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
    };
  }
);

// ── Tool: create_page ─────────────────────────────────────────────────────────
server.tool(
  "create_page",
  "Create a new Confluence page in a space",
  {
    spaceKey: z.string().describe("Target space key"),
    title: z.string().describe("Page title"),
    content: z.string().describe("Page body in HTML or plain text"),
    parentId: z.string().optional().describe("Parent page ID (creates as child page)"),
  },
  async ({ spaceKey, title, content, parentId }) => {
    const body: Record<string, unknown> = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    if (parentId) {
      body.ancestors = [{ id: parentId }];
    }

    const page = await confPost("/content", body);
    return {
      content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
    };
  }
);

// ── Tool: update_page ─────────────────────────────────────────────────────────
server.tool(
  "update_page",
  "Update the content of an existing Confluence page",
  {
    pageId: z.string().describe("Page ID to update"),
    title: z.string().describe("New page title"),
    content: z.string().describe("New page body in HTML or plain text"),
  },
  async ({ pageId, title, content }) => {
    // Must fetch current version first
    const current = await confGet<{ version: { number: number }; type: string; space: { key: string } }>(
      `/content/${pageId}?expand=version,space`
    );

    const updated = await confPut(`/content/${pageId}`, {
      type: current.type,
      title,
      space: { key: current.space.key },
      version: { number: current.version.number + 1 },
      body: {
        storage: { value: content, representation: "storage" },
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
    };
  }
);

// ── Tool: list_spaces ─────────────────────────────────────────────────────────
server.tool(
  "list_spaces",
  "List all Confluence spaces the current user can access",
  {
    type: z
      .enum(["global", "personal", "all"])
      .optional()
      .default("global")
      .describe("Space type filter"),
    limit: z.number().optional().default(50),
  },
  async ({ type, limit }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (type !== "all") params.set("type", type);

    const data = await confGet<{ results: unknown[] }>(`/space?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data.results, null, 2) }],
    };
  }
);

// ── Tool: get_page_children ───────────────────────────────────────────────────
server.tool(
  "get_page_children",
  "Get child pages of a Confluence page",
  {
    pageId: z.string().describe("Parent page ID"),
  },
  async ({ pageId }) => {
    const data = await confGet<{ results: unknown[] }>(
      `/content/${pageId}/child/page?expand=version,space&limit=100`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data.results, null, 2) }],
    };
  }
);

// ── Tool: add_comment ─────────────────────────────────────────────────────────
server.tool(
  "add_comment",
  "Add a comment to a Confluence page",
  {
    pageId: z.string().describe("Page ID"),
    comment: z.string().describe("Comment text (HTML or plain text)"),
  },
  async ({ pageId, comment }) => {
    const result = await confPost("/content", {
      type: "comment",
      container: { id: pageId, type: "page" },
      body: {
        storage: { value: `<p>${comment}</p>`, representation: "storage" },
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/confluence] Server running");
