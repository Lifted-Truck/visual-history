#!/usr/bin/env tsx
/**
 * export.ts — Generates structured exports (CSV or GeoJSON) from the compiled graph.
 * Usage: npx tsx scripts/export.ts <schema-name> [--tags tag1,tag2] [--time-range start,end]
 * Example: npx tsx scripts/export.ts persons-list --tags philosophy --time-range -600,400
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const GRAPH_PATH = path.join(ROOT, 'dist', 'graph.json');
const EXPORTS_DIR = path.join(ROOT, 'dist', 'exports');
const EXPORT_SCHEMAS_PATH = path.join(ROOT, 'data', 'schema', 'export-schemas.json');

// ── Argument parsing ────────────────────────────────────────────────────────

interface ExportArgs {
  schemaName: string;
  tags: string[];
  timeRange: [number, number] | null;
}

function parseArgs(): ExportArgs {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/export.ts <schema-name> [--tags t1,t2] [--time-range start,end]');
    process.exit(1);
  }

  const schemaName = args[0] as string;
  let tags: string[] = [];
  let timeRange: [number, number] | null = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--tags' && args[i + 1]) {
      tags = (args[i + 1] as string).split(',').map(t => t.trim()).filter(Boolean);
      i++;
    } else if (args[i] === '--time-range' && args[i + 1]) {
      const parts = (args[i + 1] as string).split(',');
      if (parts.length === 2) {
        timeRange = [parseInt(parts[0] as string, 10), parseInt(parts[1] as string, 10)];
      }
      i++;
    }
  }

  return { schemaName, tags, timeRange };
}

// ── Field resolution ────────────────────────────────────────────────────────

function resolvePath(obj: unknown, fieldPath: string): unknown {
  // Handles simple dot-notation and array index [0]
  const parts = fieldPath.split(/[.[\]]+/).filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return null;
    if (typeof cur === 'object' && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[part];
    } else if (Array.isArray(cur)) {
      const idx = parseInt(part, 10);
      cur = isNaN(idx) ? null : cur[idx];
    } else {
      return null;
    }
  }
  return cur ?? null;
}

function formatValue(val: unknown, type: string, separator = '|'): string {
  if (val === null || val === undefined) return '';
  if (type === 'string_array' && Array.isArray(val)) {
    return val.join(separator);
  }
  return String(val);
}

// ── Temporal overlap check ──────────────────────────────────────────────────

function nodeInTimeRange(node: Record<string, unknown>, timeRange: [number, number]): boolean {
  const temporal = node['temporal'] as Record<string, unknown> | undefined;
  if (!temporal) return true;

  const [scopeStart, scopeEnd] = timeRange;
  const displayMode = temporal['display_mode'] as string | undefined;

  let nodeStart: number | null = null;
  let nodeEnd: number | null = null;

  if (displayMode === 'fuzzy' || displayMode === 'range') {
    const fuzzy = temporal['fuzzy_range'] as Record<string, number> | null | undefined;
    if (fuzzy) {
      nodeStart = fuzzy['earliest'] ?? (temporal['start'] as number | null) ?? null;
      nodeEnd = fuzzy['latest'] ?? (temporal['end'] as number | null) ?? null;
    }
  }

  if (nodeStart === null) nodeStart = (temporal['start'] as number | null) ?? null;
  if (nodeEnd === null) nodeEnd = (temporal['end'] as number | null) ?? nodeStart;

  if (nodeStart === null) return true; // no temporal data — include it

  const ns = nodeStart;
  const ne = nodeEnd ?? nodeStart;
  // Overlap: node range intersects scope range
  return ns <= scopeEnd && ne >= scopeStart;
}

// ── CSV export ──────────────────────────────────────────────────────────────

interface ExportField {
  column?: string;
  property?: string;
  source: string;
  type: string;
  separator?: string;
}

interface ExportSchema {
  id: string;
  format: string;
  applies_to_types: string[];
  fields?: ExportField[];
  properties?: ExportField[];
  default_filters?: { curation_statuses?: string[]; spatial_modes?: string[] };
  geometry?: { type: string; lat_source: string; lon_source: string };
}

function generateCsv(nodes: Record<string, unknown>[], schema: ExportSchema): string {
  const fields = schema.fields ?? [];
  const header = fields.map(f => f.column ?? '').join(',');
  const rows = nodes.map(node => {
    return fields.map(f => {
      const val = resolvePath(node, f.source);
      const formatted = formatValue(val, f.type, f.separator);
      // Escape CSV: wrap in quotes if contains comma, newline, or quote
      if (formatted.includes(',') || formatted.includes('\n') || formatted.includes('"')) {
        return `"${formatted.replace(/"/g, '""')}"`;
      }
      return formatted;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

// ── GeoJSON export ──────────────────────────────────────────────────────────

function generateGeoJson(nodes: Record<string, unknown>[], schema: ExportSchema): string {
  const geomDef = schema.geometry;
  const propFields = schema.properties ?? [];

  const features = nodes
    .map(node => {
      if (!geomDef) return null;
      const lat = resolvePath(node, geomDef.lat_source);
      const lon = resolvePath(node, geomDef.lon_source);
      if (typeof lat !== 'number' || typeof lon !== 'number') return null;

      const properties: Record<string, string | number | null> = {};
      for (const f of propFields) {
        const key = f.property ?? f.column ?? f.source;
        const val = resolvePath(node, f.source);
        if (f.type === 'string_array' && Array.isArray(val)) {
          properties[key] = val.join(f.separator ?? '|');
        } else if (val === null || val === undefined) {
          properties[key] = null;
        } else if (typeof val === 'number') {
          properties[key] = val;
        } else {
          properties[key] = String(val);
        }
      }

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return JSON.stringify(
    { type: 'FeatureCollection', features },
    null,
    2
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const { schemaName, tags, timeRange } = parseArgs();

  if (!fs.existsSync(GRAPH_PATH)) {
    console.error(`Compiled graph not found at ${GRAPH_PATH}. Run compile-graph.ts first.`);
    process.exit(1);
  }

  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8')) as {
    nodes: Record<string, Record<string, unknown>>;
  };

  const exportSchemaFile = JSON.parse(fs.readFileSync(EXPORT_SCHEMAS_PATH, 'utf-8')) as {
    export_schemas: ExportSchema[];
  };

  const schema = exportSchemaFile.export_schemas.find(s => s.id === schemaName);
  if (!schema) {
    const available = exportSchemaFile.export_schemas.map(s => s.id).join(', ');
    console.error(`Unknown export schema: "${schemaName}". Available: ${available}`);
    process.exit(1);
  }

  const allowedStatuses = new Set(schema.default_filters?.curation_statuses ?? ['canonical', 'ingested']);
  const allowedSpatialModes = schema.default_filters?.spatial_modes
    ? new Set(schema.default_filters.spatial_modes)
    : null;

  const allNodes = Object.values(graph.nodes);

  // Filter nodes
  const filtered = allNodes.filter(node => {
    // Type filter
    if (!schema.applies_to_types.includes(node['node_type'] as string)) return false;
    // Curation status filter
    const status = (node['epistemic'] as Record<string, unknown> | undefined)?.['curation_status'];
    if (!allowedStatuses.has(status as string)) return false;
    // Spatial mode filter (for GIS)
    if (allowedSpatialModes) {
      const spatialMode = (node['spatial'] as Record<string, unknown> | undefined)?.['spatial_mode'];
      if (!allowedSpatialModes.has(spatialMode as string)) return false;
      // Also require coordinates
      const primary = (node['spatial'] as Record<string, unknown> | undefined)?.['primary'];
      if (!primary || typeof (primary as Record<string, unknown>)['lat'] !== 'number') return false;
    }
    // Tag filter
    if (tags.length > 0) {
      const nodeTags = ((node['semantic'] as Record<string, unknown> | undefined)?.['tags'] ?? []) as string[];
      if (!tags.some(t => nodeTags.includes(t))) return false;
    }
    // Time range filter
    if (timeRange) {
      if (!nodeInTimeRange(node, timeRange)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    console.warn(`No nodes matched the filter criteria for schema "${schemaName}".`);
  }

  // Generate output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  let outputPath: string;
  let content: string;

  if (schema.format === 'csv') {
    outputPath = path.join(EXPORTS_DIR, `${schemaName}-${timestamp}.csv`);
    content = generateCsv(filtered, schema);
  } else if (schema.format === 'geojson') {
    outputPath = path.join(EXPORTS_DIR, `${schemaName}-${timestamp}.geojson`);
    content = generateGeoJson(filtered, schema);
  } else {
    console.error(`Unsupported format: ${schema.format}`);
    process.exit(1);
  }

  fs.writeFileSync(outputPath, content);
  console.log(`Exported ${filtered.length} records to ${path.relative(ROOT, outputPath)}`);
}

main();
