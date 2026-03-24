/**
 * DetailPanel — Deep-dive view for a selected node.
 * Shows temporal range, description, connections, and sources.
 * Clicking a connection re-selects that node.
 */
import React, { useMemo } from 'react';
import { useScopeStore } from '@/state/scope-store';
import { getNodeFromGraph, neighborsFromGraph } from '@/engine/graph-browser';
import { NODE_TYPE_COLORS } from '@/render/layers/PointLayer';

function formatYear(year: number | null | undefined): string {
  if (year == null) return '?';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year} CE`;
}

export default function DetailPanel() {
  const { graph, selectedNodeId, setSelectedNode } = useScopeStore();

  const node = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    return getNodeFromGraph(graph, selectedNodeId);
  }, [graph, selectedNodeId]);

  const { nodes: neighborNodes, edges: neighborEdges } = useMemo(() => {
    if (!graph || !selectedNodeId) return { nodes: [], edges: [] };
    return neighborsFromGraph(graph, selectedNodeId, 1);
  }, [graph, selectedNodeId]);

  if (!node) return null;

  const t = node.temporal;
  const temporalLabel = t.display_mode === 'ordinal'
    ? 'ordinal (dates unresolved)'
    : `${formatYear(t.start)} – ${formatYear(t.end ?? t.start)}`;

  const description = node.semantic.description.medium ?? node.semantic.description.short;
  const connections = neighborNodes.filter(n => n.id !== node.id);

  const [r, g, b] = NODE_TYPE_COLORS[node.node_type] ?? [200, 200, 200];
  const typeColor = `rgb(${r},${g},${b})`;

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      padding: '12px',
      fontSize: 12,
      color: '#bbb',
      borderTop: '1px solid #1a1a1a',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e8', marginBottom: 4 }}>
            {node.label}
          </h2>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 3,
            background: typeColor + '22', border: `1px solid ${typeColor}55`,
            color: typeColor + 'cc',
          }}>
            {node.node_type}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Temporal */}
      <div style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>
        {temporalLabel}
        {t.contested && <span style={{ marginLeft: 6, color: '#aa6644' }}>contested</span>}
      </div>

      {/* Spatial */}
      {node.spatial.primary && (
        <div style={{ color: '#4a4a4a', fontSize: 11, marginBottom: 10 }}>
          {node.spatial.primary.place_label
            ?? node.spatial.primary.modern_equivalent
            ?? `${node.spatial.primary.lat.toFixed(1)}°N, ${node.spatial.primary.lon.toFixed(1)}°E`}
        </div>
      )}

      {/* Description */}
      <p style={{ lineHeight: 1.6, color: '#999', marginBottom: 14, fontSize: 12 }}>
        {description}
      </p>

      {/* Connections */}
      {connections.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Connections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {connections.map(neighbor => {
              const edge = neighborEdges.find(
                e => (e.source === neighbor.id && e.target === node.id) ||
                     (e.target === neighbor.id && e.source === node.id),
              );
              return (
                <button
                  key={neighbor.id}
                  onClick={() => setSelectedNode(neighbor.id)}
                  style={{
                    textAlign: 'left',
                    background: '#141414',
                    border: '1px solid #202020',
                    borderRadius: 3,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    color: '#aaa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11 }}>{neighbor.label}</span>
                  {edge && (
                    <span style={{ fontSize: 10, color: '#444', marginLeft: 8, flexShrink: 0 }}>
                      {edge.connection_class}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sources */}
      {node.sources.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {node.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 10, color: '#4a88bb', textDecoration: 'none' }}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
