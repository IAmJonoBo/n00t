import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WebSocket, WebSocketServer, RawData } from "ws";
import {
  CapabilitySummary,
  DiscoveryPayload,
} from "@n00t/capability-ir";
import { discoverCapabilities } from "@n00t/discovery";

type ExecutionChannel = "stdout" | "stderr";

type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled";

interface AgentRunRecord {
  id: string;
  capability: string;
  status: AgentRunStatus;
  summary: string;
  started: string;
  completed?: string;
  logPath?: string;
  metadata?: Record<string, unknown>;
}

interface ActiveRun {
  id: string;
  capability: CapabilitySummary;
  child: ChildProcess;
  stdoutChunks: string[];
  stderrChunks: string[];
  started: Date;
  check: boolean;
  status?: AgentRunStatus;
  completed: boolean;
  outputPath?: string;
  metadataPayload?: Record<string, unknown>;
}

interface OutboundMessage {
  type:
    | "hello"
    | "capabilities"
    | "execution-started"
    | "execution"
    | "execution-complete"
    | "error"
    | "pong";
  [key: string]: unknown;
}

type InboundMessage =
  | { type: "ping" }
  | {
      type: "run";
      capabilityId: string;
      prompt?: string;
      check?: boolean;
    }
  | {
      type: "cancel";
      runId?: string;
      capabilityId?: string;
    };

interface ClientState {
  runs: Map<string, ActiveRun>;
}

const workspaceRoot =
  process.env.WORKSPACE_ROOT ??
  path.resolve(process.cwd(), "../../..", "n00tropic-cerebrum");
const port = Number(process.env.n00t_MCP_PORT ?? "9088");

console.log(
  `[n00t:mcp-host] starting (workspace=${workspaceRoot}, port=${port})`,
);

const wss = new WebSocketServer({ port });
const clients = new Map<WebSocket, ClientState>();

let discoveryPayload: DiscoveryPayload | null = null;
let manifestPath: string | null = null;
const agentRunsPath = path.resolve(
  workspaceRoot,
  ".dev/automation/artifacts/automation/agent-runs.json",
);

function readAgentRuns(): AgentRunRecord[] {
  try {
    const raw = fs.readFileSync(agentRunsPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentRunRecord[]) : [];
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      fs.mkdirSync(path.dirname(agentRunsPath), { recursive: true });
      fs.writeFileSync(agentRunsPath, "[\n]", "utf-8");
      return [];
    }
    console.error("[n00t:mcp-host] failed to read agent runs file:", error);
    return [];
  }
}

function writeAgentRuns(records: AgentRunRecord[]) {
  try {
    fs.mkdirSync(path.dirname(agentRunsPath), { recursive: true });
    fs.writeFileSync(agentRunsPath, JSON.stringify(records, null, 2) + "\n", "utf-8");
  } catch (error) {
    console.error("[n00t:mcp-host] failed to persist agent runs:", error);
  }
}

function recordAgentRunStart(run: ActiveRun) {
  const records = readAgentRuns();
  const metadata: Record<string, unknown> = {
    source: "mcp-host",
    capabilitySummary: run.capability.summary,
    check: run.check,
  };
  const relativeEntrypoint = path.relative(
    workspaceRoot,
    run.capability.absoluteEntrypoint,
  );
  records.push({
    id: run.id,
    capability: run.capability.id,
    status: "running",
    summary: "Manual run started via MCP host",
    started: run.started.toISOString(),
    logPath: relativeEntrypoint || run.capability.entrypoint,
    metadata,
  });
  writeAgentRuns(records);
}

function recordAgentRunCompletion(
  run: ActiveRun,
  status: AgentRunStatus,
  summary: string,
  extraMetadata: Record<string, unknown> = {},
) {
  const records = readAgentRuns();
  const index = records.findIndex((entry) => entry.id === run.id);
  const metadata = {
    ...(index >= 0 ? records[index].metadata ?? {} : {}),
    ...extraMetadata,
    source: "mcp-host",
    capabilitySummary: run.capability.summary,
    check: run.check,
  };
  const completed = new Date().toISOString();
  const relativeEntrypoint =
    path.relative(workspaceRoot, run.capability.absoluteEntrypoint) ||
    run.capability.entrypoint;
  const record: AgentRunRecord = {
    id: run.id,
    capability: run.capability.id,
    status,
    summary,
    started: run.started.toISOString(),
    completed,
    logPath: records[index]?.logPath ?? relativeEntrypoint,
    metadata,
  };

  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  run.status = status;
  run.completed = true;
  writeAgentRuns(records);
}

