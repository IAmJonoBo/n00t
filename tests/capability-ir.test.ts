import { describe, expect, test } from "vitest";
import {
  capabilitySupportsCheck,
  normalizeManifest,
  type CapabilityManifest
} from "@n00t/capability-ir";
import path from "node:path";

describe("capability manifest helpers", () => {
  test("normalizeManifest maps fields and resolves entrypoints", () => {
    const manifestPath = path.resolve(
      "/tmp",
      "n00t",
      "capabilities",
      "manifest.json"
    );
    const manifest: CapabilityManifest = {
      version: "1.0.0",
      capabilities: [
        {
          id: "cortex.frontiersIngest",
          summary: "Sync n00-frontiers exports into n00-cortex",
          entrypoint: "../../.dev/automation/scripts/ingest-frontiers.sh",
          inputs: {
            properties: {
              check: { type: "boolean" }
            }
          },
          metadata: {
            docs: "docs/experience/n00ton-chat-control.md",
            tags: ["automation", "frontiers"]
          },
          provenance: {
            tags: ["frontiers"],
            surfaces: ["macOS-dashboard", "web-control-centre"]
          }
        }
      ]
    };

    const payload = normalizeManifest(manifest, manifestPath);
    expect(payload.manifestPath).toEqual(manifestPath);
    expect(payload.capabilities).toHaveLength(1);
    const capability = payload.capabilities[0];
    expect(capability.id).toBe("cortex.frontiersIngest");
    expect(capability.summary).toContain("Sync n00-frontiers");
    expect(capability.supportsCheck).toBe(true);
    expect(capability.tags).toContain("automation");
    expect(capability.tags).toContain("frontiers");
    expect(capability.surfaces).toContain("macOS-dashboard");
    expect(capability.surfaces).toContain("web-control-centre");
    expect(capability.docsLink).toBe("docs/experience/n00ton-chat-control.md");
    expect(capability.absoluteEntrypoint).toEqual(
      path.resolve(
        path.dirname(manifestPath),
        "../../.dev/automation/scripts/ingest-frontiers.sh"
      )
    );
  });

  test("capabilitySupportsCheck detects absence of check property", () => {
    const capWithCheck = {
      id: "workspace.metaCheck",
      entrypoint: "../../.dev/automation/scripts/meta-check.sh",
      inputs: {
        properties: {
          check: { type: "boolean" }
        }
      }
    };
    const capWithout = {
      id: "workspace.refresh",
      entrypoint: "../../.dev/automation/scripts/refresh-workspace.sh",
      inputs: {
        properties: {}
      }
    };

    expect(capabilitySupportsCheck(capWithCheck as any)).toBe(true);
    expect(capabilitySupportsCheck(capWithout as any)).toBe(false);
  });
});
