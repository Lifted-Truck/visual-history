/**
 * types.ts — TypeScript interfaces for all Chronos schema types.
 * These mirror the JSON schemas exactly and include Zod validators for runtime validation.
 */
import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────────────

export const NodeTypeEnum = z.enum([
  'person', 'event', 'period', 'place', 'work', 'concept',
  'institution', 'technology', 'route', 'phenomenon', 'dataset',
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const ConnectionClassEnum = z.enum([
  'causal', 'intellectual', 'biographical', 'spatial',
  'temporal', 'material', 'analogical', 'ecological',
]);
export type ConnectionClass = z.infer<typeof ConnectionClassEnum>;

export const CurationStatusEnum = z.enum([
  'canonical', 'ingested', 'provisional', 'inferred', 'deprecated', 'contested', 'stub',
]);
export type CurationStatus = z.infer<typeof CurationStatusEnum>;

export const TemporalPrecisionEnum = z.enum([
  'datetime', 'date', 'month', 'year', 'exact', 'decade', 'century', 'ordinal',
]);
export type TemporalPrecision = z.infer<typeof TemporalPrecisionEnum>;
// Note: 'exact' is kept for backward compatibility and treated as 'year'.
// New sub-year values: 'datetime' (to the minute), 'date' (day), 'month' (month).

export const DisplayModeEnum = z.enum(['exact', 'fuzzy', 'range', 'ordinal']);
export type DisplayMode = z.infer<typeof DisplayModeEnum>;

export const SpatialPrecisionEnum = z.enum(['exact', 'city', 'region', 'country', 'continent']);
export type SpatialPrecision = z.infer<typeof SpatialPrecisionEnum>;

export const SpatialModeEnum = z.enum(['point', 'region', 'path', 'diffuse']);
export type SpatialMode = z.infer<typeof SpatialModeEnum>;

export const SourceQualityEnum = z.enum([
  'primary_source', 'scholarly_consensus', 'scholarly_debate',
  'popular_synthesis', 'ai_inference', 'unverified',
]);
export type SourceQuality = z.infer<typeof SourceQualityEnum>;

export const DirectionEnum = z.enum([
  'source_to_target', 'target_to_source', 'bidirectional', 'undirected',
]);
export type Direction = z.infer<typeof DirectionEnum>;

// ── Sub-schemas ──────────────────────────────────────────────────────────────

export const FuzzyRangeSchema = z.object({
  earliest: z.number().int(),
  latest: z.number().int(),
});
export type FuzzyRange = z.infer<typeof FuzzyRangeSchema>;

/**
 * Sub-year date precision. `year` is kept in sync with TemporalBlock.start
 * for backward compatibility. month/day/hour/minute are all optional so the
 * struct doubles as a partial date depending on the precision level.
 *
 * BCE years are expressed as negative integers (490 BCE → year: -490).
 * timezone is an IANA zone string and is only meaningful for datetime precision.
 */
export const FullDateSchema = z.object({
  year:     z.number().int(),
  month:    z.number().int().min(1).max(12).optional(),
  day:      z.number().int().min(1).max(31).optional(),
  hour:     z.number().int().min(0).max(23).optional(),
  minute:   z.number().int().min(0).max(59).optional(),
  timezone: z.string().optional(),
});
export type FullDate = z.infer<typeof FullDateSchema>;

export const NativeDateSchema = z.object({
  system: z.string(),
  value: z.string(),
});
export type NativeDate = z.infer<typeof NativeDateSchema>;

export const TemporalBlockSchema = z.object({
  start: z.number().int().nullable().optional(),
  end: z.number().int().nullable().optional(),
  precision: TemporalPrecisionEnum,
  confidence: z.number().min(0).max(1),
  fuzzy_range: FuzzyRangeSchema.nullable().optional(),
  ordinal_constraints: z.array(z.string()).optional(),
  calendar_system: z.string().optional(),
  native_date: NativeDateSchema.nullable().optional(),
  contested: z.boolean().optional(),
  dating_notes: z.string().optional(),
  display_mode: DisplayModeEnum,
  /** Sub-year start date. Must be consistent with `start` (same year). */
  full_date: FullDateSchema.optional(),
  /** Sub-year end date. Must be consistent with `end` (same year). */
  full_date_end: FullDateSchema.optional(),
});
export type TemporalBlock = z.infer<typeof TemporalBlockSchema>;

export const SpatialPrimarySchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  precision: SpatialPrecisionEnum,
  confidence: z.number().min(0).max(1),
  place_label: z.string().optional(),
  modern_equivalent: z.string().optional(),
});
export type SpatialPrimary = z.infer<typeof SpatialPrimarySchema>;

