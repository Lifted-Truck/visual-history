# CHRONOS — Development Plan

This document defines the staged construction of the Chronos historical knowledge graph and visualizer. Stages are designed to be independently useful at completion — each stage produces a working system, not a partial one. Later stages extend without breaking earlier ones.

---

## Guiding Principles

- **Schema stability before UI complexity.** No render layer should be built until the data model and query layer are stable.
- **Every capability is an endpoint.** Nothing exists only in the UI or only for the AI agent. All functionality is exposed through documented, named endpoints accessible to both.
- **Fuzziness is a first-class value.** Uncertain data is not a problem to be resolved before building — it is a permanent feature of the domain. Every stage handles it correctly.
- **Epochs over migrations.** New data enters as named epochs with audit trails. Nothing is silently overwritten.
- **Portable by default.** The canonical store is flat JSON in a git repository. Runtime formats are compiled from source, not authoritative.

---

## Stage 0 — Schema and Tooling Foundation
**Goal:** A validated, documented data model and the CLI tools to work with it. No UI.

### Deliverables

- `data/schema/node.schema.json` — JSON Schema for node objects with all types
- `data/schema/edge.schema.json` — JSON Schema for edge objects
- `data/schema/keys-registry.json` — Initial canonical keys vocabulary (~100 keys seeded from baseline data)
- `data/schema/export-schemas.json` — Named export format definitions
- `data/schema/node-types.json` — Registered node type list with descriptions
- `scripts/validate.ts` — CLI: validates a batch JSON file against the schema; reports errors
- `scripts/stage-epoch.ts` — CLI: takes a batch JSON file, assigns epoch ID, runs validation, writes to `data/staging/`
- `scripts/compile-graph.ts` — CLI: reads all canonical + staged data, compiles to `dist/graph.json` (runtime format)
- `scripts/export.ts` — CLI: takes an export schema name + filter scope, outputs CSV or GeoJSON
- `chronos.config.json` — Project configuration: default scopes, display preferences, endpoint manifest

### Acceptance Criteria
- A batch JSON file produced by the ingestion prompt can be validated without errors
- The compiler produces a valid runtime graph from the baseline seed data
- The CSV exporter produces a clean persons list and a GIS points file from baseline data

### Seed Data
- Port the ~60 nodes from the prototype visualizer into proper schema format
- These become `epoch-000-baseline`
- Manually curate ~40 canonical edges between them

---

## Stage 1 — Core Query Engine
**Goal:** A programmatic API (TypeScript functions) that any consumer — UI or AI agent — calls to interrogate the graph.

### Deliverables

- `src/engine/graph.ts`
  - `loadGraph()` — loads compiled runtime graph
  - `getNode(id)` — single node by ID
  - `subgraph(scope)` — filtered subgraph by time range, tags, regions, node types
  - `neighbors(id, depth, edgeFilters)` — ego network with optional edge class filter
  - `path(sourceId, targetId)` — shortest path between two nodes
  - `contemporaries(id, windowYears)` — all nodes temporally overlapping a given one
  - `keyOverlap(ids[])` — shared keys across a set of nodes
- `src/engine/types.ts` — TypeScript interfaces for all schema types
- `src/engine/scope.ts` — Scope object definition and serialization
- `src/engine/timeline.ts`
  - `lanesToScope(scope)` — computes swimlane layout data for a given scope
  - `fuzzyPosition(node)` — resolves a fuzzy temporal node to a display range
- `src/engine/map.ts`
  - `clusters(scope)` — geographic cluster computation
  - `flowPaths(scope)` — route and edge paths for flow map rendering

### Endpoint Manifest (machine-readable, in `chronos.config.json`)
All functions above are documented with their input/output signatures and exposed in the manifest so AI agents can discover and call them.

