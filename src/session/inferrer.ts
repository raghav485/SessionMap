import type { ActivitySession, ChangeSet, ChangeSetImpact, IGraphStore } from "../types.js";
import { createFileNodeId } from "../graph/knowledge-graph.js";

function sharedDirectoryPrefix(left: string, right: string): number {
  const leftSegments = left.split("/");
  const rightSegments = right.split("/");
  let index = 0;
  while (index < leftSegments.length && index < rightSegments.length && leftSegments[index] === rightSegments[index]) {
    index += 1;
  }
  return index;
}

function hasGraphLocality(store: IGraphStore, currentPaths: string[], previousPaths: string[]): boolean {
  const previousIds = new Set(previousPaths.map((relativePath) => createFileNodeId(relativePath)));
  for (const relativePath of currentPaths) {
    const nodeId = createFileNodeId(relativePath);
    for (const edge of [...store.getIncomingEdges(nodeId), ...store.getOutgoingEdges(nodeId)]) {
      const oppositeId = edge.source === nodeId ? edge.target : edge.source;
      if (previousIds.has(oppositeId)) {
        return true;
      }
    }
  }

  return false;
}

export interface InferenceDecision {
  mergeWithSessionId?: string;
  confidence: number;
  pathLocality: boolean;
  graphLocality: boolean;
}

export class SessionInferrer {
  constructor(private readonly store: IGraphStore, private readonly inactivityGapMs: number) {}

  decide(changeSet: ChangeSet, impact: ChangeSetImpact, latestInferred: ActivitySession | null): InferenceDecision {
    if (!latestInferred) {
      return {
        confidence: 0.45,
        pathLocality: false,
        graphLocality: false
      };
    }

    const gapMs =
      new Date(changeSet.startedAt).getTime() - new Date(latestInferred.endedAt).getTime();

    const moduleOverlap = impact.touchedModules.some((moduleBoundary) =>
      latestInferred.touchedModules.includes(moduleBoundary)
    );

    const pathLocality =
      moduleOverlap ||
      impact.touchedPaths.some((currentPath) =>
        latestInferred.touchedPaths.some((previousPath) => sharedDirectoryPrefix(currentPath, previousPath) >= 2)
      );
    const graphLocality = hasGraphLocality(this.store, impact.touchedPaths, latestInferred.touchedPaths);

    if (gapMs > this.inactivityGapMs || (!pathLocality && !graphLocality)) {
      return {
        confidence: 0.45,
        pathLocality,
        graphLocality
      };
    }

    const overlapCount = impact.touchedPaths.filter((currentPath) => {
      const node = this.store.getNode(createFileNodeId(currentPath));
      return node?.metadata.moduleBoundary
        ? latestInferred.touchedModules.includes(node.metadata.moduleBoundary)
        : false;
    }).length;

    let confidence = 0.45;
    if (pathLocality) {
      confidence += 0.25;
    }
    if (graphLocality) {
      confidence += 0.2;
    }
    if (overlapCount >= 3) {
      confidence += 0.1;
    }

    return {
      mergeWithSessionId: latestInferred.id,
      confidence: Math.min(0.95, confidence),
      pathLocality,
      graphLocality
    };
  }
}
