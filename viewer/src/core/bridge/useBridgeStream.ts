import { useEffect, useState } from "react";
import { SUPPORTED_KINDS } from "../../rendering/renderers/basicRenderers";
import { useSceneStore } from "../scene-store/store";
import { openBridgeStream, type BridgeStatus } from "./sseClient";

/**
 * Connect the viewer to the Bridge's SSE stream and feed every event into the
 * Scene Store. Returns the live connection status for the session strip.
 */
export function useBridgeStream(url = "/events"): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>("connecting");

  useEffect(() => {
    const { applyEvent, noteDiagnostic } = useSceneStore.getState();
    const stream = openBridgeStream({
      url,
      onEvent: (event) => {
        applyEvent(event);
        // D2: an entity whose kind has no renderer is added to the store (and
        // listed in the tree) but never drawn — surface it instead of a silent
        // drop so the gap is visible.
        if (event.op === "add" && !SUPPORTED_KINDS.has(event.kind)) {
          noteDiagnostic(`暂无 ${event.kind} 渲染器，已忽略 ${event.id}`, event.seq);
        }
      },
      onStatus: setStatus,
      onDiagnostic: (message) => noteDiagnostic(message),
    });
    return () => stream.close();
  }, [url]);

  return status;
}
