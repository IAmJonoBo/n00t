import fs from "node:fs";
import path from "node:path";

export function discoverCapabilities(root: string) {
  // extremely naive starter
  const capabilities = [];

  // look for package.json scripts
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.scripts) {
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        capabilities.push({
          id: `cli.npm.${name}`,
          kind: "cli",
          title: `npm run ${name}`,
          description: cmd,
          runner: {
            type: "shell",
            command: "npm",
            args: ["run", name]
          },
          provenance: {
            source: "package.json"
          }
        });
      }
    }
  }

  return capabilities;
}

if (require.main === module) {
  const caps = discoverCapabilities(process.cwd());
  fs.writeFileSync("capability-ir.json", JSON.stringify(caps, null, 2));
  console.log("Wrote capability-ir.json");
}
