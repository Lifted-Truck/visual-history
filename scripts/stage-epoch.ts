#!/usr/bin/env tsx
/**
 * stage-epoch.ts — Validates a batch JSON file and copies it to data/staging/
 * with an assigned epoch ID based on the batch's epoch field.
 * Usage: npx tsx scripts/stage-epoch.ts <path-to-batch.json>
 */
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT, 'data', 'staging');

function loadSchema(name: string): object {
  const p = path.join(ROOT, 'data', 'schema', name);
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as object;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/stage-epoch.ts <path-to-batch.json>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(absPath, 'utf-8');
  } catch (e) {
    console.error(`Read error: ${(e as Error).message}`);
    process.exit(1);
  }

  let batch: Record<string, unknown>;
  try {
    batch = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.error(`JSON parse error: ${(e as Error).message}`);
    process.exit(1);
  }

  // Determine epoch ID
  const epochField = typeof batch['epoch'] === 'string' ? batch['epoch'] : '';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let epochId: string;
  if (epochField && /^epoch-/.test(epochField)) {
    epochId = epochField;
  } else {
    const slug = epochField ? slugify(epochField) : slugify(path.basename(filePath, '.json'));
    epochId = `epoch-${today}-${slug}`;
  }

  // Validate
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const nodeSchema = loadSchema('node.schema.json');
  const edgeSchema = loadSchema('edge.schema.json');
  const validateNode = ajv.compile(nodeSchema);
  const validateEdge = ajv.compile(edgeSchema);

  const nodes = Array.isArray(batch['nodes']) ? batch['nodes'] : [];
  const edges = Array.isArray(batch['edges']) ? batch['edges'] : [];
  let errorCount = 0;

  for (const node of nodes) {
    if (!validateNode(node)) {
      const id = (node as Record<string, unknown>)['id'] ?? '(unknown)';
      for (const err of validateNode.errors ?? []) {
        console.error(`NODE ${String(id)} — ${err.instancePath}: ${err.message ?? ''}`);
      }
      errorCount++;
    }
  }
  for (const edge of edges) {
    if (!validateEdge(edge)) {
      const id = (edge as Record<string, unknown>)['id'] ?? '(unknown)';
      for (const err of validateEdge.errors ?? []) {
        console.error(`EDGE ${String(id)} — ${err.instancePath}: ${err.message ?? ''}`);
      }
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.error(`\n✗ Validation failed (${errorCount} invalid records). Not staged.`);
    process.exit(1);
  }

  // Write to staging
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const destFileName = `${epochId}.json`;
  const destPath = path.join(STAGING_DIR, destFileName);

  // Stamp the epoch ID into the batch
  batch['epoch'] = epochId;
  fs.writeFileSync(destPath, JSON.stringify(batch, null, 2));

  console.log(`✓ Staged as ${epochId}`);
  console.log(`  ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`  Written to: ${path.relative(ROOT, destPath)}`);
}

main();
