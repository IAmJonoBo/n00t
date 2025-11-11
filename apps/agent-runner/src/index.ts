import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import dotenv from "dotenv";

import type { CapabilitySummary } from "@n00t/capability-ir";
import { discoverCapabilities } from "@n00t/discovery";

export type { CapabilitySummary } from "@n00t/capability-ir";

export const TZ = "Africa/Johannesburg";

export interface CliOptions {
  capabilityId?: string;
  prompt?: string;
  check: boolean;
  planOnly: boolean;
  simulateId?: string;
  dryRunOnly: boolean;
  envFiles: string[];
  autoApprove: boolean;
}

interface AgentRunRecord {
  id: string;
  capability: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  summary: string;
  started: string;
  completed?: string;
  logPath?: string;
  metadata?: Record<string, unknown>;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string[];
  stderr: string[];
}

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(moduleFilename);
const isExecutedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === moduleFilename;

const workspaceRoot =
  process.env.WORKSPACE_ROOT ?? path.resolve(moduleDir, "..", "..", "..", "..");
const artifactsRoot = path.join(
  workspaceRoot,
  ".dev/automation/artifacts/automation",
);
const agentRunsPath = path.join(artifactsRoot, "agent-runs.json");
const hqRoot =
  process.env.N00T_HQ_ROOT ?? path.resolve(workspaceRoot, "..", "n00tropic_HQ");
const secretsRoot =
  process.env.N00T_SECRETS_ROOT ?? path.join(hqRoot, "12-Platform-Ops", "secrets");
const telemetryRoot =
  process.env.N00T_TELEMETRY_ROOT ?? path.join(hqRoot, "12-Platform-Ops", "telemetry");
const telemetryLogPath = path.join(telemetryRoot, "agent-runner-log.jsonl");
const secretMappingPath = path.join(workspaceRoot, "secrets", "capability-env.json");

export interface SecretMappingEntry {
  pattern: string;
  envFiles: string[];
}

export interface SecretMapping {
  entries: SecretMappingEntry[];
}

export interface SecretResolution {
  requested: string[];
  loaded: string[];
  missing: string[];
  env: Record<string, string>;
}

let cachedSecretMapping: SecretMapping | null = null;

export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[-/\\^$+.,()|[\]{}]/g, "\\$&");
  const regexSource = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
  return new RegExp(regexSource);
}

export function patternMatchesCapability(pattern: string, capability: CapabilitySummary): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern.startsWith("tag:")) {
    const tag = pattern.slice(4);
    return Array.isArray(capability.tags) ? capability.tags.includes(tag) : false;
  }
  if (pattern.includes("*") || pattern.includes("?")) {
    return wildcardToRegExp(pattern).test(capability.id);
  }
  return capability.id === pattern;
}

function loadSecretMapping(): SecretMapping {
  if (cachedSecretMapping) {
    return cachedSecretMapping;
  }
  try {
    const raw = fs.readFileSync(secretMappingPath, "utf-8");
    const parsed = JSON.parse(raw) as { patterns?: unknown };
    if (Array.isArray(parsed.patterns)) {
      cachedSecretMapping = {
        entries: parsed.patterns
          .map((entry) => {
            if (
              entry &&
              typeof entry === "object" &&
              typeof (entry as { pattern?: unknown }).pattern === "string" &&
              Array.isArray((entry as { envFiles?: unknown }).envFiles)
            ) {
              const envFiles = (entry as { envFiles: unknown[] }).envFiles
                .filter((file): file is string => typeof file === "string")
                .map((file) => file.trim())
                .filter((file) => file.length > 0);
              return {
                pattern: ((entry as { pattern: string }).pattern).trim(),
                envFiles,
              } satisfies SecretMappingEntry;
            }
            return null;
          })
          .filter((entry): entry is SecretMappingEntry => Boolean(entry)),
      };
    } else {
      cachedSecretMapping = { entries: [] };
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      console.warn(chalk.yellow("Warning: unable to read secret mapping configuration:"), error);
    }
    cachedSecretMapping = { entries: [] };
  }
  return cachedSecretMapping;
}

