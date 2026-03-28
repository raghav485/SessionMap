import { EventEmitter } from "node:events";

import type { WebLiveUpdateMessage } from "../types.js";

export class RuntimeEventBus extends EventEmitter<{
  update: [WebLiveUpdateMessage];
}> {
  publish(message: WebLiveUpdateMessage): void {
    this.emit("update", message);
  }
}