function tailText(chunks: string[]): string | undefined {
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const text = chunks[i].trim();
    if (text.length > 0) {
      return text.split("\n").pop();
    }
  }
  return undefined;
}

function summariseRun(
  run: ActiveRun,
  status: AgentRunStatus,
  exitCode?: number | null,
  trainingMetadata?: Record<string, unknown> | null,
): { summary: string; metadata: Record<string, unknown> } {
  const stdoutTail = tailText(run.stdoutChunks);
  const stderrTail = tailText(run.stderrChunks);
  const metadata: Record<string, unknown> = {
    stdoutTail,
    stderrTail,
    exitCode,
    trainingMetadata,
  };
  let summary: string;
  const metrics =
    trainingMetadata && typeof trainingMetadata === "object" && "metrics" in trainingMetadata
      ? (trainingMetadata as { metrics?: unknown }).metrics
      : undefined;
  let accuracy: number | undefined;
  if (metrics && typeof metrics === "object" && metrics !== null && "accuracy" in metrics) {
    const value = (metrics as Record<string, unknown>).accuracy;
    if (typeof value === "number") {
      accuracy = value;
    }
  }
  if (status === "succeeded") {
    if (typeof accuracy === "number") {
      summary = `Training succeeded (accuracy ${accuracy}).`;
    } else if (stdoutTail) {
      summary = `Manual run succeeded: ${stdoutTail.slice(0, 160)}`;
    } else {
      summary = "Manual run succeeded.";
    }
  } else if (status === "cancelled") {
    summary = "Manual run cancelled via MCP host.";
  } else if (stderrTail) {
    summary = `Manual run failed: ${stderrTail.slice(0, 160)}`;
  } else if (stdoutTail) {
    summary = `Manual run ended with exit code ${exitCode}. ${stdoutTail.slice(0, 160)}`;
  } else {
    summary = `Manual run ended with exit code ${exitCode}.`;
  }
  return { summary, metadata };
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    console.warn(`[n00t:mcp-host] unable to read JSON file ${filePath}:`, error);
    return null;
  }
}

function collectTrainingMetadata(activeRun: ActiveRun): Record<string, unknown> | null {
  const outputPath = activeRun.outputPath;
  const collected: Record<string, unknown> = {};

  if (outputPath) {
    const payload = readJsonIfExists(outputPath);
    if (payload) {
      collected.output = payload;
      if (typeof payload.run_dir === "string") {
        collected.runDir = payload.run_dir;
      }
      if (typeof payload.metadata_path === "string") {
        collected.metadataPath = payload.metadata_path;
        const pipelineMetadata = readJsonIfExists(payload.metadata_path);
        if (pipelineMetadata) {
          collected.pipeline = pipelineMetadata;
          const stagesValue = (pipelineMetadata as { stages?: unknown }).stages;
          const stages = Array.isArray(stagesValue)
            ? (stagesValue as Array<Record<string, unknown>>)
            : [];
          const evaluationStage = stages.find((stage) => {
            const name = (stage as Record<string, unknown>).name;
            return typeof name === "string" && name === "evaluate-model";
          });
          if (evaluationStage) {
            const stageMetrics = evaluationStage.metrics;
            if (stageMetrics && typeof stageMetrics === "object") {
              collected.metrics = stageMetrics as Record<string, unknown>;
            }
          }
        }
      }
    }
  }

  return Object.keys(collected).length > 0 ? collected : null;
}

function safeSend(ws: WebSocket, payload: OutboundMessage) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error("[n00t:mcp-host] failed to send payload", error);
  }
}

function broadcast(payload: OutboundMessage) {
  for (const ws of clients.keys()) {
    safeSend(ws, payload);
  }
}

