import { useEffect, useState } from "react";
import { useSceneStore } from "../scene-store/store";
import { openBridgeStream, type BridgeStatus } from "./sseClient";

/**
 * Connect the viewer to the Bridge's SSE stream and feed every event into the
 * Scene Store. Returns the live connection status for the session strip.
 */
export function useBridgeStream(url = "/events"): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>("connecting");

  useEffect(() => {
    const applyEvent = useSceneStore.getState().applyEvent;
    const stream = openBridgeStream({
      url,
      onEvent: applyEvent,
      onStatus: setStatus,
    });
    return () => stream.close();
  }, [url]);

  return status;
}
