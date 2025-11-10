# Capability Manifest

`manifest.json` lists the actions that n00t can expose over MCP, CLI, or future orchestration APIs.

- `workspace.metaCheck` → runs `.dev/automation/scripts/meta-check.sh` (frontiers sanity, pip-audit, schema validation).
- `workspace.refresh` → executes `.dev/automation/scripts/refresh-workspace.sh` to fast-forward repos.
- `workspace.trunkUpgrade` → executes `.dev/automation/scripts/trunk-upgrade.sh` to run `trunk upgrade` anywhere a `.trunk/trunk.yaml` exists; accepts optional `repos[]` filters and extra `flags[]`.
- `workspace.release` → runs `.dev/automation/scripts/workspace-release.sh`, writes `1. Cerebrum Docs/releases.yaml`, and returns the manifest path.
- `workspace.gitDoctor` → runs `.dev/automation/scripts/workspace-health.sh`, emits `artifacts/workspace-health.json`, and can clean untracked files or sync submodules before reporting.
- `dependencies.check` → executes `.dev/automation/scripts/check-cross-repo-consistency.py` to validate canonical toolchains and per-project overrides against Cortex policy.
- `dependencies.dashboard` → builds the Renovate dependency snapshot via `.dev/automation/scripts/generate-renovate-dashboard.py`.
- `cortex.frontiersIngest` → triggers `.dev/automation/scripts/ingest-frontiers.sh` (or `--check`) to push n00-frontiers exports into n00-cortex.
- `school.trainingRun` → shells into `n00-school/scripts/run-training.sh` to validate or execute training pipelines (emits run directory + metadata path).

Agents should inspect this manifest to discover available automation, required inputs, and expected outputs.
