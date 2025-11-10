# Agent Runner Secret Mapping

This directory contains metadata that tells the agent runner which credential bundles to load before executing capabilities. Do not store actual credentials here – keep secret material in the operator-managed directory (defaults to `n00tropic_HQ/12-Platform-Ops/secrets/`).

## Files

- `capability-env.json` — Declarative mapping between capability identifiers (or wildcard patterns) and `.env` files that must be sourced before invoking the capability. Update this file whenever a new capability needs credentials so the runner can hydrate environment variables automatically.

## CLI Overrides

Operators can request extra bundles during a run without editing the mapping by passing `--env-file <name>` (repeatable) or setting the comma-separated `--env-files <a,b,c>` flag on `n00t-agent`. These flags resolve against the operator-managed secrets directory unless an absolute path is provided.

## Telemetry Trail

Each run appends a summary entry to `n00tropic_HQ/12-Platform-Ops/telemetry/agent-runner-log.jsonl`. The record lists which bundles were requested, loaded, or missing so the operations team can audit credential hygiene. Avoid storing raw secrets in telemetry – only bundle identifiers are captured.
