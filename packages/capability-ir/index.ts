import path from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import capabilityManifestSchema from "./schema/capability-manifest.schema.json" with { type: "json" };

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface JSONSchemaProperty {
  type?: string;
  description?: string;
  enum?: JSONValue[];
  default?: JSONValue;
  format?: string;
  examples?: JSONValue[];
  [key: string]: unknown;
}

export interface JSONSchemaObject {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
  anyOf?: JSONSchemaProperty[];
  allOf?: JSONSchemaProperty[];
  [key: string]: unknown;
}

export interface CapabilityProvenance {
  docs?: string;
  runbook?: string;
  repo?: string;
  tags?: string[];
  surfaces?: string[];
}

export interface ManifestCapability {
  id: string;
  summary?: string;
  entrypoint: string;
  description?: string;
  inputs?: JSONSchemaObject;
  outputs?: JSONSchemaObject;
  tags?: string[];
  surfaces?: string[];
  provenance?: CapabilityProvenance;
  metadata?: {
    docs?: string;
    runbook?: string;
    tags?: string[];
    surfaces?: string[];
    description?: string;
  };
}

export interface CapabilityManifest {
  $schema?: string;
  version?: string;
  capabilities?: ManifestCapability[];
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const manifestValidator: ValidateFunction<CapabilityManifest> = ajv.compile(capabilityManifestSchema);

function formatManifestError(error: ErrorObject): string {
  const pointer = error.instancePath ? error.instancePath : "/";
  const message = error.message ?? "validation error";
  const params = error.params && Object.keys(error.params).length > 0
    ? ` (${JSON.stringify(error.params)})`
    : "";
  return `${pointer} ${message}${params}`;
}

export function assertValidCapabilityManifest(
  manifest: CapabilityManifest,
  manifestPath: string,
): void {
  if (manifestValidator(manifest)) {
    return;
  }

  const errors = manifestValidator.errors ?? [];
  const rendered = errors.map(formatManifestError).join("\n");
  throw new Error(
    `Capability manifest at ${manifestPath} failed validation:\n${rendered}`,
  );
}

export interface CapabilitySummary {
  id: string;
  summary: string;
  description?: string;
  entrypoint: string;
  absoluteEntrypoint: string;
  supportsCheck: boolean;
  tags: string[];
  docsLink?: string;
  origin: string;
  surfaces: string[];
  manifestPath: string;
}

export interface DiscoveryPayload {
  version?: string;
  manifestPath: string;
  generatedAt: string;
  capabilities: CapabilitySummary[];
}

export function normalizeManifest(
  manifest: CapabilityManifest,
  manifestPath: string
): DiscoveryPayload {
  assertValidCapabilityManifest(manifest, manifestPath);
  const capabilities = manifest.capabilities ?? [];
  const baseDir = path.dirname(manifestPath);
  const normalized = capabilities.map((capability) =>
    normalizeCapability(capability, baseDir, manifestPath)
  );
  return {
    version: manifest.version,
    manifestPath,
    generatedAt: new Date().toISOString(),
    capabilities: normalized,
  };
}

export function capabilitySupportsCheck(capability: ManifestCapability): boolean {
  const properties = capability.inputs?.properties ?? {};
  return Boolean(properties["check"]);
}

function normalizeCapability(
  capability: ManifestCapability,
  baseDir: string,
  manifestPath: string
): CapabilitySummary {
  const tags = dedupeStrings([
    ...(capability.tags ?? []),
    ...(capability.metadata?.tags ?? []),
    ...(capability.provenance?.tags ?? []),
  ]);
  const surfaces = dedupeStrings([
    ...(capability.surfaces ?? []),
    ...(capability.metadata?.surfaces ?? []),
    ...(capability.provenance?.surfaces ?? []),
  ]);
  const docsLink =
    capability.metadata?.docs ??
    capability.metadata?.runbook ??
    capability.provenance?.docs ??
    capability.provenance?.runbook;

  const absoluteEntrypoint = path.resolve(baseDir, capability.entrypoint);

  return {
    id: capability.id,
    summary: capability.summary ?? capability.id,
    description: capability.description ?? capability.metadata?.description,
    entrypoint: capability.entrypoint,
    absoluteEntrypoint,
    supportsCheck: capabilitySupportsCheck(capability),
    tags,
    docsLink,
    origin: capability.entrypoint,
    surfaces,
    manifestPath,
  };
}

function dedupeStrings(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    seen.add(value);
  }
  return Array.from(seen);
}
