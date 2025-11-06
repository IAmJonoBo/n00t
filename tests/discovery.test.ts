import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverCapabilities } from "@n00t/discovery";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("discoverCapabilities", () => {
  test("loads manifest from workspace root", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "n00t-test-"));
    tempDirs.push(workspace);
    const manifestDir = path.join(workspace, "n00t", "capabilities");
    mkdirSync(manifestDir, { recursive: true });
    const automationScript = "../../.dev/automation/scripts/meta-check.sh";
    const manifest = {
      version: "1.0.0",
      capabilities: [
        {
          id: "workspace.metaCheck",
          summary: "Run meta-check\n",
          entrypoint: automationScript,
          inputs: {
            properties: {
              check: { type: "boolean" }
            }
          }
        }
      ]
    };
    writeFileSync(
      path.join(manifestDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { encoding: "utf-8", flag: "w" }
    );

    const payload = discoverCapabilities(workspace);
    expect(payload.capabilities).toHaveLength(1);
    const [capability] = payload.capabilities;
    expect(capability.id).toBe("workspace.metaCheck");
    expect(capability.summary).toContain("meta-check");
    expect(capability.supportsCheck).toBe(true);
    expect(capability.entrypoint).toBe(automationScript);
    expect(capability.absoluteEntrypoint).toBe(
      path.resolve(manifestDir, automationScript)
    );
  });

  test("throws when manifest missing", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "n00t-test-"));
    tempDirs.push(workspace);
    expect(() => discoverCapabilities(workspace)).toThrowError(
      /capability manifest not found/i
    );
  });
});
