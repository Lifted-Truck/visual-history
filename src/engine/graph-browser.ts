/**
 * graph-browser.ts — Browser-safe graph loader and engine function wrappers.
 *
 * graph.ts uses Node's fs.readFileSync and cannot run in the browser bundle.
 * This module provides equivalent functionality via fetch() and accepts a
 * pre-loaded RuntimeGraph as a parameter to avoid internal loadGraph() calls.
 */
import {
  RuntimeGraphSchema,
  type RuntimeGraph,
  type ChronosNode,
  type ChronosEdge,
  type Scope,
  type MapCluster,
  type FlowPath,
  type EdgeFilter,
  type NodeType,
  type SpatialPrimary,
} from './types';

// ── Loader ────────────────────────────────────────────────────────────────────

let _cached: RuntimeGraph | null = null;

export async function loadGraphFromUrl(url = '/dist/graph.json'): Promise<RuntimeGraph> {
  if (_cached) return _cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load graph: ${res.status} ${res.statusText}`);
  const raw: unknown = await res.json();
  _cached = RuntimeGraphSchema.parse(raw);
  return _cached;
}

export function invalidateBrowserCache(): void {
  _cached = null;
}

// ── Temporal helpers ──────────────────────────────────────────────────────────

function resolveTemporalRange(node: ChronosNode): [number, number] | null {
  const t = node.temporal;
  let start: number | null = null;
  let end: number | null = null;

  if ((t.display_mode === 'fuzzy' || t.display_mode === 'range') && t.fuzzy_range) {
    start = t.fuzzy_range.earliest;
    end = t.fuzzy_range.latest;
  } else {
    start = t.start ?? null;
    end = t.end ?? t.start ?? null;
  }

  if (start === null) return null;
  return [start, end ?? start];
}

function nodeOverlapsScope(node: ChronosNode, scopeStart: number, scopeEnd: number): boolean {
  if (node.temporal.display_mode === 'ordinal') return true;
  const range = resolveTemporalRange(node);
  if (!range) return true;
  return range[0] <= scopeEnd && range[1] >= scopeStart;
}

// ── getNode ───────────────────────────────────────────────────────────────────

export function getNodeFromGraph(graph: RuntimeGraph, id: string): ChronosNode | null {
  return graph.nodes[id] ?? null;
}

// ── subgraph ──────────────────────────────────────────────────────────────────

export function subgraphFromGraph(
  graph: RuntimeGraph,
  scope: Scope,
): { nodes: ChronosNode[]; edges: ChronosEdge[] } {
  const [scopeStart, scopeEnd] = scope.time_range;
  const nodeTypeSet = new Set<string>(scope.node_types);
  const statusSet = new Set<string>(scope.curation_statuses);
  const connClassSet = new Set<string>(scope.connection_classes);
  const tagSet = scope.tags.length > 0 ? new Set(scope.tags) : null;
  const regionSet = scope.regions.length > 0 ? new Set(scope.regions) : null;

  const matchingNodes: ChronosNode[] = [];
  const matchingNodeIds = new Set<string>();

  for (const node of Object.values(graph.nodes)) {
    if (!nodeTypeSet.has(node.node_type)) continue;
    if (!statusSet.has(node.epistemic.curation_status)) continue;
    if (tagSet && !node.semantic.tags.some(t => tagSet.has(t))) continue;
    if (regionSet) {
      const regions = node.spatial.active_regions ?? [];
      if (!regions.some(r => regionSet.has(r.region_id))) continue;
    }
    if (!nodeOverlapsScope(node, scopeStart, scopeEnd)) continue;
    matchingNodes.push(node);
    matchingNodeIds.add(node.id);
  }

  const matchingEdges = graph.edges_flat.filter(edge => {
    if (!matchingNodeIds.has(edge.source)) return false;
    if (!matchingNodeIds.has(edge.target)) return false;
    if (!connClassSet.has(edge.connection_class)) return false;
    if (!statusSet.has(edge.epistemic.curation_status)) return false;
    return true;
  });

  return { nodes: matchingNodes, edges: matchingEdges };
}

// ── neighbors ─────────────────────────────────────────────────────────────────

export function neighborsFromGraph(
  graph: RuntimeGraph,
  id: string,
  depth: number,
  edgeFilters?: EdgeFilter[],
): { nodes: ChronosNode[]; edges: ChronosEdge[] } {
  if (!graph.nodes[id]) return { nodes: [], edges: [] };

  const visitedNodes = new Set<string>([id]);
  const visitedEdges = new Set<string>();
  const queue: Array<{ nodeId: string; dist: number }> = [{ nodeId: id, dist: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.dist >= depth) continue;

    const edgeIds = graph.adjacency[item.nodeId] ?? [];
    for (const edgeId of edgeIds) {
      const edge = graph.edges[edgeId];
      if (!edge) continue;

      if (edgeFilters?.length) {
        const passes = edgeFilters.every(f => {
          if (f.connection_classes && !f.connection_classes.includes(edge.connection_class)) return false;
          if (f.curation_statuses && !f.curation_statuses.includes(edge.epistemic.curation_status)) return false;
          if (f.min_strength !== undefined && edge.strength < f.min_strength) return false;
          return true;
        });
        if (!passes) continue;
      }

      visitedEdges.add(edgeId);
      const neighborId = edge.source === item.nodeId ? edge.target : edge.source;
      if (!visitedNodes.has(neighborId)) {
        visitedNodes.add(neighborId);
        queue.push({ nodeId: neighborId, dist: item.dist + 1 });
      }
    }
  }

  const nodes = Array.from(visitedNodes)
    .map(nid => graph.nodes[nid])
    .filter((n): n is ChronosNode => n !== undefined);
  const edges = Array.from(visitedEdges)
    .map(eid => graph.edges[eid])
    .filter((e): e is ChronosEdge => e !== undefined);

  return { nodes, edges };
}

// ── clusters ──────────────────────────────────────────────────────────────────

const CLUSTER_RADIUS_DEG = 3.0;

export function clustersFromGraph(graph: RuntimeGraph, scope: Scope): MapCluster[] {
  const { nodes } = subgraphFromGraph(graph, scope);
  const locatable = nodes.filter(
    n => !n.spatial.no_coordinates && n.spatial.spatial_mode === 'point' && n.spatial.primary != null,
  );
  if (locatable.length === 0) return [];

  const cellMap = new Map<string, ChronosNode[]>();
  for (const node of locatable) {
    const p = node.spatial.primary!;
    const cellLat = Math.floor(p.lat / CLUSTER_RADIUS_DEG);
    const cellLon = Math.floor(p.lon / CLUSTER_RADIUS_DEG);
    const key = `${cellLat}:${cellLon}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(node);
  }

  const rawClusters = Array.from(cellMap.values()).map(members => {
    const primaries = members.map(n => n.spatial.primary!);
    const centLat = primaries.reduce((s, p) => s + p.lat, 0) / primaries.length;
    const centLon = primaries.reduce((s, p) => s + p.lon, 0) / primaries.length;

    const typeCounts = new Map<NodeType, number>();
    for (const m of members) typeCounts.set(m.node_type, (typeCounts.get(m.node_type) ?? 0) + 1);
    let dominantType: NodeType = members[0]!.node_type;
    let maxCount = 0;
    for (const [t, c] of typeCounts) {
      if (c > maxCount) { maxCount = c; dominantType = t; }
    }

    return { lat: centLat, lon: centLon, count: members.length, dominant_type: dominantType, intensity: members.length, node_ids: members.map(m => m.id) };
  });

  const maxCount = Math.max(...rawClusters.map(c => c.count));
  return rawClusters.map(c => ({ ...c, intensity: maxCount > 0 ? c.count / maxCount : 0 }));
}

// ── flowPaths ─────────────────────────────────────────────────────────────────

export function flowPathsFromGraph(graph: RuntimeGraph, scope: Scope): FlowPath[] {
  const { nodes, edges } = subgraphFromGraph(graph, scope);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const paths: FlowPath[] = [];

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourcePrimary = getCoords(sourceNode);
    const targetPrimary = getCoords(targetNode);
    if (!sourcePrimary || !targetPrimary) continue;

    const pathType: 'arc' | 'polyline' =
      sourceNode.node_type === 'route' || targetNode.node_type === 'route' ? 'polyline' : 'arc';

    paths.push({
      edge,
      source_coords: [sourcePrimary.lat, sourcePrimary.lon],
      target_coords: [targetPrimary.lat, targetPrimary.lon],
      waypoints: [],
      path_type: pathType,
    });
  }

  return paths;
}

function getCoords(node: ChronosNode): SpatialPrimary | null {
  if (node.spatial.no_coordinates) return null;
  if (node.spatial.spatial_mode !== 'point') return null;
  return node.spatial.primary ?? null;
}
