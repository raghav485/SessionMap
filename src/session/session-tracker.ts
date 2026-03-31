import crypto from "node:crypto";

import type {
  ActivitySession,
  ChangeSet,
  ChangeSetImpact,
  ExplicitSessionEndRequest,
  ExplicitSessionStartRequest,
  IGraphStore,
  SessionActor,
  SessionSource,
  TrackingMode
} from "../types.js";
import { SessionInferrer } from "./inferrer.js";

function unique(items: string[]): string[] {
  return Array.from(new Set(items)).sort();
}

export class SessionTracker {
  private activeExplicitSessionId: string | null = null;
  private autoTrackingArmed = false;

  constructor(
    private readonly store: IGraphStore,
    private readonly inferrer: SessionInferrer,
    private readonly captureStdout: boolean,
    private readonly inactivityGapMs: number
  ) {}

  armAutoTracking(): void {
    this.autoTrackingArmed = true;
  }

  disarmAutoTracking(): void {
    this.autoTrackingArmed = false;
  }

  getTrackingMode(): TrackingMode {
    if (this.activeExplicitSessionId) {
      return "explicit-mcp";
    }

    return this.autoTrackingArmed ? "auto" : "idle";
  }

  getActiveSessionId(referenceTime = new Date()): string | null {
    if (this.activeExplicitSessionId) {
      return this.activeExplicitSessionId;
    }

    if (!this.autoTrackingArmed) {
      return null;
    }

    const latestAutoSession = this.getLatestSessionBySource("auto-daemon");
    if (!latestAutoSession) {
      return null;
    }

    const gapMs = referenceTime.getTime() - new Date(latestAutoSession.endedAt).getTime();
    return gapMs <= this.inactivityGapMs ? latestAutoSession.id : null;
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
      source: request.source ?? "explicit-mcp",
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
      return this.attachChangeSetToExplicitSession(changeSet, impact);
    }

    if (this.autoTrackingArmed) {
      return this.recordInferredLikeChangeSet(changeSet, impact, "auto-daemon", "agent");
    }

    return this.recordInferredLikeChangeSet(changeSet, impact, "watcher-inferred", "unknown");
  }

  private attachChangeSetToExplicitSession(changeSet: ChangeSet, impact: ChangeSetImpact): ActivitySession {
    const session = this.store.getSession(this.activeExplicitSessionId!);
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

  private recordInferredLikeChangeSet(
    changeSet: ChangeSet,
    impact: ChangeSetImpact,
    source: SessionSource,
    actor: SessionActor
  ): ActivitySession {
    const effectiveChangeSet: ChangeSet = {
      ...changeSet,
      source
    };
    this.store.addChangeSet(effectiveChangeSet);

    const latestSession = this.getLatestSessionBySource(source);
    const decision = this.inferrer.decide(effectiveChangeSet, impact, latestSession);

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
      actor,
      source,
      confidence: decision.confidence,
      touchedPaths: unique(impact.touchedPaths),
      touchedModules: unique(impact.touchedModules),
      changeSets: [effectiveChangeSet.id],
      impactedDependents: unique(impact.impactedDependentModules)
    };

    this.store.upsertSession(created);
    return created;
  }

  private getLatestSessionBySource(source: SessionSource): ActivitySession | null {
    return this.store.getSessions().find((session) => session.source === source) ?? null;
  }
}