### Acceptance Criteria
- `subgraph({ time_range: [-500, 500], tags: ["philosophy"] })` returns the correct filtered node and edge sets
- `contemporaries("confucius", 50)` returns Siddhartha Gautama, Heraclitus, and other Axial Age figures
- `fuzzyPosition` correctly returns a range display for a node with `precision: "century"`

---

## Stage 2 — Map View (Port and Extend Prototype)
**Goal:** The existing prototype visualizer rebuilt as a proper React application reading from the query engine.

### Deliverables

- `src/render/MapView.tsx` — Point map mode, fully driven by `subgraph()` query
- `src/render/layers/PointLayer.tsx` — Node dots with glow, fade, density halos
- `src/render/layers/FlowLayer.tsx` — Directional edge arcs
- `src/render/layers/DensityLayer.tsx` — Aggregate intensity surface
- `src/ui/ScopePanel.tsx` — Filter/activation controls (time range, tags, node types)
- `src/ui/DetailPanel.tsx` — Node detail view with description, connections, prose
- `src/ui/TimelineScrubber.tsx` — Timeline with epoch markers, draggable cursor
- `src/state/scope-store.ts` — Reactive shared scope state (all views subscribe to this)

### Map Sub-modes (this stage)
- Point map — complete
- Flow map — complete (route nodes and directed edges)
- Density surface — complete

### Map Sub-modes (deferred)
- Choropleth — Stage 4
- Terrain integration (Deck.gl) — Stage 5
- Isochrone — Stage 6

### Acceptance Criteria
- Scrubbing the timeline updates node visibility and density halos in real time
- Clicking a node opens the detail panel with sourced description and clickable connections
- Clicking a connection in the detail panel jumps the timeline to that node's year
- All filter toggles correctly show/hide categories
- Fuzzy-temporal nodes display as halos rather than crisp points

---

## Stage 3 — Timeline View (Swimlane)
**Goal:** A parallel swimlane timeline as a second render mode, linked to the map view.

### Deliverables

- `src/render/TimelineView.tsx` — Swimlane renderer
- `src/render/lanes/PersonLane.tsx` — Horizontal bar for a person's lifespan, works as dots
- `src/render/lanes/PeriodLane.tsx` — Horizontal bar for an era or movement
- `src/render/layers/EventOverlay.tsx` — Vertical bands for discrete events crossing all lanes
- `src/render/layers/ConnectionOverlay.tsx` — Connection arcs between lanes
- `src/ui/LaneControls.tsx` — Activate/deactivate individual lanes or lane types
- Panel layout system — two views active simultaneously, linked via scope store

### Swimlane Scope
The timeline view reads the same `scope` object as the map view. A scope query for `{ tags: ["italian-renaissance"], regions: ["italy"], lane_type: "person" }` produces person lanes for Florentine figures with their works marked, political event overlays, and connection arcs auto-drawn for edges within the subgraph.

### Acceptance Criteria
- Dragging the timeline scrubber in one view updates the other simultaneously
- Clicking a node in the map highlights the corresponding lane in the timeline
- Works appear as correctly-dated dots along person lanes
- Period nodes render as background bands in the appropriate date range
- Fuzzy-temporal nodes display with gradient fade at edges, not crisp start/end

---

## Stage 4 — Ingestion Pipeline and Audit Interface
**Goal:** The full pipeline from research thread output to canonical data, with a UI for auditing.

### Deliverables

- `src/ai/ingest.ts`
  - `stageEpoch(batchJson)` — validates, assigns epoch ID, writes to staging
  - `detectConflicts(epoch)` — finds contradictions with existing canonical nodes/edges
  - `detectDuplicates(epoch)` — finds probable duplicates by ID, label, and temporal/spatial proximity
  - `computeImplication(conflict)` — scores a conflict by number of downstream dependencies
- `src/render/AuditView.tsx` — UI for reviewing a staged epoch
  - Conflict list with implication scores, AI-proposed resolutions, accept/reject controls
  - Duplicate merge UI
  - Provisional key review and canonicalization
  - Epoch promotion trigger
