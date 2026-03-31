import path from "node:path";

import {
  DEFAULT_DEPENDENCY_DIRECTION,
  DEFAULT_GRAPH_HIDDEN_PREVIEW_LIMIT,
  DEFAULT_GRAPH_LATEST_SESSION_LIMIT,
  DEFAULT_GRAPH_PROJECT_MODULE_LIMIT,
  DEFAULT_GRAPH_PROJECT_LIMIT,
  DEFAULT_GRAPH_SPARSE_FALLBACK_THRESHOLD,
  DEFAULT_RELATED_SESSIONS_LIMIT,
  DEFAULT_SEARCH_LIMIT
} from "../constants.js";
import type {
  ActivitySession,
  DependencyDirection,
  DependencyResponse,
  DirectoryExplainResponse,
  ExplorerResponse,
  ExplorerResponseDirectory,
  ExplorerResponseFile,
  FileExplainResponse,
  GraphEdgeResponse,
  GraphGranularity,
  GraphDrilldownResponse,
  GraphHiddenCategory,
  GraphHiddenPreviewGroup,
  GraphHiddenSummaryItem,
  GraphNodeResponse,
  GraphRelationshipSource,
  GraphResponse,
  IGraphStore,
  ProjectEdge,
  ProjectNode,
  SearchResultResponse,
  SessionSummaryResponse
} from "../types.js";
import { buildArchitectureProjection, type ArchitectureFileDescriptor, type ArchitectureProjection } from "./architecture-projection.js";
import { createFileNodeId } from "./knowledge-graph.js";

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/").replace(/\/$/u, "") || ".";
}

function sortPaths(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

const HIDDEN_CATEGORY_ORDER: GraphHiddenCategory[] = ["isolated", "tests", "config", "assets", "other-support"];

interface ProjectGraphUnitAccumulator {
  id: string;
  path: string;
  label: string;
  architectureUnit: string;
  signal: "package" | "entrypoint" | "heuristic";
  languageSet: Set<string>;
  language: string;
  tier: ProjectNode["tier"];
  touched: boolean;
  impacted: boolean;
  fileIds: string[];
}

interface HiddenPreviewCandidate {
  path: string;
  label: string;
  type: "file" | "module" | "directory";
  touched: boolean;
  impacted: boolean;
  degree: number;
}

interface FocusDirectoryAccumulator {
  id: string;
  path: string;
  label: string;
  architectureUnit: string;
  languageSet: Set<string>;
  tier: ProjectNode["tier"];
  touched: boolean;
  impacted: boolean;
  fileIds: string[];
}

function joinProjectPath(basePath: string, segment: string): string {
  return basePath === "." ? segment : `${basePath}/${segment}`;
}

function getRelativePath(basePath: string, targetPath: string): string | null {
  const normalizedBase = normalizeRelativePath(basePath);
  const normalizedTarget = normalizeRelativePath(targetPath);

  if (normalizedBase === ".") {
    return normalizedTarget;
  }

  if (normalizedTarget === normalizedBase) {
    return ".";
  }

  const prefix = `${normalizedBase}/`;
  return normalizedTarget.startsWith(prefix) ? normalizedTarget.slice(prefix.length) : null;
}

function pathInside(basePath: string, targetPath: string): boolean {
  return getRelativePath(basePath, targetPath) !== null;
}

function isVisibleDescriptor(descriptor: ArchitectureFileDescriptor, showHidden: boolean): boolean {
  return showHidden || descriptor.touched || descriptor.impacted || descriptor.hiddenCategory === null;
}

function getDependencyCount(store: IGraphStore, nodeId: string): number {
  return store.getOutgoingEdges(nodeId).length;
}

function getDependentCount(store: IGraphStore, nodeId: string): number {
  return store.getIncomingEdges(nodeId).length;
}

function getDegree(store: IGraphStore, nodeId: string): number {
  return getDependencyCount(store, nodeId) + getDependentCount(store, nodeId);
}

function getFileNode(store: IGraphStore, relativePath: string): ProjectNode | null {
  return store.getNode(createFileNodeId(normalizeRelativePath(relativePath)));
}

function toGraphNodeResponse(
  store: IGraphStore,
  node: ProjectNode,
  touchedPaths: Set<string>,
  impactedPaths: Set<string>,
  architectureUnit?: string
): GraphNodeResponse {
  return {
    id: node.id,
    path: node.path,
    label: path.basename(node.path) || node.path,
    type: node.type,
    language: node.language,
    moduleBoundary: node.metadata.moduleBoundary,
    architectureUnit,
    tier: node.tier,
    touched: touchedPaths.has(node.path),
    impacted: impactedPaths.has(node.path),
    degree: getDegree(store, node.id)
  };
}

function toGraphEdgeResponse(edge: ProjectEdge): GraphEdgeResponse {
  return {
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.weight,
    relationshipSources: ["import"]
  };
}

function incrementHiddenCategory(
  counts: Map<GraphHiddenCategory, number>,
  category: GraphHiddenCategory,
  amount = 1
): void {
  counts.set(category, (counts.get(category) ?? 0) + amount);
}

function buildHiddenSummary(
  counts: Map<GraphHiddenCategory, number>,
  granularity: GraphGranularity,
  options?: {
    isolatedLabel?: string;
  }
): GraphHiddenSummaryItem[] {
  return HIDDEN_CATEGORY_ORDER.flatMap((category) => {
    const count = counts.get(category) ?? 0;
    if (count === 0) {
      return [];
    }

    const label =
      category === "isolated"
        ? `${count} isolated ${options?.isolatedLabel ?? (granularity === "module" ? (count === 1 ? "module" : "modules") : count === 1 ? "file" : "files")} hidden`
        : category === "tests"
          ? `${count} test ${count === 1 ? "file" : "files"} hidden`
          : category === "config"
            ? `${count} config ${count === 1 ? "file" : "files"} hidden`
            : category === "assets"
              ? `${count} asset ${count === 1 ? "file" : "files"} hidden`
              : `${count} support ${count === 1 ? "file" : "files"} hidden`;

    return [{ category, count, label }];
  });
}

function sortHiddenPreviewCandidates(candidates: HiddenPreviewCandidate[]): HiddenPreviewCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftPriority = Number(left.touched || left.impacted);
    const rightPriority = Number(right.touched || right.impacted);
    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    const degreeDelta = right.degree - left.degree;
    if (degreeDelta !== 0) {
      return degreeDelta;
    }

    return left.path.localeCompare(right.path);
  });
}

