import type { Stats } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

import chokidar, { type FSWatcher } from "chokidar";

import { createIgnoreMatcher } from "../engine/ignore-resolver.js";
import type { SessionMapConfig, WatcherEvent } from "../types.js";

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

export class FileWatcher extends EventEmitter<{
  event: [WatcherEvent];
}> {
  private watcher: FSWatcher | null = null;
  private running = false;

  constructor(
    private readonly projectRoot: string,
    private readonly config: SessionMapConfig
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.watcher = await this.createWatcher(false);
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.watcher) {
      this.running = false;
      return;
    }

    await this.watcher.close();
    this.watcher = null;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async createWatcher(usePolling: boolean): Promise<FSWatcher> {
    const matcher = createIgnoreMatcher(this.projectRoot, this.config.ignore);
    const watcher = chokidar.watch(this.projectRoot, {
      ignoreInitial: true,
      usePolling,
      ignored: (filePath: string, stats?: Stats) => {
        const relativePath = normalizeRelativePath(path.relative(this.projectRoot, filePath));
        if (!relativePath || relativePath === ".") {
          return false;
        }

        return matcher.ignores(relativePath, stats?.isDirectory() ?? false);
      }
    });

    watcher.on("add", (filePath) => {
      this.emit("event", {
        ts: new Date().toISOString(),
        path: normalizeRelativePath(path.relative(this.projectRoot, filePath)),
        op: "add"
      });
    });

    watcher.on("change", (filePath) => {
      this.emit("event", {
        ts: new Date().toISOString(),
        path: normalizeRelativePath(path.relative(this.projectRoot, filePath)),
        op: "change"
      });
    });

    watcher.on("unlink", (filePath) => {
      this.emit("event", {
        ts: new Date().toISOString(),
        path: normalizeRelativePath(path.relative(this.projectRoot, filePath)),
        op: "unlink"
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const handleReady = () => {
          watcher.off("error", handleError);
          resolve();
        };
        const handleError = (error: unknown) => {
          watcher.off("ready", handleReady);
          reject(error);
        };

        watcher.once("ready", handleReady);
        watcher.once("error", handleError);
      });
      return watcher;
    } catch (error) {
      await watcher.close();
      if (!usePolling && typeof error === "object" && error !== null && "code" in error && error.code === "EMFILE") {
        return this.createWatcher(true);
      }

      throw error;
    }
  }
}
