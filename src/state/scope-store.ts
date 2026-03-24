/**
 * scope-store.ts — Zustand reactive store shared across all views.
 *
 * Default scope is inlined here to avoid importing scope.ts, which uses
 * Node's fs.readFileSync and cannot run in the browser bundle.
 */
import { create } from 'zustand';
import { loadGraphFromUrl } from '@/engine/graph-browser';
import type { RuntimeGraph, Scope } from '@/engine/types';

// Mirrors chronos.config.json default_scope — update both if changing defaults
const DEFAULT_SCOPE: Scope = {
  time_range: [-600, 400],
  tags: [],
  regions: [],
  node_types: [
    'person', 'event', 'period', 'place', 'work', 'concept',
    'institution', 'technology', 'route', 'phenomenon',
  ],
  connection_classes: [
    'causal', 'intellectual', 'biographical', 'spatial',
    'temporal', 'material', 'analogical', 'ecological',
  ],
  curation_statuses: ['canonical', 'ingested'],
  depth: 2,
};

interface ScopeStore {
  graph: RuntimeGraph | null;
  scope: Scope;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  showDensity: boolean;
  loadGraph: () => Promise<void>;
  setScope: (scope: Scope) => void;
  updateScope: (partial: Partial<Scope>) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  toggleDensity: () => void;
}

export const useScopeStore = create<ScopeStore>((set) => ({
  graph: null,
  scope: DEFAULT_SCOPE,
  selectedNodeId: null,
  selectedEdgeId: null,
  showDensity: false,

  loadGraph: async () => {
    const graph = await loadGraphFromUrl();
    set({ graph });
  },

  setScope: (scope) => set({ scope }),

  updateScope: (partial) =>
    set((state) => ({ scope: { ...state.scope, ...partial } })),

  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  toggleDensity: () => set((state) => ({ showDensity: !state.showDensity })),
}));
