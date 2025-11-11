import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  CapabilitySummary,
  RunResult,
  SecretMapping,
} from "../apps/agent-runner/src/index.ts";

type AgentRunnerModule = typeof import("../apps/agent-runner/src/index.ts");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runner-tests-"));
process.env.N00T_HQ_ROOT = tempRoot;
process.env.N00T_TELEMETRY_ROOT = path.join(tempRoot, "telemetry");
process.env.N00T_SECRETS_ROOT = path.join(tempRoot, "secrets");

let parseArgs: AgentRunnerModule["parseArgs"];
let summariseResult: AgentRunnerModule["summariseResult"];
let johannesburgTimestamp: AgentRunnerModule["johannesburgTimestamp"];
let TZ: AgentRunnerModule["TZ"];
let buildSecretRequestList: AgentRunnerModule["buildSecretRequestList"];
let emitTelemetryEvent: AgentRunnerModule["emitTelemetryEvent"];
let patternMatchesCapability: AgentRunnerModule["patternMatchesCapability"];

beforeAll(async () => {
  const agentRunner = await import("../apps/agent-runner/src/index.ts");
  ({
    parseArgs,
    summariseResult,
    johannesburgTimestamp,
    TZ,
    buildSecretRequestList,
    emitTelemetryEvent,
    patternMatchesCapability,
  } = agentRunner);
});

describe("parseArgs", () => {
  it("applies defaults when no flags are provided", () => {
    const result = parseArgs([]);
    expect(result).toEqual({
      capabilityId: undefined,
      prompt: undefined,
      check: true,
      planOnly: false,
      simulateId: undefined,
      dryRunOnly: false,
      envFiles: [],
      autoApprove: false,
    });
  });

  it("parses boolean and value flags correctly", () => {
    const result = parseArgs([
      "--capability",
      "n00t.test",
      "--prompt",
      "hello",
      "--no-check",
      "--plan-only",
      "--simulate",
      "abc123",
      "--dry-run-only",
    ]);

    expect(result).toEqual({
      capabilityId: "n00t.test",
      prompt: "hello",
      check: false,
      planOnly: true,
      simulateId: "abc123",
      dryRunOnly: true,
      envFiles: [],
      autoApprove: false,
    });
  });

  it("collects explicit env bundles when provided", () => {
    const result = parseArgs([
      "--env-file",
      "secret.env",
      "--env",
      "another.env",
      "--auto-approve",
    ]);

    expect(result.envFiles).toEqual(["secret.env", "another.env"]);
    expect(result.autoApprove).toBe(true);
  });
});

describe("johannesburgTimestamp", () => {
  it("formats the provided date in the Africa/Johannesburg timezone", () => {
    const instant = new Date(Date.UTC(2024, 0, 1, 10, 30, 15));
    const formatted = johannesburgTimestamp(instant);
    expect(formatted).toBe("2024-01-01T12:30:15+02:00");
  });

  it("produces timestamps in the expected offset", () => {
    const formatted = johannesburgTimestamp(new Date("2024-06-15T00:00:00Z"));
    expect(formatted.endsWith("+02:00")).toBe(true);
  });
});

describe("summariseResult", () => {
  it("summarises successful runs with trailing stdout when present", () => {
    const sample: RunResult = {
      exitCode: 0,
      stdout: ["all good", "final line"],
      stderr: [],
    };

    const summary = summariseResult(sample);
    expect(summary.status).toBe("succeeded");
    expect(summary.summary).toContain("Run succeeded");
    expect(summary.summary).toContain("final line");
  });

  it("summarises failed runs using stderr tail", () => {
    const sample: RunResult = {
      exitCode: 1,
      stdout: ["info"],
      stderr: ["minor", "boom"],
    };

    const summary = summariseResult(sample);
    expect(summary.status).toBe("failed");
    expect(summary.summary).toContain("Run failed (exit 1)");
    expect(summary.summary).toContain("boom");
  });
});

it("documents the timezone constant for reference", () => {
  expect(TZ).toBe("Africa/Johannesburg");
});

describe("buildSecretRequestList", () => {
  const sampleCapability = {
    id: "erpnext.sync",
    summary: "",
    entrypoint: "run",
    absoluteEntrypoint: "/tmp/run",
    supportsCheck: true,
    tags: ["needs:erpnext"],
    origin: "run",
    surfaces: [],
    manifestPath: "/tmp/manifest.json",
  } satisfies CapabilitySummary;

  it("merges mapping-derived bundles and CLI overrides", () => {
    const mapping: SecretMapping = {
      entries: [
        { pattern: "erpnext.*", envFiles: ["erpnext.env", "common.env"] },
        { pattern: "tag:needs:erpnext", envFiles: ["addon.env"] },
      ],
    };

  expect(patternMatchesCapability("erpnext.*", sampleCapability)).toBe(true);

    const requested = buildSecretRequestList(sampleCapability, ["extra.env"], mapping);

    expect(requested).toEqual([
      "erpnext.env",
      "common.env",
      "addon.env",
      "extra.env",
    ]);
  });
});

describe("emitTelemetryEvent", () => {
  it("appends JSON line telemetry entries", async () => {
    const event = {
      id: "test-run",
      capability: "test.capability",
      status: "succeeded" as const,
      started: "2025-01-01T00:00:00+02:00",
      completed: "2025-01-01T00:01:00+02:00",
      durationSeconds: 60,
      check: true,
      secretsLoaded: ["alpha.env"],
      secretsMissing: ["beta.env"],
      promptProvided: false,
    } satisfies Parameters<typeof emitTelemetryEvent>[0];

    await emitTelemetryEvent(event);

    const telemetryRoot = process.env.N00T_TELEMETRY_ROOT;
    if (!telemetryRoot) {
      throw new Error("telemetry root not configured for test");
    }
    const logPath = path.join(telemetryRoot, "agent-runner-log.jsonl");
    const contents = fs.readFileSync(logPath, "utf-8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject(event);
  });
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
