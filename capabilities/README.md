# Capability Manifest

`manifest.json` lists the actions that n00t can expose over MCP, CLI, or future orchestration APIs.

- `workspace.metaCheck` → runs `scripts/meta-check.sh` (frontiers sanity, pip-audit, schema validation).
- `workspace.refresh` → executes `scripts/refresh-workspace.sh` to fast-forward repos.
- `workspace.release` → writes `1.CEREBRUM-DOCS/releases.yaml` and returns the manifest path.
- `dependencies.check` → validates canonical toolchains and per-project overrides against Cortex policy.
- `school.trainingRun` → shells into `n00-school/scripts/run-training.sh` to launch model jobs.

Agents should inspect this manifest to discover available automation, required inputs, and expected outputs.
