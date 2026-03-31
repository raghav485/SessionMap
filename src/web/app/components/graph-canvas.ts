import * as d3 from "d3";

import type { GraphEdgeResponse, GraphNodeResponse, GraphResponse } from "../../../types.js";
import type { GraphViewportState } from "../state.js";

type GraphNodeDatum = GraphNodeResponse & d3.SimulationNodeDatum;
type GraphLinkDatum = GraphEdgeResponse & d3.SimulationLinkDatum<GraphNodeDatum>;

interface GraphCanvasRenderOptions {
  viewport: GraphViewportState | null;
  onViewportChange(viewport: GraphViewportState | null): void;
}

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 560;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
const FIT_PADDING = 56;
const LABEL_PADDING_X = 120;
const LABEL_PADDING_Y = 24;
const POSITIONING_TICKS = 240;

function isPanInteractionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.classList.contains("graph-pan-surface");
}

function getLinkedCoordinate(linkedNode: GraphNodeDatum | string | number | undefined, axis: "x" | "y"): number {
  if (linkedNode && typeof linkedNode === "object") {
    return linkedNode[axis] ?? 0;
  }

  return 0;
}

function isViewportValid(viewport: GraphViewportState | null): viewport is GraphViewportState {
  return Boolean(
    viewport &&
      Number.isFinite(viewport.x) &&
      Number.isFinite(viewport.y) &&
      Number.isFinite(viewport.k) &&
      viewport.k >= ZOOM_MIN &&
      viewport.k <= ZOOM_MAX
  );
}

export class GraphCanvas {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private fitHandler: (() => void) | null = null;

