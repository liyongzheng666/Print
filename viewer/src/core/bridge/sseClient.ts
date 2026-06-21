import type { DebugEvent } from "../protocol/types";

export type BridgeStatus = "connecting" | "open" | "closed";

export interface BridgeStreamOptions {
  readonly url?: string;
  readonly onEvent: (event: DebugEvent) => void;
  readonly onStatus?: (status: BridgeStatus) => void;
  readonly onDiagnostic?: (message: string) => void;
}

export interface BridgeStream {
  close(): void;
}

/**
 * Parse one SSE `data:` payload into a DebugEvent. Each line from the Bridge
 * is a single complete JSON record (contract §3.4); a malformed line returns
 * null so the stream is never torn down by one bad event.
 */
export function parseEventData(data: string): DebugEvent | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as DebugEvent;
  } catch {
    return null;
  }
}

/**
 * Subscribe to the Bridge's `/events` SSE stream. The browser EventSource
 * tracks the last `id:` (global line number) and replays it as Last-Event-ID
 * on reconnect, so the Bridge resumes exactly where it left off (§3.2–3.3).
 */
export function openBridgeStream(options: BridgeStreamOptions): BridgeStream {
  const url = options.url ?? "/events";
  const source = new EventSource(url);
  options.onStatus?.("connecting");

  source.onopen = () => options.onStatus?.("open");
  source.onmessage = (message) => {
    const event = parseEventData(message.data);
    if (event) options.onEvent(event);
    else options.onDiagnostic?.(`无法解析事件：${message.data.slice(0, 120)}`);
  };
  // EventSource reconnects automatically on error; surface it as "connecting".
  source.onerror = () => options.onStatus?.("connecting");

  return {
    close() {
      source.close();
      options.onStatus?.("closed");
    },
  };
}
