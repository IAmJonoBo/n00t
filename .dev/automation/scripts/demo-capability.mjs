#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function log(message) {
  process.stdout.write(`[demo-capability] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[demo-capability] ${message}\n`);
  process.exit(1);
}

const rawPayload = process.env.CAPABILITY_PAYLOAD;
if (!rawPayload) {
  fail("CAPABILITY_PAYLOAD environment variable is missing");
}

let payload;
try {
  payload = JSON.parse(rawPayload);
} catch (error) {
  fail(`Failed to parse CAPABILITY_PAYLOAD: ${error}`);
}

const outputPath = typeof payload.output === "string"
  ? payload.output
  : path.resolve(process.cwd(), ".dev/automation/artifacts/automation/demo-output.json");

const record = {
  status: "succeeded",
  check: Boolean(payload.check),
  receivedPrompt: payload.input ?? null,
  generatedAt: new Date().toISOString(),
};

if (record.check) {
  log("Dry-run requested; not writing output artefact.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
log(`Output written to ${outputPath}`);
