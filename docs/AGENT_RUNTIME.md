# Agent Runtime Blueprint

> Rollback: `git rm docs/AGENT_RUNTIME.md` (or `git restore --staged docs/AGENT_RUNTIME.md && git restore docs/AGENT_RUNTIME.md`).

## Overview

The n00t agent runtime coordinates discovery, MCP hosting, and execution guardrails. The core flow:

1. **Discovery** (`@n00t/discovery`)
   - Scans the workspace and emits a capability manifest (`capabilities/manifest.json`).
   - Normalises results into the Capability IR (`@n00t/capability-ir`).

2. **MCP Host** (`apps/mcp-host/src/index.ts`)
   - Loads the manifest, tracks run history, and exposes execution over WebSocket (default port `9088`).
   - Manages run logs in `.dev/automation/artifacts/automation/agent-runs.json`.

3. **Agent Orchestrator** (new CLI runner)
   - Enforces the **Plan → Approve → Run → Explain** cadence before delegating to capabilities.
   - Presents available operations, prompts the operator for approval, and streams run summaries.
   - Pipes telemetry into `.dev/automation/artifacts/automation/` and emits structured JSON for downstream UI.

4. **Control Centre UI** (`apps/control-centre`)
   - Front-end for the same orchestrator. Renders chat history, capability graph, and artefact links.

## Operating Constraints

- All destructive or irreversible operations must default to dry-run; require explicit approval to proceed.
- Every invocation records provenance (capability id, entrypoint, originating manifest path) and includes rollback notes in the Explain phase.
- Timestamps and durations use Africa/Johannesburg (`UTC+02`); ISO8601 with timezone offset.
- Summaries reference artefact or log paths (JSON, markdown, telemetry exports).
- When new CLIs/APIs are discovered without MCP surfaces, propose an MCP wrapper scaffold (see `packages/scaffolder`).

## Required Environment

| Variable | Purpose | Notes |
| --- | --- | --- |
| `WORKSPACE_ROOT` | Absolute path to workspace root (defaults to repository root). | Passed automatically by scripts and MCP host. |
| `n00t_MCP_PORT` | Port for the WebSocket bridge. | Defaults to `9088`. |
| `CAPABILITY_PAYLOAD` | JSON payload passed to shell entrypoints. | Populated by runner; includes dry-run flags and output paths. |
| `TZ` | Timezone for logs. | Set to `Africa/Johannesburg`. |

## Exposed Commands (target state)

| Script | Description |
| --- | --- |
| `pnpm agent` | Launches the agent runtime CLI (Plan → Approve → Run → Explain). |
| `pnpm agent:plan` | Preview capability run book without execution; same structured output. |
| `pnpm agent:simulate` | Replay historical run from `agent-runs.json` for auditing/testing. |

## Next Steps

- Implement the Node CLI (`apps/agent-runner/src/index.ts`) to orchestrate chat interactions and approvals.
- Register scripts in `package.json` to expose the CLI (`agent`, `agent:plan`, `agent:simulate`).
- Extend tests under `tests/` to cover approval workflow and telemetry emissions.
- Wire the control-centre UI to the same API surface (reuse HTTP/WS endpoints).