function loadCapabilities() {
  try {
    const payload = discoverCapabilities(workspaceRoot);
    discoveryPayload = payload;
    manifestPath = payload.manifestPath;
    console.log(
      `[n00t:mcp-host] loaded ${payload.capabilities.length} capabilities`,
    );
    broadcast({ type: "capabilities", payload });
  } catch (error) {
    console.error("[n00t:mcp-host] failed to load capabilities:", error);
    broadcast({
      type: "error",
      message: String(error),
    });
  }
}

function watchManifest() {
  if (!manifestPath) return;
  try {
    fs.watch(manifestPath, { persistent: false }, (eventType) => {
      if (eventType === "change") {
        loadCapabilities();
      }
    });
  } catch (error) {
    console.warn(
      "[n00t:mcp-host] unable to watch manifest for changes:",
      error,
    );
  }
}

function handleRunRequest(
  ws: WebSocket,
  capabilityId: string,
  prompt: string | undefined,
  check: boolean | undefined,
) {
  if (!discoveryPayload) {
    safeSend(ws, {
      type: "error",
      message: "Capability manifest not loaded yet.",
      capabilityId,
    });
    return;
  }
  const capability = discoveryPayload.capabilities.find(
    (cap: CapabilitySummary) => cap.id === capabilityId,
  );
  if (!capability) {
    safeSend(ws, {
      type: "error",
      message: `Capability ${capabilityId} not found.`,
      capabilityId,
    });
    return;
  }

  const runId = randomUUID();
  const env = { ...process.env };
  env.WORKSPACE_ROOT = workspaceRoot;
  const payload: Record<string, unknown> = {};
  if (prompt && prompt.trim().length > 0) {
    payload.input = prompt.trim();
  }
  if (capability.supportsCheck) {
    payload.check = Boolean(check);
  }
  const artifactsRoot = path.join(
    workspaceRoot,
    ".dev/automation/artifacts/training",
  );
  fs.mkdirSync(artifactsRoot, { recursive: true });
  const timestampLabel = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(
    artifactsRoot,
    `${capabilityId.replace(/\./g, "-")}-${timestampLabel}.json`,
  );
  payload.output = outputPath;
  if (Object.keys(payload).length > 0) {
    env.CAPABILITY_PAYLOAD = JSON.stringify(payload);
  }

  const child = spawn(capability.absoluteEntrypoint, {
    cwd: workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = clients.get(ws);
  if (!state) {
    child.kill();
    return;
  }

  const activeRun: ActiveRun = {
    id: runId,
    capability,
    child,
    stdoutChunks: [],
    stderrChunks: [],
    started: new Date(),
    check: Boolean(check),
    completed: false,
    outputPath,
  };

  state.runs.set(runId, activeRun);
  recordAgentRunStart(activeRun);

  safeSend(ws, {
    type: "execution-started",
    capabilityId,
    runId,
    timestamp: new Date().toISOString(),
  });

  const stdout = child.stdout;
  const stderr = child.stderr;
  if (stdout) {
    stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      activeRun.stdoutChunks.push(text);
      safeSend(ws, streamPayload("stdout", capability, runId, text));
    });
  }
  if (stderr) {
    stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      activeRun.stderrChunks.push(text);
      safeSend(ws, streamPayload("stderr", capability, runId, text));
    });
  }

  child.on("error", (error) => {
    console.error("[n00t:mcp-host] failed to spawn capability", error);
    if (!activeRun.completed) {
      const trainingMetadata = collectTrainingMetadata(activeRun) ?? activeRun.metadataPayload ?? null;
      if (trainingMetadata) {
        activeRun.metadataPayload = trainingMetadata;
      }
      const { summary, metadata } = summariseRun(activeRun, "failed", null, trainingMetadata ?? undefined);
      recordAgentRunCompletion(activeRun, "failed", summary, {
        ...metadata,
        error: String(error),
        outputPath: activeRun.outputPath,
      });
      state.runs.delete(runId);
      safeSend(ws, {
        type: "execution-complete",
        capabilityId,
        runId,
        exitCode: null,
        status: "failed",
        timestamp: new Date().toISOString(),
      });
    }
    safeSend(ws, {
      type: "error",
      message: `Failed to launch ${capability.id}: ${String(error)}`,
      capabilityId,
      runId,
    });
  });

  child.on("close", (code) => {
    state.runs.delete(runId);
    if (activeRun.completed) {
      return;
    }
    const agentStatus: AgentRunStatus =
      code === 0 ? "succeeded" : "failed";
    const trainingMetadata = collectTrainingMetadata(activeRun) ?? activeRun.metadataPayload ?? null;
    if (trainingMetadata) {
      activeRun.metadataPayload = trainingMetadata;
    }
    const { summary, metadata } = summariseRun(activeRun, agentStatus, code, trainingMetadata ?? undefined);
    recordAgentRunCompletion(activeRun, agentStatus, summary, {
      ...metadata,
      outputPath: activeRun.outputPath,
    });
    safeSend(ws, {
      type: "execution-complete",
      capabilityId,
      runId,
      exitCode: code,
      status: code === 0 ? "ok" : "failed",
      timestamp: new Date().toISOString(),
    });
  });
}

