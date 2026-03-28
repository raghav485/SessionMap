import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

import type { ChangeEvent, ChangeSet, WatcherEvent } from "../types.js";

interface ChangeTrackerOptions {
  projectRoot: string;
  debounceMs: number;
  resolveLanguage(path: string): string | undefined;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

function sameDirectoryAndExtension(left: string, right: string): boolean {
  return path.dirname(left) === path.dirname(right) && path.extname(left) === path.extname(right);
}

async function getBytesChanged(projectRoot: string, relativePath: string, op: ChangeEvent["op"]): Promise<number | undefined> {
  if (op === "unlink") {
    return undefined;
  }

  try {
    const stat = await fs.stat(path.join(projectRoot, relativePath));
    return stat.size;
  } catch {
    return undefined;
  }
}

export class ChangeTracker extends EventEmitter<{
  changeset: [ChangeSet];
}> {
  private readonly bufferedEvents: WatcherEvent[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: ChangeTrackerOptions) {
    super();
  }

  push(event: WatcherEvent): void {
    this.bufferedEvents.push(event);
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush();
    }, this.options.debounceMs);
  }

  async flush(): Promise<ChangeSet | null> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.bufferedEvents.length === 0) {
      return null;
    }

    const rawEvents = this.bufferedEvents.splice(0, this.bufferedEvents.length).sort((left, right) =>
      left.ts.localeCompare(right.ts)
    );
    const changeSet = await this.buildChangeSet(rawEvents);
    this.emit("changeset", changeSet);
    return changeSet;
  }

  private async buildChangeSet(rawEvents: WatcherEvent[]): Promise<ChangeSet> {
    const used = new Set<number>();
    const events: ChangeEvent[] = [];

    for (let index = 0; index < rawEvents.length; index += 1) {
      const current = rawEvents[index];
      if (current.op !== "unlink" || used.has(index)) {
        continue;
      }

      const renameIndex = rawEvents.findIndex((candidate, candidateIndex) => {
        return (
          candidateIndex > index &&
          !used.has(candidateIndex) &&
          candidate.op === "add" &&
          sameDirectoryAndExtension(current.path, candidate.path)
        );
      });

      if (renameIndex === -1) {
        continue;
      }

      const renamed = rawEvents[renameIndex];
      used.add(index);
      used.add(renameIndex);
      events.push({
        id: crypto.randomUUID(),
        ts: renamed.ts,
        path: normalizeRelativePath(renamed.path),
        op: "rename",
        previousPath: normalizeRelativePath(current.path),
        bytesChanged: await getBytesChanged(this.options.projectRoot, renamed.path, "add"),
        language: this.options.resolveLanguage(renamed.path) ?? this.options.resolveLanguage(current.path)
      });
    }

    const collapsedByPath = new Map<string, WatcherEvent>();
    for (let index = 0; index < rawEvents.length; index += 1) {
      if (used.has(index)) {
        continue;
      }

      const current = rawEvents[index];
      const normalizedPath = normalizeRelativePath(current.path);
      const existing = collapsedByPath.get(normalizedPath);
      if (!existing) {
        collapsedByPath.set(normalizedPath, { ...current, path: normalizedPath });
        continue;
      }

      if (existing.op === "add" && current.op === "change") {
        collapsedByPath.set(normalizedPath, { ...current, path: normalizedPath, op: "add" });
        continue;
      }

      collapsedByPath.set(normalizedPath, { ...current, path: normalizedPath });
    }

    for (const event of Array.from(collapsedByPath.values()).sort((left, right) => left.ts.localeCompare(right.ts))) {
      events.push({
        id: crypto.randomUUID(),
        ts: event.ts,
        path: event.path,
        op: event.op,
        bytesChanged: await getBytesChanged(this.options.projectRoot, event.path, event.op),
        language: this.options.resolveLanguage(event.path)
      });
    }

    events.sort((left, right) => left.ts.localeCompare(right.ts));

    return {
      id: crypto.randomUUID(),
      startedAt: events[0]?.ts ?? new Date().toISOString(),
      endedAt: events[events.length - 1]?.ts ?? new Date().toISOString(),
      events,
      source: "watcher-inferred"
    };
  }
}
