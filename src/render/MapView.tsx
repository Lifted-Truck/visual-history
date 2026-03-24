/**
 * MapView — DeckGL + MapLibre composition.
 *
 * DeckGL is the outer container; Map renders as a child, which is the
 * correct integration pattern — reversing them causes the map to draw
 * over the Deck.gl layers.
 */
import React, { useMemo, useCallback } from 'react';
import { DeckGL } from 'deck.gl';
import { Map } from 'react-map-gl/maplibre';
import { useScopeStore } from '@/state/scope-store';
import { subgraphFromGraph, clustersFromGraph, flowPathsFromGraph } from '@/engine/graph-browser';
import { makePointLayers } from './layers/PointLayer';
import { makeFlowLayer } from './layers/FlowLayer';
import { makeDensityLayer } from './layers/DensityLayer';
import type { ChronosNode } from '@/engine/types';

const INITIAL_VIEW_STATE = {
  longitude: 30,
  latitude: 30,
  zoom: 2.5,
  pitch: 0,
  bearing: 0,
};

// MapLibre free tiles — no token required.
// Stage 8 upgrade: swap for a Mapbox style URL and add VITE_MAPBOX_TOKEN.
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

export default function MapView() {
  const { graph, scope, showDensity, setSelectedNode } = useScopeStore();

  const { nodes, edges: _edges } = useMemo(
    () => graph ? subgraphFromGraph(graph, scope) : { nodes: [], edges: [] },
    [graph, scope],
  );

  const clusterData = useMemo(
    () => graph ? clustersFromGraph(graph, scope) : [],
    [graph, scope],
  );

  const flowData = useMemo(
    () => graph ? flowPathsFromGraph(graph, scope) : [],
    [graph, scope],
  );

  const layers = useMemo(() => [
    ...makePointLayers(nodes),
    makeFlowLayer(flowData),
    makeDensityLayer(clusterData, showDensity),
  ], [nodes, flowData, clusterData, showDensity]);

  const handleClick = useCallback(
    (info: { object?: unknown }) => {
      const obj = info.object;
      if (obj && typeof obj === 'object' && 'id' in obj && 'node_type' in obj) {
        setSelectedNode((obj as ChronosNode).id);
      } else {
        setSelectedNode(null);
      }
    },
    [setSelectedNode],
  );

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller
      layers={layers}
      onClick={handleClick}
      getTooltip={(info: { object?: unknown }) => {
        const obj = info.object as ChronosNode | null;
        if (obj?.label) {
          return { html: `<b>${obj.label}</b><br/><span style="color:#888;font-size:11px">${obj.node_type}</span>` };
        }
        return null;
      }}
      style={{ position: 'absolute', inset: '0' }}
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
}
