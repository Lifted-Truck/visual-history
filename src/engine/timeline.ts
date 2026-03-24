/**
 * timeline.ts — Swimlane layout computation and fuzzy temporal positioning.
 */
import {
  type ChronosNode,
  type SwimlaneLane,
  type Scope,
  type NodeType,
  TemporalPrecisionEnum,
} from './types';
import { subgraph } from './graph';

// ── Certainty mapping ─────────────────────────────────────────────────────────

/**
 * Maps temporal precision to a base certainty value.
 * The renderer uses certainty to determine edge sharpness:
 *   1.0 = crisp lane edges
 *   0.0 = fully gradient-faded edges
 */
const PRECISION_CERTAINTY: Record<string, number> = {
  exact: 1.0,
  year: 0.95,
  decade: 0.7,
  century: 0.35,
  ordinal: 0.1,
};

// ── fuzzyPosition ──────────────────────────────────────────────────────────────

/**
 * Resolves a node's temporal display range and certainty score.
 *
 * Logic:
 * - If display_mode is 'exact' or 'year': use start/end directly; certainty from precision table
 * - If display_mode is 'fuzzy' or 'range': use fuzzy_range when available, else fall back to start/end
 *   certainty is scaled by the node's temporal.confidence and precision
 * - If display_mode is 'ordinal': use start/end if present (ordinal_constraints may not resolve here);
 *   certainty 0.1
 *
 * Returns a start year, end year (same as start for point nodes), and certainty 0–1.
 */
export function fuzzyPosition(node: ChronosNode): { start: number; end: number; certainty: number } {
  const t = node.temporal;
  const baseCertainty = PRECISION_CERTAINTY[t.precision] ?? 0.5;

  // Ordinal: return what we have with low certainty
  if (t.display_mode === 'ordinal') {
    const s = t.start ?? 0;
    const e = t.end ?? s;
    return { start: s, end: e, certainty: Math.min(baseCertainty, t.confidence) };
  }

  // Fuzzy / range: prefer fuzzy_range
  if ((t.display_mode === 'fuzzy' || t.display_mode === 'range') && t.fuzzy_range) {
    const start = t.fuzzy_range.earliest;
    const end = t.fuzzy_range.latest;
    // Certainty: combine precision table value with node's own confidence
    // A wide fuzzy range relative to the point estimate reduces certainty
    const spread = end - start;
    const nominalDuration = Math.abs((t.end ?? t.start ?? start) - (t.start ?? start)) || 1;
    const spreadPenalty = Math.max(0, 1 - spread / (nominalDuration + spread + 1));
    const certainty = baseCertainty * t.confidence * (0.5 + 0.5 * spreadPenalty);
    return { start, end, certainty: Math.max(0, Math.min(1, certainty)) };
  }

  // Exact: use start/end directly
  const start = t.start ?? 0;
  const end = t.end ?? start;
  const certainty = baseCertainty * t.confidence;
  return { start, end, certainty: Math.max(0, Math.min(1, certainty)) };
}

// ── lanesToScope ──────────────────────────────────────────────────────────────

/**
 * Computes swimlane layout data for a given scope and lane type.
 *
 * Each lane corresponds to one entity node of `laneType`. The lane includes:
 * - computed display start/end years
 * - work nodes from the graph that are linked to this entity via 'material' edges
 * - event nodes that overlap the lane's time range
 *
 * Lanes are sorted by display_start (oldest first).
 */
export function lanesToScope(scope: Scope, laneType: NodeType): SwimlaneLane[] {
  const { nodes, edges } = subgraph(scope);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Find entity nodes of the requested lane type
  const entityNodes = nodes.filter(n => n.node_type === laneType);

  // Build a map from source node id → material edge targets (work nodes)
  const workEdges = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.connection_class !== 'material') continue;
    if (!workEdges.has(edge.source)) workEdges.set(edge.source, []);
    workEdges.get(edge.source)!.push(edge.target);
  }

  // All event nodes in the subgraph
  const eventNodes = nodes.filter(n => n.node_type === 'event');

  const lanes: SwimlaneLane[] = entityNodes.map(entity => {
    const pos = fuzzyPosition(entity);

    // Collect work nodes linked from this entity
    const workTargets = workEdges.get(entity.id) ?? [];
    const works: SwimlaneLane['works'] = workTargets
      .map(wid => nodeMap.get(wid))
      .filter((n): n is ChronosNode => n !== undefined && n.node_type === 'work')
      .map(workNode => {
        const workYear = workNode.temporal.start ?? pos.start;
        return { node: workNode, year: workYear };
      })
      .sort((a, b) => a.year - b.year);

    // Find events overlapping this lane's time range
    const overlapping_events = eventNodes.filter(ev => {
      const evPos = fuzzyPosition(ev);
      return evPos.start <= pos.end && evPos.end >= pos.start;
    });

    return {
      entity,
      display_start: pos.start,
      display_end: pos.end,
      certainty: pos.certainty,
      works,
      overlapping_events,
    };
  });

  return lanes.sort((a, b) => a.display_start - b.display_start);
}
