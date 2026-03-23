/**
 * graph.ts — Core query module for the Chronos runtime graph.
 * All functions are pure (read-only against the loaded graph).
 */
import * as fs from 'fs';
import * as nodePath from 'path';
import {
  type ChronosNode,
  type ChronosEdge,
  type RuntimeGraph,
  type Scope,
  type EdgeFilter,
  RuntimeGraphSchema,
} from './types';

// ── Graph loading ─────────────────────────────────────────────────────────────

let _cachedGraph: RuntimeGraph | null = null;

/**
 * Loads and caches the compiled runtime graph from dist/graph.json.
 * Validates with Zod on first load.
 */
export function loadGraph(): RuntimeGraph {
  if (_cachedGraph) return _cachedGraph;
  const graphPath = nodePath.resolve(process.cwd(), 'dist', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    throw new Error(`Compiled graph not found at ${graphPath}. Run: npx tsx scripts/compile-graph.ts`);
  }
  const raw = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as unknown;
  _cachedGraph = RuntimeGraphSchema.parse(raw);
  return _cachedGraph;
}

/** Force-reload the graph (useful in tests or after recompile). */
export function invalidateGraphCache(): void {
  _cachedGraph = null;
}

// ── Temporal helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the effective temporal range [start, end] for a node,
 * preferring fuzzy_range when display_mode is fuzzy/range.
 * Returns null if no temporal data is available.
 */
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
  const resolvedEnd = end ?? start;
  return [start, resolvedEnd];
}

/**
 * Returns true if a node's temporal range overlaps [scopeStart, scopeEnd].
 * Overlap means: node_start <= scopeEnd AND node_end >= scopeStart.
 * For ordinal nodes without resolvable ranges: included with a flag (handled by caller).
 */
function nodeOverlapsScope(node: ChronosNode, scopeStart: number, scopeEnd: number): boolean {
  const t = node.temporal;
  if (t.display_mode === 'ordinal') {
    // Ordinal nodes: include them; caller may flag as unresolved
    return true;
  }

  const range = resolveTemporalRange(node);
  if (!range) return true; // No temporal data — include by default

  return range[0] <= scopeEnd && range[1] >= scopeStart;
}

// ── getNode ───────────────────────────────────────────────────────────────────

export function getNode(id: string): ChronosNode | null {
  const graph = loadGraph();
  return graph.nodes[id] ?? null;
}

// ── subgraph ──────────────────────────────────────────────────────────────────

/**
 * Returns all nodes and edges matching the scope.
 *
 * Node inclusion rules:
 * - node_type must be in scope.node_types
 * - curation_status must be in scope.curation_statuses
 * - tags: if scope.tags is non-empty, node must share at least one tag
 * - regions: if scope.regions is non-empty, node's active_regions must include one
 * - temporal: node's effective range must overlap scope.time_range
 *
 * Edge inclusion: both source and target must be in the node result set,
 * and edge.connection_class and epistemic.curation_status must be in scope.
 */
export function subgraph(scope: Scope): { nodes: ChronosNode[]; edges: ChronosEdge[] } {
  const graph = loadGraph();
  const [scopeStart, scopeEnd] = scope.time_range;
  const nodeTypeSet = new Set(scope.node_types);
  const statusSet = new Set(scope.curation_statuses);
  const connClassSet = new Set(scope.connection_classes);
  const tagSet = scope.tags.length > 0 ? new Set(scope.tags) : null;
  const regionSet = scope.regions.length > 0 ? new Set(scope.regions) : null;

  const matchingNodes: ChronosNode[] = [];
  const matchingNodeIds = new Set<string>();

  for (const node of Object.values(graph.nodes)) {
    if (!nodeTypeSet.has(node.node_type)) continue;
    if (!statusSet.has(node.epistemic.curation_status)) continue;

    // Tag filter
    if (tagSet) {
      const hasTag = node.semantic.tags.some(t => tagSet.has(t));
      if (!hasTag) continue;
    }

    // Region filter
    if (regionSet) {
      const regions = node.spatial.active_regions ?? [];
      const hasRegion = regions.some(r => regionSet.has(r.region_id));
      if (!hasRegion) continue;
    }

    // Temporal filter
    if (!nodeOverlapsScope(node, scopeStart, scopeEnd)) continue;

    matchingNodes.push(node);
    matchingNodeIds.add(node.id);
  }

  // Filter edges: both endpoints in result, class and status match scope
  const matchingEdges: ChronosEdge[] = graph.edges_flat.filter(edge => {
    if (!matchingNodeIds.has(edge.source)) return false;
    if (!matchingNodeIds.has(edge.target)) return false;
    if (!connClassSet.has(edge.connection_class)) return false;
    if (!statusSet.has(edge.epistemic.curation_status)) return false;
    return true;
  });

  return { nodes: matchingNodes, edges: matchingEdges };
}

// ── neighbors ─────────────────────────────────────────────────────────────────

/**
 * Returns the ego network around a node up to `depth` hops.
 * Uses BFS over the adjacency list. Respects edge direction.
 * Optional edgeFilters restrict which edges are traversed.
 */
