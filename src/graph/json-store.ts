import fs from "node:fs";
import path from "node:path";

import { SCHEMA_VERSION } from "../constants.js";
import type {
  ActivitySession,
  ChangeSet,
  GeneratedContextState,
  IGraphStore,
  PersistedState,
  ProjectEdge,
  ProjectNode,
  TechStackSummary
} from "../types.js";
import { KnowledgeGraph } from "./knowledge-graph.js";

function sortSessions(sessions: ActivitySession[]): ActivitySession[] {
  return sessions.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
}

function sortChangeSets(changeSets: ChangeSet[]): ChangeSet[] {
  return changeSets.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
}

export class JsonGraphStore implements IGraphStore {
  private graph = new KnowledgeGraph();
  private state: PersistedState | null = null;
  private readonly sessions = new Map<string, ActivitySession>();
  private readonly changeSets = new Map<string, ChangeSet>();

  constructor(private readonly statePath: string) {}

  getNode(id: string): ProjectNode | null {
    return this.graph.getNode(id);
  }

  getNodes(): ProjectNode[] {
    return this.graph.getNodes();
  }

  getEdges(nodeId?: string): ProjectEdge[] {
    return this.graph.getEdges(nodeId);
  }

  getIncomingEdges(nodeId: string): ProjectEdge[] {
    return this.graph.getIncomingEdges(nodeId);
  }

  getOutgoingEdges(nodeId: string): ProjectEdge[] {
    return this.graph.getOutgoingEdges(nodeId);
  }

  search(query: string): ProjectNode[] {
    return this.graph.search(query);
  }

  upsertNode(node: ProjectNode): void {
    this.ensureState();
    this.graph.upsertNode(node);
  }

  removeNode(id: string): void {
    this.ensureState();
    this.graph.removeNode(id);
  }

  replaceOutgoingEdges(sourceId: string, edges: ProjectEdge[]): void {
    this.ensureState();
    this.graph.replaceOutgoingEdges(sourceId, edges);
  }

  removeEdgesForNode(nodeId: string): void {
    this.ensureState();
    this.graph.removeEdgesForNode(nodeId);
  }

  getSessions(limit?: number): ActivitySession[] {
    const sessions = sortSessions(Array.from(this.sessions.values()).map((session) => ({
      ...session,
      touchedPaths: [...session.touchedPaths],
      touchedModules: [...session.touchedModules],
      changeSets: [...session.changeSets],
      impactedDependents: session.impactedDependents ? [...session.impactedDependents] : undefined
    })));
    return typeof limit === "number" ? sessions.slice(0, limit) : sessions;
  }

  getSession(id: string): ActivitySession | null {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }

