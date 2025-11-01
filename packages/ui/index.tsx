"use client";

import { useEffect, useState } from "react";

export function N00tonChat() {
  const [messages, setMessages] = useState([{ role: "system", content: "n00ton ready." }]);

  return (
    <div className="border rounded-lg p-4 max-w-lg w-full">
      <h2 className="font-semibold mb-2">n00ton Chat</h2>
      <div className="bg-muted rounded p-2 mb-2 h-48 overflow-auto">
        {messages.map((m, i) => (
          <p key={i}>
            <strong>{m.role}:</strong> {m.content}
          </p>
        ))}
      </div>
      <input
        placeholder="Ask n00ton..."
        className="border rounded px-2 py-1 w-full"
      />
    </div>
  );
}
