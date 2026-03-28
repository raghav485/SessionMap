import crypto from "node:crypto";

import type {
  ActivitySession,
  ChangeSet,
  ChangeSetImpact,
  ExplicitSessionEndRequest,
  ExplicitSessionStartRequest,
  IGraphStore
} from "../types.js";
import { SessionInferrer } from "./inferrer.js";

function unique(items: string[]): string[] {
  return Array.from(new Set(items)).sort();
}

export class SessionTracker {
  private activeExplicitSessionId: string | null = null;

  constructor(
    private readonly store: IGraphStore,
    private readonly inferrer: SessionInferrer,
    private readonly captureStdout: boolean
  ) {}

  getActiveExplicitSessionId(): string | null {
    return this.activeExplicitSessionId;
  }

  getSessions(limit?: number): ActivitySession[] {
    return this.store.getSessions(limit);
  }

  getSession(id: string): ActivitySession | null {
    return this.store.getSession(id);
  }

  startExplicitSession(request: ExplicitSessionStartRequest) {
    if (this.activeExplicitSessionId) {
      const error = new Error("An explicit session is already active");
      error.name = "SessionConflictError";
      throw error;
    }

    const session: ActivitySession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      actor: "agent",
      source: request.source ?? "explicit-wrapper",
      confidence: 1,
      intent: request.intent,
      agentCommand: request.agentCommand,
      touchedPaths: [],
      touchedModules: [],
      changeSets: [],
      impactedDependents: []
    };

    this.store.upsertSession(session);
    this.store.persist();
    this.activeExplicitSessionId = session.id;

    return {
      sessionId: session.id,
      startedAt: session.startedAt
    };
  }

  endExplicitSession(sessionId: string, request: ExplicitSessionEndRequest): ActivitySession {
    const existing = this.store.getSession(sessionId);
    if (!existing) {
      throw new Error(`Unknown explicit session: ${sessionId}`);
    }

    const finalized: ActivitySession = {
      ...existing,
      endedAt: new Date().toISOString(),
      agentStdout: this.captureStdout ? request.agentStdout : undefined
    };

    this.store.upsertSession(finalized);
    this.store.persist();
    if (this.activeExplicitSessionId === sessionId) {
      this.activeExplicitSessionId = null;
    }

    return finalized;
  }

  recordChangeSet(changeSet: ChangeSet, impact: ChangeSetImpact): ActivitySession {
    if (this.activeExplicitSessionId) {
      const session = this.store.getSession(this.activeExplicitSessionId);
      if (!session) {
        throw new Error(`Missing active explicit session: ${this.activeExplicitSessionId}`);
      }

      const effectiveChangeSet: ChangeSet = {
        ...changeSet,
        source: session.source
      };
      this.store.addChangeSet(effectiveChangeSet);

      const updated: ActivitySession = {
        ...session,
        endedAt: effectiveChangeSet.endedAt,
        touchedPaths: unique([...session.touchedPaths, ...impact.touchedPaths]),
        touchedModules: unique([...session.touchedModules, ...impact.touchedModules]),
        changeSets: unique([...session.changeSets, effectiveChangeSet.id]),
        impactedDependents: unique([...(session.impactedDependents ?? []), ...impact.impactedDependentModules])
      };

      this.store.upsertSession(updated);
      return updated;
    }

    const effectiveChangeSet: ChangeSet = {
      ...changeSet,
      source: "watcher-inferred"
    };
    this.store.addChangeSet(effectiveChangeSet);

    const latestInferred =
      this.store
        .getSessions()
        .filter((session) => session.source === "watcher-inferred")
        .at(0) ?? null;
    const decision = this.inferrer.decide(effectiveChangeSet, impact, latestInferred);

    if (decision.mergeWithSessionId) {
      const existing = this.store.getSession(decision.mergeWithSessionId);
      if (!existing) {
        throw new Error(`Missing inferred session: ${decision.mergeWithSessionId}`);
      }

      const merged: ActivitySession = {
        ...existing,
        endedAt: effectiveChangeSet.endedAt,
        confidence: Math.max(existing.confidence, decision.confidence),
        touchedPaths: unique([...existing.touchedPaths, ...impact.touchedPaths]),
        touchedModules: unique([...existing.touchedModules, ...impact.touchedModules]),
        changeSets: unique([...existing.changeSets, effectiveChangeSet.id]),
        impactedDependents: unique([...(existing.impactedDependents ?? []), ...impact.impactedDependentModules])
      };

      this.store.upsertSession(merged);
      return merged;
    }

    const created: ActivitySession = {
      id: crypto.randomUUID(),
      startedAt: effectiveChangeSet.startedAt,
      endedAt: effectiveChangeSet.endedAt,
      actor: "unknown",
      source: "watcher-inferred",
      confidence: decision.confidence,
      touchedPaths: unique(impact.touchedPaths),
      touchedModules: unique(impact.touchedModules),
      changeSets: [effectiveChangeSet.id],
      impactedDependents: unique(impact.impactedDependentModules)
    };

    this.store.upsertSession(created);
    return created;
  }
}
