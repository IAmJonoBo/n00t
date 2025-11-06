import fs from "node:fs";
import path from "node:path";
import {
  CapabilityManifest,
  DiscoveryPayload,
  normalizeManifest,
} from "@n00t/capability-ir";

export function discoverCapabilities(root: string): DiscoveryPayload {
  const manifestPath = path.resolve(root, "n00t/capabilities/manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[discovery] capability manifest not found at ${manifestPath}`,
    );
  }

  const content = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(content) as CapabilityManifest;
  return normalizeManifest(manifest, manifestPath);
}
