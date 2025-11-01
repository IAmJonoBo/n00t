export interface Capability {
  id: string;
  kind: "mcp" | "cli" | "http" | "task";
  title: string;
  description?: string;
  inputs?: any[];
  runner: any;
  auth?: any;
  provenance?: any;
}