  render(
    container: HTMLElement,
    graph: GraphResponse,
    onNodeSelect: (node: GraphNodeResponse) => void,
    options: GraphCanvasRenderOptions
  ): void {
    container.innerHTML = "";
    this.svg = null;
    this.zoomBehavior = null;
    this.fitHandler = null;

    if (graph.nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No graph nodes are available for the selected scope yet.";
      container.appendChild(empty);
      options.onViewportChange(null);
      return;
    }

    const svg = d3
      .select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`)
      .attr("class", "graph-svg");

    const nodes: GraphNodeDatum[] = graph.nodes.map((node) => ({ ...node }));
    const links: GraphLinkDatum[] = graph.edges.map((edge) => ({ ...edge }));

    const panSurface = svg
      .append("rect")
      .attr("class", "graph-pan-surface")
      .attr("width", GRAPH_WIDTH)
      .attr("height", GRAPH_HEIGHT);

    const viewport = svg.append("g").attr("class", "graph-viewport");

    const simulation = d3
      .forceSimulation<GraphNodeDatum>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNodeDatum, GraphLinkDatum>(links)
          .id((node) => node.id)
          .distance(90)
      )
      .force("charge", d3.forceManyBody<GraphNodeDatum>().strength(-260))
      .force("center", d3.forceCenter(GRAPH_WIDTH / 2, GRAPH_HEIGHT / 2))
      .force("collision", d3.forceCollide<GraphNodeDatum>().radius((node) => 14 + Math.min(node.degree, 10)));

    for (let index = 0; index < POSITIONING_TICKS; index += 1) {
      simulation.tick();
    }
    simulation.stop();

    const link = viewport
      .append("g")
      .attr("class", "graph-links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (edge) => Math.max(1, edge.weight));

    const nodeGroup = viewport
      .append("g")
      .attr("class", "graph-nodes")
      .selectAll<SVGGElement, GraphNodeDatum>("g")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", (node) => `Inspect ${node.path}`);

    const updatePositions = () => {
      link
        .attr("x1", (edge) => getLinkedCoordinate(edge.source as GraphNodeDatum | string | number | undefined, "x"))
        .attr("y1", (edge) => getLinkedCoordinate(edge.source as GraphNodeDatum | string | number | undefined, "y"))
        .attr("x2", (edge) => getLinkedCoordinate(edge.target as GraphNodeDatum | string | number | undefined, "x"))
        .attr("y2", (edge) => getLinkedCoordinate(edge.target as GraphNodeDatum | string | number | undefined, "y"));

      nodeGroup.attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    };

    nodeGroup
      .call(
        d3
          .drag<SVGGElement, GraphNodeDatum>()
          .on("start", (event, node) => {
            event.sourceEvent?.stopPropagation();
            if (!event.active) {
              simulation.alphaTarget(0.2).restart();
            }
            node.fx = node.x;
            node.fy = node.y;
          })
          .on("drag", (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
            updatePositions();
          })
          .on("end", (event, node) => {
            if (!event.active) {
              simulation.alphaTarget(0);
            }
            node.fx = null;
            node.fy = null;
          })
      )
      .on("click", (_event, node) => {
        onNodeSelect(node);
      })
      .on("keydown", (event, node) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNodeSelect(node);
        }
      });

    nodeGroup
      .append("circle")
      .attr("class", "graph-node-hit")
      .attr("r", (node) => 10 + Math.min(node.degree, 8))
      .attr("fill", (node) => {
        if (node.touched) {
          return "#d47c3c";
        }
        if (node.impacted) {
          return "#6f9ccf";
        }
        return "#1f2a36";
      });

    nodeGroup
      .append("text")
      .attr("dy", 4)
      .attr("x", 14)
      .text((node) => node.label)
      .attr("class", "graph-label");

    const persistViewport = (transform: d3.ZoomTransform): void => {
      viewport
        .attr("transform", transform.toString())
        .attr("data-transform", `${transform.x.toFixed(2)},${transform.y.toFixed(2)},${transform.k.toFixed(4)}`);
      options.onViewportChange({
        x: transform.x,
        y: transform.y,
        k: transform.k
      });
    };

    const applyTransform = (transform: d3.ZoomTransform): void => {
      if (!this.svg || !this.zoomBehavior) {
        return;
      }

      this.svg.call(this.zoomBehavior.transform, transform);
    };

    const fitGraph = (): void => {
      const minX =
        d3.min(nodes, (node) => (node.x ?? GRAPH_WIDTH / 2) - (18 + Math.min(node.degree, 8))) ?? GRAPH_WIDTH / 2;
      const maxX = d3.max(nodes, (node) => (node.x ?? GRAPH_WIDTH / 2) + LABEL_PADDING_X) ?? GRAPH_WIDTH / 2;
      const minY =
        d3.min(nodes, (node) => (node.y ?? GRAPH_HEIGHT / 2) - (18 + Math.min(node.degree, 8))) ?? GRAPH_HEIGHT / 2;
      const maxY = d3.max(nodes, (node) => (node.y ?? GRAPH_HEIGHT / 2) + LABEL_PADDING_Y) ?? GRAPH_HEIGHT / 2;

      const boundsWidth = Math.max(maxX - minX, 1);
      const boundsHeight = Math.max(maxY - minY, 1);
      const scale = Math.max(
        ZOOM_MIN,
        Math.min(
          ZOOM_MAX,
          Math.min((GRAPH_WIDTH - FIT_PADDING * 2) / boundsWidth, (GRAPH_HEIGHT - FIT_PADDING * 2) / boundsHeight)
        )
      );
      const centerX = minX + boundsWidth / 2;
      const centerY = minY + boundsHeight / 2;

      applyTransform(
        d3.zoomIdentity
          .translate(GRAPH_WIDTH / 2 - centerX * scale, GRAPH_HEIGHT / 2 - centerY * scale)
          .scale(scale)
      );
    };

    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => {
        if (event.type === "wheel") {
          return true;
        }

        if (event.type === "mousedown" || event.type.startsWith("touch")) {
          return isPanInteractionTarget(event.target);
        }

        return false;
      })
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on("start", (event) => {
        svg.classed("graph-panning", event.sourceEvent?.type === "mousedown");
      })
      .on("zoom", (event) => {
        persistViewport(event.transform);
      })
      .on("end", () => {
        svg.classed("graph-panning", false);
      });

    svg.call(this.zoomBehavior).on("dblclick.zoom", null);
    panSurface.lower();
    this.svg = svg;
    this.fitHandler = fitGraph;

    updatePositions();
    simulation.on("tick", updatePositions);

    if (isViewportValid(options.viewport)) {
      applyTransform(d3.zoomIdentity.translate(options.viewport.x, options.viewport.y).scale(options.viewport.k));
    } else {
      fitGraph();
    }
  }

  zoomIn(): void {
    if (!this.svg || !this.zoomBehavior) {
      return;
    }

    this.svg.transition().duration(160).call(this.zoomBehavior.scaleBy, ZOOM_STEP);
  }

  zoomOut(): void {
    if (!this.svg || !this.zoomBehavior) {
      return;
    }

    this.svg.transition().duration(160).call(this.zoomBehavior.scaleBy, 1 / ZOOM_STEP);
  }

  fitToView(): void {
    this.fitHandler?.();
  }
}
