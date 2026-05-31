# Contributing to MCP Farm

Thank you for helping grow the farm! 🌾

## Getting Started

```bash
git clone https://github.com/your-org/mcp-farm.git
cd mcp-farm
npm install
npm run build
```

## Project Structure

```
packages/<tool>-mcp/
├── src/
│   └── index.ts      # MCP server entry point — all tools defined here
├── package.json
├── tsconfig.json
└── README.md
```

Each MCP server lives in its own package. They are intentionally self-contained — `src/index.ts` is the only required file.

## Adding a New Tool to an Existing Server

1. Open `packages/<tool>-mcp/src/index.ts`
2. Add a new `server.tool(...)` block following the existing pattern
3. Add the tool to the README table
4. Write a test in `src/__tests__/`
5. Submit a PR

## Adding a New MCP Server

1. Create `packages/<new-tool>-mcp/`
2. Copy `packages/jira-mcp/` as a template
3. Update `package.json` name, description, bin
4. Implement tools in `src/index.ts`
5. Write a README
6. Add to root `README.md` table
7. Submit a PR

## Code Style

- TypeScript strict mode
- `async/await` over `.then()` chains
- Descriptive tool names and parameter descriptions (these appear in AI prompts)
- Always validate required env vars at startup and exit with a clear message
- Never log credentials

## Testing

```bash
# Test a specific package
cd packages/jira-mcp
npm test

# Test all
npm test --workspaces
```

For integration tests, set real credentials in a local `.env.test` file (never commit this).

## Pull Request Checklist

- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] New tools documented in the package README
- [ ] Env vars documented in `docs/configuration.md` if new

## Commit Message Format

```
feat(jira): add get_sprint_velocity tool
fix(splunk): handle token expiry gracefully
docs(dynatrace): add required token scopes
```

## Issues

Use GitHub Issues for bug reports and feature requests. Include:
- Which package is affected
- Steps to reproduce
- Expected vs actual behaviour
- Relevant env var names (never values!)