export const ActiveRegionSchema = z.object({
  region_id: z.string(),
  role: z.string(),
});
export type ActiveRegion = z.infer<typeof ActiveRegionSchema>;

export const SpatialBlockSchema = z.object({
  primary: SpatialPrimarySchema.nullable().optional(),
  active_regions: z.array(ActiveRegionSchema).optional(),
  spatial_mode: SpatialModeEnum,
  fuzzy_radius_km: z.number().int().nullable().optional(),
  no_coordinates: z.boolean(),
  no_coordinates_reason: z.string().nullable().optional(),
});
export type SpatialBlock = z.infer<typeof SpatialBlockSchema>;

export const ProvisionalKeySchema = z.object({
  proposed_key: z.string(),
  description: z.string(),
  candidate_canonical_parents: z.array(z.string()).optional(),
  status: z.literal('provisional'),
});
export type ProvisionalKey = z.infer<typeof ProvisionalKeySchema>;

export const DescriptionBlockSchema = z.object({
  short: z.string().min(1),
  medium: z.string().optional(),
  long: z.string().optional(),
});
export type DescriptionBlock = z.infer<typeof DescriptionBlockSchema>;

export const SemanticBlockSchema = z.object({
  tags: z.array(z.string()),
  keys: z.array(z.string()),
  keys_provisional: z.array(ProvisionalKeySchema).optional(),
  facets: z.record(z.string(), z.string()).optional(),
  description: DescriptionBlockSchema,
});
export type SemanticBlock = z.infer<typeof SemanticBlockSchema>;

export const EpistemicBlockSchema = z.object({
  curation_status: CurationStatusEnum,
  confidence_overall: z.number().min(0).max(1),
  source_quality: SourceQualityEnum,
  epoch: z.string(),
  ingestion_notes: z.string().optional(),
  contradictions: z.array(z.string()).optional(),
  prose_cache_ids: z.array(z.string()).optional(),
});
export type EpistemicBlock = z.infer<typeof EpistemicBlockSchema>;