function buildHiddenPreview(
  previewCandidates: Map<GraphHiddenCategory, HiddenPreviewCandidate[]>
): GraphHiddenPreviewGroup[] {
  return HIDDEN_CATEGORY_ORDER.flatMap((category) => {
    const candidates = previewCandidates.get(category) ?? [];
    if (candidates.length === 0) {
      return [];
    }

    const sorted = sortHiddenPreviewCandidates(candidates);
    return [
      {
        category,
        truncated: sorted.length > DEFAULT_GRAPH_HIDDEN_PREVIEW_LIMIT,
        items: sorted.slice(0, DEFAULT_GRAPH_HIDDEN_PREVIEW_LIMIT).map((candidate) => ({
          path: candidate.path,
          label: candidate.label,
          type: candidate.type
        }))
      }
    ];
  });
}

function createProjectFileNodeResponse(descriptor: ArchitectureFileDescriptor, degree: number): GraphNodeResponse {
  return {
    id: descriptor.node.id,
    path: descriptor.node.path,
    label: path.basename(descriptor.node.path) || descriptor.node.path,
    type: "file",
    language: descriptor.node.language,
    moduleBoundary: descriptor.node.metadata.moduleBoundary,
    architectureUnit: descriptor.architectureUnitPath,
    tier: descriptor.node.tier,
    touched: descriptor.touched,
    impacted: descriptor.impacted,
    degree
  };
}

function createHiddenFilePreviewCandidate(descriptor: ArchitectureFileDescriptor, degree: number): HiddenPreviewCandidate {
  return {
    path: descriptor.node.path,
    label: path.basename(descriptor.node.path) || descriptor.node.path,
    type: "file",
    touched: descriptor.touched,
    impacted: descriptor.impacted,
    degree
  };
}

function createProjectUnitNodeResponse(group: ProjectGraphUnitAccumulator, degree: number): GraphNodeResponse {
  const languages = Array.from(group.languageSet);

  return {
    id: group.id,
    path: group.path,
    label: group.label,
    type: "module",
    language: group.signal === "package" && group.language !== "mixed" ? group.language : languages.length === 1 ? (languages[0] ?? "unknown") : "mixed",
    moduleBoundary: group.path === "." ? undefined : group.path,
    architectureUnit: group.architectureUnit,
    tier: group.tier,
    touched: group.touched,
    impacted: group.impacted,
    degree
  };
}

function createHiddenGroupPreviewCandidate(
  group: ProjectGraphUnitAccumulator,
  degree: number
): HiddenPreviewCandidate {
  return {
    path: group.path,
    label: group.label,
    type: "module",
    touched: group.touched,
    impacted: group.impacted,
    degree
  };
}

function toDirectoryNodeId(directoryPath: string): string {
  return `directory:${directoryPath}`;
}

function createProjectDirectoryNodeResponse(group: FocusDirectoryAccumulator, degree: number): GraphNodeResponse {
  const languages = Array.from(group.languageSet);

  return {
    id: group.id,
    path: group.path,
    label: group.label,
    type: "directory",
    language: languages.length === 1 ? (languages[0] ?? "unknown") : "mixed",
    moduleBoundary: group.path,
    architectureUnit: group.architectureUnit,
    tier: group.tier,
    touched: group.touched,
    impacted: group.impacted,
    degree
  };
}

function createHiddenDirectoryPreviewCandidate(
  group: FocusDirectoryAccumulator,
  degree: number
): HiddenPreviewCandidate {
  return {
    path: group.path,
    label: group.label,
    type: "directory",
    touched: group.touched,
    impacted: group.impacted,
    degree
  };
}

function buildDrilldownTrail(focusPath: string, currentPath: string): GraphDrilldownResponse[] {
  if (currentPath === focusPath) {
    return [];
  }

  const relativePath = getRelativePath(focusPath, currentPath);
  if (!relativePath || relativePath === ".") {
    return [];
  }

  const segments = relativePath.split("/").filter(Boolean);
  let accumulatedPath = focusPath;

  return segments.map((segment) => {
    accumulatedPath = joinProjectPath(accumulatedPath, segment);
    return {
      path: accumulatedPath,
      relativePath: getRelativePath(focusPath, accumulatedPath) ?? ".",
      label: segment
    };
  });
}

function hasDescriptorsWithinPath(descriptors: ArchitectureFileDescriptor[], currentPath: string): boolean {
  return descriptors.some((descriptor) => {
    const relativePath = getRelativePath(currentPath, descriptor.node.path);
    return relativePath !== null && relativePath !== ".";
  });
}

