# n00ton – Project Specification (Starter)

## 1. Vision
Create a bolt-on, MCP-first "agent control centre" that can be dropped into any codebase or environment and automatically:
1. discovers capabilities (MCP, CLI, HTTP/OpenAPI, task runners),
2. normalises them to a common Capability IR,
3. exposes them through a UI and a CLI,
4. lets an agent (OpenAI Agents SDK, LangGraph, or another LLM runner) call those capabilities,
5. can self-scaffold missing MCP servers for discovered CLIs/APIs.

## 2. Core components

### 2.1 Discovery Service (Node/TS)
- Scans the repo and running services.
- Looks for:
  - MCP manifests / config files.
  - package.json scripts, pnpm-workspace.yaml, turbo.json.
  - Python: pyproject.toml, requirements.txt, invoke tasks.
  - OpenAPI/Swagger/GraphQL docs.
- Emits a `capability-ir.json`.

### 2.2 Capability IR
- JSON-based, typed.
- Example:
  ```json
  {
    "id": "cli.npm.test",
    "kind": "cli",
    "title": "Run tests",
    "description": "npm run test",
    "inputs": [],
    "runner": {
      "type": "shell",
      "command": "npm",
      "args": ["run", "test"]
    },
    "auth": {
      "policy": "user-confirm"
    },
    "provenance": {
      "source": "package.json:scripts.test"
    }
  }
  ```

### 2.3 MCP Host
- Implements MCP client.
- Loads known MCP servers (from discovery) and presents them to the agent.
- Provides guardrails:
  - explicit allowlist for destructive actions,
  - per-tool confirmation,
  - audit log.

### 2.4 Agent Orchestrator
- Default: OpenAI Agents SDK (Python) or Node equivalent.
- Alternative: LangGraph (Python/JS).
- Responsibilities:
  - take chat messages,
  - map to capability IR,
  - call matching MCP or CLI,
  - stream output to UI.

### 2.5 Web UI (Next.js)
- Chat panel,
- Capability browser,
- Run history/log viewer.

## 3. Non-goals for starter
- No multi-tenant auth yet.
- No registry publishing.
- No deep provider billing.

## 4. OSS-first with paid options
- Core under Apache-2.0.
- Paid/enterprise:
  - policy editor,
  - capability packs,
  - cloud discovery,
  - registry sync.

## 5. Directory layout
- apps/
  - control-centre/  (Next.js 16 app)
  - mcp-host/        (Node/TS host service)
- packages/
  - discovery/
  - capability-ir/
  - scaffolder/
- tools/
  - scripts for local dev
