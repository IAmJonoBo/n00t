# n00t

n00t is an OSS-first, MCP-centric agent control centre for the entire n00tropic platform. It:

- scans a project for MCP servers, CLIs, OpenAPI/GraphQL specs;
- normalises them into a capability graph;
- exposes them to an agent (local or cloud) via a unified host; and
- ships a drop-in web UI (Next.js) to chat with and orchestrate capabilities;
- brokers workspace-wide automation (refresh, meta-check, release) using the shared toolchain manifest; and
- streams telemetry back into `n00-cortex` so downstream generators keep pace with live execution.

With the introduction of `n00-school/`, n00t will also trigger training runs, simulations, and regression suites against freshly fine-tuned models.

## Developer workflow

```bash
pnpm install
pnpm test        # Executes workspace tests and Vitest suites
```

`pnpm test` now exercises:

- workspace-local `test` scripts (if defined);
- the shared Vitest harness (see `tests/` and `vitest.config.ts`) covering capability-manifest helpers and discovery logic.

When working on AI/ML automation, the `school.trainingRun` capability can be invoked directly:

```bash
pnpm exec ../n00-school/scripts/run-training.sh default --dataset horizons-sample
```

> Status: starter pack scaffold. Flesh out adapters and orchestration hooks before promoting to production.

## Capability Manifest

Automation actions are declared in [`capabilities/manifest.json`](capabilities/manifest.json). The manifest powers MCP resources, CLI wrappers, and any future orchestration APIs.

See `START HERE/PROJECT_ORCHESTRATION.md` for the full runbook covering project capture, sync flows, and metadata remediation commands.
