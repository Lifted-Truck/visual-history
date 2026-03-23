#!/usr/bin/env tsx
/**
 * compile-graph.ts — Reads all epoch JSON files, merges canonical+ingested
 * nodes and edges, and writes dist/graph.json optimized for query access.
 * Usage: npx tsx scripts/compile-graph.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EPOCHS_DIR = path.join(ROOT, 'data', 'epochs');
const STAGING_DIR = path.join(ROOT, 'data', 'staging');
const DIST_DIR = path.join(ROOT, 'dist');
const OUTPUT = path.join(DIST_DIR, 'graph.json');

const INCLUDED_STATUSES = new Set(['canonical', 'ingested']);

interface NodeLike {
  id: string;
  epistemic?: { curation_status?: string };
  [key: string]: unknown;
}

interface EdgeLike {
  id: string;
  source: string;
  target: string;
  epistemic?: { curation_status?: string };
  [key: string]: unknown;
}

interface EpochFile {
  nodes?: NodeLike[];
  edges?: EdgeLike[];
}

function readJsonFiles(dir: string): EpochFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as EpochFile;
      } catch (e) {
        console.warn(`Skipping ${f}: ${(e as Error).message}`);
        return null;
      }
    })
    .filter((f): f is EpochFile => f !== null);
}

function main(): void {
  const allFiles = [
    ...readJsonFiles(EPOCHS_DIR),
    ...readJsonFiles(STAGING_DIR),
  ];

  // Deduplicate: last-write wins for nodes/edges with same id
  const nodeMap = new Map<string, NodeLike>();
  const edgeMap = new Map<string, EdgeLike>();

  for (const file of allFiles) {
    for (const node of (file.nodes ?? [])) {
      const status = node.epistemic?.curation_status ?? '';
      if (INCLUDED_STATUSES.has(status)) {
        nodeMap.set(node.id, node);
      }
    }
    for (const edge of (file.edges ?? [])) {
      const status = edge.epistemic?.curation_status ?? '';
      if (INCLUDED_STATUSES.has(status)) {
        edgeMap.set(edge.id, edge);
      }
    }
  }

  // Build adjacency list: nodeId → array of edge IDs
  const adjacency = new Map<string, string[]>();
  for (const node of nodeMap.values()) {
    adjacency.set(node.id, []);
  }

  for (const edge of edgeMap.values()) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge.id);

    // Add reverse direction entry so undirected/bidirectional edges are traversable both ways
    const dir = (edge as Record<string, unknown>)['direction'];
    if (dir === 'bidirectional' || dir === 'undirected') {
      adjacency.get(edge.target)!.push(edge.id);
    }
  }

  const nodesObj: Record<string, NodeLike> = {};
  for (const [id, node] of nodeMap) nodesObj[id] = node;

  const edgesObj: Record<string, EdgeLike> = {};
  for (const [id, edge] of edgeMap) edgesObj[id] = edge;

  const adjacencyObj: Record<string, string[]> = {};
  for (const [id, edgeIds] of adjacency) adjacencyObj[id] = edgeIds;

  const graph = {
    compiled_at: new Date().toISOString(),
    node_count: nodeMap.size,
    edge_count: edgeMap.size,
    nodes: nodesObj,
    edges: edgesObj,
    adjacency: adjacencyObj,
    edges_flat: Array.from(edgeMap.values()),
  };

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(graph, null, 2));

  console.log(`Compiled ${nodeMap.size} nodes, ${edgeMap.size} edges to ${path.relative(ROOT, OUTPUT)}`);
}

main();
