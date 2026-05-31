#!/usr/bin/env node
/**
 * @mcp-farm/bmc-remedy
 * MCP server for BMC Remedy ITSM
 *
 * Environment variables:
 *   REMEDY_BASE_URL  — e.g. https://remedy.yourorg.com
 *   REMEDY_USERNAME  — Remedy username
 *   REMEDY_PASSWORD  — Remedy password
 *   REMEDY_PORT      — REST API port (default: 8008)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.REMEDY_BASE_URL?.replace(/\/$/, "");
const USERNAME = process.env.REMEDY_USERNAME;
const PASSWORD = process.env.REMEDY_PASSWORD;
const PORT = process.env.REMEDY_PORT ?? "8008";

if (!BASE_URL || !USERNAME || !PASSWORD) {
  console.error(
    "[mcp-farm/bmc-remedy] Missing required env vars: REMEDY_BASE_URL, REMEDY_USERNAME, REMEDY_PASSWORD"
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

  if (!res.ok) throw new Error(`Remedy auth failed: ${res.status}`);
  authToken = await res.text();
  // Token expires — clear after 50 minutes
  setTimeout(() => { authToken = null; }, 50 * 60 * 1000);
  return authToken;
}

async function remedyGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `AR-JWT ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Remedy API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function remedyPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `AR-JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Remedy API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function remedyPut(path: string, body: unknown): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { Authorization: `AR-JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Remedy API error ${res.status}: ${await res.text()}`);
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-farm/bmc-remedy",
  version: "1.0.0",
});

// ── Tool: get_incident ────────────────────────────────────────────────────────
server.tool(
  "get_incident",
  "Get a Remedy incident by Incident Number (e.g. INC000000012345)",
  {
    incidentNumber: z.string().describe("Incident number, e.g. INC000000012345"),
  },
  async ({ incidentNumber }) => {
    const data = await remedyGet(
      `/entry/HPD:Help%20Desk?q=%27Incident%20Number%27%3D%22${incidentNumber}%22`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: search_incidents ────────────────────────────────────────────────────
server.tool(
  "search_incidents",
  "Search Remedy incidents by status, priority, assignee, or custom qualifier",
  {
    qualifier: z
      .string()
      .optional()
      .describe("AR System qualifier string, e.g. 'Status' = \"Assigned\""),
    status: z
      .enum(["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"])
      .optional(),
    priority: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
    assignee: z.string().optional(),
    limit: z.number().optional().default(25),
  },
  async ({ qualifier, status, priority, assignee, limit }) => {
    const conditions: string[] = [];
    if (qualifier) conditions.push(qualifier);
    if (status) conditions.push(`'Status' = "${status}"`);
    if (priority) conditions.push(`'Priority' = "${priority}"`);
    if (assignee) conditions.push(`'Assignee' = "${assignee}"`);

    const q = conditions.length ? conditions.join(" AND ") : "'Status' != \"Closed\"";
    const encoded = encodeURIComponent(q);

    const data = await remedyGet(
      `/entry/HPD:Help%20Desk?q=${encoded}&limit=${limit}&fields=values(Incident%20Number,Summary,Status,Priority,Assignee,Submit%20Date,Last%20Modified%20Date)`
    );

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: create_incident ─────────────────────────────────────────────────────
server.tool(
  "create_incident",
  "Create a new Remedy incident",
  {
    summary: z.string().describe("Short description of the incident"),
    description: z.string().describe("Detailed incident description"),
    impact: z.enum(["1-Extensive/Widespread", "2-Significant/Large", "3-Moderate/Limited", "4-Minor/Localized"]),
    urgency: z.enum(["1-Critical", "2-High", "3-Medium", "4-Low"]),
    assignedGroup: z.string().optional().describe("Support group to assign to"),
    firstName: z.string().describe("Reporter first name"),
    lastName: z.string().describe("Reporter last name"),
  },
  async ({ summary, description, impact, urgency, assignedGroup, firstName, lastName }) => {
    const values: Record<string, string> = {
      Summary: summary,
      "Notes": description,
      Impact: impact,
      Urgency: urgency,
      "First Name": firstName,
      "Last Name": lastName,
      "Reported Source": "Direct Input",
      "Service Type": "User Service Restoration",
    };

    if (assignedGroup) values["Assigned Group"] = assignedGroup;

    const result = await remedyPost("/entry/HPD:Help%20Desk", { values });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: update_incident ─────────────────────────────────────────────────────
server.tool(
  "update_incident",
  "Update a Remedy incident (status, notes, assignee, etc.)",
  {
    entryId: z.string().describe("Remedy entry ID (not the INC number — fetch the entry first)"),
    status: z
      .enum(["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"])
      .optional(),
    workNotes: z.string().optional().describe("Work notes to append"),
    assignee: z.string().optional(),
    assignedGroup: z.string().optional(),
  },
  async ({ entryId, status, workNotes, assignee, assignedGroup }) => {
    const values: Record<string, string> = {};
    if (status) values["Status"] = status;
    if (workNotes) values["Work Info Summary"] = workNotes;
    if (assignee) values["Assignee"] = assignee;
    if (assignedGroup) values["Assigned Group"] = assignedGroup;

    await remedyPut(`/entry/HPD:Help%20Desk/${entryId}`, { values });
    return {
      content: [{ type: "text", text: `Incident ${entryId} updated successfully.` }],
    };
  }
);

// ── Tool: get_change_request ──────────────────────────────────────────────────
server.tool(
  "get_change_request",
  "Get a Remedy Change Request by Change ID (e.g. CRQ000000012345)",
  {
    changeId: z.string().describe("Change ID, e.g. CRQ000000012345"),
  },
  async ({ changeId }) => {
    const data = await remedyGet(
      `/entry/CHG:Infrastructure%20Change?q=%27Infrastructure%20Change%20ID%27%3D%22${changeId}%22`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: search_change_requests ──────────────────────────────────────────────
server.tool(
  "search_change_requests",
  "Search Remedy Change Requests by status or class",
  {
    status: z
      .enum(["Draft", "Request For Authorization", "Request For Change", "Planning In Progress", "Scheduled For Review", "Scheduled For Approval", "Scheduled", "Implementation In Progress", "Pending", "Rejected", "Completed", "Closed", "Cancelled"])
      .optional(),
    changeClass: z.enum(["Normal", "Standard", "Emergency", "Latent"]).optional(),
    limit: z.number().optional().default(25),
  },
  async ({ status, changeClass, limit }) => {
    const conditions: string[] = [];
    if (status) conditions.push(`'Change Request Status' = "${status}"`);
    if (changeClass) conditions.push(`'Class' = "${changeClass}"`);

    const q = conditions.join(" AND ") || "'Change Request Status' != \"Closed\"";
    const data = await remedyGet(
      `/entry/CHG:Infrastructure%20Change?q=${encodeURIComponent(q)}&limit=${limit}`
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/bmc-remedy] Server running");
