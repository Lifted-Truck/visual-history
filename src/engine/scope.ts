/**
 * scope.ts — Scope object definition, defaults, serialization, and merge utilities.
 */
import * as fs from 'fs';
import * as path from 'path';
import { type Scope, ScopeSchema, NodeTypeEnum, ConnectionClassEnum, CurationStatusEnum } from './types';

// ── Config loading ────────────────────────────────────────────────────────────

interface ChronosConfig {
  default_scope: {
    time_range: [number, number];
    tags: string[];
    regions: string[];
    node_types: string[];
    connection_classes: string[];
    curation_statuses: string[];
    depth: number;
  };
}

let _cachedConfig: ChronosConfig | null = null;

function loadConfig(): ChronosConfig {
  if (_cachedConfig) return _cachedConfig;
  const configPath = path.resolve(process.cwd(), 'chronos.config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  _cachedConfig = JSON.parse(raw) as ChronosConfig;
  return _cachedConfig;
}

// ── defaultScope ─────────────────────────────────────────────────────────────

/**
 * Returns the default scope as defined in chronos.config.json.
 */
export function defaultScope(): Scope {
  const config = loadConfig();
  const ds = config.default_scope;
  return ScopeSchema.parse({
    time_range: ds.time_range,
    tags: ds.tags,
    regions: ds.regions,
    node_types: ds.node_types.filter(t => NodeTypeEnum.options.includes(t as never)),
    connection_classes: ds.connection_classes.filter(c => ConnectionClassEnum.options.includes(c as never)),
    curation_statuses: ds.curation_statuses.filter(s => CurationStatusEnum.options.includes(s as never)),
    depth: ds.depth,
  });
}

// ── serializeScope / deserializeScope ────────────────────────────────────────

/**
 * Serializes a scope to a compact, URL-safe string (base64-encoded JSON).
 * Used for story state serialization and URL params.
 */
export function serializeScope(scope: Scope): string {
  const json = JSON.stringify(scope);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Deserializes a scope from its compact string form.
 * Throws if the string is invalid or the resulting scope fails validation.
 */
export function deserializeScope(str: string): Scope {
  let json: string;
  try {
    json = Buffer.from(str, 'base64url').toString('utf-8');
  } catch {
    throw new Error(`Invalid scope string: could not base64-decode`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`Invalid scope string: could not JSON-parse after decoding`);
  }
  return ScopeSchema.parse(raw);
}

// ── mergeScopes ───────────────────────────────────────────────────────────────

/**
 * Returns the union of two scopes.
 * - time_range: expanded to cover both ranges
 * - arrays (tags, regions, node_types, etc.): union of both
 * - depth: max of both
 */
export function mergeScopes(a: Scope, b: Scope): Scope {
  return {
    time_range: [
      Math.min(a.time_range[0], b.time_range[0]),
      Math.max(a.time_range[1], b.time_range[1]),
    ],
    tags: Array.from(new Set([...a.tags, ...b.tags])),
    regions: Array.from(new Set([...a.regions, ...b.regions])),
    node_types: Array.from(new Set([...a.node_types, ...b.node_types])),
    connection_classes: Array.from(new Set([...a.connection_classes, ...b.connection_classes])),
    curation_statuses: Array.from(new Set([...a.curation_statuses, ...b.curation_statuses])),
    depth: Math.max(a.depth, b.depth),
  };
}
