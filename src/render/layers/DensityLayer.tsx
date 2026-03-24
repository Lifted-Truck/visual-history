/**
 * DensityLayer — Deck.gl HeatmapLayer factory for MapCluster data.
 *
 * Requires WebGL2 (available in all modern browsers).
 * Toggle visibility via the `visible` prop rather than mounting/unmounting.
 */
import { HeatmapLayer } from 'deck.gl';
import type { MapCluster } from '@/engine/types';

export function makeDensityLayer(clusters: MapCluster[], visible: boolean) {
  return new HeatmapLayer<MapCluster>({
    id: 'density',
    data: clusters,
    getPosition: (c) => [c.lon, c.lat],  // [longitude, latitude] for Deck.gl
    getWeight: (c) => c.intensity,
    radiusPixels: 80,
    intensity: 1,
    threshold: 0.05,
    visible,
  });
}