function collectVisibleFocusDirectoryCandidates(
  descriptors: ArchitectureFileDescriptor[],
  currentPath: string,
  showHidden: boolean,
  focusPath: string
): Map<string, FocusDirectoryAccumulator> {
  const directories = new Map<string, FocusDirectoryAccumulator>();

  for (const descriptor of descriptors) {
    if (!isVisibleDescriptor(descriptor, showHidden)) {
      continue;
    }

    const relativePath = getRelativePath(currentPath, descriptor.node.path);
    if (!relativePath || relativePath === "." || !relativePath.includes("/")) {
      continue;
    }

    const [segment] = relativePath.split("/");
    if (!segment) {
      continue;
    }

    const directoryPath = joinProjectPath(currentPath, segment);
    const existing = directories.get(directoryPath) ?? {
      id: toDirectoryNodeId(directoryPath),
      path: directoryPath,
      label: segment,
      architectureUnit: focusPath,
      languageSet: new Set<string>(),
      tier: descriptor.node.tier,
      touched: false,
      impacted: false,
      fileIds: []
    };

    existing.languageSet.add(descriptor.node.language);
    existing.tier = descriptor.node.tier < existing.tier ? descriptor.node.tier : existing.tier;
    existing.touched = existing.touched || descriptor.touched;
    existing.impacted = existing.impacted || descriptor.impacted;
    existing.fileIds.push(descriptor.node.id);
    directories.set(directoryPath, existing);
  }

  return directories;
}

function collectFocusDirectDescriptors(
  descriptors: ArchitectureFileDescriptor[],
  currentPath: string
): ArchitectureFileDescriptor[] {
  return descriptors.filter((descriptor) => {
    const relativePath = getRelativePath(currentPath, descriptor.node.path);
    return relativePath !== null && relativePath !== "." && !relativePath.includes("/");
  });
}

function selectRenderableFocusFileIds(
  store: IGraphStore,
  directDescriptors: ArchitectureFileDescriptor[],
  childDirectories: Map<string, FocusDirectoryAccumulator>,
  currentPath: string,
  showHidden: boolean
): Set<string> {
  if (childDirectories.size === 0 || showHidden) {
    return new Set(directDescriptors.map((descriptor) => descriptor.node.id));
  }

  const renderableIds = new Set<string>();

  for (const descriptor of directDescriptors) {
    if (descriptor.touched || descriptor.impacted) {
      renderableIds.add(descriptor.node.id);
      continue;
    }

    const connectedChildDirectories = new Set<string>();
    for (const edge of [...store.getIncomingEdges(descriptor.node.id), ...store.getOutgoingEdges(descriptor.node.id)]) {
      const neighborId = edge.source === descriptor.node.id ? edge.target : edge.source;
      const neighbor = store.getNode(neighborId);
      if (!neighbor || neighbor.type !== "file" || !pathInside(currentPath, neighbor.path)) {
        continue;
      }

      const relativePath = getRelativePath(currentPath, neighbor.path);
      if (!relativePath || relativePath === "." || !relativePath.includes("/")) {
        continue;
      }

      const [segment] = relativePath.split("/");
      if (segment) {
        connectedChildDirectories.add(segment);
      }
    }

    if (connectedChildDirectories.size > 1) {
      renderableIds.add(descriptor.node.id);
    }
  }

  return renderableIds;
}

function autoDescendFocusPath(
  store: IGraphStore,
  descriptors: ArchitectureFileDescriptor[],
  focusPath: string
): string {
  let currentPath = focusPath;

  while (true) {
    const visibleDescriptors = descriptors.filter((descriptor) => {
      const relativePath = getRelativePath(currentPath, descriptor.node.path);
      return (
        relativePath !== null &&
        relativePath !== "." &&
        (descriptor.hiddenCategory === null || descriptor.touched || descriptor.impacted)
      );
    });

    const childDirectories = collectVisibleFocusDirectoryCandidates(visibleDescriptors, currentPath, false, focusPath);
    if (childDirectories.size !== 1) {
      return currentPath;
    }

    const directDescriptors = collectFocusDirectDescriptors(visibleDescriptors, currentPath);
    const renderableDirectFileIds = selectRenderableFocusFileIds(
      store,
      directDescriptors,
      childDirectories,
      currentPath,
      false
    );

    if (renderableDirectFileIds.size > 0) {
      return currentPath;
    }

    const nextPath = Array.from(childDirectories.keys())[0];
    if (!nextPath || nextPath === currentPath) {
      return currentPath;
    }

    currentPath = nextPath;
  }
}

function sortGraphNodes(nodes: GraphNodeResponse[]): GraphNodeResponse[] {
  return [...nodes].sort((left, right) => {
    const leftPriority = Number(left.touched || left.impacted);
    const rightPriority = Number(right.touched || right.impacted);
    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    const degreeDelta = right.degree - left.degree;
    if (degreeDelta !== 0) {
      return degreeDelta;
    }

    return left.path.localeCompare(right.path);
  });
}

function addAggregatedEdge(
  aggregatedEdges: Map<string, GraphEdgeResponse>,
  source: string,
  target: string,
  type: ProjectEdge["type"],
  weight: number,
  relationshipSource: GraphRelationshipSource
): void {
  const edgeKey = `${source}::${target}::${type}`;
  const existing = aggregatedEdges.get(edgeKey);
  if (existing) {
    existing.weight += weight;
    if (!existing.relationshipSources.includes(relationshipSource)) {
      existing.relationshipSources = [...existing.relationshipSources, relationshipSource].sort();
    }
    return;
  }

  aggregatedEdges.set(edgeKey, {
    source,
    target,
    type,
    weight,
    relationshipSources: [relationshipSource]
  });
}

