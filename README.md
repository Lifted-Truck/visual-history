# Chronos

A personal historical knowledge graph and multi-modal visualizer.

---

## What This Is

Chronos is a tool for building and exploring a personal map of world history — not as a sequence of memorized facts, but as a live network of entities, influences, movements, and contingencies that can be interrogated, extended, and visualized from multiple angles simultaneously.

The core conviction behind it is that historical intuition — the felt sense of how periods connect, how ideas travel, what had to precede what — is a learnable thing, and that it is learned more effectively through spatial and relational representation than through linear narrative. Before you can populate a map with specific details, you need a map. This project is an attempt to build that map in a form that grows more useful the more you use it.

It is designed as a *personal epistemological infrastructure*, not a public encyclopedia. It is biased toward the kinds of questions you actually want to ask, the analytical modes you find generative, and the narrative threads you happen to be pulling at any given time. It is meant to accumulate and self-correct over years, not to be complete.

---

## Philosophical Orientation

A few commitments that shape every design decision:

**Uncertainty is data, not a problem.** Historical knowledge is irreducibly uncertain — dates are contested, attributions are disputed, connections are inferred rather than documented. The system encodes this uncertainty explicitly in every node and edge rather than forcing false precision. A node with only ordinal temporal constraints ("after the Bronze Age Collapse, before Homer") is a first-class member of the graph, displayed differently but not excluded.

**The same facts support many stories.** The same node — say, the Mongol conquests — appears as a political event in one scope, a trade disruption in another, a demographic catastrophe in a third, and an intellectual transmission vector in a fourth. The system separates the canonical data layer from the query and render layers specifically so that a single well-modeled entity can participate in any number of analytical framings without being reduced to one.

**Epistemic provenance matters.** A connection proposed by an AI inference engine is not the same as a connection documented by primary sources and confirmed by scholarly consensus, which is not the same as a connection you've drawn yourself based on a reading of the evidence. All three are valuable; none should be silently conflated. Every piece of information in the system carries metadata about how it came to be there and how much confidence to place in it.

**The tool should outlast any single session.** Each research session enriches the permanent record. Prose generated in response to a question is cached and accrues. Connections proposed dynamically can be promoted to the canonical record. Story states save the exact framing of a question so it can be returned to. The system is designed to become more useful over time, not to reset between uses.

**Analysis and narrative coexist.** Quantitative Bayesian estimates about lacunae and probabilistic attributions live in the same system as qualitative annotations, personal interpretive notes, and saved narrative framings. Neither mode is privileged. The goal is to be able to ask both "what is the probability distribution over Ibn Sina's likely awareness of Indian mathematics?" and "how does reading al-Ghazali after Ibn Rushd change the shape of the Abbasid story?" — and to have both questions leave traces in the same growing map.

---

## Architecture Overview