    return {
      ...session,
      touchedPaths: [...session.touchedPaths],
      touchedModules: [...session.touchedModules],
      changeSets: [...session.changeSets],
      impactedDependents: session.impactedDependents ? [...session.impactedDependents] : undefined
    };
  }

  upsertSession(session: ActivitySession): void {
    this.ensureState();
    this.sessions.set(session.id, {
      ...session,
      touchedPaths: [...session.touchedPaths],
      touchedModules: [...session.touchedModules],
      changeSets: [...session.changeSets],
      impactedDependents: session.impactedDependents ? [...session.impactedDependents] : undefined
    });
  }

  getChangeSets(limit?: number): ChangeSet[] {
    const changeSets = sortChangeSets(
      Array.from(this.changeSets.values()).map((changeSet) => ({
        ...changeSet,
        events: changeSet.events.map((event) => ({ ...event }))
      }))
    );
    return typeof limit === "number" ? changeSets.slice(0, limit) : changeSets;
  }

  getChangeSet(id: string): ChangeSet | null {
    const changeSet = this.changeSets.get(id);
    if (!changeSet) {
      return null;
    }

    return {
      ...changeSet,
      events: changeSet.events.map((event) => ({ ...event }))
    };
  }

  addChangeSet(changeSet: ChangeSet): void {
    this.ensureState();
    this.changeSets.set(changeSet.id, {
      ...changeSet,
      events: changeSet.events.map((event) => ({ ...event }))
    });
  }

  setTechStack(summary: TechStackSummary): void {
    this.ensureState();
    this.state!.techStack = {
      packageManagers: [...summary.packageManagers],
      frameworks: [...summary.frameworks],
      languages: [...summary.languages],
      configFiles: [...summary.configFiles]
    };
  }

  getGeneratedContext(): GeneratedContextState {
    this.ensureState();
    return {
      lastGeneratedAt: this.state!.generatedContext.lastGeneratedAt,
      projectSummary: this.state!.generatedContext.projectSummary
        ? { ...this.state!.generatedContext.projectSummary }
        : undefined,
      conventionsSummary: this.state!.generatedContext.conventionsSummary
        ? { ...this.state!.generatedContext.conventionsSummary }
        : undefined,
      moduleSummaries: Object.fromEntries(
        Object.entries(this.state!.generatedContext.moduleSummaries).map(([moduleBoundary, summary]) => [
          moduleBoundary,
          {
            ...summary,
            filePaths: [...summary.filePaths]
          }
        ])
      ),
      generatedFiles: [...this.state!.generatedContext.generatedFiles]
    };
  }

  setGeneratedContext(generatedContext: GeneratedContextState): void {
    this.ensureState();
    this.state!.generatedContext = {
      lastGeneratedAt: generatedContext.lastGeneratedAt,
      projectSummary: generatedContext.projectSummary ? { ...generatedContext.projectSummary } : undefined,
      conventionsSummary: generatedContext.conventionsSummary ? { ...generatedContext.conventionsSummary } : undefined,
      moduleSummaries: Object.fromEntries(
        Object.entries(generatedContext.moduleSummaries).map(([moduleBoundary, summary]) => [
          moduleBoundary,
          {
            ...summary,
            filePaths: [...summary.filePaths]
          }
        ])
      ),
      generatedFiles: [...generatedContext.generatedFiles]
    };
  }

  updateMetadata(metadata: Partial<PersistedState["metadata"]>): void {
    this.ensureState();
    this.state!.metadata = {
      ...this.state!.metadata,
      ...metadata
    };
  }

  getState(): PersistedState {
    this.ensureState();
    return {
      ...this.state!,
      generatedContext: this.getGeneratedContext(),
      nodes: this.graph.getNodes(),
      edges: this.graph.getEdges(),
      sessions: this.getSessions(),
      changeSets: this.getChangeSets()
    };
  }

  persist(): void {
    const snapshot = this.getState();
    snapshot.generatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, this.statePath);
    this.state = snapshot;
  }

  replace(state: PersistedState): void {
    this.hydrate(state);
    this.persist();
  }

  load(): PersistedState | null {
    if (!fs.existsSync(this.statePath)) {
      this.state = null;
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as PersistedState;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      fs.rmSync(this.statePath, { force: true });
      this.state = null;
      return null;
    }

    this.hydrate(parsed);
    return this.getState();
  }

  private ensureState(): void {
    if (!this.state) {
      this.state = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        projectRoot: "",
        techStack: {
          packageManagers: [],
          frameworks: [],
          languages: [],
          configFiles: []
        },
        nodes: [],
        edges: [],
        sessions: [],
        changeSets: [],
        generatedContext: {
          moduleSummaries: {},
          generatedFiles: []
        },
        metadata: {}
      };
    }
  }

  private hydrate(state: PersistedState): void {
    this.state = {
      ...state,
      techStack: {
        packageManagers: [...state.techStack.packageManagers],
        frameworks: [...state.techStack.frameworks],
        languages: [...state.techStack.languages],
        configFiles: [...state.techStack.configFiles]
      },
      metadata: {
        ...state.metadata
      },
      nodes: [],
      edges: [],
      sessions: [],
      changeSets: [],
      generatedContext: {
        lastGeneratedAt: state.generatedContext.lastGeneratedAt,
        projectSummary: state.generatedContext.projectSummary ? { ...state.generatedContext.projectSummary } : undefined,
        conventionsSummary: state.generatedContext.conventionsSummary ? { ...state.generatedContext.conventionsSummary } : undefined,
        moduleSummaries: Object.fromEntries(
          Object.entries(state.generatedContext.moduleSummaries).map(([moduleBoundary, summary]) => [
            moduleBoundary,
            {
              ...summary,
              filePaths: [...summary.filePaths]
            }
          ])
        ),
        generatedFiles: [...state.generatedContext.generatedFiles]
      }
    };

    this.graph = new KnowledgeGraph(state);
    this.sessions.clear();
    this.changeSets.clear();

    for (const session of state.sessions) {
      this.upsertSession(session);
    }

    for (const changeSet of state.changeSets) {
      this.addChangeSet(changeSet);
    }
  }
}
