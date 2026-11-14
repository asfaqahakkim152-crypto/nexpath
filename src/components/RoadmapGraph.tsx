import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Clock, Sparkles } from 'lucide-react';
import { RoadmapStep } from '../types/skillpilot';

interface RoadmapGraphProps {
  steps: RoadmapStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onToggleComplete: (stepId: string) => void;
}

interface EdgeCoord {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHighlighted: boolean;
  isCompleted: boolean;
}

export function RoadmapGraph({
  steps,
  selectedStepId,
  onSelectStep,
  onToggleComplete,
}: RoadmapGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [edges, setEdges] = useState<EdgeCoord[]>([]);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number }>({
    width: 900,
    height: 360,
  });

  // Group steps into columns by week
  const weekColumns = useMemo(() => {
    const map = new Map<number, RoadmapStep[]>();
    for (const step of steps) {
      const w = Math.max(1, step.week || 1);
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(step);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, items]) => ({ week, items }));
  }, [steps]);

  // Resolve prerequisite edges cleanly (explicit prerequisites or sequential fallback across adjacent columns)
  const logicalEdges = useMemo(() => {
    const result: Array<{ from: RoadmapStep; to: RoadmapStep }> = [];
    const bySkill = new Map<string, RoadmapStep>();
    for (const s of steps) {
      bySkill.set(s.skill.toLowerCase(), s);
    }

    for (let i = 0; i < steps.length; i++) {
      const target = steps[i];
      const prereqs = target.prerequisites || [];
      let added = false;

      for (const pName of prereqs) {
        const pLower = pName.toLowerCase().trim();
        const source =
          bySkill.get(pLower) ||
          steps.find(
            (s) =>
              s.id !== target.id &&
              (s.skill.toLowerCase().includes(pLower) || pLower.includes(s.skill.toLowerCase()))
          );
        if (source && source.id !== target.id) {
          result.push({ from: source, to: target });
          added = true;
        }
      }

      // If no explicit prerequisite matched and this isn't the first node, connect from previous step
      if (!added && i > 0) {
        const prev = steps[i - 1];
        if (prev.id !== target.id) {
          result.push({ from: prev, to: target });
        }
      }
    }
    return result;
  }, [steps]);

  const recomputeEdges = () => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setSvgSize({
      width: Math.max(container.scrollWidth, cRect.width),
      height: Math.max(container.scrollHeight, cRect.height),
    });

    const computed: EdgeCoord[] = [];
    for (const { from, to } of logicalEdges) {
      const fromEl = nodeRefs.current[from.id];
      const toEl = nodeRefs.current[to.id];
      if (!fromEl || !toEl) continue;

      const fRect = fromEl.getBoundingClientRect();
      const tRect = toEl.getBoundingClientRect();

      const fromRightX = fRect.right - cRect.left + container.scrollLeft;
      const fromCenterY = fRect.top - cRect.top + fRect.height / 2 + container.scrollTop;
      const toLeftX = tRect.left - cRect.left + container.scrollLeft;
      const toCenterY = tRect.top - cRect.top + tRect.height / 2 + container.scrollTop;

      // If nodes are stacked vertically (same column), connect bottom -> top
      const isSameColumn = Math.abs(fRect.left - tRect.left) < 40;
      const x1 = isSameColumn
        ? fRect.left - cRect.left + fRect.width / 2 + container.scrollLeft
        : fromRightX;
      const y1 = isSameColumn
        ? fRect.bottom - cRect.top + container.scrollTop
        : fromCenterY;
      const x2 = isSameColumn
        ? tRect.left - cRect.left + tRect.width / 2 + container.scrollLeft
        : toLeftX;
      const y2 = isSameColumn
        ? tRect.top - cRect.top + container.scrollTop
        : toCenterY;

      computed.push({
        id: `${from.id}->${to.id}`,
        x1,
        y1,
        x2,
        y2,
        isHighlighted: selectedStepId === from.id || selectedStepId === to.id,
        isCompleted: from.completed && to.completed,
      });
    }
    setEdges(computed);
  };

  useLayoutEffect(() => {
    recomputeEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, selectedStepId, weekColumns]);

  useEffect(() => {
    const onResize = () => recomputeEdges();
    window.addEventListener('resize', onResize);
    const timer = setTimeout(recomputeEdges, 120);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, selectedStepId]);

  const firstUncompletedId = steps.find((s) => !s.completed)?.id || null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Interactive Skill Dependency Graph
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Follow arrows from foundational skills to advanced mastery. Click any node to open its
            YouTube suggestions, readings, and practice tasks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            Up Next
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Circle className="h-3.5 w-3.5 text-slate-400" />
            Upcoming
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-x-auto rounded-xl border border-slate-100 bg-[#F8FAFC] p-6"
      >
        {/* SVG Dependency Connector Layer */}
        <svg
          width={svgSize.width}
          height={svgSize.height}
          className="pointer-events-none absolute inset-0 z-0"
        >
          <defs>
            <marker
              id="arrow-slate"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#CBD5E1" />
            </marker>
            <marker
              id="arrow-indigo"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#4F46E5" />
            </marker>
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#16A34A" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const dx = Math.max(36, Math.abs(edge.x2 - edge.x1) * 0.48);
            const isVertical = Math.abs(edge.x2 - edge.x1) < 25;
            const pathD = isVertical
              ? `M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + 24}, ${edge.x2} ${edge.y2 - 24}, ${edge.x2} ${edge.y2}`
              : `M ${edge.x1} ${edge.y1} C ${edge.x1 + dx} ${edge.y1}, ${edge.x2 - dx} ${edge.y2}, ${edge.x2} ${edge.y2}`;

            const stroke = edge.isHighlighted
              ? '#4F46E5'
              : edge.isCompleted
                ? '#16A34A'
                : '#CBD5E1';
            const markerEnd = edge.isHighlighted
              ? 'url(#arrow-indigo)'
              : edge.isCompleted
                ? 'url(#arrow-emerald)'
                : 'url(#arrow-slate)';

            return (
              <path
                key={edge.id}
                d={pathD}
                fill="none"
                stroke={stroke}
                strokeWidth={edge.isHighlighted ? 2.5 : 2}
                markerEnd={markerEnd}
                className="transition-colors duration-200"
              />
            );
          })}
        </svg>

        {/* Columns by Week */}
        <div
          className="relative z-10 grid gap-8 items-start"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, weekColumns.length)}, minmax(220px, 1fr))`,
            minWidth: `${Math.max(1, weekColumns.length) * 245}px`,
          }}
        >
          {weekColumns.map((col) => (
            <div key={col.week} className="space-y-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 tabular-nums">
                Week {col.week}
              </div>

              <div className="space-y-5">
                {col.items.map((step) => {
                  const isSelected = selectedStepId === step.id;
                  const isUpNext = step.id === firstUncompletedId;
                  return (
                    <button
                      key={step.id}
                      ref={(el) => {
                        nodeRefs.current[step.id] = el;
                      }}
                      type="button"
                      onClick={() => onSelectStep(step.id)}
                      className={`w-full text-left rounded-2xl border p-4 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-white shadow-md ring-2 ring-indigo-600/15'
                          : step.completed
                            ? 'border-emerald-300 bg-emerald-50/60 hover:border-emerald-400'
                            : isUpNext
                              ? 'border-indigo-300 bg-white shadow-sm hover:border-indigo-500'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-semibold text-indigo-700">
                          {step.skill}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(step.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onToggleComplete(step.id);
                            }
                          }}
                          aria-label={`Toggle ${step.focusTitle} complete`}
                          className="text-slate-400 hover:text-emerald-600 shrink-0"
                        >
                          {step.completed ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                          ) : isUpNext ? (
                            <Sparkles className="h-4.5 w-4.5 text-indigo-600" />
                          ) : (
                            <Circle className="h-4.5 w-4.5" />
                          )}
                        </span>
                      </div>

                      <p
                        className={`font-display text-sm font-bold mt-1.5 leading-snug ${
                          step.completed ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {step.focusTitle}
                      </p>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{step.targetLevel}</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {step.estimatedHours}h
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