```
chronos/
├── data/
│   ├── nodes/              # One JSON file per node or grouped by epoch/region
│   ├── edges/              # Edge definitions, keyed by epoch
│   ├── staging/            # Incoming epoch batches awaiting audit
│   ├── stories/            # Saved story states
│   ├── prose-cache/        # Cached AI-generated prose, keyed by subject+angle
│   └── schema/
│       ├── node.schema.json
│       ├── edge.schema.json
│       ├── keys-registry.json
│       ├── export-schemas.json
│       └── node-types.json
├── src/
│   ├── engine/
│   │   ├── graph.ts        # Subgraph query, filter, path, neighbor logic
│   │   ├── timeline.ts     # Swimlane layout, fuzzy temporal positioning
│   │   ├── map.ts          # Geographic projection, clustering, flow paths
│   │   ├── analysis.ts     # Influence ranking, lacuna detection, Bayesian estimates
│   │   ├── story.ts        # Story state save/load/list
│   │   └── types.ts        # TypeScript interfaces for all schema types
│   ├── ai/
│   │   ├── ingest.ts       # Epoch staging, conflict/duplicate detection, implication scoring
│   │   ├── connections.ts  # Dynamic edge inference from key overlap + proximity
│   │   ├── explain.ts      # Prose cache management and generation
│   │   ├── enrich.ts       # Web search → staged batch JSON
│   │   └── key-reconcile.ts  # Key quantization and provisional key management
│   ├── render/
│   │   ├── MapView.tsx         # Point, flow, density, choropleth, terrain sub-modes
│   │   ├── TimelineView.tsx    # Swimlane timeline with event overlays
│   │   ├── NetworkView.tsx     # Force graph, hierarchical, bipartite, chord
│   │   ├── EntityPage.tsx      # Deep-dive single node view
│   │   ├── ComparisonView.tsx  # Side-by-side node comparison
│   │   ├── NarrativeView.tsx   # Story state as linked prose
│   │   └── AuditView.tsx       # Epoch review and conflict resolution UI
│   └── ui/
│       ├── ScopePanel.tsx      # Filter and activation controls
│       ├── DetailPanel.tsx     # Contextual node/edge details
│       ├── AIPanel.tsx         # Inference, enrichment, prose requests
│       ├── StoryPanel.tsx      # Save/load/annotate story states
│       ├── ExportPanel.tsx     # CSV, GeoJSON, GraphML export
│       └── LaneControls.tsx    # Timeline lane activation
├── scripts/
│   ├── validate.ts         # CLI: validate a batch JSON file
│   ├── stage-epoch.ts      # CLI: stage an incoming epoch for audit
│   ├── compile-graph.ts    # CLI: compile canonical data to runtime format
│   └── export.ts           # CLI: generate structured exports
├── dist/
│   └── graph.json          # Compiled runtime graph (generated, not canonical)
├── chronos.config.json     # Project config, endpoint manifest, display defaults
├── README.md               # This file
├── DEVELOPMENT_PLAN.md     # Staged construction plan
└── CHRONOS_INGESTION_PROMPT.md  # Prompt document for research threads
```

---

## Data Model Summary

Every entity in the system is a **node** with a type, temporal coordinates, spatial coordinates, semantic tags and keys, and epistemic metadata. Nodes are connected by **edges** that are themselves first-class objects with types, confidence scores, descriptions, and provenance.

The five internal namespaces on every node are:

| Namespace | Purpose |
|-----------|---------|
| `temporal` | When — with explicit fuzziness, multiple calendar systems, ordinal constraints |
| `spatial` | Where — with precision levels, uncertainty radii, diffuse mode for unlocatable entities |
| `semantic` | What — tags for display filtering, keys for AI inference, facets for quantitative analysis |
| `epistemic` | How confident and why — curation status, source quality, epoch provenance, contradictions |
| `export` | How it maps to external formats — field mappings for CSV, GeoJSON, GraphML |

This structure means new analytical domains (ecology, demography, linguistics) extend the model by adding new node types, new keys, and new export schemas — not by restructuring existing data.

### Node Types

`person` · `event` · `period` · `place` · `work` · `concept` · `institution` · `technology` · `route` · `phenomenon` · `dataset`

### Edge Connection Classes

`causal` · `intellectual` · `biographical` · `spatial` · `temporal` · `material` · `analogical` · `ecological`

### Curation Statuses

| Status | Meaning |
|--------|---------|
| `canonical` | Verified, sourced, human-reviewed |
| `ingested` | From a research epoch, pending full audit |
| `provisional` | AI-proposed, lower confidence |
| `inferred` | Dynamically generated, not stored permanently |
| `deprecated` | Superseded, kept for backward compatibility |
| `contested` | Active contradiction flagged for resolution |

---

## UI Modes

All views are linked through a shared reactive `scope` object. Changing the scope in any view updates all others simultaneously. A scope is a serializable object specifying time range, tag filters, region filters, node type filters, and connection class filters.

### Space-Primary
- **Point Map** — nodes as located dots, colored by category
- **Flow Map** — directional edge arcs and route paths
- **Density Surface** — aggregate civilizational intensity field
- **Choropleth** — regions shaded by a computed attribute *(Stage 4)*
- **Terrain Map** — Deck.gl with elevation, rivers, historical tile layers *(Stage 8)*
- **Isochrone Map** — influence propagation rings from a selected node *(Stage 8)*

### Time-Primary
- **Linear Timeline** — single scrollable axis with epoch markers
- **Swimlane Timeline** — parallel entity lanes with work dots and event overlays
- **Era Comparison** — two time ranges side by side *(future)*
- **Stacked Timeline** — multiple tag streams as geological strata *(future)*

