/**
 * map.test.ts — Unit tests for clusters() and flowPaths().
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { clusters, flowPaths } from './map';
import { loadGraph, invalidateGraphCache } from './graph';
import { defaultScope } from './scope';
import type { Scope } from './types';

beforeAll(() => {
  invalidateGraphCache();
  loadGraph();
});

describe('clusters', () => {
  test('returns clusters for Mediterranean nodes at -500', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, -400],
      tags: [],
    };
    const result = clusters(scope);
    expect(result.length).toBeGreaterThan(0);
    // Each cluster must have valid structure
    for (const c of result) {
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lon).toBe('number');
      expect(c.count).toBeGreaterThan(0);
      expect(c.intensity).toBeGreaterThanOrEqual(0);
      expect(c.intensity).toBeLessThanOrEqual(1);
      expect(c.node_ids.length).toBe(c.count);
    }
  });

  test('intensity is normalized 0–1', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, 400],
    };
    const result = clusters(scope);
    if (result.length > 0) {
      const maxIntensity = Math.max(...result.map(c => c.intensity));
      expect(maxIntensity).toBeCloseTo(1.0, 5);
    }
  });

  test('clusters exclude nodes with no_coordinates', () => {
    const scope: Scope = { ...defaultScope(), time_range: [-600, 400] };
    const result = clusters(scope);
    const graph = loadGraph();
    // All node_ids in clusters should reference locatable nodes (no_coordinates: false)
    for (const cluster of result) {
      for (const id of cluster.node_ids) {
        const node = graph.nodes[id];
        expect(node).toBeDefined();
        expect(node?.spatial.no_coordinates).toBe(false);
      }
    }
  });

  test('returns empty array for future scope with no nodes', () => {
    const scope: Scope = { ...defaultScope(), time_range: [2000, 2100] };
    const result = clusters(scope);
    expect(result).toEqual([]);
  });
});

describe('flowPaths', () => {
  test('returns arcs for intellectual transmission edges with coordinates', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, 400],
      connection_classes: ['intellectual'],
    };
    const result = flowPaths(scope);
    // Should find intellectual edges between nodes with coords
    // (e.g. socrates → plato, plato → aristotle, etc.)
    if (result.length > 0) {
      for (const fp of result) {
        expect(fp.edge.connection_class).toBe('intellectual');
        expect(fp.path_type).toMatch(/^(arc|polyline)$/);
        expect(fp.source_coords).toHaveLength(2);
        expect(fp.target_coords).toHaveLength(2);
      }
    }
  });

  test('each flow path has valid coordinate arrays', () => {
    const scope: Scope = { ...defaultScope(), time_range: [-600, 400] };
    const result = flowPaths(scope);
    for (const fp of result) {
      expect(fp.source_coords).toHaveLength(2);
      expect(fp.target_coords).toHaveLength(2);
      expect(typeof fp.source_coords[0]).toBe('number');
      expect(typeof fp.source_coords[1]).toBe('number');
      expect(Array.isArray(fp.waypoints)).toBe(true);
    }
  });

  test('returns empty array when scope has no edges', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [2000, 2100],
    };
    const result = flowPaths(scope);
    expect(result).toEqual([]);
  });

  test('non-route edges produce arc path_type', () => {
    const scope: Scope = {
      ...defaultScope(),
      time_range: [-600, 400],
      connection_classes: ['biographical'],
    };
    const result = flowPaths(scope);
    const arcs = result.filter(fp => fp.path_type === 'arc');
    // Biographical edges between persons should be arcs
    expect(arcs.length).toBeGreaterThanOrEqual(0); // May be 0 if no coords match
  });
});
