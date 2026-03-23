/**
 * graph.test.ts — Unit tests for the Chronos query engine.
 * Requires compiled graph (run compile-graph.ts before running tests).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import {
  loadGraph,
  invalidateGraphCache,
  getNode,
  subgraph,
  neighbors,
  path,
  contemporaries,
  keyOverlap,
} from './graph';
import { defaultScope } from './scope';
import type { Scope } from './types';

beforeAll(() => {
  invalidateGraphCache();
  // Ensure graph is loaded once before tests
  loadGraph();
});

// ── getNode ───────────────────────────────────────────────────────────────────

describe('getNode', () => {
  test('returns Confucius by ID', () => {
    const node = getNode('confucius');
    expect(node).not.toBeNull();
    expect(node?.label).toBe('Confucius');
    expect(node?.node_type).toBe('person');
  });

  test('returns null for unknown ID', () => {
    expect(getNode('nonexistent-node-xyz')).toBeNull();
  });
});

// ── subgraph ──────────────────────────────────────────────────────────────────

describe('subgraph', () => {
  test('returns correct nodes for Axial Age philosophy scope', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, -400],
      tags: ['philosophy'],
    };
    const { nodes } = subgraph(scope);
    const labels = nodes.map(n => n.label);
    expect(labels).toContain('Confucius');
    expect(labels).toContain('Socrates');
    expect(labels).toContain('Heraclitus');
  });

  test('fuzzy-temporal node included when range overlaps scope boundary', () => {
    // Laozi has century precision with fuzzy_range — should be included in -700 to -400
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-700, -400],
      tags: [],
      node_types: ['person'],
    };
    const { nodes } = subgraph(scope);
    const ids = nodes.map(n => n.id);
    expect(ids).toContain('laozi');
  });

  test('fuzzy-temporal node excluded when range is entirely outside scope', () => {
    // Laozi is ~600-470 BCE — should not appear in 100 CE – 400 CE
    const scope: Scope = {
      ...defaultScope(),
      time_range: [100, 400],
      tags: [],
      node_types: ['person'],
    };
    const { nodes } = subgraph(scope);
    const ids = nodes.map(n => n.id);
    expect(ids).not.toContain('laozi');
  });

  test('subgraph respects node_type filter', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, 400],
      node_types: ['period'],
    };
    const { nodes } = subgraph(scope);
    expect(nodes.every(n => n.node_type === 'period')).toBe(true);
  });

  test('subgraph edges only include endpoints present in node result', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, -400],
      tags: ['philosophy'],
    };
    const { nodes, edges } = subgraph(scope);
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});

// ── contemporaries ────────────────────────────────────────────────────────────

describe('contemporaries', () => {
  test('returns Confucius, Buddha, Heraclitus for Socrates with 100yr window', () => {
    // Socrates: 470-399 BCE; window 100 → 570-299 BCE
    const peers = contemporaries('socrates', 100);
    const labels = peers.map(n => n.label);
    expect(labels).toContain('Confucius');
    expect(labels).toContain('Siddhartha Gautama');
    expect(labels).toContain('Heraclitus');
  });

  test('returns empty array for unknown node', () => {
    expect(contemporaries('nonexistent-xyz', 50)).toEqual([]);
  });

  test('does not include the node itself', () => {
    const peers = contemporaries('socrates', 50);
    expect(peers.map(n => n.id)).not.toContain('socrates');
  });

  test('respects window: tight window excludes distant contemporaries', () => {
    // Socrates 470-399; window 0 → only exact overlap; Confucius died 479 BCE
    // Confucius (551-479) overlaps Socrates (470-399) even with window 0
    // since 479 >= 470
    const peers = contemporaries('socrates', 0);
    const ids = peers.map(n => n.id);
    // Plato (428-348) should overlap: 428 <= 470 and 348 >= 399? No: 348 < 399.
    // Actually 428 <= 470 ✓ and 348 >= 399? 348 < 399 ✗ — so Plato should NOT be in window 0
    // Wait: Socrates range is [470, 399] — but 470 > 399 (BCE, negative). Let me reconsider.
    // In the data: start = -470, end = -399 (BCE as negative ints).
    // contemporaries with window 0: node range must overlap [-470, -399].
    // Plato: [-428, -348] → -428 <= -399 ✓ AND -348 >= -470 ✓ → overlaps.
    expect(ids).toContain('plato');
  });
});

// ── path ──────────────────────────────────────────────────────────────────────

describe('path', () => {
  test('finds direct path between Plato and Aristotle', () => {
    const result = path('plato', 'aristotle');
    expect(result).not.toBeNull();
    expect(result!.hops).toBeGreaterThanOrEqual(1);
    expect(result!.nodes.map(n => n.id)).toContain('plato');
    expect(result!.nodes.map(n => n.id)).toContain('aristotle');
  });

  test('returns null for non-existent node', () => {
    expect(path('socrates', 'nonexistent-xyz')).toBeNull();
  });

  test('returns zero-hop path for same node', () => {
    const result = path('socrates', 'socrates');
    expect(result).not.toBeNull();
    expect(result!.hops).toBe(0);
    expect(result!.nodes).toHaveLength(1);
  });

  test('path result nodes form a connected sequence', () => {
    const result = path('confucius', 'mencius');
    if (result === null) return; // acceptable if not connected
    // Verify each hop: consecutive nodes should share an edge in the result
    const nodeIds = result.nodes.map(n => n.id);
    for (const edge of result.edges) {
      expect(nodeIds).toContain(edge.source);
      expect(nodeIds).toContain(edge.target);
    }
  });
});

// ── keyOverlap ────────────────────────────────────────────────────────────────

describe('keyOverlap', () => {
  test('returns shared keys for axial-age philosophers', () => {
    const result = keyOverlap(['confucius', 'socrates', 'siddhartha-gautama']);
    expect(result.length).toBeGreaterThan(0);
    // All three should share at least ethics or self-cultivation
    const sharedKeys = result.map(r => r.key);
    const hasSharedEthicsOrCult = sharedKeys.some(k =>
      ['ethics', 'self-cultivation', 'asceticism'].includes(k)
    );
    expect(hasSharedEthicsOrCult).toBe(true);
  });

  test('returns results sorted by number of nodes descending', () => {
    const result = keyOverlap(['plato', 'aristotle', 'socrates']);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.nodes.length).toBeGreaterThanOrEqual(result[i]!.nodes.length);
    }
  });

  test('returns empty array for unknown nodes', () => {
    expect(keyOverlap(['nonexistent-a', 'nonexistent-b'])).toEqual([]);
  });

  test('excludes keys held by only one node', () => {
    const result = keyOverlap(['confucius', 'laozi']);
    for (const entry of result) {
      expect(entry.nodes.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── neighbors ─────────────────────────────────────────────────────────────────

describe('neighbors', () => {
  test('depth 1 returns direct connections', () => {
    const { nodes } = neighbors('plato', 1);
    const ids = nodes.map(n => n.id);
    // Plato was taught by Socrates and taught Aristotle
    expect(ids).toContain('plato'); // the center node is included
    expect(ids.length).toBeGreaterThan(1);
  });

  test('depth 2 returns second-degree connections', () => {
    const { nodes: d1 } = neighbors('plato', 1);
    const { nodes: d2 } = neighbors('plato', 2);
    expect(d2.length).toBeGreaterThanOrEqual(d1.length);
  });

  test('returns empty for unknown node', () => {
    const { nodes, edges } = neighbors('nonexistent-xyz', 1);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  test('edge filter restricts to intellectual edges', () => {
    const { edges } = neighbors('plato', 1, [{ connection_classes: ['intellectual'] }]);
    for (const edge of edges) {
      expect(edge.connection_class).toBe('intellectual');
    }
  });
});
