#!/usr/bin/env tsx
/**
 * validate.ts — Validates a Chronos batch JSON file against node and edge schemas.
 * Usage: npx tsx scripts/validate.ts <path-to-batch.json>
 * Exit 0 if valid, exit 1 if any errors.
 */
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(__dirname, '..');

function loadSchema(name: string): object {
  const p = path.join(ROOT, 'data', 'schema', name);
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as object;
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/validate.ts <path-to-batch.json>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let batch: unknown;
  try {
    batch = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
  } catch (e) {
    console.error(`JSON parse error: ${(e as Error).message}`);
    process.exit(1);
  }

  if (typeof batch !== 'object' || batch === null) {
    console.error('Batch file must be a JSON object.');
    process.exit(1);
  }

  const batchObj = batch as Record<string, unknown>;
  const nodes = Array.isArray(batchObj['nodes']) ? batchObj['nodes'] : [];
  const edges = Array.isArray(batchObj['edges']) ? batchObj['edges'] : [];

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const nodeSchema = loadSchema('node.schema.json');
  const edgeSchema = loadSchema('edge.schema.json');

  const validateNode = ajv.compile(nodeSchema);
  const validateEdge = ajv.compile(edgeSchema);

  let nodeErrors = 0;
  let edgeErrors = 0;

  for (const node of nodes) {
    const valid = validateNode(node);
    if (!valid) {
      const nodeId = (typeof node === 'object' && node !== null && 'id' in node)
        ? String((node as Record<string, unknown>)['id'])
        : '(unknown)';
      for (const err of (validateNode.errors ?? [])) {
        console.error(`NODE ${nodeId} — ${err.instancePath || '/'}: ${err.message ?? ''}`);
      }
      nodeErrors++;
    }
  }

  for (const edge of edges) {
    const valid = validateEdge(edge);
    if (!valid) {
      const edgeId = (typeof edge === 'object' && edge !== null && 'id' in edge)
        ? String((edge as Record<string, unknown>)['id'])
        : '(unknown)';
      for (const err of (validateEdge.errors ?? [])) {
        console.error(`EDGE ${edgeId} — ${err.instancePath || '/'}: ${err.message ?? ''}`);
      }
      edgeErrors++;
    }
  }

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const validNodes = nodeCount - nodeErrors;
  const validEdges = edgeCount - edgeErrors;

  if (nodeErrors === 0 && edgeErrors === 0) {
    console.log(`✓ ${nodeCount} nodes valid, ${edgeCount} edges valid`);
    process.exit(0);
  } else {
    console.error(`\n✗ ${nodeErrors}/${nodeCount} nodes invalid, ${edgeErrors}/${edgeCount} edges invalid`);
    console.log(`  Valid: ${validNodes} nodes, ${validEdges} edges`);
    process.exit(1);
  }
}

main();
