# n00ton – Site / App Architecture

## 1. App surfaces
1. **Web (Next.js 16)**
   - `/` – landing / status of discovery.
   - `/chat` – main agent chat interface.
   - `/capabilities` – list of discovered MCP/CLI/API tools.
   - `/runs` – past executions + logs.
2. **API routes (Next.js)**
   - `POST /api/chat` – send message → orchestrator.
   - `GET /api/capabilities` – return capability IR.
   - `POST /api/execute` – run specific capability.
3. **Background service (`apps/mcp-host`)**
   - Runs discovery on startup.
   - Exposes WebSocket for streaming logs/events to the UI.

## 2. Data flow
User → Next.js chat → orchestrator API → MCP host → chosen capability
↘ UI listens to WebSocket for stream/log updates.

## 3. Embeddability
The chat UI is bundled as a React component (`<N00tonChat />`) in `packages/ui/` so it can be embedded in other projects.

## 4. Tech stack
- Next.js 16 (React 19) for front-end. 
- Node 22+ / TypeScript for discovery + MCP host.
- pnpm + Turborepo for monorepo.
- MCP spec 2025-06-18 compliant.