function aggregateRenderedEdges(
  store: IGraphStore,
  fileNodeIds: Set<string>,
  renderedNodeIdsByFileId: Map<string, string>,
  staticRelationships: ArchitectureProjection["staticRelationships"] = [],
  relationshipNodeIdsByPath: Map<string, string> = new Map()
): {
  edges: GraphEdgeResponse[];
  degreeCounts: Map<string, number>;
} {
  const aggregatedEdges = new Map<string, GraphEdgeResponse>();

  for (const edge of store.getEdges()) {
    if (!fileNodeIds.has(edge.source) || !fileNodeIds.has(edge.target)) {
      continue;
    }

    const source = renderedNodeIdsByFileId.get(edge.source);
    const target = renderedNodeIdsByFileId.get(edge.target);
    if (!source || !target || source === target) {
      continue;
    }

    addAggregatedEdge(aggregatedEdges, source, target, edge.type, edge.weight, "import");
  }

  for (const relationship of staticRelationships) {
    const source = relationshipNodeIdsByPath.get(relationship.sourcePath);
    const target = relationshipNodeIdsByPath.get(relationship.targetPath);
    if (!source || !target || source === target) {
      continue;
    }

    addAggregatedEdge(aggregatedEdges, source, target, "imports", 1, relationship.sourceKind);
  }

  const degreeCounts = new Map<string, number>();
  for (const edge of aggregatedEdges.values()) {
    degreeCounts.set(edge.source, (degreeCounts.get(edge.source) ?? 0) + 1);
    degreeCounts.set(edge.target, (degreeCounts.get(edge.target) ?? 0) + 1);
  }

  return {
    edges: Array.from(aggregatedEdges.values()),
    degreeCounts
  };
}

function finalizeProjectGraph(
  nodes: GraphNodeResponse[],
  edges: GraphEdgeResponse[],
  limit: number,
  granularity: GraphGranularity,
  hiddenSummary: GraphHiddenSummaryItem[],
  hiddenPreview: GraphHiddenPreviewGroup[],
  showHidden: boolean,
  focus: { path: string; label: string } | null,
  drilldown: GraphDrilldownResponse | null,
  drilldownTrail: GraphDrilldownResponse[]
): GraphResponse {
  const selectedNodes = sortGraphNodes(nodes)
    .slice(0, limit)
    .map((node) => ({ ...node }));
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));
  const degreeCounts = new Map<string, number>();

  for (const edge of selectedEdges) {
    degreeCounts.set(edge.source, (degreeCounts.get(edge.source) ?? 0) + 1);
    degreeCounts.set(edge.target, (degreeCounts.get(edge.target) ?? 0) + 1);
  }

  for (const node of selectedNodes) {
    node.degree = degreeCounts.get(node.id) ?? 0;
  }

  const hiddenIsolatedCount = hiddenSummary.find((summary) => summary.category === "isolated")?.count ?? 0;
  const fallbackApplied =
    !showHidden && nodes.length < DEFAULT_GRAPH_SPARSE_FALLBACK_THRESHOLD && hiddenPreview.length > 0;

  return {
    scope: "project",
    granularity,
    nodeCount: selectedNodes.length,
    edgeCount: selectedEdges.length,
    truncated: nodes.length > selectedNodes.length,
    fallbackApplied,
    focusApplied: Boolean(focus),
    focus: focus ?? undefined,
    drilldown: drilldown ?? undefined,
    drilldownTrail,
    hiddenIsolatedCount,
    hiddenSummary,
    hiddenPreview: showHidden ? [] : hiddenPreview,
    nodes: selectedNodes,
    edges: selectedEdges
  };
}

