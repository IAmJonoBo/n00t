# Start Here: n00t

n00t is the MCP control centre that orchestrates automation, exposes capabilities, and provides a UI for agents and operators.

## If you only have 5 minutes

- Read the root [`README.md`](../README.md) for architecture and workflow context.
- Open `capabilities/manifest.json` to see the automation surface area available to agents.
- Sync runtimes with the workspace-specific `pnpm` and Trunk versions listed in `package.json` and `.trunk/trunk.yaml`.

## Quick start (humans)

```bash
cd n00t
pnpm install

# Run unit tests
pnpm test

# Launch the development UI
pnpm dev
```

## Agent hooks

- Every entry in `capabilities/manifest.json` is exported to MCP clients (e.g. n00t’s web UI, CLI, or external agents).
- The manifest now points to `../../../.dev/automation/scripts/*` so workspace-level scripts stay reusable.
- Submodule `n00t-widget-mcp-enab/` bundles a referential UI widget; keep its build artefacts (`dist/`, `node_modules/`) ignored.

## Key directories

| Path            | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `apps/`         | Next.js web app for the control centre.                            |
| `capabilities/` | Declarative manifest + helpers for automation exposure.            |
| `packages/`     | Shared libraries used across the UI and CLI.                       |
| `tests/`        | Vitest suites ensuring manifest helpers and adapters stay healthy. |

## Contribution guardrails

- Update `.trunk/trunk.yaml` and `capabilities/manifest.json` together when introducing new automation scripts.
- Regenerate type definitions (`pnpm run lint:types`) if you modify manifest helpers.
- Keep automation scripts in the workspace root (`../../../.dev/automation/scripts/`) so other repos can reuse them.
