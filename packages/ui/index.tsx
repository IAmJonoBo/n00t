"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StreamChannel = "stdout" | "stderr" | "transcript";

type StatusIndicator =
  | "ok"
  | "warning"
  | "failed"
  | "informational"
  | "cancelled"
  | "unknown";

interface CapabilitySummary {
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

interface DiscoveryPayload {
  version?: string;
  manifestPath: string;
  generatedAt: string;
  capabilities: CapabilitySummary[];
}

interface ControlMessage {
  id: string;
  role: "system" | "user" | "assistant" | "event";
  text: string;
  timestamp: Date;
  capabilityId?: string;
  stream: StreamChannel;
  status?: StatusIndicator;
  runId?: string;
}

interface ExecutionState {
  runId: string;
  capabilityId: string;
  status: StatusIndicator;
}

export interface ControlCentreProps {
  endpoint?: string;
}

function generateId(): string {
  const globalCrypto: Crypto | undefined = (globalThis as any)?.crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

const systemMessage: ControlMessage = {
  id: generateId(),
  role: "system",
  text: "n00ton Control Centre ready. Select a capability and provide a prompt to launch automation.",
  timestamp: new Date(),
  stream: "transcript",
  status: "informational",
};

export function N00tonControlCentre({ endpoint = "ws://localhost:9088" }: ControlCentreProps) {
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [capabilities, setCapabilities] = useState<CapabilitySummary[]>([]);
  const [selectedCapability, setSelectedCapability] = useState<CapabilitySummary | null>(null);
  const [messages, setMessages] = useState<ControlMessage[]>([systemMessage]);
  const [draft, setDraft] = useState("");
  const [runCheck, setRunCheck] = useState(false);
  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = new WebSocket(endpoint);
    wsRef.current = socket;
    setConnectionStatus("connecting");

    socket.onopen = () => {
      setConnectionStatus("ready");
    };
    socket.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data) as Record<string, unknown>;
        handleServerMessage(incoming);
      } catch (error) {
        console.error("[n00ton-ui] failed to parse message", error);
      }
    };
    socket.onerror = () => {
      setConnectionStatus("error");
    };
    socket.onclose = () => {
      setConnectionStatus("error");
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredCapabilities = useMemo(() => {
    return [...capabilities].sort((a: CapabilitySummary, b: CapabilitySummary) =>
      a.id.localeCompare(b.id),
    );
  }, [capabilities]);

  function handleServerMessage(payload: Record<string, unknown>) {
    const type = typeof payload.type === "string" ? payload.type : undefined;
    switch (type) {
      case "capabilities":
        {
          const data = payload.payload as DiscoveryPayload;
          setCapabilities(data.capabilities);
          if (!selectedCapability && data.capabilities.length > 0) {
            setSelectedCapability(data.capabilities[0]);
          }
        }
        break;
      case "execution-started":
        {
          const runId = String(payload.runId ?? "");
          const capabilityId = String(payload.capabilityId ?? "");
          setExecution({ runId, capabilityId, status: "informational" });
          appendMessage({
            role: "event",
            text: `Launching ${capabilityId}…`,
            capabilityId,
            stream: "transcript",
            runId,
            status: "informational",
          });
        }
        break;
      case "execution":
        {
          const runId = String(payload.runId ?? "");
          const capabilityId = String(payload.capabilityId ?? "");
          const channel = payload.channel === "stderr" ? "stderr" : "stdout";
          const text = String((payload as { text?: unknown }).text ?? "");
          if (text.trim().length === 0) return;
          appendStream(runId, capabilityId, channel, text);
        }
        break;
      case "execution-complete":
        {
          const runId = String(payload.runId ?? "");
          const capabilityId = String(payload.capabilityId ?? selectedCapability?.id ?? "");
          const exitCode = (payload as { exitCode?: number | null }).exitCode ?? null;
          const status: StatusIndicator =
            payload.status === "cancelled"
              ? "cancelled"
              : exitCode === 0
                ? "ok"
                : "failed";
          setExecution((current: ExecutionState | null) =>
            current && current.runId === runId ? { ...current, status } : current,
          );
          appendMessage({
            role: "event",
            text: `${capabilityId} finished with status ${exitCode}`,
            capabilityId,
            stream: "transcript",
            status,
            runId,
          });
        }
        break;
      case "error":
        appendMessage({
          role: "event",
          text: String(payload.message ?? "Unknown error"),
          capabilityId: payload.capabilityId as string | undefined,
          stream: "transcript",
          status: "failed",
        });
        break;
      case "hello":
      case "pong":
      default:
        break;
    }
  }

  function appendMessage(partial: Omit<ControlMessage, "id" | "timestamp">) {
    setMessages((current: ControlMessage[]) => [
      ...current,
      {
        id: generateId(),
        timestamp: new Date(),
        ...partial,
      },
    ]);
  }

  function appendStream(
    runId: string,
    capabilityId: string,
    channel: StreamChannel,
    text: string,
  ) {
    setMessages((current: ControlMessage[]) => {
      const index = current.findIndex(
        (message) =>
          message.runId === runId &&
          message.capabilityId === capabilityId &&
          message.stream === channel &&
          message.role === "assistant",
      );
      if (index >= 0) {
        const existing = current[index];
        const updated = {
          ...existing,
          text: existing.text + text,
          timestamp: new Date(),
        };
        return [
          ...current.slice(0, index),
          updated,
          ...current.slice(index + 1),
        ];
      }
      return [
        ...current,
        {
          id: generateId(),
          role: "assistant",
          text,
          capabilityId,
          stream: channel,
          runId,
          timestamp: new Date(),
        },
      ];
    });
  }

  function send() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      appendMessage({
        role: "event",
        text: "WebSocket connection is not ready. Unable to send request.",
        stream: "transcript",
        status: "failed",
      });
      return;
    }
    if (!selectedCapability) {
      appendMessage({
        role: "event",
        text: "Select a capability first.",
        stream: "transcript",
        status: "warning",
      });
      return;
    }

    const trimmed = draft.trim();
    if (trimmed.length === 0 && !selectedCapability.supportsCheck) {
      appendMessage({
        role: "event",
        text: "Provide a prompt or choose a capability that supports check mode.",
        stream: "transcript",
        status: "warning",
      });
      return;
    }

    appendMessage({
      role: "user",
      text: trimmed.length > 0 ? trimmed : "(No prompt provided)",
      capabilityId: selectedCapability.id,
      stream: "transcript",
    });

    wsRef.current.send(
      JSON.stringify({
        type: "run",
        capabilityId: selectedCapability.id,
        prompt: trimmed,
        check: runCheck,
      }),
    );

    if (!selectedCapability.supportsCheck) {
      setRunCheck(false);
    }
    setDraft("");
  }

  function cancelRun() {
    if (!execution) return;
    wsRef.current?.send(
      JSON.stringify({
        type: "cancel",
        runId: execution.runId,
        capabilityId: execution.capabilityId,
      }),
    );
  }

  function statusLabel(status: StatusIndicator | undefined) {
    switch (status) {
      case "ok":
        return "✓";
      case "failed":
        return "✖";
      case "warning":
        return "⚠";
      case "cancelled":
        return "⧖";
      case "informational":
        return "ℹ";
      default:
        return "";
    }
  }

  return (
    <div style={containerStyle}>
      <aside style={sidebarStyle}>
        <header style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>Capabilities</h2>
          <small style={{ color: "#64748b" }}>
            {connectionStatus === "connecting" && "Connecting…"}
            {connectionStatus === "ready" && `${capabilities.length} available`}
            {connectionStatus === "error" && "Disconnected"}
          </small>
        </header>
        <div style={capabilityListStyle}>
          {filteredCapabilities.map((capability: CapabilitySummary) => {
            const isSelected = capability.id === selectedCapability?.id;
            const isRunning =
              execution?.capabilityId === capability.id &&
              execution.status !== "ok" &&
              execution.status !== "failed";
            return (
              <button
                key={capability.id}
                type="button"
                onClick={() => {
                  setSelectedCapability(capability);
                  if (!capability.supportsCheck) {
                    setRunCheck(false);
                  }
                }}
                style={{
                  ...capabilityButtonStyle,
                  borderColor: isSelected ? "#6366f1" : "rgba(148, 163, 184, 0.3)",
                  backgroundColor: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{capability.summary}</span>
                  {isRunning && (
                    <span style={{ fontSize: "0.75rem", color: "#22c55e" }}>Running…</span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{capability.id}</div>
                {capability.supportsCheck && (
                  <div style={{ fontSize: "0.7rem", color: "#0ea5e9" }}>Supports --check</div>
                )}
              </button>
            );
          })}
        </div>
        {selectedCapability && (
          <div style={capabilityDetailStyle}>
            <h3 style={{ marginTop: 0 }}>{selectedCapability.summary}</h3>
            <p style={detailParagraphStyle}>{selectedCapability.description ?? selectedCapability.id}</p>
            <p style={detailParagraphStyle}>
              <strong>Entrypoint:</strong> {selectedCapability.origin}
            </p>
            {selectedCapability.docsLink && (
              <p style={detailParagraphStyle}>
                <a href={selectedCapability.docsLink} target="_blank" rel="noreferrer">
                  Documentation
                </a>
              </p>
            )}
            {selectedCapability.supportsCheck && (
              <label style={toggleLabelStyle}>
                <input
                  type="checkbox"
                  checked={runCheck}
                  onChange={(event) => setRunCheck(event.target.checked)}
                />
                Run in check mode
              </label>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={send} style={primaryButtonStyle}>
                Launch
              </button>
              <button
                type="button"
                onClick={() => setDraft(`Run ${selectedCapability.summary.toLowerCase()}`)}
                style={secondaryButtonStyle}
              >
                Prefill prompt
              </button>
            </div>
          </div>
        )}
      </aside>
      <section style={mainSectionStyle}>
        <header style={sectionHeaderStyle}>
          <div>
            <h2 style={{ margin: 0 }}>Chat Console</h2>
            {execution && (
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Active run {execution.capabilityId} ({execution.status})
              </span>
            )}
          </div>
          {execution && (
            <button type="button" onClick={cancelRun} style={dangerButtonStyle}>
              Cancel
            </button>
          )}
        </header>
        <div style={transcriptStyle}>
          {messages.map((message: ControlMessage) => (
            <div
              key={message.id}
              style={{
                ...bubbleStyle,
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                backgroundColor: bubbleColor(message),
                color: message.role === "user" ? "#fff" : "#0f172a",
              }}
            >
              <div style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                {message.capabilityId && <span>{message.capabilityId} • </span>}
                {message.stream !== "transcript" && <span>{message.stream} • </span>}
                <span>{message.timestamp.toLocaleTimeString()}</span>
                {message.status && <span> • {message.status}</span>}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
            </div>
          ))}
          <div ref={lastMessageRef} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          style={inputBarStyle}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask n00ton for assistance…"
            style={textAreaStyle}
            rows={3}
          />
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button type="submit" style={primaryButtonStyle} disabled={!selectedCapability && draft.trim().length === 0}>
              Send
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                setDraft("");
                setMessages([systemMessage]);
              }}
            >
              Reset chat
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  function bubbleColor(message: ControlMessage) {
    if (message.role === "user") {
      return "#6366f1";
    }
    if (message.stream === "stderr") {
      return "rgba(248,113,113,0.2)";
    }
    if (message.status === "warning") {
      return "rgba(251,191,36,0.25)";
    }
    if (message.status === "failed") {
      return "rgba(248,113,113,0.25)";
    }
    return "rgba(148,163,184,0.18)";
  }
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  gap: "20px",
  alignItems: "flex-start",
  width: "100%",
  color: "#0f172a",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const sidebarStyle: React.CSSProperties = {
  flex: "0 0 320px",
  backgroundColor: "rgba(241,245,249,0.9)",
  borderRadius: "16px",
  padding: "16px",
  border: "1px solid rgba(148,163,184,0.3)",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const mainSectionStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  backgroundColor: "rgba(255,255,255,0.9)",
  borderRadius: "16px",
  border: "1px solid rgba(148,163,184,0.3)",
  padding: "16px",
  minHeight: "600px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const capabilityListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "320px",
  overflowY: "auto",
};

const capabilityButtonStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.3)",
  padding: "12px",
  textAlign: "left",
  background: "transparent",
  cursor: "pointer",
};

const capabilityDetailStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(148,163,184,0.2)",
  paddingTop: "12px",
  fontSize: "0.85rem",
};

const detailParagraphStyle: React.CSSProperties = {
  margin: "4px 0",
  color: "#475569",
};

const toggleLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "0.8rem",
  color: "#1e293b",
};

const transcriptStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  background: "rgba(241,245,249,0.6)",
  borderRadius: "12px",
  padding: "12px",
  border: "1px solid rgba(148,163,184,0.25)",
};

const bubbleStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  maxWidth: "640px",
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
  fontSize: "0.95rem",
};

const inputBarStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.4)",
  padding: "12px",
  fontSize: "0.95rem",
  resize: "vertical",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: "#6366f1",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "999px",
  border: "1px solid rgba(99,102,241,0.4)",
  backgroundColor: "transparent",
  color: "#6366f1",
  cursor: "pointer",
  fontWeight: 500,
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: "#ef4444",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