function buildProjectFocusedGraph(
  store: IGraphStore,
  projection: ArchitectureProjection,
  limit: number,
  showHidden: boolean,
  focusPath: string,
  drilldownPath?: string
): GraphResponse {
  const descriptors = projection.descriptors.filter((descriptor) => descriptor.architectureUnitPath === focusPath);
  if (descriptors.length === 0) {
    return buildProjectFileGraph(store, projection, limit, showHidden);
  }

  const requestedPath = drilldownPath ? joinProjectPath(focusPath, drilldownPath) : focusPath;
  const hasRequestedPath = drilldownPath ? hasDescriptorsWithinPath(descriptors, requestedPath) : false;
  const currentPath = hasRequestedPath ? requestedPath : autoDescendFocusPath(store, descriptors, focusPath);
  const focusFileNodeIds = new Set(descriptors.map((descriptor) => descriptor.node.id));
  const directDescriptors = collectFocusDirectDescriptors(descriptors, currentPath);
  const visibleChildDirectories = collectVisibleFocusDirectoryCandidates(descriptors, currentPath, showHidden, focusPath);
  const visibleDirectDescriptors = directDescriptors.filter((descriptor) => isVisibleDescriptor(descriptor, showHidden));
  const renderableDirectFileIds = selectRenderableFocusFileIds(
    store,
    visibleDirectDescriptors,
    visibleChildDirectories,
    currentPath,
    showHidden
  );
  const hiddenCounts = new Map<GraphHiddenCategory, number>();
  const hiddenPreviewCandidates = new Map<GraphHiddenCategory, HiddenPreviewCandidate[]>();
  const candidateRenderedNodeIdsByFileId = new Map<string, string>();

  for (const directory of visibleChildDirectories.values()) {
    for (const fileId of directory.fileIds) {
      candidateRenderedNodeIdsByFileId.set(fileId, directory.id);
    }
  }

  for (const descriptor of visibleDirectDescriptors) {
    if (renderableDirectFileIds.has(descriptor.node.id)) {
      candidateRenderedNodeIdsByFileId.set(descriptor.node.id, descriptor.node.id);
    }
  }

  const { degreeCounts: candidateDegreeCounts } = aggregateRenderedEdges(
    store,
    focusFileNodeIds,
    candidateRenderedNodeIdsByFileId
  );

  const renderedNodes: GraphNodeResponse[] = [];
  const renderedNodeIdsByFileId = new Map<string, string>();

  for (const directory of visibleChildDirectories.values()) {
    const degree = candidateDegreeCounts.get(directory.id) ?? 0;
    if (showHidden || directory.touched || directory.impacted || degree > 0) {
      renderedNodes.push(createProjectDirectoryNodeResponse(directory, degree));
      for (const fileId of directory.fileIds) {
        renderedNodeIdsByFileId.set(fileId, directory.id);
      }
      continue;
    }

    incrementHiddenCategory(hiddenCounts, "isolated");
    const existing = hiddenPreviewCandidates.get("isolated") ?? [];
    existing.push(createHiddenDirectoryPreviewCandidate(directory, degree));
    hiddenPreviewCandidates.set("isolated", existing);
  }

  for (const descriptor of directDescriptors) {
    const degree = candidateDegreeCounts.get(descriptor.node.id) ?? 0;
    const visibleByCategory = isVisibleDescriptor(descriptor, showHidden);
    const shouldRender = visibleByCategory && renderableDirectFileIds.has(descriptor.node.id);
    const isLeafLayer = visibleChildDirectories.size === 0;

    if (shouldRender && (isLeafLayer || showHidden || descriptor.touched || descriptor.impacted || degree > 0)) {
      renderedNodes.push(createProjectFileNodeResponse(descriptor, degree));
      renderedNodeIdsByFileId.set(descriptor.node.id, descriptor.node.id);
      continue;
    }

    if (!showHidden && descriptor.hiddenCategory && !descriptor.touched && !descriptor.impacted) {
      incrementHiddenCategory(hiddenCounts, descriptor.hiddenCategory);
      const existing = hiddenPreviewCandidates.get(descriptor.hiddenCategory) ?? [];
      existing.push(createHiddenFilePreviewCandidate(descriptor, degree));
      hiddenPreviewCandidates.set(descriptor.hiddenCategory, existing);
      continue;
    }

    if (!showHidden && !descriptor.touched && !descriptor.impacted) {
      incrementHiddenCategory(hiddenCounts, "isolated");
      const existing = hiddenPreviewCandidates.get("isolated") ?? [];
      existing.push(createHiddenFilePreviewCandidate(descriptor, degree));
      hiddenPreviewCandidates.set("isolated", existing);
      continue;
    }

    renderedNodes.push(createProjectFileNodeResponse(descriptor, degree));
    renderedNodeIdsByFileId.set(descriptor.node.id, descriptor.node.id);
  }

  const { edges, degreeCounts } = aggregateRenderedEdges(store, focusFileNodeIds, renderedNodeIdsByFileId);
  const nodes = renderedNodes.map((node) => ({
    ...node,
    degree: degreeCounts.get(node.id) ?? 0
  }));
  const drilldownTrail = buildDrilldownTrail(focusPath, currentPath);
  const drilldown = drilldownTrail.at(-1) ?? null;

  return finalizeProjectGraph(
    nodes,
    edges,
    limit,
    "file",
    buildHiddenSummary(hiddenCounts, "file", {
      isolatedLabel: "items"
    }),
    buildHiddenPreview(hiddenPreviewCandidates),
    showHidden,
    { path: focusPath, label: focusPath === "." ? "project-root" : focusPath },
    drilldown,
    drilldownTrail
  );
}

function buildProjectFileGraph(
  store: IGraphStore,
  projection: ArchitectureProjection,
  limit: number,
  showHidden: boolean,
  focusPath?: string,
  drilldownPath?: string
): GraphResponse {
  if (focusPath) {
    return buildProjectFocusedGraph(store, projection, limit, showHidden, focusPath, drilldownPath);
  }

  const descriptors = focusPath
    ? projection.descriptors.filter((descriptor) => descriptor.architectureUnitPath === focusPath)
    : projection.descriptors;

  const fileNodeIds = new Set(descriptors.map((descriptor) => descriptor.node.id));
  const candidateRenderedNodeIdsByFileId = new Map(descriptors.map((descriptor) => [descriptor.node.id, descriptor.node.id]));
  const { degreeCounts: candidateDegreeCounts } = aggregateRenderedEdges(store, fileNodeIds, candidateRenderedNodeIdsByFileId);
  const hiddenCounts = new Map<GraphHiddenCategory, number>();
  const hiddenPreviewCandidates = new Map<GraphHiddenCategory, HiddenPreviewCandidate[]>();
  const visibleDescriptors = descriptors.filter((descriptor) => {
    const degree = candidateDegreeCounts.get(descriptor.node.id) ?? 0;
    if (showHidden || descriptor.touched || descriptor.impacted) {
      return true;
    }

    if (descriptor.hiddenCategory) {
      incrementHiddenCategory(hiddenCounts, descriptor.hiddenCategory);
      const existing = hiddenPreviewCandidates.get(descriptor.hiddenCategory) ?? [];
      existing.push(createHiddenFilePreviewCandidate(descriptor, degree));
      hiddenPreviewCandidates.set(descriptor.hiddenCategory, existing);
      return false;
    }

    if (degree === 0) {
      incrementHiddenCategory(hiddenCounts, "isolated");
      const existing = hiddenPreviewCandidates.get("isolated") ?? [];
      existing.push(createHiddenFilePreviewCandidate(descriptor, degree));
      hiddenPreviewCandidates.set("isolated", existing);
      return false;
    }

    return true;
  });

  const renderedNodeIdsByFileId = new Map(visibleDescriptors.map((descriptor) => [descriptor.node.id, descriptor.node.id]));
  const { edges, degreeCounts } = aggregateRenderedEdges(store, fileNodeIds, renderedNodeIdsByFileId);
  const nodes = visibleDescriptors.map((descriptor) => ({
    ...createProjectFileNodeResponse(descriptor, degreeCounts.get(descriptor.node.id) ?? 0),
    degree: degreeCounts.get(descriptor.node.id) ?? 0
  }));

  return finalizeProjectGraph(
    nodes,
    edges,
    limit,
    "file",
    buildHiddenSummary(hiddenCounts, "file"),
    buildHiddenPreview(hiddenPreviewCandidates),
    showHidden,
    null,
    null,
    []
  );
}

