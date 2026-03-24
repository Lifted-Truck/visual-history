/**
 * DetailPanel — Deep-dive view for a selected node or edge.
 * Shows temporal range, description, connections, and sources.
 * Clicking a connection re-selects that node.
 */
import React, { useMemo } from 'react';
import { useScopeStore } from '@/state/scope-store';
import { getNodeFromGraph, neighborsFromGraph } from '@/engine/graph-browser';
import { NODE_TYPE_COLORS } from '@/render/layers/PointLayer';
import { EDGE_COLORS } from '@/render/layers/FlowLayer';
import type { ChronosNode, ChronosEdge, RuntimeGraph } from '@/engine/types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatYear(year: number | null | undefined): string {
  if (year == null) return '?';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year} CE`;
}

function formatFullDate(fd: { year: number; month?: number; day?: number; hour?: number; minute?: number; timezone?: string }): string {
  const era = fd.year < 0 ? ' BCE' : ' CE';
  const yr = Math.abs(fd.year);
  if (fd.hour != null && fd.minute != null) {
    const hh = String(fd.hour).padStart(2, '0');
    const mm = String(fd.minute).padStart(2, '0');
    const tz = fd.timezone && fd.timezone !== 'UTC' ? ` ${fd.timezone}` : '';
    return `${hh}:${mm}${tz}, ${fd.day ?? '?'} ${fd.month ? MONTH_NAMES[fd.month - 1] : '?'} ${yr}${era}`;
  }
  if (fd.day != null) return `${fd.day} ${fd.month ? MONTH_NAMES[fd.month - 1] : '?'} ${yr}${era}`;
  if (fd.month != null) return `${MONTH_NAMES[fd.month - 1]} ${yr}${era}`;
  return `${yr}${era}`;
}

function StrengthBar({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <div style={{ fontSize: 10, color: '#444', width: 50 }}>strength</div>
      <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
        <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: '#3a6aaf', borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 10, color: '#555', width: 28, textAlign: 'right' }}>{(value * 100).toFixed(0)}%</div>
    </div>
  );
}

function EdgeDetail({ edge, graph, setSelectedNode }: {
  edge: ChronosEdge;
  graph: RuntimeGraph;
  setSelectedNode: (id: string | null) => void;
}) {
  const sourceNode = graph.nodes[edge.source] as ChronosNode | undefined;
  const targetNode = graph.nodes[edge.target] as ChronosNode | undefined;
  const [r, g, b] = EDGE_COLORS[edge.connection_class] ?? [200, 200, 200];
  const typeColor = `rgb(${r},${g},${b})`;

  const directionSymbol: Record<string, string> = {
    source_to_target: '→',
    target_to_source: '←',
    bidirectional: '↔',
    undirected: '—',
  };

  const desc = edge.description?.detailed ?? edge.description?.short;

  return (
    <div>
      {/* Connection class badge */}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 3,
          background: typeColor + '22', border: `1px solid ${typeColor}55`,
          color: typeColor + 'cc',
        }}>
          {edge.connection_class}
        </span>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#555' }}>
          {directionSymbol[edge.direction] ?? edge.direction}
        </span>
      </div>

      {/* Source → Target */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <button
          onClick={() => sourceNode && setSelectedNode(sourceNode.id)}
          disabled={!sourceNode}
          style={{
            background: '#141414', border: '1px solid #202020', borderRadius: 3,
            padding: '4px 8px', cursor: sourceNode ? 'pointer' : 'default',
            color: '#aaa', fontSize: 11,
          }}
        >
          {sourceNode?.label ?? edge.source}
        </button>
        <span style={{ color: typeColor, fontSize: 14 }}>{directionSymbol[edge.direction] ?? '—'}</span>
        <button
          onClick={() => targetNode && setSelectedNode(targetNode.id)}
          disabled={!targetNode}
          style={{
            background: '#141414', border: '1px solid #202020', borderRadius: 3,
            padding: '4px 8px', cursor: targetNode ? 'pointer' : 'default',
            color: '#aaa', fontSize: 11,
          }}
        >
          {targetNode?.label ?? edge.target}
        </button>
      </div>

      <StrengthBar value={edge.strength} />

      {/* Temporal context */}
      {edge.temporal_context?.approximate_year != null && (
        <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
          ~{formatYear(edge.temporal_context.approximate_year)}
          {edge.temporal_context.notes && (
            <span style={{ marginLeft: 6, color: '#3a3a3a' }}>{edge.temporal_context.notes}</span>
          )}
        </div>
      )}

      {/* Description */}
      {desc && (
        <p style={{ lineHeight: 1.6, color: '#999', marginTop: 12, marginBottom: 14, fontSize: 12 }}>
          {desc}
        </p>
      )}

      {/* Epistemic */}
      <div style={{ fontSize: 10, color: '#3a3a3a', marginBottom: 10 }}>
        {edge.epistemic.curation_status}
        {edge.epistemic.evidence_type && (
          <>{' · '}{edge.epistemic.evidence_type.replace(/_/g, ' ')}</>
        )}
      </div>

      {/* Sources */}
      {edge.sources.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {edge.sources.map((s, i) => (
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

export default function DetailPanel() {
  const { graph, selectedNodeId, selectedEdgeId, setSelectedNode, setSelectedEdge } = useScopeStore();

  const node = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    return getNodeFromGraph(graph, selectedNodeId);
  }, [graph, selectedNodeId]);

  const edge = useMemo((): ChronosEdge | null => {
    if (!graph || !selectedEdgeId) return null;
    return graph.edges[selectedEdgeId] ?? null;
  }, [graph, selectedEdgeId]);

  const { nodes: neighborNodes, edges: neighborEdges } = useMemo(() => {
    if (!graph || !selectedNodeId) return { nodes: [], edges: [] };
    return neighborsFromGraph(graph, selectedNodeId, 1);
  }, [graph, selectedNodeId]);

  if (!node && !edge) return null;

  const panelStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    fontSize: 12,
    color: '#bbb',
    borderTop: '1px solid #1a1a1a',
  };

  const closeButton = (onClose: () => void) => (
    <button
      onClick={onClose}
      style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
      aria-label="Close"
    >
      ×
    </button>
  );

  // ── Edge detail view ───────────────────────────────────────────────────────
  if (edge && graph) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>Connection</h2>
          {closeButton(() => setSelectedEdge(null))}
        </div>
        <EdgeDetail edge={edge} graph={graph} setSelectedNode={setSelectedNode} />
      </div>
    );
  }

  // ── Node detail view ───────────────────────────────────────────────────────
  if (!node) return null;

  const t = node.temporal;
  const startLabel = t.full_date ? formatFullDate(t.full_date) : formatYear(t.start);
  const endLabel = t.full_date_end
    ? formatFullDate(t.full_date_end)
    : t.full_date
      ? formatFullDate({ ...t.full_date, ...(t.end != null ? { year: t.end } : {}) })
      : formatYear(t.end ?? t.start);
  const samePoint = startLabel === endLabel;
  const temporalLabel = t.display_mode === 'ordinal'
    ? 'ordinal (dates unresolved)'
    : samePoint ? startLabel : `${startLabel} – ${endLabel}`;

  const description = node.semantic.description.medium ?? node.semantic.description.short;
  const connections = neighborNodes.filter(n => n.id !== node.id);

  const [r, g, b] = NODE_TYPE_COLORS[node.node_type] ?? [200, 200, 200];
  const typeColor = `rgb(${r},${g},${b})`;

  return (
    <div style={panelStyle}>
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
        {closeButton(() => setSelectedNode(null))}
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
              const edgeForConn = neighborEdges.find(
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
                  {edgeForConn && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedEdge(edgeForConn.id); }}
                      style={{
                        background: 'none', border: '1px solid #252525', borderRadius: 2,
                        padding: '1px 5px', cursor: 'pointer', fontSize: 10,
                        color: '#555', marginLeft: 8, flexShrink: 0,
                      }}
                    >
                      {edgeForConn.connection_class}
                    </button>
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