- `src/ai/key-reconcile.ts`
  - `quantizeKey(freeformConcept)` — maps a free-form string to the top 3 candidate canonical keys with similarity scores
  - `proposeNewKey(concept, description)` — stages a provisional key for registry review

### Conflict Resolution Logic
- **Auto-resolve:** conflicts affecting ≤ 2 downstream edges, where one source has higher `source_quality`
- **Flag for review:** conflicts affecting ≥ 3 downstream edges, or where both sources are `scholarly_consensus`
- **Preserve ambiguity:** when no resolution is clearly better, encode both datings in `fuzzy_range` and set `contested: true`

### Acceptance Criteria
- A batch JSON file from the ingestion prompt can be staged, conflict-checked, and promoted to canonical without manual file editing
- The audit UI correctly identifies a date conflict between a new node and an existing canonical node
- High-implication conflicts appear in a distinct review queue

---

## Stage 5 — AI Integration Layer
**Goal:** The AI agent integration — inference, enrichment, and the prose cache.

### Deliverables

- `src/ai/connections.ts`
  - `inferEdges(subgraph)` — proposes edges not in data based on key overlap, temporal proximity, geographic proximity; returns with confidence scores and reasoning
- `src/ai/explain.ts`
  - `getProse(subjectIds, angle)` — checks prose cache; generates if angle is novel; appends to cache entry
  - `invalidateProse(ids[])` — marks cache entries stale after node/edge updates
- `src/ai/enrich.ts`
  - `webSearchAndPackage(topic, scope)` — searches the web for a topic, packages results into staged batch JSON for human review
- `data/prose-cache/` — JSON files keyed by `prose_cache_id`
- `src/ui/AIPanel.tsx` — Interface for requesting inferences, prose, and web enrichment

### Dynamic Inference Display
Inferred edges display with:
- Dashed line style (vs. solid for canonical)
- Lower opacity
- Confidence score badge on hover
- One-click promote to `ingested` status (enters audit pipeline)

### Prose Cache Schema
```json
{
  "id": "prose-{hash}",
  "subject_ids": [],
  "edge_id": null,
  "angles_covered": [],
  "generated_at": "",
  "model_version": "",
  "content": { "short": "", "medium": "", "detailed": "" },
  "invalidated": false,
  "invalidation_reason": null
}
```

### Acceptance Criteria
- `inferEdges` on the Axial Age subgraph proposes connections between Confucius, Buddha, and Socrates with distinct reasoning for each
- `getProse` on an already-cached edge with a novel angle generates only the new angle, not the full entry
- Web enrichment produces valid stageable JSON from a topic query

---

## Stage 6 — Network and Analysis Views
**Goal:** Graph topology views and the meta-analysis / Bayesian endpoints.

### Deliverables

- `src/render/NetworkView.tsx` — Force-directed graph, hierarchical graph, bipartite graph sub-modes
- `src/engine/analysis.ts`
  - `influenceRanking(scope, dimension)` — nodes sorted by outbound edge weight within scope
  - `lacunaMap(scope)` — identifies underrepresented periods, regions, or categories in the graph
  - `bayesianEstimate(id, field)` — probability distribution for uncertain attributes, based on similar nodes
  - `metaAnalysis(scope, dimension)` — aggregate influence analysis across a scope
- `src/render/AnalysisPanel.tsx` — Influence ranking, lacuna map, Bayesian estimates

### Acceptance Criteria
- `influenceRanking({ tags: ["philosophy"], time_range: [-600, 400] })` returns Aristotle, Plato, Confucius in the top tier
- `lacunaMap({ regions: ["sub-saharan-africa"] })` correctly identifies that the graph is sparse for this region
- Bayesian estimate for an under-documented medieval scholar produces a reasonable distribution over `intellectual_tradition` based on known contemporaries

---

## Stage 7 — Story States and Export
**Goal:** Save and restore named viewing contexts; structured export for external analysis.

### Deliverables