function streamPayload(
  channel: ExecutionChannel,
  capability: CapabilitySummary,
  runId: string,
  text: string,
) {
  return {
    type: "execution" as const,
    capabilityId: capability.id,
    runId,
    channel,
    text,
    timestamp: new Date().toISOString(),
  };
}

function handleCancelRequest(
  ws: WebSocket,
  runId?: string,
  capabilityId?: string,
) {
  const state = clients.get(ws);
  if (!state) return;

  const activeRun = runId
    ? state.runs.get(runId)
    : Array.from(state.runs.values()).find(
        (run) => capabilityId && run.capability.id === capabilityId,
      );

  if (!activeRun) {
    safeSend(ws, {
      type: "error",
      message: "No matching run to cancel.",
      capabilityId,
      runId,
    });
    return;
  }

  activeRun.child.kill();
  state.runs.delete(activeRun.id);
  const trainingMetadata = activeRun.metadataPayload ?? collectTrainingMetadata(activeRun);
  const { summary, metadata } = summariseRun(activeRun, "cancelled", null, trainingMetadata ?? undefined);
  recordAgentRunCompletion(activeRun, "cancelled", summary, {
    ...metadata,
    outputPath: activeRun.outputPath,
  });
  safeSend(ws, {
    type: "execution-complete",
    capabilityId: activeRun.capability.id,
    runId: activeRun.id,
    exitCode: null,
    status: "cancelled",
    timestamp: new Date().toISOString(),
  });
}

wss.on("connection", (ws: WebSocket) => {
  const clientState: ClientState = { runs: new Map() };
  clients.set(ws, clientState);

  safeSend(ws, {
    type: "hello",
    version: "1.0.0",
    workspaceRoot,
  });

  if (discoveryPayload) {
    safeSend(ws, { type: "capabilities", payload: discoveryPayload });
  }

  ws.on("message", (data: RawData) => {
    try {
      const message = JSON.parse(String(data)) as InboundMessage;
      switch (message.type) {
        case "ping":
          safeSend(ws, { type: "pong", timestamp: Date.now() });
          break;
        case "run":
          handleRunRequest(ws, message.capabilityId, message.prompt, message.check);
          break;
        case "cancel":
          handleCancelRequest(ws, message.runId, message.capabilityId);
          break;
        default:
          safeSend(ws, {
            type: "error",
            message: `Unsupported message type ${(message as InboundMessage).type}`,
          });
      }
    } catch (error) {
      console.error("[n00t:mcp-host] failed to handle message:", error);
      safeSend(ws, {
        type: "error",
        message: `Failed to process message: ${String(error)}`,
      });
    }
  });

  ws.on("close", () => {
    const state = clients.get(ws);
    if (state) {
      for (const run of state.runs.values()) {
        run.child.kill();
      }
    }
    clients.delete(ws);
  });
});

wss.on("listening", () => {
  loadCapabilities();
  watchManifest();
  console.log(`[n00t:mcp-host] listening on ws://localhost:${port}`);
});