function buildProjectModuleGraph(
  store: IGraphStore,
  projection: ArchitectureProjection,
  limit: number,
  showHidden: boolean
): GraphResponse {
  const descriptors = projection.descriptors;
  const fileNodeIds = new Set(descriptors.map((descriptor) => descriptor.node.id));
  const hiddenCounts = new Map<GraphHiddenCategory, number>();
  const hiddenPreviewCandidates = new Map<GraphHiddenCategory, HiddenPreviewCandidate[]>();
  const groupCandidates = new Map<string, ProjectGraphUnitAccumulator>();
  const visibleSupportFiles: ArchitectureFileDescriptor[] = [];
  const candidateRenderedNodeIdsByFileId = new Map<string, string>();
  const candidateRelationshipNodeIdsByPath = new Map<string, string>();

  for (const descriptor of descriptors) {
    if (descriptor.hiddenCategory === null) {
      const existing = groupCandidates.get(descriptor.architectureUnitId) ?? {
        id: descriptor.architectureUnitId,
        path: descriptor.architectureUnitPath,
        label: descriptor.architectureUnitLabel,
        architectureUnit: descriptor.architectureUnitPath,
        signal: descriptor.architectureSignal,
        languageSet: new Set<string>(),
        language: descriptor.node.language,
        tier: descriptor.node.tier,
        touched: false,
        impacted: false,
        fileIds: []
      };
      existing.languageSet.add(descriptor.node.language);
      existing.tier = descriptor.node.tier < existing.tier ? descriptor.node.tier : existing.tier;
      existing.language = existing.language === descriptor.node.language ? existing.language : "mixed";
      existing.touched = existing.touched || descriptor.touched;
      existing.impacted = existing.impacted || descriptor.impacted;
      existing.fileIds.push(descriptor.node.id);
      if (existing.signal !== "package" && descriptor.architectureSignal === "package") {
        existing.signal = "package";
      } else if (existing.signal === "heuristic" && descriptor.architectureSignal === "entrypoint") {
        existing.signal = "entrypoint";
      }
      groupCandidates.set(descriptor.architectureUnitId, existing);
      candidateRenderedNodeIdsByFileId.set(descriptor.node.id, descriptor.architectureUnitId);
      candidateRelationshipNodeIdsByPath.set(descriptor.architectureUnitPath, descriptor.architectureUnitId);
      continue;
    }

    if (showHidden || descriptor.touched || descriptor.impacted) {
      visibleSupportFiles.push(descriptor);
      candidateRenderedNodeIdsByFileId.set(descriptor.node.id, descriptor.node.id);
      continue;
    }

    incrementHiddenCategory(hiddenCounts, descriptor.hiddenCategory);
    const existing = hiddenPreviewCandidates.get(descriptor.hiddenCategory) ?? [];
    existing.push(createHiddenFilePreviewCandidate(descriptor, descriptor.fileDegree));
    hiddenPreviewCandidates.set(descriptor.hiddenCategory, existing);
  }

  const { degreeCounts: candidateDegreeCounts } = aggregateRenderedEdges(
    store,
    fileNodeIds,
    candidateRenderedNodeIdsByFileId,
    projection.staticRelationships,
    candidateRelationshipNodeIdsByPath
  );

  const visibleGroupIds = new Set<string>();
  const visibleRelationshipNodeIdsByPath = new Map<string, string>();
  const renderedNodes: GraphNodeResponse[] = [];

  for (const group of groupCandidates.values()) {
    const degree = candidateDegreeCounts.get(group.id) ?? 0;
    const visible = showHidden || group.touched || group.impacted || degree > 0 || group.signal !== "heuristic";
    if (!visible) {
      incrementHiddenCategory(hiddenCounts, "isolated");
      const existing = hiddenPreviewCandidates.get("isolated") ?? [];
      existing.push(createHiddenGroupPreviewCandidate(group, degree));
      hiddenPreviewCandidates.set("isolated", existing);
      continue;
    }

    visibleGroupIds.add(group.id);
    visibleRelationshipNodeIdsByPath.set(group.path, group.id);
    renderedNodes.push(createProjectUnitNodeResponse(group, degree));
  }

  for (const descriptor of visibleSupportFiles) {
    renderedNodes.push(createProjectFileNodeResponse(descriptor, 0));
  }

  const renderedNodeIdsByFileId = new Map<string, string>();
  for (const descriptor of descriptors) {
    if (descriptor.hiddenCategory === null) {
      if (visibleGroupIds.has(descriptor.architectureUnitId)) {
        renderedNodeIdsByFileId.set(descriptor.node.id, descriptor.architectureUnitId);
      }
      continue;
    }

    if (showHidden || descriptor.touched || descriptor.impacted) {
      renderedNodeIdsByFileId.set(descriptor.node.id, descriptor.node.id);
    }
  }

  const { edges, degreeCounts } = aggregateRenderedEdges(
    store,
    fileNodeIds,
    renderedNodeIdsByFileId,
    projection.staticRelationships,
    visibleRelationshipNodeIdsByPath
  );
  const nodes = renderedNodes.map((node) => ({
    ...node,
    degree: degreeCounts.get(node.id) ?? 0
  }));

  return finalizeProjectGraph(
    nodes,
    edges,
    limit,
    "module",
    buildHiddenSummary(hiddenCounts, "module"),
    buildHiddenPreview(hiddenPreviewCandidates),
    showHidden,
    null,
    null,
    []
  );
}

