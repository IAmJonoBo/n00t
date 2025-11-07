# Project Orchestration Runbook

This runbook explains how n00t orchestrates project metadata across ideas, charters, GitHub, and ERPNext. It is designed for human operators, local agents, and cloud copilots so handovers remain deterministic and drift is corrected quickly.

---

## 1. Capability Overview

| Capability ID            | Purpose                                                                               | When to Use                                                     |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `project.capture`        | Validate an artefact’s metadata and register it against the unified catalog.          | After editing an existing idea/charter/learning log.            |
| `project.sync.github`    | Surface upstream/downstream impacts before reconciling with GitHub Projects.          | Prior to updating project boards or creating new columns.       |
| `project.sync.erpnext`   | Check readiness before syncing metadata to ERPNext project tasks/blueprints.          | Before Platform Ops applies project code updates.               |
| `project.recordIdea`     | Scaffold a new idea (metadata + Markdown body) and register it automatically.         | During discovery or when transcribing meeting notes.            |
| `project.ingestMarkdown` | Attach metadata to an existing Markdown document (or remediate gaps) and register it. | When converting historical docs or fixing missing front matter. |

All capabilities emit:

- `status` – `ok` when ready, `attention` when follow-up is required.
- `upstreamImpacts` – artefacts that fed the metadata (ADRs, learning logs, etc.).
- `downstreamImpacts` – actions or TODOs to resolve (e.g., missing GitHub board, ERPNext blueprint).
- `drift` – metadata fields that changed relative to the registry.
- `warnings` – advisory notes (e.g., tags canonicalised).

The execution writes JSON artefacts to `.dev/automation/artifacts/project-sync/` so handovers capture the full context.

---

## 2. Standardised Metadata (Edge Case Playbook)

### Mandatory Fields

| Field             | Notes                                                                | Autofix                                                      |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `id`              | Format `idea-…`, `project-…`, `learn-…`, `issue-…`. Must be unique.  | `project.ingestMarkdown --id`                                |
| `title`           | Human readable.                                                      | `project.ingestMarkdown` infers from `# Heading`.            |
| `lifecycle_stage` | `discover / shape / deliver / archive`.                              | `autofix-project-metadata.py --apply --set-default-status`.  |
| `status`          | e.g. `proposed`, `in-definition`, `recorded`.                        | `autofix-project-metadata.py --set-default-status`.          |
| `owner`           | Team or person accountable.                                          | `project.ingestMarkdown --owner`.                            |
| `tags[]`          | Must exist in catalog (`n00-cortex/data/catalog/project-tags.yaml`). | `autofix-project-metadata.py --apply` canonicalises aliases. |
| `review_date`     | ISO date for next review.                                            | `project.ingestMarkdown --review-days N`.                    |

### Link Hygiene

- Use relative paths from the document to related artefacts (`links[].path`).
- The validator ensures referenced files exist; missing paths block merges.
- Downstream TODOs should be logged via `project.sync.*` outputs and tracked in GitHub issues.

### Duplicate Detection

`validate-project-metadata.py` surfaces duplicate IDs across the workspace. Resolve by renaming the `id` (and directory if necessary) then rerun `project.capture`.

---

## 3. Drift & Auto-Remediation Guardrails

### Scenarios & Responses

| Scenario                                                          | Detection                                                         | Remediation                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Alias tags (`design-system` vs canonical `dx/frontier-standards`) | Warning from validator/capture.                                   | Run `.dev/automation/scripts/autofix-project-metadata.py --apply`.                                                |
| Missing metadata block                                            | `MetadataLoadError` from validator/integrations.                  | `project.ingestMarkdown --path <doc> --kind idea --owner ...`                                                     |
| Unsynchronised GitHub project                                     | `project.sync.github` adds TODO in `downstreamImpacts`.           | Apply blueprint (see §4) or update metadata to include board URL.                                                 |
| ERPNext project absent                                            | `project.sync.erpnext` warns `erpnext_project metadata is empty`. | Populate blueprint in ERPNext and set `erpnext_project` using `project.ingestMarkdown --erpnext-project PM-XXXX`. |
| Agent handover                                                    | Latest JSON artefact + registry entry share canonical state.      | Share path to artefact + rerun `project.capture` after edits.                                                     |

