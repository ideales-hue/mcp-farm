#!/usr/bin/env node
/**
 * @mcp-farm/jira
 * MCP server for Atlassian Jira
 *
 * Environment variables:
 *   JIRA_BASE_URL   — e.g. https://your-org.atlassian.net
 *   JIRA_EMAIL      — your Atlassian account email
 *   JIRA_API_TOKEN  — API token from https://id.atlassian.com/manage-profile/security/api-tokens
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
const EMAIL = process.env.JIRA_EMAIL;
const API_TOKEN = process.env.JIRA_API_TOKEN;

if (!BASE_URL || !EMAIL || !API_TOKEN) {
  console.error(
    "[mcp-farm/jira] Missing required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN"
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

async function jiraGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api/3${path}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function jiraPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api/3${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function jiraPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/rest/api/3${path}`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/jira",
  version: "1.0.0",
});

// ── Tool: search_issues ───────────────────────────────────────────────────────
server.tool(
  "search_issues",
  "Search Jira issues using JQL (Jira Query Language)",
  {
    jql: z.string().describe("JQL query string, e.g. 'project = FOO AND status = Open'"),
    maxResults: z.number().optional().default(25).describe("Max results (default 25, max 100)"),
    fields: z
      .array(z.string())
      .optional()
      .default(["summary", "status", "assignee", "priority", "issuetype", "created", "updated"])
      .describe("Fields to return"),
  },
  async ({ jql, maxResults, fields }) => {
    const data = await jiraPost<{ issues: unknown[]; total: number }>(
      "/search",
      { jql, maxResults, fields }
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total: data.total, returned: data.issues.length, issues: data.issues },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: get_issue ───────────────────────────────────────────────────────────
server.tool(
  "get_issue",
  "Get a Jira issue by key (e.g. FOO-123) with all fields",
  {
    issueKey: z.string().describe("Issue key, e.g. FOO-123"),
  },
  async ({ issueKey }) => {
    const issue = await jiraGet(`/issue/${issueKey}`);
    return {
      content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
    };
  }
);

// ── Tool: create_issue ────────────────────────────────────────────────────────
server.tool(
  "create_issue",
  "Create a new Jira issue",
  {
    projectKey: z.string().describe("Project key, e.g. FOO"),
    summary: z.string().describe("Issue summary / title"),
    issueType: z
      .string()
      .default("Task")
      .describe("Issue type: Task, Bug, Story, Epic, etc."),
    description: z.string().optional().describe("Issue description (plain text)"),
    priority: z.string().optional().describe("Priority: Highest, High, Medium, Low, Lowest"),
    assignee: z.string().optional().describe("Assignee account ID or email"),
    labels: z.array(z.string()).optional().describe("Labels to apply"),
  },
  async ({ projectKey, summary, issueType, description, priority, assignee, labels }) => {
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };

    if (description) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", content: [{ type: "text", text: description }] },
        ],
      };
    }
    if (priority) fields.priority = { name: priority };
    if (assignee) fields.assignee = { id: assignee };
    if (labels?.length) fields.labels = labels;

    const issue = await jiraPost("/issue", { fields });
    return {
      content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
    };
  }
);

// ── Tool: update_issue ────────────────────────────────────────────────────────
server.tool(
  "update_issue",
  "Update fields on an existing Jira issue",
  {
    issueKey: z.string().describe("Issue key, e.g. FOO-123"),
    summary: z.string().optional(),
    priority: z.string().optional(),
    assignee: z.string().optional().describe("Assignee account ID"),
    labels: z.array(z.string()).optional(),
    status: z.string().optional().describe("Target status name (triggers a transition)"),
  },
  async ({ issueKey, summary, priority, assignee, labels, status }) => {
    if (status) {
      // Find and apply transition
      const transitions = await jiraGet<{ transitions: { id: string; name: string }[] }>(
        `/issue/${issueKey}/transitions`
      );
      const transition = transitions.transitions.find(
        (t) => t.name.toLowerCase() === status.toLowerCase()
      );
      if (!transition) {
        throw new Error(
          `Transition '${status}' not found. Available: ${transitions.transitions.map((t) => t.name).join(", ")}`
        );
      }
      await jiraPost(`/issue/${issueKey}/transitions`, {
        transition: { id: transition.id },
      });
    }

    const fields: Record<string, unknown> = {};
    if (summary) fields.summary = summary;
    if (priority) fields.priority = { name: priority };
    if (assignee) fields.assignee = { id: assignee };
    if (labels) fields.labels = labels;

    if (Object.keys(fields).length > 0) {
      await jiraPut(`/issue/${issueKey}`, { fields });
    }

    return {
      content: [{ type: "text", text: `Issue ${issueKey} updated successfully.` }],
    };
  }
);

// ── Tool: add_comment ─────────────────────────────────────────────────────────
server.tool(
  "add_comment",
  "Add a comment to a Jira issue",
  {
    issueKey: z.string().describe("Issue key, e.g. FOO-123"),
    comment: z.string().describe("Comment text"),
  },
  async ({ issueKey, comment }) => {
    const result = await jiraPost(`/issue/${issueKey}/comment`, {
      body: {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", content: [{ type: "text", text: comment }] },
        ],
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: list_projects ───────────────────────────────────────────────────────
server.tool(
  "list_projects",
  "List all Jira projects accessible to the current user",
  {},
  async () => {
    const data = await jiraGet<{ values: unknown[] }>("/project/search?maxResults=100");
    return {
      content: [{ type: "text", text: JSON.stringify(data.values, null, 2) }],
    };
  }
);

// ── Tool: get_sprint_issues ───────────────────────────────────────────────────
server.tool(
  "get_sprint_issues",
  "Get all issues in the active sprint for a board",
  {
    boardId: z.number().describe("Jira Software board ID"),
  },
  async ({ boardId }) => {
    const res = await fetch(
      `${BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`Jira Agile API error ${res.status}`);
    const { values: sprints } = await res.json() as { values: { id: number; name: string }[] };

    if (!sprints.length) {
      return { content: [{ type: "text", text: "No active sprint found." }] };
    }

    const sprint = sprints[0];
    const issuesRes = await fetch(
      `${BASE_URL}/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=100`,
      { headers: HEADERS }
    );
    if (!issuesRes.ok) throw new Error(`Jira Agile API error ${issuesRes.status}`);
    const { issues } = await issuesRes.json() as { issues: unknown[] };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ sprint: sprint.name, issues }, null, 2),
        },
      ],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/jira] Server running");
