import * as d3 from "d3";

import type { GraphEdgeResponse, GraphNodeResponse, GraphResponse } from "../../../types.js";

type GraphNodeDatum = GraphNodeResponse & d3.SimulationNodeDatum;
type GraphLinkDatum = GraphEdgeResponse & d3.SimulationLinkDatum<GraphNodeDatum>;

function getLinkedCoordinate(linkedNode: GraphNodeDatum | string | number | undefined, axis: "x" | "y"): number {
  if (linkedNode && typeof linkedNode === "object") {
    return linkedNode[axis] ?? 0;
  }

  return 0;
}

export class GraphCanvas {
  render(container: HTMLElement, graph: GraphResponse, onNodeSelect: (path: string) => void): void {
    container.innerHTML = "";

    if (graph.nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No graph nodes are available for the selected scope yet.";
      container.appendChild(empty);
      return;
    }

    const width = Math.max(container.clientWidth, 640);
    const height = 560;
    const svg = d3
      .select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("class", "graph-svg");

    const nodes: GraphNodeDatum[] = graph.nodes.map((node) => ({ ...node }));
    const links: GraphLinkDatum[] = graph.edges.map((edge) => ({ ...edge }));

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
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNodeDatum>().radius((node) => 14 + Math.min(node.degree, 10)));

    const link = svg
      .append("g")
      .attr("class", "graph-links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (edge) => Math.max(1, edge.weight));

    const nodeGroup = svg
      .append("g")
      .attr("class", "graph-nodes")
      .selectAll<SVGGElement, GraphNodeDatum>("g")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", (node) => `Open ${node.path}`)
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNodeDatum>()
          .on("start", (event, node) => {
            if (!event.active) {
              simulation.alphaTarget(0.2).restart();
            }
            node.fx = node.x;
            node.fy = node.y;
          })
          .on("drag", (_event, node) => {
            node.fx = _event.x;
            node.fy = _event.y;
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
        onNodeSelect(node.path);
      })
      .on("keydown", (event, node) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNodeSelect(node.path);
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

    simulation.on("tick", () => {
      link
        .attr("x1", (edge) => getLinkedCoordinate(edge.source as GraphNodeDatum | string | number | undefined, "x"))
        .attr("y1", (edge) => getLinkedCoordinate(edge.source as GraphNodeDatum | string | number | undefined, "y"))
        .attr("x2", (edge) => getLinkedCoordinate(edge.target as GraphNodeDatum | string | number | undefined, "x"))
        .attr("y2", (edge) => getLinkedCoordinate(edge.target as GraphNodeDatum | string | number | undefined, "y"));

      nodeGroup.attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    });
  }
}
