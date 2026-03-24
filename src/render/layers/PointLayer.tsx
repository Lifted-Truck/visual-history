/**
 * PointLayer — Deck.gl ScatterplotLayer factory for ChronosNode data.
 *
 * Returns an array of layer instances (not a React component).
 * Pass the result directly into DeckGL's `layers` prop.
 *
 * Visual encoding by temporal precision:
 *   exact / year   → crisp filled circle, full opacity
 *   decade / century → filled circle + outer halo ring (fuzzy)
 *   ordinal / stub → dim filled circle, very low opacity
 */
import { ScatterplotLayer } from 'deck.gl';
import type { ChronosNode, NodeType } from '@/engine/types';

export const NODE_TYPE_COLORS: Record<NodeType, [number, number, number]> = {
  person:      [255, 160,  64],
  event:       [220,  80,  80],
  period:      [100, 160, 255],
  place:       [ 80, 200, 120],
  work:        [200, 120, 220],
  concept:     [255, 220,  60],
  institution: [160, 120,  80],
  technology:  [ 60, 200, 220],
  route:       [180, 180,  60],
  phenomenon:  [160,  80, 200],
  dataset:     [120, 120, 120],
};

const getPos = (n: ChronosNode): [number, number] => [
  n.spatial.primary!.lon,  // Deck.gl: longitude first
  n.spatial.primary!.lat,
];

const fillColor = (n: ChronosNode, alpha: number): [number, number, number, number] => {
  const [r, g, b] = NODE_TYPE_COLORS[n.node_type] ?? [200, 200, 200];
  return [r, g, b, alpha];
};

const lineColor = (n: ChronosNode, alpha: number): [number, number, number, number] => {
  const [r, g, b] = NODE_TYPE_COLORS[n.node_type] ?? [200, 200, 200];
  return [r, g, b, alpha];
};

export function makePointLayers(nodes: ChronosNode[]) {
  // Only nodes with actual point coordinates are rendered as dots
  const locatable = nodes.filter(
    n => !n.spatial.no_coordinates &&
         n.spatial.spatial_mode === 'point' &&
         n.spatial.primary != null,
  );

  const crisp   = locatable.filter(n => n.temporal.precision === 'exact' || n.temporal.precision === 'year');
  const fuzzy   = locatable.filter(n => n.temporal.precision === 'decade' || n.temporal.precision === 'century');
  const dim     = locatable.filter(n => n.temporal.precision === 'ordinal' || n.epistemic.curation_status === 'stub');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers: any[] = [];

  if (crisp.length > 0) {
    layers.push(new ScatterplotLayer<ChronosNode>({
      id: 'points-crisp',
      data: crisp,
      getPosition: getPos,
      getFillColor: (n) => fillColor(n, 220),
      getRadius: 5,
      radiusUnits: 'pixels',
      pickable: true,
    }));
  }

  if (fuzzy.length > 0) {
    // Inner fill (slightly transparent)
    layers.push(new ScatterplotLayer<ChronosNode>({
      id: 'points-fuzzy',
      data: fuzzy,
      getPosition: getPos,
      getFillColor: (n) => fillColor(n, 150),
      getRadius: 7,
      radiusUnits: 'pixels',
      pickable: true,
    }));
    // Outer halo ring
    layers.push(new ScatterplotLayer<ChronosNode>({
      id: 'points-fuzzy-halo',
      data: fuzzy,
      getPosition: getPos,
      getFillColor: [0, 0, 0, 0],
      getLineColor: (n) => lineColor(n, 70),
      getRadius: 15,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      pickable: false,
    }));
  }

  if (dim.length > 0) {
    layers.push(new ScatterplotLayer<ChronosNode>({
      id: 'points-dim',
      data: dim,
      getPosition: getPos,
      getFillColor: (n) => fillColor(n, 55),
      getRadius: 4,
      radiusUnits: 'pixels',
      pickable: true,
    }));
  }

  return layers;
}
