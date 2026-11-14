import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  Filter,
  GitBranch,
  List,
  Play,
  PlayCircle,
  Sparkles,
  Wrench,
  Youtube,
} from 'lucide-react';
import {
  CatalogResource,
  LearnerWorkspace,
  RoadmapStep,
  StudyFormat,
  YouTubeSuggestion,
} from '../types/skillpilot';
import { getStrings } from '../constants/i18n';
import { RoadmapGraph } from './RoadmapGraph';

interface RoadmapViewProps {
  workspace: LearnerWorkspace;
  onToggleStepComplete: (stepId: string) => void;
  onDismissNotice: (id: string) => void;
  onAskMentorAboutStep: (skill: string) => void;
}

export function RoadmapView({
  workspace,
  onToggleStepComplete,
  onDismissNotice,
  onAskMentorAboutStep,
}: RoadmapViewProps) {
  const { roadmap, adaptiveNotices, profile } = workspace;
  const strings = getStrings(profile.preferredLanguage);

  const [viewMode, setViewMode] = useState<'graph' | 'timeline'>('graph');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(roadmap[0]?.id || null);
  const [freeOnly, setFreeOnly] = useState(profile.budget === 'free-only');
  const [formatFilter, setFormatFilter] = useState<'all' | StudyFormat>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  useEffect(() => {
    if (roadmap.length > 0 && (!selectedStepId || !roadmap.some((r) => r.id === selectedStepId))) {
      const nextActive = roadmap.find((r) => !r.completed) || roadmap[0];
      setSelectedStepId(nextActive.id);
    }
  }, [roadmap, selectedStepId]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const step of roadmap) {
      set.add(step.resources.video.platform);
      set.add(step.resources.reading.platform);
      set.add(step.resources.handsOn.platform);
    }
    return ['all', ...Array.from(set).sort()];
  }, [roadmap]);

  const completedCount = roadmap.filter((s) => s.completed).length;
  const totalCount = roadmap.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const selectedStep = roadmap.find((s) => s.id === selectedStepId) || roadmap[0] || null;

  const filterResource = (res: CatalogResource): boolean => {
    if (freeOnly && res.cost !== 'free') return false;
    if (formatFilter !== 'all' && res.format !== formatFilter) return false;
    if (platformFilter !== 'all' && res.platform !== platformFilter) return false;
    return true;
  };

  const buildFallbackYouTubeSuggestions = (step: RoadmapStep): YouTubeSuggestion[] => {
    if (step.youtubeSuggestions && step.youtubeSuggestions.length > 0) {
      return step.youtubeSuggestions;
    }
    return [
      {
        id: `yt-auto-1-${step.id}`,
        title: `${step.skill}: ${step.focusTitle}`,
        channel: 'YouTube Learning Pick',
        query: `${step.skill} ${profile.field || ''} tutorial`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${step.skill} ${profile.field || ''} tutorial`
        )}`,
        duration: '20-45 min',
        reason: `Recommended video walkthrough aligned with ${step.targetLevel} ${step.skill}.`,
      },
      {
        id: `yt-auto-2-${step.id}`,
        title: `${step.skill} Real-World Case & Practice`,
        channel: 'YouTube Practice Pick',
        query: `${step.skill} practical examples ${profile.targetCareer}`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${step.skill} practical examples ${profile.targetCareer}`
        )}`,
        duration: '15-30 min',
        reason: `Shows applied examples for ${profile.targetCareer}.`,
      },
    ];
  };

  const renderYouTubeCards = (step: RoadmapStep) => {
    const suggestions = buildFallbackYouTubeSuggestions(step);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Youtube className="h-4 w-4 text-red-600" />
          <span>{strings.youtubeRecommendations}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {suggestions.map((yt) => (
            <a
              key={yt.id}
              href={yt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-red-300 hover:shadow-sm transition-all flex flex-col"
            >
              {/* Crisp 16:9 YouTube-style Thumbnail Preview */}
              <div className="relative aspect-video bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 p-3.5 flex flex-col justify-between text-white">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="font-semibold text-red-400">YouTube</span>
                  <span className="font-mono tabular-nums bg-black/50 px-1.5 py-0.5 rounded">
                    {yt.duration}
                  </span>
                </div>
                <div className="flex items-center justify-center my-auto">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow group-hover:scale-105 transition-transform">
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </div>
                </div>
                <p className="text-[11px] font-medium text-slate-200 truncate">{yt.channel}</p>
              </div>

              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 line-clamp-2 leading-snug">
                    {yt.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{yt.reason}</p>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold text-indigo-600">
                  <span>{yt.isDirectVideo ? 'Watch video' : 'Open YouTube picks'}</span>
                  <ExternalLink className="h-3 w-3" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderResourceRow = (
    res: CatalogResource,
    slotLabel: string,
    SlotIcon: React.ElementType
  ) => {
    const visible = filterResource(res);
    if (!visible) return null;

    return (
      <a
        key={`${slotLabel}-${res.id}`}
        href={res.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-indigo-600">
            <SlotIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-indigo-700">
              {slotLabel} · {res.platform}
            </p>
            <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 truncate mt-0.5">
              {res.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {res.level} · {res.duration} · {res.cost === 'free' ? 'Free' : 'Paid'}
              {res.isSearchFallback ? ' · Platform search link' : ''}
            </p>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 shrink-0 mt-1" />
      </a>
    );
  };

  const renderStepCard = (step: RoadmapStep) => {
    const visibleResources = [
      renderResourceRow(step.resources.video, 'Video Course', PlayCircle),
      renderResourceRow(step.resources.reading, 'Reading Guide', BookOpen),
      renderResourceRow(step.resources.handsOn, 'Hands-on Practice', Wrench),
    ].filter(Boolean);

    return (
      <div
        key={step.id}
        className={`rounded-2xl border p-5 sm:p-6 space-y-5 transition-colors ${
          step.completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <button
              type="button"
              onClick={() => onToggleStepComplete(step.id)}
              aria-label={`Mark ${step.focusTitle} as ${step.completed ? 'incomplete' : 'complete'}`}
              className="mt-0.5 text-slate-400 hover:text-indigo-600 focus:outline-none cursor-pointer"
            >
              {step.completed ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <Circle className="h-6 w-6" />
              )}
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-indigo-700 tabular-nums">Week {step.week}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-800">{step.skill}</span>
                <span aria-hidden="true">·</span>
                <span>{step.targetLevel}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{step.estimatedHours} hrs</span>
                {step.prerequisites && step.prerequisites.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Builds on: {step.prerequisites.join(', ')}</span>
                  </>
                )}
                {step.adaptiveTag && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-amber-700">{step.adaptiveTag}</span>
                  </>
                )}
              </div>

              <h3
                className={`font-display text-lg font-bold mt-1 ${
                  step.completed ? 'line-through text-slate-500' : 'text-slate-900'
                }`}
              >
                {step.focusTitle}
              </h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                <strong className="font-semibold text-slate-800">Why it matters: </strong>
                {step.whyItMatters}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onAskMentorAboutStep(step.skill)}
            className="self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ask Mentor
          </button>
        </div>

        {/* Curated Catalog 3-Slot Resources */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-0 sm:pl-9">
          {visibleResources.length > 0 ? (
            visibleResources
          ) : (
            <div className="col-span-3 rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
              No resources in this step match your active filter combination.
            </div>
          )}
        </div>

        {/* YouTube-Style Recommended Suggestions */}
        <div className="pl-0 sm:pl-9">{renderYouTubeCards(step)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {strings.roadmapTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {profile.field} · Target:{' '}
            <strong className="text-slate-900">{profile.targetCareer}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Graph vs Timeline View Toggle */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setViewMode('graph')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'graph'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {strings.graphView}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              {strings.timelineView}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
              <span>Completion</span>
              <span className="font-mono text-indigo-700 tabular-nums">
                {completedCount}/{totalCount} ({progressPct}%)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Adaptive Notice Banner */}
      {adaptiveNotices.length > 0 && (
        <div className="space-y-2.5">
          {adaptiveNotices.slice(0, 2).map((notice) => (
            <div
              key={notice.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{notice.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismissNotice(notice.id)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 self-end sm:self-center shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 mr-1">
            <Filter className="h-3.5 w-3.5" />
            Filters:
          </span>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['all', 'video', 'reading', 'hands-on'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatFilter(fmt)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  formatFilter === fmt
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {fmt === 'all' ? 'All formats' : fmt}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFreeOnly((f) => !f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              freeOnly
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {freeOnly ? 'Free only: On' : 'Free only: Off'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Platform:</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'All platforms' : p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      {roadmap.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-800">No roadmap steps generated yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Visit Career Match or Profile &amp; Goal to generate your personalized roadmap.
          </p>
        </div>
      ) : viewMode === 'graph' ? (
        <div className="space-y-6">
          <RoadmapGraph
            steps={roadmap}
            selectedStepId={selectedStep?.id || null}
            onSelectStep={setSelectedStepId}
            onToggleComplete={onToggleStepComplete}
          />
          {selectedStep && renderStepCard(selectedStep)}
        </div>
      ) : (
        <div className="space-y-4">{roadmap.map((step) => renderStepCard(step))}</div>
      )}
    </div>
  );
}
