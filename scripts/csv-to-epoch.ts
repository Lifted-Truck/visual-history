#!/usr/bin/env tsx
/**
 * csv-to-epoch.ts — Convert a flat CSV file to a Chronos epoch JSON batch.
 *
 * Usage:
 *   npx tsx scripts/csv-to-epoch.ts <nodes.csv> [edges.csv] --out <output.json>
 *   npx tsx scripts/csv-to-epoch.ts combined.csv --out output.json
 *
 * The CSV can contain nodes, edges, or both (use the `type` column = "node"/"edge").
 * If two files are given, the first is treated as nodes-only, the second as edges-only.
 *
 * After this script runs, pipe into the staging workflow:
 *   npx tsx scripts/stage-epoch.ts <output.json>
 *   npx tsx scripts/compile-graph.ts
 *
 * ── Node columns ─────────────────────────────────────────────────────────────
 *   type              "node" (optional if file contains only nodes)
 *   id                leave blank to auto-generate from label + node_type
 *   label             *required*
 *   node_type         person | event | period | place | work | concept |
 *                     institution | technology | route | phenomenon | dataset
 *   start_year        integer (negative = BCE)
 *   end_year          integer; blank = same as start_year
 *   precision         exact | year | decade | century | ordinal  (default: year)
 *   confidence        0–1 float  (default: 0.8)
 *   display_mode      exact | fuzzy | range | ordinal  (default: exact)
 *   lat               decimal degrees
 *   lon               decimal degrees
 *   spatial_precision exact | city | region | country | continent  (default: city)
 *   place_label       human-readable place name  (e.g. "Athens")
 *   modern_equivalent modern name  (e.g. "Athens, Greece")
 *   description_short *required*
 *   description_med   medium description paragraph
 *   tags              comma-separated list
 *   curation_status   canonical | ingested | provisional | inferred |
 *                     deprecated | contested | stub  (default: ingested)
 *   confidence_overall 0–1 float  (default: 0.8)
 *   source_quality    scholarly_consensus | primary_source | scholarly_debate |
 *                     popular_synthesis | ai_inference | unverified  (default: scholarly_consensus)
 *   epoch             epoch name/ID  *required*
 *   source_url        URL for the primary source
 *   source_label      human label for the source
 *   start_date        sub-year start date: YYYY-MM-DD or YYYY-MM-DDTHH:MM (negative year = BCE)
 *                     examples:  -490-09-12   1453-05-29   1969-07-20T20:17   -44-03-15T10:00
 *   end_date          sub-year end date (same format); only needed when end precision < year
 *
 * ── Edge columns ─────────────────────────────────────────────────────────────
 *   type              "edge" (optional if file contains only edges)
 *   id                leave blank to auto-generate
 *   source            source node ID  *required*
 *   target            target node ID  *required*
 *   connection_class  causal | intellectual | biographical | spatial |
 *                     temporal | material | analogical | ecological
 *   direction         source_to_target | target_to_source | bidirectional | undirected
 *   strength          0–1 float  (default: 0.7)
 *   description_short *required*
 *   description_det   detailed description
 *   curation_status   (same as node, default: ingested)
 *   confidence        0–1 float  (default: 0.8)
 *   source_quality    (same as node)
 *   epoch             epoch name/ID  *required*
 *   approx_year       integer; when this connection occurred
 *   temporal_notes    free text context
 *   source_url        URL
 *   source_label      label
 */
import * as fs from 'fs';
import * as path from 'path';

// ── CSV parser ────────────────────────────────────────────────────────────────
// Simple RFC 4180-compatible parser. Does not support multi-line quoted fields.

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue; // skip blanks and comment rows
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function strVal(row: Record<string, string>, key: string, fallback = ''): string {
  return (row[key] ?? '').trim() || fallback;
}

