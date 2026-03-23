/**
 * map.ts — Geographic cluster computation and flow path extraction.
 */
import {
  type ChronosNode,
  type Scope,
  type MapCluster,
  type FlowPath,
  type NodeType,
  type SpatialPrimary,
} from './types';
import { subgraph } from './graph';

// ── Cluster algorithm ─────────────────────────────────────────────────────────

/**
 * Groups nodes into geographic clusters using a simple grid-cell approach.
 * Nodes within `CLUSTER_RADIUS_DEG` degrees lat/lon of each other are grouped.
 *
 * Each cluster has:
 * - centroid (mean lat/lon of members)
 * - count
 * - dominant_type (most frequent node_type)
 * - intensity (0–1, based on count relative to max cluster size in scope)
 * - node_ids
 *
 * Only nodes with spatial coordinates (no_coordinates === false, spatial_mode === 'point')
 * are included.
 */
const CLUSTER_RADIUS_DEG = 3.0; // ~300km at mid-latitudes

export function clusters(scope: Scope): MapCluster[] {
  const { nodes } = subgraph(scope);

  // Filter to locatable point nodes
  const locatable = nodes.filter(
    n => !n.spatial.no_coordinates && n.spatial.spatial_mode === 'point' && n.spatial.primary != null,
  );

  if (locatable.length === 0) return [];

  // Grid-cell clustering: quantize lat/lon to cluster_radius cells
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

    // Dominant type
    const typeCounts = new Map<NodeType, number>();
    for (const m of members) {
      typeCounts.set(m.node_type, (typeCounts.get(m.node_type) ?? 0) + 1);
    }
    let dominantType: NodeType = members[0]!.node_type;
    let maxCount = 0;
    for (const [t, c] of typeCounts) {
      if (c > maxCount) { maxCount = c; dominantType = t; }
    }

    return {
      lat: centLat,
      lon: centLon,
      count: members.length,
      dominant_type: dominantType,
      intensity: members.length, // raw count; normalized below
      node_ids: members.map(m => m.id),
    };
  });

  // Normalize intensity 0–1
  const maxCount = Math.max(...rawClusters.map(c => c.count));
  return rawClusters.map(c => ({
    ...c,
    intensity: maxCount > 0 ? c.count / maxCount : 0,
  }));
}

// ── flowPaths ──────────────────────────────────────────────────────────────────

/**
 * Extracts flow paths for all edges in the scope where both source and target
 * have spatial coordinates.
 *
 * - Route node edges → polyline (using the route node's active_regions as waypoints; simplified here)
 * - All other edge classes → direct arc
 *
 * Only edges with connection_class in scope.connection_classes are included.
 */
export function flowPaths(scope: Scope): FlowPath[] {
  const { nodes, edges } = subgraph(scope);

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

// ── helpers ───────────────────────────────────────────────────────────────────

function getCoords(node: ChronosNode): SpatialPrimary | null {
  if (node.spatial.no_coordinates) return null;
  if (node.spatial.spatial_mode !== 'point') return null;
  return node.spatial.primary ?? null;
}