export function buildSecretRequestList(
  capability: CapabilitySummary,
  cliEnvFiles: string[],
  mapping: SecretMapping,
): string[] {
  const requested = new Set<string>();
  mapping.entries.forEach((entry) => {
    if (patternMatchesCapability(entry.pattern, capability)) {
      entry.envFiles.forEach((file) => {
        const trimmed = file.trim();
        if (trimmed.length > 0) {
          requested.add(trimmed);
        }
      });
    }
  });

  if (capability.id.startsWith("erpnext.")) {
    requested.add("erpnext.env");
  }
  if (Array.isArray(capability.tags) && capability.tags.includes("needs:erpnext")) {
    requested.add("erpnext.env");
  }

  cliEnvFiles.forEach((file) => {
    if (file && file.trim().length > 0) {
      requested.add(file.trim());
    }
  });

  return Array.from(requested);
}

function labelSecretFile(reference: string, absolute: string): string {
  if (!path.isAbsolute(reference)) {
    return reference;
  }
  const relativeToRoot = path.relative(secretsRoot, absolute);
  return relativeToRoot.startsWith("..") ? absolute : relativeToRoot;
}

async function prepareSecrets(
  capability: CapabilitySummary,
  options: CliOptions,
): Promise<SecretResolution> {
  const mapping = loadSecretMapping();
  const requested = buildSecretRequestList(capability, options.envFiles, mapping);
  if (requested.length === 0) {
    return { requested, loaded: [], missing: [], env: {} };
  }

  const env: Record<string, string> = {};
  const loaded: string[] = [];
  const missing: string[] = [];

  for (const reference of requested) {
    const target = path.isAbsolute(reference)
      ? reference
      : path.join(secretsRoot, reference);
    if (!fs.existsSync(target)) {
      missing.push(labelSecretFile(reference, target));
      console.warn(chalk.yellow(`Warning: secret file not found: ${labelSecretFile(reference, target)}`));
      continue;
    }
    try {
      const contents = await readFile(target, "utf-8");
      const parsed = dotenv.parse(contents);
      Object.assign(env, parsed);
      loaded.push(labelSecretFile(reference, target));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: unable to parse secret file ${labelSecretFile(reference, target)}:`), error);
    }
  }

  return { requested, loaded, missing, env };
}

interface TelemetryEvent {
  id: string;
  capability: string;
  status: AgentRunRecord["status"];
  started: string;
  completed?: string;
  durationSeconds?: number;
  check: boolean;
  secretsLoaded: string[];
  secretsMissing: string[];
  promptProvided: boolean;
}

export async function emitTelemetryEvent(event: TelemetryEvent) {
  try {
    await mkdir(telemetryRoot, { recursive: true });
    await appendFile(telemetryLogPath, `${JSON.stringify(event)}\n`, "utf-8");
  } catch (error) {
    console.warn(chalk.yellow("Warning: failed to write telemetry event:"), error);
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    check: true,
    planOnly: false,
    dryRunOnly: false,
    envFiles: [],
    autoApprove: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--capability":
      case "-c":
        options.capabilityId = argv[i + 1];
        i += 1;
        break;
      case "--prompt":
      case "-p":
        options.prompt = argv[i + 1];
        i += 1;
        break;
      case "--no-check":
        options.check = false;
        break;
      case "--check":
        options.check = true;
        break;
      case "--plan-only":
        options.planOnly = true;
        break;
      case "--simulate":
        options.simulateId = argv[i + 1];
        i += 1;
        break;
      case "--dry-run-only":
        options.dryRunOnly = true;
        break;
      case "--env":
      case "--env-file":
        if (argv[i + 1]) {
          options.envFiles.push(argv[i + 1]);
        }
        i += 1;
        break;
      case "--auto-approve":
        options.autoApprove = true;
        break;
      default:
        break;
    }
  }
  return options;
}

export function johannesburgTimestamp(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
  const { year, month, day, hour, minute, second } = parts;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`;
}

async function ensureArtifactsRoot() {
  await mkdir(artifactsRoot, { recursive: true });
}

async function readAgentRuns(): Promise<AgentRunRecord[]> {
  try {
    const raw = await readFile(agentRunsPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentRunRecord[]) : [];
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      await ensureArtifactsRoot();
      await writeFile(agentRunsPath, "[\n]", "utf-8");
      return [];
    }
    console.warn(chalk.yellow("Warning: unable to read agent run log:"), error);
    return [];
  }
}

async function writeAgentRuns(records: AgentRunRecord[]) {
  await ensureArtifactsRoot();
  await writeFile(agentRunsPath, `${JSON.stringify(records, null, 2)}\n`, "utf-8");
}

async function appendAgentRun(record: AgentRunRecord) {
  const records = await readAgentRuns();
  const existingIndex = records.findIndex((entry) => entry.id === record.id);
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }
  await writeAgentRuns(records);
}