- `src/engine/story.ts`
  - `saveStory(state)` — serializes current scope + view layout + annotations
  - `loadStory(id)` — restores state
  - `listStories()` — index of saved states
- `data/stories/` — JSON files, one per saved story state
- `src/ui/StoryPanel.tsx` — Save, load, annotate story states
- `scripts/export.ts` (extended)
  - CSV export: persons list, works list, events list, custom field mappings
  - GeoJSON export: points, paths, regions — QGIS-ready
  - GraphML export: for external graph analysis tools
  - JSON-LD export: for linked data / semantic web integration
- `src/ui/ExportPanel.tsx` — Export interface with schema selector and scope filter

### Story State Schema
```json
{
  "id": "story-{slug}",
  "label": "",
  "description": "",
  "created_at": "",
  "scope": { },
  "view_layout": {
    "panels": [
      { "mode": "terrain-map", "position": "left", "weight": 0.6 },
      { "mode": "swimlane-timeline", "position": "bottom-right", "weight": 0.4 }
    ],
    "linked": true
  },
  "highlighted_nodes": [],
  "annotations": [],
  "prose_cache_ids": [],
  "animation_keyframes": null
}
```

`animation_keyframes` is reserved for a future animation mode — a sequence of scope states with timing, producing a scripted tour through the graph. The field is defined now so story states saved in this stage will be compatible with that feature when built.

### Acceptance Criteria
- A story state saved in the Aristotle transmission scope restores the exact view, highlights, and scope filters
- GeoJSON export of route nodes produces a valid file importable into QGIS
- CSV works list export for a tag filter produces a clean spreadsheet with title, author, date, language, and source URL

---

## Stage 8 — Terrain Map and GIS Integration
**Goal:** Real geographic data underneath the visualization; QGIS-compatible output.

### Deliverables

- Deck.gl or Mapbox GL JS integration replacing the canvas map renderer
- Historical map tile layers (e.g., from the Digital Atlas of Roman and Medieval Civilizations)
- Terrain elevation layer
- River system and coastline data as static GeoJSON overlays
- Choropleth mode: regions shaded by a computed attribute at a given timestamp
- Isochrone mode: influence propagation rings from a selected node

### Note on Scope
This stage deliberately comes last. The data model, query layer, and analysis tools do not depend on a specific map renderer. Swapping the renderer in Stage 8 does not require touching the schema, the engine, or the AI layer — it is purely a presentation change. This is by design.

---

## Cross-Cutting Concerns (all stages)

### Testing
- Unit tests for schema validation and query engine functions from Stage 0
- Integration tests for the ingestion pipeline from Stage 4
- Snapshot tests for render output from Stage 2 onward

### Documentation
- `README.md` — project overview, philosophy, structure
- `INGESTION_PROMPT.md` — this document's companion for research threads
- `ENDPOINTS.md` — full endpoint manifest, auto-generated from `chronos.config.json`
- `KEYS_REGISTRY.md` — human-readable rendering of the canonical keys vocabulary
- Inline JSDoc on all engine and AI functions

### Versioning
- The schema carries a `schema_version` field. Breaking schema changes increment the major version and require a migration script.
- The epoch system provides a full audit trail of all data additions and resolutions.

---

## Approximate Stage Sequencing

| Stage | Estimated Complexity | Depends On |
|-------|---------------------|------------|
| 0 — Schema & Tooling | Medium | Nothing |
| 1 — Query Engine | Medium | Stage 0 |
| 2 — Map View | Medium-High | Stage 1 |
| 3 — Timeline View | Medium-High | Stage 1, 2 |
| 4 — Ingestion & Audit | High | Stage 1 |
| 5 — AI Integration | High | Stage 4 |
| 6 — Network & Analysis | Medium | Stage 1, 5 |
| 7 — Stories & Export | Medium | Stage 1, 2, 3 |
| 8 — Terrain & GIS | High | Stage 2, 7 |
