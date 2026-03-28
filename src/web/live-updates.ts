import type { FastifyInstance } from "fastify";

import { createLogger } from "../logger.js";
import type { RuntimeEventBus } from "../daemon/runtime-events.js";
import type { WebLiveUpdateMessage } from "../types.js";

const logger = createLogger("web-live-updates");

interface LiveSocket {
  readyState: number;
  OPEN: number;
  send(payload: string): void;
  close(): void;
  on(event: "close", handler: () => void): void;
}

export function registerLiveUpdatesRoute(app: FastifyInstance, eventBus: RuntimeEventBus): void {
  const sockets = new Set<LiveSocket>();

  const broadcast = (message: WebLiveUpdateMessage): void => {
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  };

  eventBus.on("update", broadcast);

  app.get("/ws", { websocket: true }, (socket) => {
    const liveSocket = socket as unknown as LiveSocket;
    sockets.add(liveSocket);
    liveSocket.on("close", () => {
      sockets.delete(liveSocket);
    });
  });

  app.addHook("onClose", async () => {
    eventBus.off("update", broadcast);
    for (const socket of sockets) {
      try {
        socket.close();
      } catch (error) {
        logger.warn("Failed to close websocket client cleanly", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    sockets.clear();
  });
}