async function closeDanglingRuns() {
  const records = await readAgentRuns();
  let mutated = false;
  const timestamp = johannesburgTimestamp();
  const updated = records.map((record) => {
    const originalMetadata: Record<string, unknown> = record.metadata ?? {};
    const autoRecovered =
      typeof originalMetadata.autoRecovered === "boolean"
        ? Boolean(originalMetadata.autoRecovered)
        : false;
    if (record.status !== "running" || autoRecovered) {
      return record;
    }
    mutated = true;
    return {
      ...record,
      status: "failed" as const,
      completed: record.completed ?? timestamp,
      summary: "Run auto-marked as failed after interrupted execution.",
      metadata: { ...originalMetadata, autoRecovered: true },
    };
  });
  if (mutated) {
    await writeAgentRuns(updated);
  }
}

function formatPlan(
  capability: CapabilitySummary,
  check: boolean,
  prompt: string | undefined,
  secrets: SecretResolution,
) {
  console.log(chalk.cyan("Plan"));
  console.log(
    chalk.white(
      `  - Capability: ${capability.id}\n  - Summary: ${capability.summary}\n  - Entrypoint: ${capability.entrypoint}\n  - Absolute Entrypoint: ${capability.absoluteEntrypoint}\n  - Supports check: ${capability.supportsCheck ? "yes" : "no"}`,
    ),
  );
  if (prompt && prompt.trim().length > 0) {
    console.log(chalk.white(`  - Prompt: ${prompt.trim()}`));
  }
  if (secrets.requested.length > 0) {
    const details: string[] = [`requested ${secrets.requested.length}`];
    if (secrets.loaded.length > 0) {
      details.push(`available ${secrets.loaded.length}`);
    }
    if (secrets.missing.length > 0) {
      details.push(`missing ${secrets.missing.length}`);
    }
    console.log(chalk.white(`  - Secrets: ${details.join(", ")}`));
    if (secrets.loaded.length > 0) {
      console.log(chalk.white(`    Loaded: ${secrets.loaded.join(", ")}`));
    }
    if (secrets.missing.length > 0) {
      console.log(chalk.yellow(`    Missing: ${secrets.missing.join(", ")}`));
    }
  } else {
    console.log(chalk.white("  - Secrets: none"));
  }
  if (capability.supportsCheck) {
    console.log(
      chalk.white(`  - Mode: ${check ? "dry-run (check=true)" : "execute"}`),
    );
  } else {
    console.log(chalk.white("  - Mode: execute (check unsupported)"));
  }
}

function listCapabilities(capabilities: CapabilitySummary[]) {
  console.log(chalk.bold("Available capabilities:"));
  capabilities.forEach((cap, index) => {
    console.log(
  chalk.gray(`${index + 1}. ${cap.id} - ${cap.summary}`),
    );
  });
}

