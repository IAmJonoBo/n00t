# n00ton

n00ton is an OSS-first, MCP-centric agent control centre for the entire n00tropic platform. It now:

- scans a project for MCP servers, CLIs, OpenAPI/GraphQL specs;
- normalises them into a capability graph;
- exposes them to an agent (local or cloud) via a unified host; and
- ships a drop-in web UI (Next.js) to chat with and orchestrate capabilities;
- brokers workspace-wide automation (refresh, meta-check, release) using the shared toolchain manifest; and
- streams telemetry back into `n00-cortex` so downstream generators keep pace with live execution.

With the introduction of `n00-school/`, n00ton will also trigger training runs, simulations, and regression suites against freshly fine-tuned models.

> Status: starter pack scaffold. Flesh out adapters and orchestration hooks before promoting to production.

## Capability Manifest

Automation actions are declared in [`capabilities/manifest.json`](capabilities/manifest.json). The manifest powers MCP resources, CLI wrappers, and any future orchestration APIs.
