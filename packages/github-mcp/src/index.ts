#!/usr/bin/env node
/**
 * @mcp-farm/github
 * MCP server for GitHub — repos, issues, PRs, branches, files, actions
 *
 * Environment variables:
 *   GITHUB_TOKEN       — Personal Access Token or GitHub App token
 *   GITHUB_BASE_URL    — Optional: GitHub Enterprise base URL (default: https://api.github.com)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN = process.env.GITHUB_TOKEN;
const BASE_URL = (process.env.GITHUB_BASE_URL ?? "https://api.github.com").replace(/\/$/, "");

if (!TOKEN) {
  console.error("[mcp-farm/github] Missing required env var: GITHUB_TOKEN");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function ghGet<T>(path: string): Promise<T> {
  const url = path.startsWith("https://") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ghPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ghPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ghPut<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ghDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "mcp-farm/github", version: "1.0.0" });

// ══ REPOSITORIES ══════════════════════════════════════════════════════════════

server.tool(
  "list_repos",
  "List repositories for the authenticated user or a specific org/user",
  {
    owner: z.string().optional().describe("Org or user login. Omit for authenticated user."),
    type: z.enum(["all", "public", "private", "forks", "sources", "member"]).optional().default("all"),
    sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().default("updated"),
    perPage: z.number().optional().default(30),
  },
  async ({ owner, type, sort, perPage }) => {
    const params = new URLSearchParams({ type: type!, sort: sort!, per_page: String(perPage) });
    const path = owner
      ? `/orgs/${owner}/repos?${params}` // try org first
      : `/user/repos?${params}`;
    const repos = await ghGet<unknown[]>(path).catch(() =>
      ghGet<unknown[]>(`/users/${owner}/repos?${params}`)
    );
    return { content: [{ type: "text", text: JSON.stringify(repos, null, 2) }] };
  }
);

server.tool(
  "get_repo",
  "Get details for a specific repository",
  {
    owner: z.string().describe("Repository owner (user or org)"),
    repo: z.string().describe("Repository name"),
  },
  async ({ owner, repo }) => {
    const data = await ghGet(`/repos/${owner}/${repo}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_repo",
  "Create a new GitHub repository",
  {
    name: z.string().describe("Repository name"),
    description: z.string().optional(),
    private: z.boolean().optional().default(false),
    autoInit: z.boolean().optional().default(true).describe("Initialize with README"),
    org: z.string().optional().describe("Create under this org instead of the authenticated user"),
  },
  async ({ name, description, private: isPrivate, autoInit, org }) => {
    const body = { name, description, private: isPrivate, auto_init: autoInit };
    const path = org ? `/orgs/${org}/repos` : "/user/repos";
    const repo = await ghPost(path, body);
    return { content: [{ type: "text", text: JSON.stringify(repo, null, 2) }] };
  }
);

server.tool(
  "search_repos",
  "Search GitHub repositories using GitHub search syntax",
  {
    query: z.string().describe("Search query, e.g. 'org:myorg language:typescript stars:>100'"),
    sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional(),
    order: z.enum(["asc", "desc"]).optional().default("desc"),
    perPage: z.number().optional().default(20),
  },
  async ({ query, sort, order, perPage }) => {
    const params = new URLSearchParams({ q: query, order: order!, per_page: String(perPage) });
    if (sort) params.set("sort", sort);
    const data = await ghGet<{ total_count: number; items: unknown[] }>(`/search/repositories?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify({ total: data.total_count, repos: data.items }, null, 2) }],
    };
  }
);

// ══ ISSUES ════════════════════════════════════════════════════════════════════

server.tool(
  "list_issues",
  "List issues in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional().default("open"),
    labels: z.string().optional().describe("Comma-separated label names"),
    assignee: z.string().optional(),
    milestone: z.string().optional(),
    perPage: z.number().optional().default(30),
  },
  async ({ owner, repo, state, labels, assignee, milestone, perPage }) => {
    const params = new URLSearchParams({ state: state!, per_page: String(perPage) });
    if (labels) params.set("labels", labels);
    if (assignee) params.set("assignee", assignee);
    if (milestone) params.set("milestone", milestone);
    const issues = await ghGet<unknown[]>(`/repos/${owner}/${repo}/issues?${params}`);
    return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
  }
);

server.tool(
  "get_issue",
  "Get a specific issue by number",
  {
    owner: z.string(),
    repo: z.string(),
    issueNumber: z.number().describe("Issue number"),
  },
  async ({ owner, repo, issueNumber }) => {
    const issue = await ghGet(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
  }
);

server.tool(
  "create_issue",
  "Create a new issue in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
    milestone: z.number().optional(),
  },
  async ({ owner, repo, title, body, labels, assignees, milestone }) => {
    const issue = await ghPost(`/repos/${owner}/${repo}/issues`, {
      title, body, labels, assignees, milestone,
    });
    return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
  }
);

server.tool(
  "update_issue",
  "Update an existing issue (title, body, state, labels, assignees)",
  {
    owner: z.string(),
    repo: z.string(),
    issueNumber: z.number(),
    title: z.string().optional(),
    body: z.string().optional(),
    state: z.enum(["open", "closed"]).optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  },
  async ({ owner, repo, issueNumber, ...updates }) => {
    const issue = await ghPatch(`/repos/${owner}/${repo}/issues/${issueNumber}`, updates);
    return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
  }
);

server.tool(
  "add_issue_comment",
  "Add a comment to an issue or pull request",
  {
    owner: z.string(),
    repo: z.string(),
    issueNumber: z.number(),
    body: z.string().describe("Comment body (Markdown supported)"),
  },
  async ({ owner, repo, issueNumber, body }) => {
    const comment = await ghPost(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
    return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
  }
);

// ══ PULL REQUESTS ═════════════════════════════════════════════════════════════

server.tool(
  "list_pull_requests",
  "List pull requests in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional().default("open"),
    base: z.string().optional().describe("Filter by base branch name"),
    head: z.string().optional().describe("Filter by head branch (user:branch)"),
    sort: z.enum(["created", "updated", "popularity", "long-running"]).optional().default("updated"),
    perPage: z.number().optional().default(20),
  },
  async ({ owner, repo, state, base, head, sort, perPage }) => {
    const params = new URLSearchParams({ state: state!, sort: sort!, per_page: String(perPage) });
    if (base) params.set("base", base);
    if (head) params.set("head", head);
    const prs = await ghGet<unknown[]>(`/repos/${owner}/${repo}/pulls?${params}`);
    return { content: [{ type: "text", text: JSON.stringify(prs, null, 2) }] };
  }
);

server.tool(
  "get_pull_request",
  "Get details of a specific pull request including diff stats",
  {
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
  },
  async ({ owner, repo, pullNumber }) => {
    const pr = await ghGet(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
  }
);

server.tool(
  "create_pull_request",
  "Create a new pull request",
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    head: z.string().describe("Branch containing changes (e.g. feature/my-branch)"),
    base: z.string().describe("Branch to merge into (e.g. main)"),
    body: z.string().optional().describe("PR description (Markdown)"),
    draft: z.boolean().optional().default(false),
    maintainerCanModify: z.boolean().optional().default(true),
  },
  async ({ owner, repo, title, head, base, body, draft, maintainerCanModify }) => {
    const pr = await ghPost(`/repos/${owner}/${repo}/pulls`, {
      title, head, base, body, draft, maintainer_can_modify: maintainerCanModify,
    });
    return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
  }
);

server.tool(
  "merge_pull_request",
  "Merge a pull request",
  {
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
    commitTitle: z.string().optional(),
    commitMessage: z.string().optional(),
    mergeMethod: z.enum(["merge", "squash", "rebase"]).optional().default("merge"),
  },
  async ({ owner, repo, pullNumber, commitTitle, commitMessage, mergeMethod }) => {
    const result = await ghPut(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
      commit_title: commitTitle,
      commit_message: commitMessage,
      merge_method: mergeMethod,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_pr_reviews",
  "List reviews on a pull request",
  {
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
  },
  async ({ owner, repo, pullNumber }) => {
    const reviews = await ghGet(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`);
    return { content: [{ type: "text", text: JSON.stringify(reviews, null, 2) }] };
  }
);

// ══ BRANCHES & COMMITS ════════════════════════════════════════════════════════

server.tool(
  "list_branches",
  "List branches in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    perPage: z.number().optional().default(30),
  },
  async ({ owner, repo, perPage }) => {
    const branches = await ghGet(`/repos/${owner}/${repo}/branches?per_page=${perPage}`);
    return { content: [{ type: "text", text: JSON.stringify(branches, null, 2) }] };
  }
);

server.tool(
  "create_branch",
  "Create a new branch from a given ref",
  {
    owner: z.string(),
    repo: z.string(),
    branch: z.string().describe("New branch name"),
    fromRef: z.string().optional().default("main").describe("Source branch or commit SHA"),
  },
  async ({ owner, repo, branch, fromRef }) => {
    // Resolve ref to SHA
    const refData = await ghGet<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${fromRef}`)
      .catch(() => ghGet<{ sha: string }>(`/repos/${owner}/${repo}/commits/${fromRef}`).then(c => ({ object: c })));
    const sha = (refData as { object: { sha: string } }).object.sha;
    const result = await ghPost(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`, sha,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_commits",
  "List commits on a branch or path",
  {
    owner: z.string(),
    repo: z.string(),
    branch: z.string().optional().default("main"),
    path: z.string().optional().describe("Filter commits touching this path"),
    perPage: z.number().optional().default(20),
  },
  async ({ owner, repo, branch, path, perPage }) => {
    const params = new URLSearchParams({ sha: branch!, per_page: String(perPage) });
    if (path) params.set("path", path);
    const commits = await ghGet(`/repos/${owner}/${repo}/commits?${params}`);
    return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
  }
);

// ══ FILES & CONTENTS ══════════════════════════════════════════════════════════

server.tool(
  "get_file_content",
  "Get the content of a file in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string().describe("File path, e.g. src/index.ts"),
    ref: z.string().optional().describe("Branch, tag, or commit SHA"),
  },
  async ({ owner, repo, path, ref }) => {
    const params = ref ? `?ref=${ref}` : "";
    const data = await ghGet<{ content: string; encoding: string; sha: string; size: number }>(
      `/repos/${owner}/${repo}/contents/${path}${params}`
    );
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return {
      content: [{ type: "text", text: JSON.stringify({ sha: data.sha, size: data.size, content: decoded }, null, 2) }],
    };
  }
);

server.tool(
  "create_or_update_file",
  "Create or update a file in a repository",
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string().describe("File path in the repo"),
    content: z.string().describe("File content (plain text)"),
    message: z.string().describe("Commit message"),
    branch: z.string().optional().default("main"),
    sha: z.string().optional().describe("Required when updating an existing file (current file SHA)"),
  },
  async ({ owner, repo, path, content, message, branch, sha }) => {
    const encoded = Buffer.from(content).toString("base64");
    const body: Record<string, unknown> = { message, content: encoded, branch };
    if (sha) body.sha = sha;
    const result = await ghPut(`/repos/${owner}/${repo}/contents/${path}`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ══ GITHUB ACTIONS ════════════════════════════════════════════════════════════

server.tool(
  "list_workflows",
  "List GitHub Actions workflows in a repository",
  {
    owner: z.string(),
    repo: z.string(),
  },
  async ({ owner, repo }) => {
    const data = await ghGet<{ workflows: unknown[] }>(`/repos/${owner}/${repo}/actions/workflows`);
    return { content: [{ type: "text", text: JSON.stringify(data.workflows, null, 2) }] };
  }
);

server.tool(
  "list_workflow_runs",
  "List recent workflow runs, optionally filtered by workflow or branch",
  {
    owner: z.string(),
    repo: z.string(),
    workflowId: z.string().optional().describe("Workflow ID or filename (e.g. ci.yml)"),
    branch: z.string().optional(),
    status: z.enum(["completed", "in_progress", "queued", "waiting", "requested", "pending"]).optional(),
    perPage: z.number().optional().default(20),
  },
  async ({ owner, repo, workflowId, branch, status, perPage }) => {
    const params = new URLSearchParams({ per_page: String(perPage) });
    if (branch) params.set("branch", branch);
    if (status) params.set("status", status);
    const path = workflowId
      ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${params}`
      : `/repos/${owner}/${repo}/actions/runs?${params}`;
    const data = await ghGet<{ workflow_runs: unknown[] }>(path);
    return { content: [{ type: "text", text: JSON.stringify(data.workflow_runs, null, 2) }] };
  }
);

server.tool(
  "trigger_workflow",
  "Manually trigger a workflow_dispatch workflow",
  {
    owner: z.string(),
    repo: z.string(),
    workflowId: z.string().describe("Workflow ID or filename (e.g. deploy.yml)"),
    ref: z.string().describe("Branch or tag to run on"),
    inputs: z.record(z.string()).optional().describe("Workflow input parameters"),
  },
  async ({ owner, repo, workflowId, ref, inputs }) => {
    await ghPost(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      ref, inputs: inputs ?? {},
    });
    return { content: [{ type: "text", text: `Workflow '${workflowId}' triggered on '${ref}'.` }] };
  }
);

// ══ RELEASES ══════════════════════════════════════════════════════════════════

server.tool(
  "list_releases",
  "List releases for a repository",
  {
    owner: z.string(),
    repo: z.string(),
    perPage: z.number().optional().default(10),
  },
  async ({ owner, repo, perPage }) => {
    const releases = await ghGet(`/repos/${owner}/${repo}/releases?per_page=${perPage}`);
    return { content: [{ type: "text", text: JSON.stringify(releases, null, 2) }] };
  }
);

server.tool(
  "create_release",
  "Create a new release (and optionally a tag)",
  {
    owner: z.string(),
    repo: z.string(),
    tagName: z.string().describe("Tag name, e.g. v1.2.0"),
    name: z.string().describe("Release title"),
    body: z.string().optional().describe("Release notes (Markdown)"),
    draft: z.boolean().optional().default(false),
    prerelease: z.boolean().optional().default(false),
    targetCommitish: z.string().optional().default("main").describe("Branch or commit SHA to tag"),
  },
  async ({ owner, repo, tagName, name, body, draft, prerelease, targetCommitish }) => {
    const release = await ghPost(`/repos/${owner}/${repo}/releases`, {
      tag_name: tagName, name, body, draft, prerelease,
      target_commitish: targetCommitish,
    });
    return { content: [{ type: "text", text: JSON.stringify(release, null, 2) }] };
  }
);

// ══ TEAMS & COLLABORATORS ═════════════════════════════════════════════════════

server.tool(
  "list_collaborators",
  "List collaborators on a repository",
  {
    owner: z.string(),
    repo: z.string(),
    affiliation: z.enum(["outside", "direct", "all"]).optional().default("all"),
  },
  async ({ owner, repo, affiliation }) => {
    const collaborators = await ghGet(`/repos/${owner}/${repo}/collaborators?affiliation=${affiliation}&per_page=100`);
    return { content: [{ type: "text", text: JSON.stringify(collaborators, null, 2) }] };
  }
);

server.tool(
  "search_code",
  "Search for code across GitHub repositories",
  {
    query: z.string().describe("Search query, e.g. 'McpServer repo:myorg/myrepo language:typescript'"),
    perPage: z.number().optional().default(20),
  },
  async ({ query, perPage }) => {
    const params = new URLSearchParams({ q: query, per_page: String(perPage) });
    const data = await ghGet<{ total_count: number; items: unknown[] }>(`/search/code?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify({ total: data.total_count, items: data.items }, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-farm/github] Server running");