async function chooseCapability(capabilities: CapabilitySummary[]): Promise<CapabilitySummary> {
  const rl = createInterface({ input, output });
  listCapabilities(capabilities);
  while (true) {
    const response = await rl.question(chalk.cyan("Select capability by number: "));
    const index = Number.parseInt(response, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= capabilities.length) {
      rl.close();
      return capabilities[index - 1];
    }
    console.log(chalk.yellow("Invalid selection. Try again."));
  }
}

async function requestApproval(): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(chalk.cyan("Approve execution? [y/N] "));
  rl.close();
  if (!answer) return false;
  const normalised = answer.trim().toLowerCase();
  return normalised === "y" || normalised === "yes";
}

async function runCapability(
  capability: CapabilitySummary,
  check: boolean,
  prompt: string | undefined,
  secretEnv: Record<string, string>,
): Promise<RunResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WORKSPACE_ROOT: workspaceRoot,
    TZ,
  };
  Object.assign(env, secretEnv);
  const payload: Record<string, unknown> = {};
  if (prompt && prompt.trim().length > 0) {
    payload.input = prompt.trim();
  }
  if (capability.supportsCheck) {
    payload.check = Boolean(check);
  }
  const timestampLabel = johannesburgTimestamp().replace(/[:+]/g, "-");
  const outputPath = path.join(
    artifactsRoot,
    `agent-run-${capability.id.replace(/\./g, "-")}-${timestampLabel}.json`,
  );
  payload.output = outputPath;
  env.CAPABILITY_PAYLOAD = JSON.stringify(payload);

  await ensureArtifactsRoot();

  const child = spawn(capability.absoluteEntrypoint, {
    cwd: workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  if (child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutChunks.push(text);
      process.stdout.write(text);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      process.stderr.write(text);
    });
  }

  const exitCode: number | null = await new Promise((resolve) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      stderrChunks.push(error.message);
      resolve(typeof error.code === "number" ? error.code : 1);
    };
    child.once("error", handleError);
    child.once("close", (code) => {
      child.off("error", handleError);
      resolve(code);
    });
  });

  return { exitCode, stdout: stdoutChunks, stderr: stderrChunks };
}

export function summariseResult(result: RunResult): { status: AgentRunRecord["status"]; summary: string } {
  if (result.exitCode === 0) {
    const stdoutTail = result.stdout.at(-1)?.trim();
    return {
      status: "succeeded",
      summary: stdoutTail && stdoutTail.length > 0
        ? `Run succeeded. Tail: ${stdoutTail.slice(0, 160)}`
        : "Run succeeded.",
    };
  }
  const tail = result.stderr.at(-1)?.trim() ?? result.stdout.at(-1)?.trim() ?? "";
  return {
    status: "failed",
    summary: tail.length > 0
      ? `Run failed (exit ${result.exitCode ?? -1}). Tail: ${tail.slice(0, 160)}`
      : `Run failed (exit ${result.exitCode ?? -1}).`,
  };
}

