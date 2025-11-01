import { WebSocketServer } from "ws";

console.log("[n00ton:mcp-host] starting...");

// TODO: load capability-ir.json from discovery package and expose over ws
const wss = new WebSocketServer({ port: 9088 });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", msg: "n00ton MCP host ready" }));
});

