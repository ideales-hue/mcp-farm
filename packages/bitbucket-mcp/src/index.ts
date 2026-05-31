#!/usr/bin/env node
/**
 * @mcp-farm/bitbucket
 * MCP server for Bitbucket Cloud & Bitbucket Server (Data Center)
 *
 * Environment variables (Cloud):
 *   BITBUCKET_BASE_URL   — https://api.bitbucket.org/2.0 (default, Cloud)
 *   BITBUCKET_USERNAME   — Bitbucket username or email
 *   BITBUCKET_APP_PASSWORD — App password (Cloud) from https://bitbucket.org/account/settings/app-passwords/
 *
 * Environment variables (Server / Data Center):
 *   BITBUCKET_BASE_URL   — e.g. https://bitbucket.yourorg.com/rest/api/1.0
 *   BITBUCKET_TOKEN      — Personal Access Token (Server/DC preferred)
 *   BITBUCKET_USERNAME   — Username (if using basic auth instead of token)
 *   BITBUCKET_PASSWORD   — Password (Server basic auth fallback)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = (process.env.BITBUCKET_BASE_URL ?? "https://api.bitbucket.org/2.0").replace(/\/$/, "");
const TOKEN = process.env.BITBUCKET_TOKEN;
const USERNAME = process.env.BITBUCKET_USERNAME;
const APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD ?? process.env.BITBUCKET_PASSWORD;

const IS_CLOUD = BASE_URL.includes("bitbucket.org");

if (!TOKEN && (!USERNAME || !APP_PASSWORD)) {
  console.error(
    "[mcp-farm/bitbucket] Provide BITBUCKET_TOKEN or BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD"
  );
  process.exit(1);
}

function getAuthHeader(): string {
  if (TOKEN) return `Bearer ${TOKEN}`;
  return "Basic " + Buffer.from(`${USERNAME}:${APP_PASSWORD}`).toString("base64");
}

const HEADERS = {
  Authorization: getAuthHeader(),
  "Content-Type": "application/json",
  Accept: "application/json",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function bbGet<T>(path: string): Promise<T> {
  const url = path.startsWith("https://") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function bbPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function bbPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function bbDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${await res.text()}`);
}

// Paginate through Cloud's paginated responses
async function bbGetAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = path.startsWith("https://") ? path : `${BASE_URL}${path}`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Bitbucket API error ${res.status}`);
    const data = await res.json() as { values: T[]; next?: string };
    results.push(...(data.values ?? []));
    url = data.next ?? null;
  }
  return results;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "mcp-farm/bitbucket", version: "1.0.0" });

// ══ REPOSITORIES ══════════════════════════════════════════════════════════════

server.tool(
  "list_repos",
  "List repositories in a workspace (Cloud) or project (Server)",
  {
    workspace: z.string().describe("Workspace slug (Cloud) or project key (Server)"),
    role: z.enum(["owner", "admin", "contributor", "member"]).optional().describe("Cloud only: filter by role"),
    perPage: z.number().optional().default(25),
  },
  async ({ workspace, role, perPage }) => {
    const params = new URLSearchParams({ pagelen: String(perPage) });
    if (role) params.set("role", role);
    const path = IS_CLOUD
      ? `/repositories/${workspace}?${params}`
      : `/projects/${workspace}/repos?limit=${perPage}`;
    const data = await bbGet<{ values: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.values ?? data, null, 2) }] };
  }
);

server.tool(
  "get_repo",
  "Get details for a specific repository",
  {
    workspace: z.string().describe("Workspace slug (Cloud) or project key (Server)"),
    repoSlug: z.string().describe("Repository slug or name"),
  },
  async ({ workspace, repoSlug }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}`
      : `/projects/${workspace}/repos/${repoSlug}`;
    const data = await bbGet(path);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_repo",
  "Create a new repository in a workspace or project",
  {
    workspace: z.string().describe("Workspace slug (Cloud) or project key (Server)"),
    repoSlug: z.string().describe("Repository slug/name"),
    description: z.string().optional(),
    isPrivate: z.boolean().optional().default(true),
    scm: z.enum(["git", "hg"]).optional().default("git").describe("Cloud only: SCM type"),
  },
  async ({ workspace, repoSlug, description, isPrivate, scm }) => {
    if (IS_CLOUD) {
      const repo = await bbPost(`/repositories/${workspace}/${repoSlug}`, {
        scm, description, is_private: isPrivate,
      });
      return { content: [{ type: "text", text: JSON.stringify(repo, null, 2) }] };
    } else {
      const repo = await bbPost(`/projects/${workspace}/repos`, {
        name: repoSlug, description,
        scmId: "git",
        forkable: true,
      });
      return { content: [{ type: "text", text: JSON.stringify(repo, null, 2) }] };
    }
  }
);

// ══ PULL REQUESTS ═════════════════════════════════════════════════════════════

server.tool(
  "list_pull_requests",
  "List pull requests in a repository",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    state: z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]).optional().default("OPEN"),
    perPage: z.number().optional().default(25),
  },
  async ({ workspace, repoSlug, state, perPage }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/pullrequests?state=${state}&pagelen=${perPage}`
      : `/projects/${workspace}/repos/${repoSlug}/pull-requests?state=${state}&limit=${perPage}`;
    const data = await bbGet<{ values: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.values ?? data, null, 2) }] };
  }
);

server.tool(
  "get_pull_request",
  "Get details of a specific pull request",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    prId: z.number().describe("Pull request ID"),
  },
  async ({ workspace, repoSlug, prId }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`
      : `/projects/${workspace}/repos/${repoSlug}/pull-requests/${prId}`;
    const pr = await bbGet(path);
    return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
  }
);

server.tool(
  "create_pull_request",
  "Create a new pull request",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    title: z.string(),
    sourceBranch: z.string().describe("Branch containing changes"),
    destinationBranch: z.string().describe("Target branch (e.g. main)"),
    description: z.string().optional(),
    reviewers: z.array(z.string()).optional().describe("Reviewer usernames or account IDs"),
    closeSourceBranch: z.boolean().optional().default(false),
  },
  async ({ workspace, repoSlug, title, sourceBranch, destinationBranch, description, reviewers, closeSourceBranch }) => {
    if (IS_CLOUD) {
      const body: Record<string, unknown> = {
        title,
        description,
        source: { branch: { name: sourceBranch } },
        destination: { branch: { name: destinationBranch } },
        close_source_branch: closeSourceBranch,
        reviewers: (reviewers ?? []).map((r) => ({ uuid: r })),
      };
      const pr = await bbPost(`/repositories/${workspace}/${repoSlug}/pullrequests`, body);
      return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
    } else {
      const body: Record<string, unknown> = {
        title,
        description,
        fromRef: { id: `refs/heads/${sourceBranch}`, repository: { slug: repoSlug, project: { key: workspace } } },
        toRef: { id: `refs/heads/${destinationBranch}`, repository: { slug: repoSlug, project: { key: workspace } } },
        reviewers: (reviewers ?? []).map((r) => ({ user: { name: r } })),
      };
      const pr = await bbPost(`/projects/${workspace}/repos/${repoSlug}/pull-requests`, body);
      return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
    }
  }
);

server.tool(
  "merge_pull_request",
  "Merge a pull request",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    prId: z.number(),
    message: z.string().optional().describe("Custom merge commit message"),
    strategy: z.enum(["merge_commit", "squash", "fast_forward"]).optional().default("merge_commit"),
  },
  async ({ workspace, repoSlug, prId, message, strategy }) => {
    if (IS_CLOUD) {
      const result = await bbPost(`/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/merge`, {
        message, merge_strategy: strategy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } else {
      const result = await bbPost(`/projects/${workspace}/repos/${repoSlug}/pull-requests/${prId}/merge`, {
        autoSubject: !message, message,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  }
);

server.tool(
  "add_pr_comment",
  "Add a comment to a pull request",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    prId: z.number(),
    text: z.string().describe("Comment text"),
  },
  async ({ workspace, repoSlug, prId, text }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`
      : `/projects/${workspace}/repos/${repoSlug}/pull-requests/${prId}/comments`;
    const comment = await bbPost(path, IS_CLOUD ? { content: { raw: text } } : { text });
    return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
  }
);

server.tool(
  "approve_pull_request",
  "Approve a pull request (adds your approval)",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    prId: z.number(),
  },
  async ({ workspace, repoSlug, prId }) => {
    if (IS_CLOUD) {
      const result = await bbPost(`/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/approve`, {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } else {
      const result = await bbPost(`/projects/${workspace}/repos/${repoSlug}/pull-requests/${prId}/approve`, {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  }
);

// ══ BRANCHES & COMMITS ════════════════════════════════════════════════════════

server.tool(
  "list_branches",
  "List branches in a repository",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    filter: z.string().optional().describe("Filter branches by name prefix"),
    perPage: z.number().optional().default(25),
  },
  async ({ workspace, repoSlug, filter, perPage }) => {
    const params = new URLSearchParams({ pagelen: String(perPage) });
    if (filter) params.set("q", `name ~ "${filter}"`);
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/refs/branches?${params}`
      : `/projects/${workspace}/repos/${repoSlug}/branches?limit=${perPage}${filter ? `&filterText=${filter}` : ""}`;
    const data = await bbGet<{ values: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.values ?? data, null, 2) }] };
  }
);

server.tool(
  "create_branch",
  "Create a new branch",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    branchName: z.string().describe("New branch name"),
    fromBranch: z.string().optional().default("main").describe("Source branch or commit hash"),
  },
  async ({ workspace, repoSlug, branchName, fromBranch }) => {
    if (IS_CLOUD) {
      const result = await bbPost(`/repositories/${workspace}/${repoSlug}/refs/branches`, {
        name: branchName,
        target: { hash: fromBranch },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } else {
      const result = await bbPost(`/projects/${workspace}/repos/${repoSlug}/branches`, {
        name: branchName, startPoint: fromBranch,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  }
);

server.tool(
  "list_commits",
  "List commits on a branch",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    branch: z.string().optional().default("main"),
    perPage: z.number().optional().default(20),
  },
  async ({ workspace, repoSlug, branch, perPage }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/commits/${branch}?pagelen=${perPage}`
      : `/projects/${workspace}/repos/${repoSlug}/commits?until=${branch}&limit=${perPage}`;
    const data = await bbGet<{ values: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.values ?? data, null, 2) }] };
  }
);

// ══ FILES & SOURCE ════════════════════════════════════════════════════════════

server.tool(
  "get_file_content",
  "Get the raw content of a file from a repository",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    filePath: z.string().describe("Path to file, e.g. src/index.ts"),
    ref: z.string().optional().default("main").describe("Branch, tag, or commit hash"),
  },
  async ({ workspace, repoSlug, filePath, ref }) => {
    const path = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/src/${ref}/${filePath}`
      : `/projects/${workspace}/repos/${repoSlug}/raw/${filePath}?at=${ref}`;
    const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${await res.text()}`);
    const content = await res.text();
    return { content: [{ type: "text", text: content }] };
  }
);

server.tool(
  "list_directory",
  "List files and directories at a path in the repository",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    path: z.string().optional().default("").describe("Directory path (empty for root)"),
    ref: z.string().optional().default("main"),
  },
  async ({ workspace, repoSlug, path: dirPath, ref }) => {
    const bbPath = IS_CLOUD
      ? `/repositories/${workspace}/${repoSlug}/src/${ref}/${dirPath}`
      : `/projects/${workspace}/repos/${repoSlug}/browse/${dirPath}?at=${ref}`;
    const data = await bbGet(bbPath);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ══ PIPELINES (Cloud only) ════════════════════════════════════════════════════

server.tool(
  "list_pipelines",
  "List recent Bitbucket Pipelines runs (Cloud only)",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    status: z.enum(["IN_PROGRESS", "PENDING", "SUCCESSFUL", "FAILED", "ERROR", "STOPPED"]).optional(),
    perPage: z.number().optional().default(20),
  },
  async ({ workspace, repoSlug, status, perPage }) => {
    if (!IS_CLOUD) {
      return { content: [{ type: "text", text: "Pipelines API is only available on Bitbucket Cloud." }] };
    }
    const params = new URLSearchParams({ pagelen: String(perPage), sort: "-created_on" });
    if (status) params.set("status", status);
    const data = await bbGet<{ values: unknown[] }>(
      `/repositories/${workspace}/${repoSlug}/pipelines/?${params}`
    );
    return { content: [{ type: "text", text: JSON.stringify(data.values, null, 2) }] };
  }
);

server.tool(
  "trigger_pipeline",
  "Trigger a Bitbucket Pipeline on a branch (Cloud only)",
  {
    workspace: z.string(),
    repoSlug: z.string(),
    branch: z.string().describe("Branch to run the pipeline on"),
    pipelineSelector: z.string().optional().describe("Custom pipeline name from bitbucket-pipelines.yml"),
    variables: z.array(z.object({ key: z.string(), value: z.string(), secured: z.boolean().optional() })).optional(),
  },
  async ({ workspace, repoSlug, branch, pipelineSelector, variables }) => {
    if (!IS_CLOUD) {
      return { content: [{ type: "text", text: "Pipelines API is only available on Bitbucket Cloud." }] };
    }
    const body: Record<string, unknown> = {
      target: {
        type: "pipeline_ref_target",
        ref_type: "branch",
        ref_name: branch,
        ...(pipelineSelector ? { selector: { type: "custom", pattern: pipelineSelector } } : {}),
      },
      variables: variables ?? [],
    };
    const result = await bbPost(`/repositories/${workspace}/${repoSlug}/pipelines/`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ══ WORKSPACES & PROJECTS ═════════════════════════════════════════════════════

server.tool(
  "list_workspaces",
  "List Bitbucket Cloud workspaces the authenticated user belongs to",
  {},
  async () => {
    if (!IS_CLOUD) {
      return { content: [{ type: "text", text: "Workspaces are a Bitbucket Cloud concept. Use projects on Server/DC." }] };
    }
    const data = await bbGet<{ values: unknown[] }>("/workspaces?pagelen=50");
    return { content: [{ type: "text", text: JSON.stringify(data.values, null, 2) }] };
  }
);

server.tool(
  "list_projects",
  "List projects in a workspace (Cloud) or all projects (Server)",
  {
    workspace: z.string().describe("Workspace slug (Cloud) or ignored for Server"),
  },
  async ({ workspace }) => {
    const path = IS_CLOUD
      ? `/workspaces/${workspace}/projects?pagelen=50`
      : `/projects?limit=50`;
    const data = await bbGet<{ values: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.values ?? data, null, 2) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/bitbucket] Server running");