### Automation Order of Operations

1. `project.ingestMarkdown` (or `project.recordIdea`) – ensures front matter is present.
2. `project.capture` – validates and updates registry (normalises tags automatically).
3. `project.sync.github` – review TODOs; run GitHub CLI automation if ready.
4. `project.sync.erpnext` – confirm blueprint alignment prior to ops deployment.

> Tip: Integrate these steps into commit hooks or CI to prevent drift entering main branches.

> Script shortcuts:
>
> - `.dev/automation/scripts/github-project-apply-blueprint.sh` wraps `gh project create --copy-file` with required flags (`--title`, `--owner`), avoiding the “required flag(s) 'title' not set” error. The script prints the resulting project URL for metadata updates.
> - All scripts accept absolute or workspace-relative paths so cloud agents can execute them without extra setup.

---

## 4. GitHub Project & ERPNext Blueprint Alignment

### GitHub Project Template

Generated repositories include `blueprints/github-project-template.json` (see `templates/project-management/{{cookiecutter.project_slug}}` in n00-frontiers). Apply it via:

```bash
gh project create --copy-file blueprints/github-project-template.json \
  --owner {{ cookiecutter.github_org }} \
  --title "Unified PM – {{ cookiecutter.project_name }}"
```

> Use `.dev/automation/scripts/github-project-apply-blueprint.sh --owner {{ cookiecutter.github_org }} --title "Unified PM – {{ cookiecutter.project_name }}" --blueprint blueprints/github-project-template.json` to automate the command and guarantee required flags are supplied.

The blueprint defines:

- Columns: Backlog / In Progress / Review / Blocked / Done
- Custom fields: Priority, Target Iteration, Lifecycle Stage
- Auto-add rules for issues labelled `task`, `from:todo`, `from:tasklist`

Use `.dev/automation/scripts/github-project-apply-blueprint.sh --owner {{ cookiecutter.github_org }} --title "Unified PM – {{ cookiecutter.project_name }}" --template-number <project_number>` (or pass a blueprint JSON that encodes `template_project_number`) to wrap `gh project copy` with the required `--title` flag and avoid the CLI error.

Update the generated `github_project` metadata with the resulting board URL.

### ERPNext Blueprint

`blueprints/erpnext-project-blueprint.json` (and project-specific variants under `n00tropic_HQ/.../erpnext/`) define the ERPNext representation:

- Project code plus display name, default task groups, SLA targets, tag defaults, and operator notes.
- Blueprints are authored in JSON; YAML is also supported when `PyYAML` is available locally.
- After provisioning, set `erpnext_project` in the artefact metadata so `project.sync.erpnext` can verify alignment.

Provision or reconcile the project with:

```bash
.dev/automation/scripts/erpnext-import-blueprint.sh \
  --instance http://127.0.0.1:8080 \
  --site ops.n00tropic.local \
  --blueprint n00tropic_HQ/99. Internal-Projects/IP-3-frontier-ops-control-plane/erpnext/pm-fops-ctrl-blueprint.json
```

- Requires `ERPNEXT_API_KEY`/`ERPNEXT_API_SECRET` or `ERPNEXT_BEARER_TOKEN` (script sets `Authorization` and `X-Frappe-Site-Name`).
- Uses ERPNext’s REST resources: creates the Project when missing, updates description/tags when present, and ensures Tasks (keyed by subject) are created or refreshed without duplication.
- Writes a machine-readable summary to `/tmp/erpnext_import_resp.json` and echoes any `notes[]` from the blueprint so follow-up checks are obvious.
- Re-run safely at any time; the script is idempotent and only updates fields that drift from the blueprint. Follow with `project.sync.erpnext` to capture downstream evidence.

---

## 5. Recording New Ideas from Notes

