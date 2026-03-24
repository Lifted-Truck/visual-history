/**
 * ScopePanel — Filter and activation controls.
 * All changes write directly to the Zustand scope store.
 */
import React from 'react';
import { useScopeStore } from '@/state/scope-store';
import type { NodeType, ConnectionClass } from '@/engine/types';

const NODE_TYPES: NodeType[] = [
  'person', 'event', 'period', 'place', 'work', 'concept',
  'institution', 'technology', 'route', 'phenomenon',
];

const CONNECTION_CLASSES: ConnectionClass[] = [
  'causal', 'intellectual', 'biographical', 'spatial',
  'temporal', 'material', 'analogical', 'ecological',
];

const label: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: 5,
};

const chip = (active: boolean, accent: string): React.CSSProperties => ({
  padding: '2px 8px',
  fontSize: 10,
  cursor: 'pointer',
  borderRadius: 3,
  background: active ? accent + '22' : '#161616',
  border: `1px solid ${active ? accent + '88' : '#252525'}`,
  color: active ? accent + 'cc' : '#444',
  transition: 'all 0.1s',
});

export default function ScopePanel() {
  const { scope, updateScope, showDensity, toggleDensity } = useScopeStore();

  const toggleType = (type: NodeType) => {
    const s = new Set(scope.node_types);
    s.has(type) ? s.delete(type) : s.add(type);
    updateScope({ node_types: Array.from(s) as NodeType[] });
  };

  const toggleClass = (cls: ConnectionClass) => {
    const s = new Set(scope.connection_classes);
    s.has(cls) ? s.delete(cls) : s.add(cls);
    updateScope({ connection_classes: Array.from(s) as ConnectionClass[] });
  };

  const input: React.CSSProperties = {
    width: 72,
    padding: '3px 6px',
    background: '#161616',
    border: '1px solid #252525',
    color: '#bbb',
    fontSize: 12,
    borderRadius: 3,
  };

  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1a1a1a', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#444', textTransform: 'uppercase', marginBottom: 12 }}>
        Scope
      </div>

      {/* Time range */}
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Time range</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="number"
            value={scope.time_range[0]}
            onChange={e => updateScope({ time_range: [+e.target.value, scope.time_range[1]] })}
            style={input}
          />
          <span style={{ color: '#333' }}>—</span>
          <input
            type="number"
            value={scope.time_range[1]}
            onChange={e => updateScope({ time_range: [scope.time_range[0], +e.target.value] })}
            style={input}
          />
        </div>
      </div>

      {/* Node types */}
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Node types</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {NODE_TYPES.map(type => (
            <button key={type} onClick={() => toggleType(type)} style={chip(scope.node_types.includes(type), '#5599dd')}>
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Connection classes */}
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Connections</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CONNECTION_CLASSES.map(cls => (
            <button key={cls} onClick={() => toggleClass(cls)} style={chip(scope.connection_classes.includes(cls), '#aa66dd')}>
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* Density layer */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 11, color: '#555' }}>
        <input
          type="checkbox"
          checked={showDensity}
          onChange={toggleDensity}
          style={{ accentColor: '#5599dd' }}
        />
        Density heatmap
      </label>
    </div>
  );
}