export const WorkEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  year: z.number().int().nullable().optional(),
  year_precision: z.enum(['exact', 'approximate', 'century', 'unknown']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type WorkEntry = z.infer<typeof WorkEntrySchema>;

export const SourceRefSchema = z.object({
  label: z.string(),
  url: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

// ── Main Node Schema ─────────────────────────────────────────────────────────

export const ChronosNodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  schema_version: z.string(),
  node_type: NodeTypeEnum,
  label: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  temporal: TemporalBlockSchema,
  spatial: SpatialBlockSchema,
  semantic: SemanticBlockSchema,
  epistemic: EpistemicBlockSchema,
  works: z.array(WorkEntrySchema).optional(),
  export: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(SourceRefSchema),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ChronosNode = z.infer<typeof ChronosNodeSchema>;

// ── Edge Schema ──────────────────────────────────────────────────────────────

export const EdgeEpistemicSchema = z.object({
  curation_status: CurationStatusEnum,
  confidence: z.number().min(0).max(1),
  evidence_type: SourceQualityEnum.optional(),
  reasoning: z.string().optional(),
  contradictions: z.array(z.string()).optional(),
  epoch: z.string(),
});
export type EdgeEpistemic = z.infer<typeof EdgeEpistemicSchema>;

export const EdgeDescriptionSchema = z.object({
  short: z.string().min(1),
  detailed: z.string().optional(),
  prose_cache_id: z.string().nullable().optional(),
  prose_angles_covered: z.array(z.string()).optional(),
});
export type EdgeDescription = z.infer<typeof EdgeDescriptionSchema>;

export const ChronosEdgeSchema = z.object({
  id: z.string(),
  schema_version: z.string(),
  source: z.string(),
  target: z.string(),
  connection_class: ConnectionClassEnum,
  connection_types: z.array(z.string()).optional(),
  direction: DirectionEnum,
  strength: z.number().min(0).max(1),
  temporal_context: z.object({
    approximate_year: z.number().int().nullable().optional(),
    notes: z.string().optional(),
  }).nullable().optional(),
  spatial_context: z.object({
    via: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }).nullable().optional(),
  semantic: z.object({
    tags: z.array(z.string()).optional(),
    keys: z.array(z.string()).optional(),
    keys_provisional: z.array(ProvisionalKeySchema).optional(),
  }).optional(),
  epistemic: EdgeEpistemicSchema,
  description: EdgeDescriptionSchema,
  sources: z.array(SourceRefSchema),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ChronosEdge = z.infer<typeof ChronosEdgeSchema>;

// ── Runtime Graph ────────────────────────────────────────────────────────────

export interface RuntimeGraph {
  compiled_at: string;
  node_count: number;
  edge_count: number;
  /** Nodes keyed by ID for O(1) lookup */
  nodes: Record<string, ChronosNode>;
  /** Edges keyed by ID */
  edges: Record<string, ChronosEdge>;
  /** nodeId → array of edge IDs (both directions for bidirectional edges) */
  adjacency: Record<string, string[]>;
  /** Flat array of all edges, for iteration */
  edges_flat: ChronosEdge[];
}

export const RuntimeGraphSchema = z.object({
  compiled_at: z.string(),
  node_count: z.number(),
  edge_count: z.number(),
  nodes: z.record(z.string(), ChronosNodeSchema),
  edges: z.record(z.string(), ChronosEdgeSchema),
  adjacency: z.record(z.string(), z.array(z.string())),
  edges_flat: z.array(ChronosEdgeSchema),
});

// ── Scope ────────────────────────────────────────────────────────────────────

export const ScopeSchema = z.object({
  time_range: z.tuple([z.number(), z.number()]),
  tags: z.array(z.string()),
  regions: z.array(z.string()),
  node_types: z.array(NodeTypeEnum),
  connection_classes: z.array(ConnectionClassEnum),
  curation_statuses: z.array(CurationStatusEnum),
  depth: z.number().int().min(1).max(10),
});
export type Scope = z.infer<typeof ScopeSchema>;

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface SwimlaneLane {
  /** The entity (person, period, institution) this lane represents */
  entity: ChronosNode;
  /** Computed display start year (resolved from fuzzy range) */
  display_start: number;
  /** Computed display end year */
  display_end: number;
  /** certainty 0–1 for edge rendering: 1 = crisp, 0 = fully gradient */
  certainty: number;
  /** Work nodes associated with this entity, as dated points */
  works: { node: ChronosNode; year: number }[];
  /** Event nodes that overlap this lane's time range */
  overlapping_events: ChronosNode[];
}

// ── Map ──────────────────────────────────────────────────────────────────────

export interface MapCluster {
  /** Centroid latitude */
  lat: number;
  /** Centroid longitude */
  lon: number;
  /** Number of nodes in this cluster */
  count: number;
  /** Most common node_type in the cluster */
  dominant_type: NodeType;
  /** Intensity 0–1 for density surface rendering */
  intensity: number;
  /** IDs of nodes in this cluster */
  node_ids: string[];
}

export interface FlowPath {
  /** Edge that generated this path */
  edge: ChronosEdge;
  /** Source coordinates */
  source_coords: [number, number];
  /** Target coordinates */
  target_coords: [number, number];
  /** For route nodes: intermediate waypoints */
  waypoints: [number, number][];
  /** 'arc' for intellectual/other edges, 'polyline' for route nodes */
  path_type: 'arc' | 'polyline';
}

// ── Edge filter (used by neighbors()) ────────────────────────────────────────

export interface EdgeFilter {
  connection_classes?: ConnectionClass[];
  curation_statuses?: CurationStatus[];
  min_strength?: number;
}

// ── Prose cache ──────────────────────────────────────────────────────────────

export interface ProseCache {
  id: string;
  subject_ids: string[];
  edge_id: string | null;
  angles_covered: string[];
  generated_at: string;
  model_version: string;
  content: { short: string; medium: string; detailed: string };
  invalidated: boolean;
  invalidation_reason: string | null;
}
