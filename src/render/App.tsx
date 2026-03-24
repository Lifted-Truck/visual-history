import React, { useEffect } from 'react';
import { useScopeStore } from '@/state/scope-store';
import MapView from './MapView';
import ScopePanel from '@/ui/ScopePanel';
import DetailPanel from '@/ui/DetailPanel';
import TimelineScrubber from '@/ui/TimelineScrubber';

export default function App() {
  const { graph, loadGraph } = useScopeStore();

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#0a0a0a',
      color: '#ccc',
    }}>
      {/* Left — map + scrubber */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {graph
            ? <MapView />
            : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#444', fontSize: 13,
              }}>
                Loading graph…
              </div>
            )
          }
        </div>
        <TimelineScrubber />
      </div>

      {/* Right — scope + detail */}
      <div style={{
        width: 300,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #1e1e1e',
        background: '#0f0f0f',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <ScopePanel />
        <DetailPanel />
      </div>
    </div>
  );
}