export function neighbors(
  id: string,
  depth: number,
  edgeFilters?: EdgeFilter[],
): { nodes: ChronosNode[]; edges: ChronosEdge[] } {
  const graph = loadGraph();
  if (!graph.nodes[id]) {
    return { nodes: [], edges: [] };
  }

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

      // Apply edge filters
      if (edgeFilters && edgeFilters.length > 0) {
        const passes = edgeFilters.every(f => {
          if (f.connection_classes && !f.connection_classes.includes(edge.connection_class)) return false;
          if (f.curation_statuses && !f.curation_statuses.includes(edge.epistemic.curation_status)) return false;
          if (f.min_strength !== undefined && edge.strength < f.min_strength) return false;
          return true;
        });
        if (!passes) continue;
      }

      visitedEdges.add(edgeId);

      // Determine the neighbor on the other end
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

// ── path ──────────────────────────────────────────────────────────────────────

/**
 * Finds the shortest path between two nodes using BFS over the edge adjacency list.
 * Respects edge direction: source_to_target edges are only traversed forward;
 * target_to_source edges are only traversed in reverse;
 * bidirectional and undirected edges are traversed in both directions.
 */
export function path(
  sourceId: string,
  targetId: string,
): { nodes: ChronosNode[]; edges: ChronosEdge[]; hops: number } | null {
  const graph = loadGraph();
  if (!graph.nodes[sourceId] || !graph.nodes[targetId]) return null;
  if (sourceId === targetId) {
    const node = graph.nodes[sourceId]!;
    return { nodes: [node], edges: [], hops: 0 };
  }

  // BFS: track predecessor edge for path reconstruction
  const prev = new Map<string, { from: string; edgeId: string }>();
  const visited = new Set<string>([sourceId]);
  const queue: string[] = [sourceId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edgeIds = graph.adjacency[current] ?? [];

    for (const edgeId of edgeIds) {
      const edge = graph.edges[edgeId];
      if (!edge) continue;

      // Determine which direction is valid from `current`
      let neighbor: string | null = null;
      const dir = edge.direction;

      if (edge.source === current) {
        // Forward direction
        if (dir === 'source_to_target' || dir === 'bidirectional' || dir === 'undirected') {
          neighbor = edge.target;
        }
      } else if (edge.target === current) {
        // Reverse direction
        if (dir === 'target_to_source' || dir === 'bidirectional' || dir === 'undirected') {
          neighbor = edge.source;
        }
      }

      if (!neighbor || visited.has(neighbor)) continue;

      visited.add(neighbor);
      prev.set(neighbor, { from: current, edgeId });
      queue.push(neighbor);

      if (neighbor === targetId) {
        // Reconstruct path
        const pathEdgeIds: string[] = [];
        const pathNodeIds: string[] = [neighbor];
        let cur = neighbor;

        while (cur !== sourceId) {
          const p = prev.get(cur)!;
          pathEdgeIds.unshift(p.edgeId);
          pathNodeIds.unshift(p.from);
          cur = p.from;
        }

        const pathNodes = pathNodeIds
          .map(nid => graph.nodes[nid])
          .filter((n): n is ChronosNode => n !== undefined);
        const pathEdges = pathEdgeIds
          .map(eid => graph.edges[eid])
          .filter((e): e is ChronosEdge => e !== undefined);

        return { nodes: pathNodes, edges: pathEdges, hops: pathEdges.length };
      }
    }
  }

  return null;
}

// ── contemporaries ────────────────────────────────────────────────────────────

/**
 * Returns all nodes whose temporal range overlaps with the given node's range,
 * expanded by windowYears in each direction.
 *
 * Fuzzy-temporal ranges are used when available. Ordinal nodes are included
 * if their ordinal constraints cannot be resolved (flagged separately, not returned).
 */
export function contemporaries(id: string, windowYears: number): ChronosNode[] {
  const graph = loadGraph();
  const center = graph.nodes[id];
  if (!center) return [];

  const centerRange = resolveTemporalRange(center);
  if (!centerRange) return [];

  const windowStart = centerRange[0] - windowYears;
  const windowEnd = centerRange[1] + windowYears;

  return Object.values(graph.nodes).filter(node => {
    if (node.id === id) return false;
    if (node.temporal.display_mode === 'ordinal') return false;

    const range = resolveTemporalRange(node);
    if (!range) return false;

    // Overlap: node range intersects expanded window
    return range[0] <= windowEnd && range[1] >= windowStart;
  });
}

// ── keyOverlap ────────────────────────────────────────────────────────────────

/**
 * Returns all keys shared across a set of nodes, grouped by key.
 * Only keys present in 2+ nodes are returned.
 */
export function keyOverlap(ids: string[]): { key: string; nodes: string[] }[] {
  const graph = loadGraph();

  const keyToNodes = new Map<string, string[]>();

  for (const id of ids) {
    const node = graph.nodes[id];
    if (!node) continue;
    for (const key of node.semantic.keys) {
      if (!keyToNodes.has(key)) keyToNodes.set(key, []);
      keyToNodes.get(key)!.push(id);
    }
  }

  return Array.from(keyToNodes.entries())
    .filter(([, nodes]) => nodes.length >= 2)
    .map(([key, nodes]) => ({ key, nodes }))
    .sort((a, b) => b.nodes.length - a.nodes.length);
}