Use the `project.recordIdea` capability to capture discussion outcomes quickly:

```json
{
  "title": "Unified onboarding playbook",
  "owner": "service-delivery",
  "tags": ["governance/project-management", "automation/n00t"],
  "sponsors": ["leadership-council"],
  "source": "ops-review"
}
```

The capability:

1. Generates `n00-horizons/ideas/idea-unified-onboarding-playbook/README.md`.
2. Populates metadata (status `proposed`, review date = today + 30 days).
3. Registers the idea in `n00-cortex/data/catalog/projects.json`.
4. Returns any downstream TODOs (e.g., missing GitHub project link).

---

## 6. Ingesting Existing Docs

To attach metadata to an archived doc:

```bash
.dev/automation/scripts/project-ingest-markdown.sh \
  --path n00tropic_HQ/99. Internal-Projects/IP-3-ops-handoff/IP-3.md \
  --kind project \
  --owner "platform-ops" \
  --tags governance/project-management automation/n00t \
  --erpnext-project PM-OPS-HANDOFF \
  --github-project https://github.com/orgs/IAmJonoBo/projects/101
```

If the doc already had metadata, only supplied fields are updated. The command finishes by running `project.capture`, guaranteeing the registry stays current.

---

## 7. Tag Governance

- Canonical taxonomy lives at `n00-cortex/data/catalog/project-tags.yaml`.
- Proposed changes require PRs against n00-cortex (owners: Product Office + Platform Ops).
- Use aliases sparingly; the validator rewrites them to canonical names.
- When in doubt, tag at the most specific level (e.g., `integration/erpnext`, not just `integration`).

---

## 8. Troubleshooting

| Issue                               | Cause                                      | Fix                                                                      |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `MetadataLoadError`                 | Front matter missing or malformed.         | Run `project.ingestMarkdown` or edit YAML manually.                      |
| `Duplicate metadata id`             | Two artefacts share `id`.                  | Rename the newcomer via `project.ingestMarkdown --id` and rerun capture. |
| `Tag 'foo' not present in taxonomy` | Unapproved tag.                            | Map to existing tag or update taxonomy via n00-cortex.                   |
| GitHub project TODO persists        | Board not created or metadata missing URL. | Apply blueprint + update metadata.                                       |
| ERPNext blueprint mismatch          | ERPNext project absent or code differs.    | Align blueprint, set `erpnext_project`, rerun `project.sync.erpnext`.    |

---

## 9. Task Slices & Impact Analysis

- Follow the [Task Slice Playbook](../../n00-horizons/docs/task-slice-playbook.md) for taxonomy, metadata fields, and impact worksheets; every idea, charter, milestone, instrumentation file, and learning log should cite upstream/downstream slices in `links[]`.
- After editing an artefact, run `project.capture` plus `project.sync.github`/`project.sync.erpnext` to refresh reminders; include the resulting JSON artefact paths in the worksheet so handovers have evidence.
- For airgapped systems, set `PYTHONPATH` to the n00-frontiers templates directory so hooks resolve locally, and rely on `.dev/automation/scripts/github-project-apply-blueprint.sh --template-number <id>` + `.dev/automation/scripts/erpnext-import-blueprint.sh` to reproduce automation offline.

---

## 10. Automation Shortcuts

- Validate everything: `.dev/automation/scripts/validate-project-metadata.py`
- Autofix canonical tags/defaults: `.dev/automation/scripts/autofix-project-metadata.py --apply`
- Summarise slices/links: `.dev/automation/scripts/project-slice-report.py --json artifacts/project-slices.json`
- Scaffold & register from CLI: `.dev/automation/scripts/project-record-idea.sh --title "..." --owner "..."`
- Bulk ingest directory:

  ```bash
  find n00tropic_HQ/99. Internal-Projects -name "*.md" -maxdepth 2 \
    -exec .dev/automation/scripts/project-ingest-markdown.sh --kind project --path {} \;
  ```

Maintaining these guardrails ensures any agent can resume work reliably, whether they operate locally, via the cloud, or through scheduled automation.