### Network-Primary
- **Force Graph** — standard node-link with physics layout
- **Hierarchical Graph** — tree layout for causal chains
- **Bipartite Graph** — two node types, e.g. persons × works
- **Chord Diagram** — aggregate flows between regions or categories *(future)*

### Text-Primary
- **Entity Page** — deep dive on a single node
- **Comparison View** — two or more nodes side by side
- **Narrative View** — a story state rendered as prose with inline graph links
- **Audit View** — epoch review, conflict resolution, key reconciliation

### Meta / Analysis
- **Influence Ranking** — nodes sorted by outbound edge weight within a scope
- **Lacuna Map** — where is the graph sparse?
- **Bayesian Panel** — probability distributions for uncertain attributes

---

## The Endpoint Principle

Every capability in the system is exposed as a named, documented endpoint accessible to both the UI and an AI agent. The interface calls the same functions the AI does. This means:

- An AI agent can do anything visible in the UI
- Anything you can ask an AI to do programmatically, you can do in the interface
- No capability is locked to one consumer

The full endpoint manifest is in `chronos.config.json` and rendered to `ENDPOINTS.md`.

---

## Data Ingestion Workflow

Research sessions use a separate Claude thread loaded with `CHRONOS_INGESTION_PROMPT.md`. That thread researches a topic and produces a batch JSON file conforming to the schema. The workflow is:

```
Research thread → batch JSON → validate → stage epoch → audit (conflict detection, duplicate detection, key reconciliation) → human review of flagged items → promote to canonical → recompile graph
```

Epochs are named and preserved. Every piece of data in the canonical graph can be traced to the epoch that introduced it. Retracting an epoch is possible without corrupting later ones, though it triggers a re-audit of anything that depended on it.

---

## The Keys System

Tags are for display/filter logic. Keys are semantic handles used by the AI inference layer to propose connections and estimate relationships. The keys registry (`data/schema/keys-registry.json`) is a curated vocabulary with a hierarchy, aliases, and ambiguity notes.

When research threads propose novel keys, they enter as `provisional`. A reconciliation step canonicalizes, merges, or splits them. Ambiguous keys — where two distinct concepts are using the same label — are preserved as contested rather than forcibly resolved, surfaced for human judgment.

---

## Story States

