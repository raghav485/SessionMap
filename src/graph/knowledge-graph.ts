import type { PersistedState, ProjectEdge, ProjectNode } from "../types.js";

export function createFileNodeId(relativePath: string): string {
  return `file:${relativePath}`;
}

export function createDirectoryNodeId(relativePath: string): string {
  return `directory:${relativePath || "."}`;
}

function cloneEdge(edge: ProjectEdge): ProjectEdge {
  return {
    ...edge,
    symbols: [...edge.symbols]
  };
}

export class KnowledgeGraph {
  private readonly nodes = new Map<string, ProjectNode>();
  private readonly outgoingEdges = new Map<string, Map<string, ProjectEdge>>();
  private readonly incomingEdges = new Map<string, Map<string, ProjectEdge>>();

  constructor(state?: PersistedState) {
    if (state) {
      this.replace(state.nodes, state.edges);
    }
  }

  replace(nodes: ProjectNode[], edges: ProjectEdge[]): void {
    this.nodes.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();

    for (const node of nodes) {
      this.nodes.set(node.id, { ...node, exports: [...node.exports], metadata: { ...node.metadata } });
    }

    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  getNode(id: string): ProjectNode | null {
    return this.nodes.get(id) ?? null;
  }

  getNodes(): ProjectNode[] {
    return Array.from(this.nodes.values()).sort((left, right) => left.path.localeCompare(right.path));
  }

  getEdges(nodeId?: string): ProjectEdge[] {
    if (!nodeId) {
      return Array.from(this.outgoingEdges.values())
        .flatMap((edgeMap) => Array.from(edgeMap.values()))
        .sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`));
    }

    return [...this.getIncomingEdges(nodeId), ...this.getOutgoingEdges(nodeId)].sort((left, right) =>
      `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)
    );
  }

  getIncomingEdges(nodeId: string): ProjectEdge[] {
    return Array.from(this.incomingEdges.get(nodeId)?.values() ?? []).sort((left, right) =>
      `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)
    );
  }

  getOutgoingEdges(nodeId: string): ProjectEdge[] {
    return Array.from(this.outgoingEdges.get(nodeId)?.values() ?? []).sort((left, right) =>
      `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)
    );
  }

  search(query: string): ProjectNode[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.getNodes();
    }

    return this.getNodes().filter((node) => {
      return (
        node.name.toLowerCase().includes(normalized) ||
        node.path.toLowerCase().includes(normalized) ||
        node.summary?.toLowerCase().includes(normalized)
      );
    });
  }

  upsertNode(node: ProjectNode): void {
    this.nodes.set(node.id, { ...node, exports: [...node.exports], metadata: { ...node.metadata } });
  }

  removeNode(id: string): void {
    this.removeEdgesForNode(id);
    this.nodes.delete(id);
  }

  replaceOutgoingEdges(sourceId: string, edges: ProjectEdge[]): void {
    const currentOutgoing = this.outgoingEdges.get(sourceId);
    if (currentOutgoing) {
      for (const targetId of currentOutgoing.keys()) {
        this.incomingEdges.get(targetId)?.delete(sourceId);
        if (this.incomingEdges.get(targetId)?.size === 0) {
          this.incomingEdges.delete(targetId);
        }
      }
    }

    this.outgoingEdges.delete(sourceId);

    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  removeEdgesForNode(nodeId: string): void {
    const outgoing = this.outgoingEdges.get(nodeId);
    if (outgoing) {
      for (const targetId of outgoing.keys()) {
        this.incomingEdges.get(targetId)?.delete(nodeId);
        if (this.incomingEdges.get(targetId)?.size === 0) {
          this.incomingEdges.delete(targetId);
        }
      }
      this.outgoingEdges.delete(nodeId);
    }

    const incoming = this.incomingEdges.get(nodeId);
    if (incoming) {
      for (const sourceId of incoming.keys()) {
        this.outgoingEdges.get(sourceId)?.delete(nodeId);
        if (this.outgoingEdges.get(sourceId)?.size === 0) {
          this.outgoingEdges.delete(sourceId);
        }
      }
      this.incomingEdges.delete(nodeId);
    }
  }

  private addEdge(edge: ProjectEdge): void {
    const clonedEdge = cloneEdge(edge);

    const outgoingForSource = this.outgoingEdges.get(clonedEdge.source) ?? new Map<string, ProjectEdge>();
    outgoingForSource.set(clonedEdge.target, clonedEdge);
    this.outgoingEdges.set(clonedEdge.source, outgoingForSource);

    const incomingForTarget = this.incomingEdges.get(clonedEdge.target) ?? new Map<string, ProjectEdge>();
    incomingForTarget.set(clonedEdge.source, clonedEdge);
    this.incomingEdges.set(clonedEdge.target, incomingForTarget);
  }
}
