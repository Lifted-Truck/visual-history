/**
 * TimelineScrubber — Draggable two-handle timeline for scope.time_range.
 *
 * Uses d3-scale for the year→pixel mapping and raw mouse events for drag.
 * Width is read from the DOM on each drag move so it stays accurate after
 * window resize without needing a ResizeObserver.
 */
import React, { useRef, useEffect, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { useScopeStore } from '@/state/scope-store';

const HEIGHT = 44;
const PAD_L = 44;
const PAD_R = 12;
const DOMAIN: [number, number] = [-700, 700];
const TICKS = [-600, -400, -200, 0, 200, 400, 600];

function makeScale(totalWidth: number) {
  return scaleLinear()
    .domain(DOMAIN)
    .range([PAD_L, totalWidth - PAD_R])
    .clamp(true);
}

export default function TimelineScrubber() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const { scope, updateScope } = useScopeStore();

  // Track width on mount and resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) setWidth(containerRef.current.clientWidth);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const scale = makeScale(width);
  const sx = scale(scope.time_range[0]);
  const ex = scale(scope.time_range[1]);

  const makeDragHandler = (handle: 'start' | 'end') => (e: React.MouseEvent<SVGCircleElement>) => {
    e.preventDefault();

    const onMove = (me: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Recompute scale from current DOM width to stay accurate after resize
      const currentScale = makeScale(rect.width);
      const year = Math.round(currentScale.invert(me.clientX - rect.left));
      // Always read fresh state to avoid stale closure
      const { scope: s, updateScope: update } = useScopeStore.getState();
      if (handle === 'start') {
        update({ time_range: [Math.min(year, s.time_range[1] - 10), s.time_range[1]] });
      } else {
        update({ time_range: [s.time_range[0], Math.max(year, s.time_range[0] + 10)] });
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={containerRef}
      style={{ height: HEIGHT, background: '#0c0c0c', borderTop: '1px solid #1a1a1a', flexShrink: 0 }}
    >
      <svg width={width} height={HEIGHT} style={{ display: 'block' }}>
        {/* Axis baseline */}
        <line
          x1={PAD_L} y1={HEIGHT / 2}
          x2={width - PAD_R} y2={HEIGHT / 2}
          stroke="#2a2a2a" strokeWidth={1}
        />

        {/* Selected range highlight */}
        <rect
          x={sx} y={HEIGHT / 2 - 3}
          width={Math.max(0, ex - sx)} height={6}
          fill="#3a6aaf" opacity={0.5} rx={3}
        />

        {/* Tick marks */}
        {TICKS.map(year => {
          const x = scale(year);
          return (
            <g key={year}>
              <line x1={x} y1={HEIGHT / 2 - 5} x2={x} y2={HEIGHT / 2 + 5} stroke="#333" strokeWidth={1} />
              <text
                x={x} y={HEIGHT - 4}
                textAnchor="middle"
                fill="#444"
                fontSize={9}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {year < 0 ? `${Math.abs(year)}B` : year === 0 ? '0' : `${year}`}
              </text>
            </g>
          );
        })}

        {/* Current range labels */}
        <text x={sx} y={9} textAnchor="middle" fill="#5599dd" fontSize={9} style={{ userSelect: 'none' }}>
          {scope.time_range[0] < 0 ? `${Math.abs(scope.time_range[0])} BCE` : `${scope.time_range[0]} CE`}
        </text>
        <text x={ex} y={9} textAnchor="middle" fill="#5599dd" fontSize={9} style={{ userSelect: 'none' }}>
          {scope.time_range[1] < 0 ? `${Math.abs(scope.time_range[1])} BCE` : `${scope.time_range[1]} CE`}
        </text>

        {/* Start handle */}
        <circle
          cx={sx} cy={HEIGHT / 2} r={7}
          fill="#3a6aaf" stroke="#5588cc" strokeWidth={1.5}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={makeDragHandler('start')}
        />

        {/* End handle */}
        <circle
          cx={ex} cy={HEIGHT / 2} r={7}
          fill="#3a6aaf" stroke="#5588cc" strokeWidth={1.5}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={makeDragHandler('end')}
        />
      </svg>
    </div>
  );
}
