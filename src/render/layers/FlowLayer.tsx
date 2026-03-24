/**
 * FlowLayer — Deck.gl ArcLayer factory for FlowPath data.
 *
 * IMPORTANT: FlowPath stores coords as [lat, lon] (Chronos convention).
 * ArcLayer expects [longitude, latitude]. Swap on access.
 */
import { ArcLayer } from 'deck.gl';
import type { FlowPath, ConnectionClass } from '@/engine/types';

const EDGE_COLORS: Record<ConnectionClass, [number, number, number]> = {
  causal:       [255, 100,  60],
  intellectual: [100, 160, 255],
  biographical: [255, 200,  60],
  spatial:      [ 80, 200, 120],
  temporal:     [200, 200, 200],
  material:     [200, 120,  60],
  analogical:   [200, 100, 220],
  ecological:   [ 60, 180,  80],
};

export function makeFlowLayer(flows: FlowPath[]) {
  return new ArcLayer<FlowPath>({
    id: 'flows',
    data: flows,
    // coords are [lat, lon] — swap to [lon, lat] for Deck.gl
    getSourcePosition: (fp) => [fp.source_coords[1], fp.source_coords[0]],
    getTargetPosition: (fp) => [fp.target_coords[1], fp.target_coords[0]],
    getSourceColor: (fp) => {
      const [r, g, b] = EDGE_COLORS[fp.edge.connection_class] ?? [200, 200, 200];
      const alpha = fp.edge.epistemic.curation_status === 'canonical' ? 200 : 110;
      return [r, g, b, alpha];
    },
    getTargetColor: (fp) => {
      const [r, g, b] = EDGE_COLORS[fp.edge.connection_class] ?? [200, 200, 200];
      const alpha = fp.edge.epistemic.curation_status === 'canonical' ? 160 : 80;
      return [r, g, b, alpha];
    },
    getWidth: (fp) => Math.max(1, fp.edge.strength * 4),
    widthUnits: 'pixels',
    pickable: false,
  });
}