A story state serializes a complete viewing context: the scope, the view layout (which modes are active and how they're arranged), highlighted nodes, annotations, and a list of relevant prose cache entries. Story states are the unit of *saving your work* — not just a bookmark, but a full record of the analytical frame you were using.

The `animation_keyframes` field in the story state schema is reserved for a future feature: a scripted tour through a sequence of scopes with timing, producing an animation of how the graph changes across a historical arc.

---

## Export Formats

| Format | Use |
|--------|-----|
| CSV — persons list | Names, dates, regions, biographical fields |
| CSV — works list | Titles, authors, dates, languages, sources |
| CSV — events list | Events by date, location, category |
| GeoJSON — points | Node locations for GIS import |
| GeoJSON — paths | Route and flow paths for GIS analysis |
| GeoJSON — regions | Political/cultural boundaries with temporal extent |
| GraphML | Graph topology for external analysis tools (Gephi, etc.) |
| JSON-LD | Linked data / semantic web compatibility |

Export schemas are defined in `data/schema/export-schemas.json` and can be extended without touching node data.

---

## TODOs

### Stage 0
- [ ] Write `data/schema/node.schema.json` with all types and validation rules
- [ ] Write `data/schema/edge.schema.json`
- [ ] Seed `data/schema/keys-registry.json` with ~100 canonical keys from baseline data
- [ ] Write `data/schema/export-schemas.json` with persons, works, events, gis-points schemas
- [ ] Convert prototype's ~60 nodes to proper schema format as `epoch-000-baseline`
- [ ] Write `scripts/validate.ts`
- [ ] Write `scripts/compile-graph.ts`
- [ ] Write `scripts/stage-epoch.ts`
- [ ] Write initial `chronos.config.json` with endpoint manifest skeleton
- [ ] Write `scripts/export.ts` with CSV and GeoJSON output

### Stage 1
- [ ] Write `src/engine/types.ts`
- [ ] Write `src/engine/scope.ts`
- [ ] Implement `graph.ts`: `loadGraph`, `getNode`, `subgraph`, `neighbors`, `path`, `contemporaries`, `keyOverlap`
- [ ] Implement `timeline.ts`: `lanesToScope`, `fuzzyPosition`
- [ ] Implement `map.ts`: `clusters`, `flowPaths`
- [ ] Write unit tests for all engine functions
- [ ] Generate `ENDPOINTS.md` from config manifest

### Stage 2
- [ ] Initialize React project with TypeScript
- [ ] Implement `ScopePanel.tsx` and reactive scope store
- [ ] Port prototype canvas renderer to `MapView.tsx` / `PointLayer.tsx`
- [ ] Implement `FlowLayer.tsx`
- [ ] Implement `DensityLayer.tsx`
- [ ] Implement `DetailPanel.tsx` with prose display
- [ ] Implement `TimelineScrubber.tsx`
- [ ] Implement fuzzy-temporal display (halo rendering for uncertain nodes)

### Stage 3
- [ ] Implement `TimelineView.tsx` with `PersonLane`, `PeriodLane`, `EventOverlay`, `ConnectionOverlay`
- [ ] Implement panel layout system for concurrent views
- [ ] Implement `LaneControls.tsx`
- [ ] Verify linked-view behavior (scrubbing one view updates the other)

### Stage 4
- [ ] Implement `src/ai/ingest.ts`: `stageEpoch`, `detectConflicts`, `detectDuplicates`, `computeImplication`
- [ ] Implement `src/ai/key-reconcile.ts`: `quantizeKey`, `proposeNewKey`
- [ ] Implement `AuditView.tsx` with conflict queue, merge UI, key review, epoch promotion
- [ ] Define implication threshold configuration in `chronos.config.json`

### Stage 5
- [ ] Implement `src/ai/connections.ts`: `inferEdges` with confidence scoring and reasoning field
- [ ] Implement `src/ai/explain.ts`: prose cache management, angle-aware generation, invalidation
- [ ] Implement `src/ai/enrich.ts`: web search → staged batch JSON
- [ ] Implement `AIPanel.tsx`
- [ ] Define inferred edge visual treatment (dashed, lower opacity, confidence badge)

### Stage 6
- [ ] Implement `analysis.ts`: `influenceRanking`, `lacunaMap`, `bayesianEstimate`, `metaAnalysis`
- [ ] Implement `NetworkView.tsx` (force graph sub-mode first)
- [ ] Implement `AnalysisPanel.tsx`

### Stage 7
- [ ] Implement `story.ts`: `saveStory`, `loadStory`, `listStories`
- [ ] Implement `StoryPanel.tsx` and `NarrativeView.tsx`
- [ ] Extend `scripts/export.ts` with GraphML and JSON-LD
- [ ] Implement `ExportPanel.tsx`

### Stage 8
- [ ] Evaluate Deck.gl vs. Mapbox GL JS for terrain integration
- [ ] Source historical map tile layers
- [ ] Implement choropleth mode
- [ ] Implement isochrone mode
- [ ] Verify QGIS compatibility of GeoJSON export

### Ongoing
- [ ] Expand canonical dataset with focused research epochs
- [ ] Maintain keys registry as new domains are added
- [ ] Periodic prose cache invalidation audit when underlying data changes
- [ ] Track `analogical` edge candidates as meta-analytical insights accumulate
- [ ] Document and test Bayesian estimation model as graph density increases

---

## Dependencies (anticipated)

| Package | Purpose |
|---------|---------|
| React + TypeScript | UI framework |
| Zustand or Jotai | Reactive scope state |
| D3.js | Timeline and network layout calculations |
| Deck.gl or Mapbox GL JS | Terrain map mode (Stage 8) |
| Zod | Runtime schema validation |
| Ajv | JSON Schema validation for CLI tools |
| better-sqlite3 | Optional local cache for compiled graph at scale |
| Anthropic SDK | AI integration layer |

---

## A Note on Scope

This is a personal research tool, not a public platform. Design decisions favor depth over breadth, personal analytical modes over generic interfaces, and long-term accretion over immediate completeness. It is explicitly not trying to be Wikipedia, a textbook, or a game. It is trying to be the kind of working map that a serious reader builds over years — but made navigable, queryable, and expandable in ways that a physical map or a set of marginalia cannot be.