function rankSearchResult(node: ProjectNode, normalizedQuery: string): number {
  if (node.path.toLowerCase() === normalizedQuery) {
    return 0;
  }

  if (node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery)) {
    return 1;
  }

  if (node.summary?.toLowerCase().includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

function matchesDirectory(store: IGraphStore, normalizedPath: string): boolean {
  if (normalizedPath === ".") {
    return true;
  }

  const prefix = `${normalizedPath}/`;
  return store.getNodes().some((node) => node.type === "file" && (node.path === normalizedPath || node.path.startsWith(prefix)));
}

function findDirectoryModuleBoundary(store: IGraphStore, normalizedPath: string): string | undefined {
  return (
    store
      .getNodes()
      .find((node) => node.type === "file" && node.metadata.moduleBoundary === normalizedPath)
      ?.metadata.moduleBoundary ?? undefined
  );
}

function getModuleSummary(store: IGraphStore, moduleBoundary: string | undefined) {
  if (!moduleBoundary) {
    return undefined;
  }

  return store.getGeneratedContext().moduleSummaries[moduleBoundary];
}

export function buildFileExplanation(store: IGraphStore, relativePath: string): FileExplainResponse | null {
  const normalizedPath = normalizeRelativePath(relativePath);
  const node = store.getNode(createFileNodeId(normalizedPath));
  if (!node) {
    return null;
  }

  const dependencyPaths = store
    .getOutgoingEdges(node.id)
    .map((edge) => store.getNode(edge.target)?.path)
    .filter((value): value is string => Boolean(value))
    .sort();

  const dependentPaths = store
    .getIncomingEdges(node.id)
    .map((edge) => store.getNode(edge.source)?.path)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    kind: "file",
    path: node.path,
    language: node.language,
    tier: node.tier,
    summary: node.summary ?? "",
    summarySource: node.summarySource ?? "heuristic",
    exports: node.exports,
    dependencies: dependencyPaths,
    dependents: dependentPaths,
    externalDependencies: node.metadata.externalDependencies ?? [],
    unresolvedImports: node.metadata.unresolvedImports ?? [],
    moduleBoundary: node.metadata.moduleBoundary
  };
}