async function simulateRun(simulateId: string) {
  const records = await readAgentRuns();
  const record = records.find((entry) => entry.id === simulateId);
  if (!record) {
    console.error(chalk.red(`No run found with id ${simulateId}.`));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.cyan("Simulation"));
  console.log(JSON.stringify(record, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await closeDanglingRuns();

  if (options.simulateId) {
    await simulateRun(options.simulateId);
    return;
  }

  const discovery = discoverCapabilities(workspaceRoot);
  const capabilities = discovery.capabilities;
  if (capabilities.length === 0) {
    console.error(chalk.red("No capabilities were discovered. Ensure the manifest is present."));
    process.exitCode = 1;
    return;
  }

  let capability: CapabilitySummary | undefined;
  if (options.capabilityId) {
    capability = capabilities.find((cap) => cap.id === options.capabilityId);
    if (!capability) {
      console.error(chalk.red(`Capability ${options.capabilityId} not found.`));
      process.exitCode = 1;
      return;
    }
  } else {
    capability = await chooseCapability(capabilities);
  }

  if (!capability) {
    console.error(chalk.red("No capability selected."));
    process.exitCode = 1;
    return;
  }

  if (!capability.supportsCheck && options.check) {
    console.log(chalk.yellow("Capability does not support dry-run. Proceeding with execute mode."));
  }

  const secrets = await prepareSecrets(capability, options);

  formatPlan(capability, options.check, options.prompt, secrets);

  if (options.planOnly) {
    console.log(chalk.green("Plan only requested. Exiting without execution."));
    return;
  }

  if (options.autoApprove) {
    console.log(chalk.white("Auto-approve enabled. Continuing without manual confirmation."));
  } else {
    const approved = await requestApproval();
    if (!approved) {
      console.log(chalk.yellow("Execution cancelled by operator."));
      return;
    }
  }

  if (options.dryRunOnly && !options.check && capability.supportsCheck) {
    console.log(chalk.yellow("Dry-run only flag set. Skipping execute mode."));
    return;
  }

  const runId = randomUUID();
  const started = new Date();
  const startedAt = johannesburgTimestamp(started);

  await appendAgentRun({
    id: runId,
    capability: capability.id,
    status: "running",
    summary: "Agent CLI run started.",
    started: startedAt,
    logPath: path.relative(workspaceRoot, capability.absoluteEntrypoint),
    metadata: {
      workspaceRoot,
      check: capability.supportsCheck ? options.check : false,
      prompt: options.prompt,
      provenance: discovery.manifestPath,
      secretsRequested: secrets.requested,
      secretsLoaded: secrets.loaded,
      secretsMissing: secrets.missing,
    },
  });

  console.log(chalk.cyan("Run"));
  console.log(chalk.white(`  - Started: ${startedAt}`));
  if (secrets.loaded.length > 0) {
    console.log(chalk.white(`  - Secrets loaded: ${secrets.loaded.join(", ")}`));
  }
  if (secrets.missing.length > 0) {
    console.log(chalk.yellow(`  - Missing secret files: ${secrets.missing.join(", ")}`));
  }

  const result = await runCapability(
    capability,
    options.check && capability.supportsCheck,
    options.prompt,
    secrets.env,
  );

  const completed = new Date();
  const completedAt = johannesburgTimestamp(completed);
  const { status, summary } = summariseResult(result);

  await appendAgentRun({
    id: runId,
    capability: capability.id,
    status,
    summary,
    started: startedAt,
    completed: completedAt,
    logPath: path.relative(workspaceRoot, capability.absoluteEntrypoint),
    metadata: {
      workspaceRoot,
      check: capability.supportsCheck ? options.check : false,
      prompt: options.prompt,
      provenance: discovery.manifestPath,
      exitCode: result.exitCode,
      stdoutTail: result.stdout.at(-1)?.trim(),
      stderrTail: result.stderr.at(-1)?.trim(),
      durationSeconds: (completed.getTime() - started.getTime()) / 1000,
      secretsRequested: secrets.requested,
      secretsLoaded: secrets.loaded,
      secretsMissing: secrets.missing,
    },
  });

  await emitTelemetryEvent({
    id: runId,
    capability: capability.id,
    status,
    started: startedAt,
    completed: completedAt,
    durationSeconds: (completed.getTime() - started.getTime()) / 1000,
    check: capability.supportsCheck ? options.check : false,
    secretsLoaded: secrets.loaded,
    secretsMissing: secrets.missing,
    promptProvided: Boolean(options.prompt && options.prompt.trim().length > 0),
  });

  console.log(chalk.cyan("Explain"));
  console.log(chalk.white(`  - Completed: ${completedAt}`));
  console.log(chalk.white(`  - Status: ${status}`));
  console.log(chalk.white(`  - Summary: ${summary}`));
  console.log(chalk.white(`  - Artefact: ${path.relative(workspaceRoot, agentRunsPath)}`));

  if (status !== "succeeded") {
    process.exitCode = 1;
  }
}

if (isExecutedDirectly) {
  await ensureArtifactsRoot();
  await main().catch((error) => {
    console.error(chalk.red("Agent runner failed:"), error);
    process.exitCode = 1;
  });
}