function numVal(row: Record<string, string>, key: string, fallback: number): number {
  const v = (row[key] ?? '').trim();
  if (!v) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function intVal(row: Record<string, string>, key: string): number | undefined {
  const v = (row[key] ?? '').trim();
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

// ── Date parser ───────────────────────────────────────────────────────────────
// Parses strings like: "-490-09-12", "1453-05-29", "1969-07-20T20:17", "-44-03-15T10:00"
// Returns a FullDate-compatible object or null if blank/unparseable.

interface FullDateLike {
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  timezone?: string;
}

function parseDate(raw: string): FullDateLike | null {
  const s = raw.trim();
  if (!s) return null;
  // Regex: optional leading minus, then 1+ digits for year,
  // optional -MM, optional -DD, optional THH:MM
  const m = s.match(/^(-?\d+)(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/);
  if (!m) return null;
  const fd: FullDateLike = { year: parseInt(m[1], 10) };
  if (m[2]) fd.month = parseInt(m[2], 10);
  if (m[3]) fd.day = parseInt(m[3], 10);
  if (m[4]) fd.hour = parseInt(m[4], 10);
  if (m[5]) fd.minute = parseInt(m[5], 10);
  return fd;
}

// ── Node builder ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNode(row: Record<string, string>, lineNum: number, errors: string[]): any | null {
  const label = strVal(row, 'label');
  const descShort = strVal(row, 'description_short');
  const epoch = strVal(row, 'epoch');

  if (!label)     { errors.push(`Row ${lineNum}: missing 'label'`); return null; }
  if (!descShort) { errors.push(`Row ${lineNum}: missing 'description_short'`); return null; }
  if (!epoch)     { errors.push(`Row ${lineNum}: missing 'epoch'`); return null; }

  const nodeType = strVal(row, 'node_type', 'person');
  const id = strVal(row, 'id') || `${nodeType}-${slugify(label)}`;
  const precision = strVal(row, 'precision', 'year');
  const displayMode = strVal(row, 'display_mode', precision === 'ordinal' ? 'ordinal' : 'exact');
  const startYear = intVal(row, 'start_year');
  const endYear = intVal(row, 'end_year');

  const temporal: Record<string, unknown> = {
    precision,
    confidence: numVal(row, 'confidence', 0.8),
    display_mode: displayMode,
  };
  if (startYear !== undefined) temporal.start = startYear;
  if (endYear !== undefined) temporal.end = endYear;

  const fullDate = parseDate(strVal(row, 'start_date'));
  if (fullDate) temporal.full_date = fullDate;
  const fullDateEnd = parseDate(strVal(row, 'end_date'));
  if (fullDateEnd) temporal.full_date_end = fullDateEnd;

  const latRaw = (row['lat'] ?? '').trim();
  const lonRaw = (row['lon'] ?? '').trim();
  const hasCoords = latRaw !== '' && lonRaw !== '';

  let spatial: Record<string, unknown>;
  if (hasCoords) {
    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);
    const spatialPrimary: Record<string, unknown> = {
      lat, lon,
      precision: strVal(row, 'spatial_precision', 'city'),
      confidence: 0.8,
    };
    const placeLabel = strVal(row, 'place_label');
    const modernEquiv = strVal(row, 'modern_equivalent');
    if (placeLabel) spatialPrimary.place_label = placeLabel;
    if (modernEquiv) spatialPrimary.modern_equivalent = modernEquiv;
    spatial = { spatial_mode: 'point', no_coordinates: false, primary: spatialPrimary };
  } else {
    spatial = { spatial_mode: 'diffuse', no_coordinates: true };
  }

  const tagsRaw = strVal(row, 'tags');
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const description: Record<string, string> = { short: descShort };
  const descMed = strVal(row, 'description_med');
  if (descMed) description.medium = descMed;

  const sources = [];
  const srcUrl = strVal(row, 'source_url');
  const srcLabel = strVal(row, 'source_label');
  if (srcUrl || srcLabel) {
    sources.push({ label: srcLabel || srcUrl, url: srcUrl || '', type: 'url' });
  }

  const now = new Date().toISOString();
  return {
    id,
    schema_version: '1.0',
    node_type: nodeType,
    label,
    temporal,
    spatial,
    semantic: { tags, keys: [], description },
    epistemic: {
      curation_status: strVal(row, 'curation_status', 'ingested'),
      confidence_overall: numVal(row, 'confidence_overall', 0.8),
      source_quality: strVal(row, 'source_quality', 'scholarly_consensus'),
      epoch,
    },
    sources,
    created_at: now,
    updated_at: now,
  };
}

// ── Edge builder ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEdge(row: Record<string, string>, lineNum: number, errors: string[]): any | null {
  const source = strVal(row, 'source');
  const target = strVal(row, 'target');
  const descShort = strVal(row, 'description_short');
  const epoch = strVal(row, 'epoch');

  if (!source)    { errors.push(`Row ${lineNum}: missing 'source'`); return null; }
  if (!target)    { errors.push(`Row ${lineNum}: missing 'target'`); return null; }
  if (!descShort) { errors.push(`Row ${lineNum}: missing 'description_short'`); return null; }
  if (!epoch)     { errors.push(`Row ${lineNum}: missing 'epoch'`); return null; }

  const connClass = strVal(row, 'connection_class', 'intellectual');
  const id = strVal(row, 'id') || `edge-${slugify(source)}-${slugify(connClass)}-${slugify(target)}`;

  const description: Record<string, string> = { short: descShort };
  const descDet = strVal(row, 'description_det');
  if (descDet) description.detailed = descDet;

  const sources = [];
  const srcUrl = strVal(row, 'source_url');
  const srcLabel = strVal(row, 'source_label');
  if (srcUrl || srcLabel) {
    sources.push({ label: srcLabel || srcUrl, url: srcUrl || '', type: 'url' });
  }

  const approxYear = intVal(row, 'approx_year');
  const temporalNotes = strVal(row, 'temporal_notes');
  let temporal_context: Record<string, unknown> | undefined;
  if (approxYear !== undefined || temporalNotes) {
    temporal_context = {};
    if (approxYear !== undefined) temporal_context.approximate_year = approxYear;
    if (temporalNotes) temporal_context.notes = temporalNotes;
  }

  const now = new Date().toISOString();
  const edge: Record<string, unknown> = {
    id,
    schema_version: '1.0',
    source,
    target,
    connection_class: connClass,
    direction: strVal(row, 'direction', 'source_to_target'),
    strength: numVal(row, 'strength', 0.7),
    description,
    epistemic: {
      curation_status: strVal(row, 'curation_status', 'ingested'),
      confidence: numVal(row, 'confidence', 0.8),
      source_quality: strVal(row, 'source_quality', 'scholarly_consensus'),
      epoch,
    },
    sources,
    created_at: now,
    updated_at: now,
  };
  if (temporal_context) edge.temporal_context = temporal_context;
  return edge;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function processRows(
  rows: Record<string, string>[],
  defaultType: 'node' | 'edge' | 'auto',
  errors: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edges: any[] = [];

  rows.forEach((row, i) => {
    const lineNum = i + 2; // 1-indexed, +1 for header
    const rawType = (row['type'] ?? '').trim().toLowerCase();
    const type = rawType || (defaultType === 'auto' ? (row['source'] ? 'edge' : 'node') : defaultType);

    if (type === 'node') {
      const node = buildNode(row, lineNum, errors);
      if (node) nodes.push(node);
    } else if (type === 'edge') {
      const edge = buildEdge(row, lineNum, errors);
      if (edge) edges.push(edge);
    } else {
      errors.push(`Row ${lineNum}: unknown type '${rawType}' — expected 'node' or 'edge'`);
    }
  });

  return { nodes, edges };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/csv-to-epoch.ts <file.csv> [edges.csv] [--out output.json]');
    console.error('       npx tsx scripts/csv-to-epoch.ts --help  (print column reference)');
    process.exit(1);
  }

  if (args[0] === '--help') {
    const header = fs.readFileSync(__filename, 'utf-8');
    const docLines = header.split('\n').slice(1, 60).map(l => l.replace(/^ \* ?/, ''));
    console.log(docLines.join('\n'));
    process.exit(0);
  }

  // Parse --out argument
  let outFile: string | undefined;
  const outIdx = args.indexOf('--out');
  const inputFiles: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') { outFile = args[i + 1]; i++; }
    else inputFiles.push(args[i]);
  }

  const errors: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allNodes: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allEdges: any[] = [];

  if (inputFiles.length === 1) {
    // Single file: auto-detect type from `type` column or by presence of `source` column
    const text = fs.readFileSync(inputFiles[0], 'utf-8');
    const rows = parseCSV(text);
    const { nodes, edges } = processRows(rows, 'auto', errors);
    allNodes = nodes;
    allEdges = edges;
  } else if (inputFiles.length === 2) {
    // Two files: first = nodes, second = edges
    const nodeRows = parseCSV(fs.readFileSync(inputFiles[0], 'utf-8'));
    const edgeRows = parseCSV(fs.readFileSync(inputFiles[1], 'utf-8'));
    const nr = processRows(nodeRows, 'node', errors);
    const er = processRows(edgeRows, 'edge', errors);
    allNodes = nr.nodes;
    allEdges = er.edges;
  } else {
    console.error('Provide 1 or 2 CSV file paths.');
    process.exit(1);
  }

  if (errors.length > 0) {
    console.error('\nValidation errors:');
    errors.forEach(e => console.error('  ✗', e));
    if (allNodes.length === 0 && allEdges.length === 0) process.exit(1);
    console.error('\nPartial output will be written (rows with errors skipped).\n');
  }

  const output = JSON.stringify({ nodes: allNodes, edges: allEdges }, null, 2);

  if (outFile) {
    const dir = path.dirname(path.resolve(outFile));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outFile, output);
    console.log(`✓ Wrote ${allNodes.length} nodes, ${allEdges.length} edges → ${outFile}`);
    console.log(`  Next: npx tsx scripts/stage-epoch.ts ${outFile}`);
  } else {
    process.stdout.write(output);
  }
}

main();