export function buildDirectoryExplanation(store: IGraphStore, relativePath: string): DirectoryExplainResponse {
  const normalizedPath = normalizeRelativePath(relativePath);
  const prefix = normalizedPath === "." ? "" : `${normalizedPath}/`;
  const matchingFiles = store.getNodes().filter(
    (node) => node.type === "file" && (node.path === normalizedPath || node.path.startsWith(prefix))
  );

  const dominantLanguages = Array.from(
    matchingFiles.reduce<Map<string, number>>((counts, node) => {
      counts.set(node.language, (counts.get(node.language) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .map(([language]) => language)
    .slice(0, 3);

  const moduleBoundary = findDirectoryModuleBoundary(store, normalizedPath);
  const moduleSummary = getModuleSummary(store, moduleBoundary);

  return {
    kind: "directory",
    path: normalizedPath,
    fileCount: matchingFiles.length,
    dominantLanguages,
    children: matchingFiles.map((node) => node.path).sort(),
    techStackHints: [...new Set(store.getState().techStack.frameworks)],
    summary: moduleSummary?.text,
    summarySource: moduleSummary?.source
  };
}

export function buildSearchResults(store: IGraphStore, query: string, limit = DEFAULT_SEARCH_LIMIT): SearchResultResponse[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return store
    .search(normalizedQuery)
    .sort((left, right) => {
      const leftRank = rankSearchResult(left, normalizedQuery);
      const rightRank = rankSearchResult(right, normalizedQuery);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, limit)
    .map((node) => ({
      path: node.path,
      type: node.type,
      language: node.language,
      summary: node.summary,
      moduleBoundary: node.metadata.moduleBoundary
    }));
}

export function buildDependencyResponse(
  store: IGraphStore,
  relativePath: string,
  direction: DependencyDirection = DEFAULT_DEPENDENCY_DIRECTION
): DependencyResponse | null {
  const explanation = buildFileExplanation(store, relativePath);
  if (!explanation) {
    return null;
  }

  return {
    path: explanation.path,
    direction,
    moduleBoundary: explanation.moduleBoundary,
    dependencies: direction === "dependents" ? [] : explanation.dependencies,
    dependents: direction === "dependencies" ? [] : explanation.dependents,
    externalDependencies: explanation.externalDependencies,
    unresolvedImports: explanation.unresolvedImports
  };
}

export function buildExplorerResponse(
  store: IGraphStore,
  relativePath: string,
  options?: {
    latestSession?: ActivitySession | null;
    relatedSessions?: SessionSummaryResponse[];
    relatedSessionsLimit?: number;
  }
): ExplorerResponse | null {
  const normalizedPath = normalizeRelativePath(relativePath);
  const latestSession = options?.latestSession ?? null;
  const fileExplanation = buildFileExplanation(store, normalizedPath);

  if (fileExplanation) {
    const node = getFileNode(store, normalizedPath);
    const moduleFiles = node?.metadata.moduleBoundary
      ? sortPaths(
          store
            .getNodes()
            .filter((candidate) => candidate.type === "file" && candidate.metadata.moduleBoundary === node.metadata.moduleBoundary)
            .map((candidate) => candidate.path)
        )
      : [];

    const response: ExplorerResponseFile = {
      ...fileExplanation,
      kind: "file",
      moduleFiles,
      incomingCount: node ? getDependentCount(store, node.id) : 0,
      outgoingCount: node ? getDependencyCount(store, node.id) : 0,
      lastTouchedByLatestSession: Boolean(latestSession?.touchedPaths.includes(normalizedPath))
    };

    return response;
  }

  if (!matchesDirectory(store, normalizedPath)) {
    return null;
  }

  const moduleBoundary = findDirectoryModuleBoundary(store, normalizedPath);

  const response: ExplorerResponseDirectory = {
    ...buildDirectoryExplanation(store, normalizedPath),
    kind: "directory",
    moduleBoundary,
    relatedSessions: (options?.relatedSessions ?? []).slice(0, options?.relatedSessionsLimit ?? DEFAULT_RELATED_SESSIONS_LIMIT)
  };

  return response;
}

export function buildGraphResponse(
  store: IGraphStore,
  options: {
    scope: "latest-session" | "project";
    session?: ActivitySession | null;
    granularity?: GraphGranularity;
    showHidden?: boolean;
    focusPath?: string;
    drilldownPath?: string;
    limitNodes?: number;
  }
): GraphResponse {
  const session = options.session ?? null;
  const touchedPaths = new Set(session?.touchedPaths ?? []);
  const impactedPaths = new Set(session?.impactedDependents ?? []);
  const granularity = options.scope === "latest-session" ? "file" : (options.granularity ?? "module");
  const defaultLimit =
    options.scope === "latest-session"
      ? DEFAULT_GRAPH_LATEST_SESSION_LIMIT
      : granularity === "module"
        ? DEFAULT_GRAPH_PROJECT_MODULE_LIMIT
        : DEFAULT_GRAPH_PROJECT_LIMIT;
  const limit = options.limitNodes ?? defaultLimit;

  if (options.scope === "project") {
    const projection = buildArchitectureProjection(store, touchedPaths, impactedPaths);
    return granularity === "module"
      ? buildProjectModuleGraph(store, projection, limit, options.showHidden ?? false)
      : buildProjectFileGraph(store, projection, limit, options.showHidden ?? false, options.focusPath, options.drilldownPath);
  }

  let selectedNodes: ProjectNode[] = [];
  if (session) {
    const touchedNodes = sortPaths(session.touchedPaths)
      .map((sessionPath) => getFileNode(store, sessionPath))
      .filter((node): node is ProjectNode => node !== null);
    const impactedNodes = sortPaths(session.impactedDependents ?? [])
      .map((sessionPath) => getFileNode(store, sessionPath))
      .filter((node): node is ProjectNode => node !== null);

    const oneHopNeighborIds = new Set<string>();
    for (const node of touchedNodes) {
      for (const edge of [...store.getIncomingEdges(node.id), ...store.getOutgoingEdges(node.id)]) {
        const neighborId = edge.source === node.id ? edge.target : edge.source;
        const neighbor = store.getNode(neighborId);
        if (neighbor?.type === "file") {
          oneHopNeighborIds.add(neighborId);
        }
      }
    }

    const prioritizedNodes = new Map<string, ProjectNode>();
    for (const node of touchedNodes) {
      prioritizedNodes.set(node.id, node);
    }

    for (const node of impactedNodes) {
      if (!prioritizedNodes.has(node.id)) {
        prioritizedNodes.set(node.id, node);
      }
    }

    const neighbors = Array.from(oneHopNeighborIds)
      .map((nodeId) => store.getNode(nodeId))
      .filter((node): node is ProjectNode => node !== null && node.type === "file")
      .filter((node) => !prioritizedNodes.has(node.id))
      .sort((left, right) => {
        const degreeDelta = getDegree(store, right.id) - getDegree(store, left.id);
        if (degreeDelta !== 0) {
          return degreeDelta;
        }

        return left.path.localeCompare(right.path);
      });

    selectedNodes = [...prioritizedNodes.values(), ...neighbors].slice(0, limit);
  }

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = store
    .getEdges()
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map(toGraphEdgeResponse);

  return {
    scope: "latest-session",
    granularity: "file",
    nodeCount: selectedNodes.length,
    edgeCount: selectedEdges.length,
    truncated:
      session !== null &&
      new Set([...(session.touchedPaths ?? []), ...((session.impactedDependents ?? []) || [])]).size > 0 &&
      selectedNodes.length >= limit,
    fallbackApplied: false,
    focusApplied: false,
    drilldownTrail: [],
    hiddenIsolatedCount: 0,
    hiddenSummary: [],
    hiddenPreview: [],
    nodes: selectedNodes.map((node) => toGraphNodeResponse(store, node, touchedPaths, impactedPaths)),
    edges: selectedEdges
  };
}
