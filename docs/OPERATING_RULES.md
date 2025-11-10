# Operating Rules

> Rollback: `git rm docs/OPERATING_RULES.md` followed by `git commit --amend` (or drop the change in Git) fully reverts this briefing.

## Workflow Guardrails

- Operate in **Plan → Approve → Run → Explain** phases. Present tool choice, arguments, provenance, and expected impact before execution.
- Surface dry-run versus live execution explicitly for destructive actions. Default to dry-run and capture rollback steps before seeking approval.
- Emit structured JSON or tabular summaries that include status, artefact paths, and log pointers after every run phase.
- Record Africa/Johannesburg timestamps and keep narrative crisp (Oxford English, short sentences).
- Cite discovery sources for repo or web lookups.

## Capability Alignment

| Operating Need | Capability ID | Inputs Snapshot | Notes |
| --- | --- | --- | --- |
| Workspace hygiene & drift detection | `workspace.metaCheck` | `{ "skipBootstrap": false }` (default) | Aggregates schema checks, Frontiers sanity, pip-audit. |
| Fast-forward repos | `workspace.refresh` | Optional `{ "repos": ["n00-cortex", …] }` | Logs refreshed repos and failures. |
| Trunk upgrade gate | `workspace.trunkUpgrade` | `{}` | Promotes canonical Trunk toolchain. |
| Release manifesting | `workspace.release` | `{ "version": "YYYY.MM.DD" }` | Writes `1. Cerebrum Docs/releases.yaml`. |
| Dependency posture | `dependencies.check` | `{}` | Validates toolchain manifest alignment. |
| Renovate snapshot | `dependencies.dashboard` | `{ "output": ".dev/automation/artifacts/renovate/dashboard.json" }` | Produces changelog-friendly dashboard. |
| Cortex ⇄ Frontiers drift | `cortex.frontiersIngest` | `{ "check": true }` preferred on CI | Regenerates or validates catalog exports. |
| Project governance | `project.capture`, `project.sync.github`, `project.sync.erpnext` | `{"path": "<doc>.md"}` + optional registry override | Use `project-orchestration.py` wrappers for chained runs. |
| AI development rituals | `ai.workflow.*` | `{}` | Planning → Architecture → Coding → Debugging → Review → Runner. |
| ERPNext exports & audits | `erpnext.exportData`, `erpnext.verifyExports` | Module/format arrays with limits | Run from secured environment with credentials. |

## Safety Expectations

- Provide tool provenance: state whether the capability was declared in `capabilities/manifest.json`, scaffolded locally, or fetched remotely.
- Announce conflicts using n00-frontiers’ resolution guidelines and cross-check n00-cortex schemas before automatic remediation.
- Offer MCP wrappers when encountering external CLIs/APIs without MCP surfaces; ship diffs and ask for approval prior to applying.

## Telemetry & Artefacts

- Route progress logs to `.dev/automation/artifacts/` when available. Link the artefact or log path in the Explain phase.
- Stream completion telemetry to n00-cortex registries (for example via `record-capability-run.py`) when the capability provides hooks.
- Preserve dry-run artefacts separately to simplify audit trails.

