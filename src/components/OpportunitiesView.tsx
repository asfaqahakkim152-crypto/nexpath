import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Calendar,
  CheckCircle2,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import fallbackCatalog from '../data/opportunitiesFallback.json';
import {
  CachedOpportunitiesState,
  LearnerWorkspace,
  OpportunityCategory,
  OpportunityCost,
  OpportunityItem,
  OpportunityMode,
  OpportunitySkillFit,
  ReadinessBand,
  ScoutActivityEntry,
} from '../types/skillpilot';
import {
  fetchOpportunityFitExplanation,
  runOpportunityScout,
} from '../services/skillpilotApi';
import {
  buildPlatformSearchLinks,
  computeOpportunitySkillFit,
} from '../utils/opportunityMatch';
import { SkeletonRows } from './ui/StateBlocks';

const FALLBACK_ITEMS = fallbackCatalog as OpportunityItem[];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type OpportunityTab = 'hackathon' | 'internship' | 'job_role' | 'saved';

interface OpportunitiesViewProps {
  workspace: LearnerWorkspace;
  onUpdateCachedOpportunities: (
    cache: CachedOpportunitiesState,
    scoutLogs: ScoutActivityEntry[]
  ) => void;
  onToggleSaveOpportunity: (item: OpportunityItem) => void;
  onAddMissingSkills: (
    missingSkills: string[],
    opportunityTitle: string
  ) => Promise<{ addedCount: number; addedSkills: string[] }>;
  onNavigateToRoadmap: () => void;
  onNavigateToAssess: () => void;
}

export function OpportunitiesView({
  workspace,
  onUpdateCachedOpportunities,
  onToggleSaveOpportunity,
  onAddMissingSkills,
  onNavigateToRoadmap,
  onNavigateToAssess,
}: OpportunitiesViewProps) {
  const { profile, assessments, savedOpportunities = [], cachedOpportunities, scoutActivityLog = [] } = workspace;

  const [activeTab, setActiveTab] = useState<OpportunityTab>('hackathon');
  const [searchQuery, setSearchQuery] = useState('');
  const [skillFilter, setSkillFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState<'all' | OpportunityMode>('all');
  const [costFilter, setCostFilter] = useState<'all' | OpportunityCost>('all');
  const [readinessFilter, setReadinessFilter] = useState<'all' | ReadinessBand>('all');

  const [isLoading, setIsLoading] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [addingOppId, setAddingOppId] = useState<string | null>(null);
  const [roadmapToast, setRoadmapToast] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Side Drawer State
  const [drawerItem, setDrawerItem] = useState<OpportunityItem | null>(null);
  const [drawerExplanation, setDrawerExplanation] = useState<string>('');
  const [drawerLoading, setDrawerLoading] = useState(false);

  const savedIds = useMemo(
    () => new Set(savedOpportunities.map((s) => s.id)),
    [savedOpportunities]
  );

  const isCacheValid = useMemo(() => {
    if (!cachedOpportunities?.cachedAt) return false;
    const age = Date.now() - new Date(cachedOpportunities.cachedAt).getTime();
    if (Number.isNaN(age) || age > CACHE_TTL_MS) return false;
    return (
      cachedOpportunities.targetCareer === profile.targetCareer &&
      cachedOpportunities.field === profile.field
    );
  }, [cachedOpportunities, profile.targetCareer, profile.field]);

  const loadOpportunities = useCallback(
    async (force = false) => {
      if (!force && isCacheValid) return;
      setIsLoading(true);
      try {
        const res = await runOpportunityScout(profile, assessments);
        onUpdateCachedOpportunities(
          {
            targetCareer: profile.targetCareer,
            field: profile.field,
            cachedAt: res.cachedAt,
            hackathons: res.hackathons,
            internships: res.internships,
            jobRoles: res.jobRoles,
            usedFallbackHackathons: res.usedFallbackHackathons,
            usedFallbackInternships: res.usedFallbackInternships,
            mentorTip: res.mentorTip,
          },
          res.scoutLogs || []
        );
      } catch {
        // Silent graceful fallback to curated list
        const now = new Date().toISOString();
        const fbHacks = FALLBACK_ITEMS.filter((i) => i.category === 'hackathon');
        const fbInts = FALLBACK_ITEMS.filter((i) => i.category === 'internship');
        const fbRole: OpportunityItem = {
          id: `role-fallback-${Date.now()}`,
          category: 'job_role',
          title: profile.targetCareer,
          organization: profile.field,
          mode: 'hybrid',
          location: 'Global / Hybrid',
          cost: 'free',
          overview: `Target career blueprint for ${profile.targetCareer} in ${profile.field}.`,
          responsibilities: [
            `Execute core ${profile.targetCareer} workflows and quality reviews`,
            'Collaborate across teams and communicate project progress clearly',
            'Continuously verify and upgrade core domain competencies',
          ],
          requiredSkills:
            profile.existingSkills.slice(0, 4).map((s) => s.name).length > 0
              ? profile.existingSkills.slice(0, 4).map((s) => s.name)
              : [profile.field, 'Problem Solving', 'Communication'],
          niceToHaveSkills: ['Project Management'],
          experienceLevels: ['Intern', 'Junior', 'Mid', 'Senior'],
          careerPath: ['Intern', 'Junior', 'Mid', 'Senior'],
          prizeOrStipend: 'Estimate: Varies by region and experience level',
          fetchedAt: now,
        };

        onUpdateCachedOpportunities(
          {
            targetCareer: profile.targetCareer,
            field: profile.field,
            cachedAt: now,
            hackathons: fbHacks,
            internships: fbInts,
            jobRoles: [fbRole],
            usedFallbackHackathons: true,
            usedFallbackInternships: true,
            mentorTip: `Showing popular verified opportunities for ${profile.targetCareer}. Verify your skills in Skill Assessment to unlock personalized Match % scores.`,
          },
          [
            {
              id: `scout-fb-${Date.now()}`,
              fromAgent: 'Scout',
              toAgent: 'Gap Analyst',
              message: `Loaded ${fbHacks.length + fbInts.length} verified fallback opportunities while live search recovers.`,
              timestamp: now,
            },
          ]
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isCacheValid, profile, assessments, onUpdateCachedOpportunities]
  );

  useEffect(() => {
    void loadOpportunities(false);
  }, [loadOpportunities]);

  // Close drawer on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentTabRawItems = useMemo<OpportunityItem[]>(() => {
    if (activeTab === 'saved') return savedOpportunities;
    if (!cachedOpportunities) {
      if (activeTab === 'hackathon') return FALLBACK_ITEMS.filter((i) => i.category === 'hackathon');
      if (activeTab === 'internship') return FALLBACK_ITEMS.filter((i) => i.category === 'internship');
      return [];
    }
    if (activeTab === 'hackathon') return cachedOpportunities.hackathons;
    if (activeTab === 'internship') return cachedOpportunities.internships;
    return cachedOpportunities.jobRoles;
  }, [activeTab, cachedOpportunities, savedOpportunities]);

  // Compute live verified-only fit for every item in current view
  const enrichedItems = useMemo(() => {
    return currentTabRawItems.map((item) => ({
      item,
      fit: computeOpportunitySkillFit(item, assessments),
    }));
  }, [currentTabRawItems, assessments]);

  // Live Mentor Tip computed dynamically from verified assessments across all cached items
  const liveMentorTip = useMemo(() => {
    const allItems = [
      ...(cachedOpportunities?.hackathons || []),
      ...(cachedOpportunities?.internships || []),
      ...(cachedOpportunities?.jobRoles || []),
    ];
    if (allItems.length === 0) {
      return cachedOpportunities?.mentorTip || 'Discover hackathons, internships, and roles aligned to your verified skills.';
    }
    const verifiedCount = Object.keys(assessments).length;
    if (verifiedCount === 0) {
      return `Verify your first skill to see true Match % scores — ${allItems.length} opportunities are lined up for ${profile.targetCareer}.`;
    }
    let readyCount = 0;
    const missingCounts = new Map<string, number>();
    for (const opp of allItems) {
      const f = computeOpportunitySkillFit(opp, assessments);
      if (f.readinessBand === 'ready-now') readyCount += 1;
      for (const m of f.missingSkills) {
        missingCounts.set(m, (missingCounts.get(m) || 0) + 1);
      }
    }
    const topMissing = Array.from(missingCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topMissing) {
      return `You are ready for ${readyCount} ${readyCount === 1 ? 'opportunity' : 'opportunities'} today. Learn or verify ${topMissing[0]} to unlock ${topMissing[1]} more.`;
    }
    return `You are ready for ${readyCount} opportunities today across ${profile.targetCareer}!`;
  }, [cachedOpportunities, assessments, profile.targetCareer]);

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    for (const { item } of enrichedItems) {
      for (const s of item.requiredSkills || []) set.add(s);
      for (const s of item.niceToHaveSkills || []) set.add(s);
    }
    return ['all', ...Array.from(set).sort()];
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedItems
      .filter(({ item, fit }) => {
        if (skillFilter !== 'all') {
          const hasSkill =
            (item.requiredSkills || []).some((s) => s.toLowerCase() === skillFilter.toLowerCase()) ||
            (item.niceToHaveSkills || []).some((s) => s.toLowerCase() === skillFilter.toLowerCase());
          if (!hasSkill) return false;
        }
        if (modeFilter !== 'all' && item.mode !== modeFilter) return false;
        if (costFilter !== 'all' && item.cost !== costFilter) return false;
        if (readinessFilter !== 'all' && fit.readinessBand !== readinessFilter) return false;
        if (q) {
          const blob = [
            item.title,
            item.organization,
            item.location,
            item.overview || '',
            ...(item.requiredSkills || []),
          ]
            .join(' ')
            .toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.fit.matchPercent - a.fit.matchPercent);
  }, [enrichedItems, searchQuery, skillFilter, modeFilter, costFilter, readinessFilter]);

  const showFallbackNotice =
    (activeTab === 'hackathon' && cachedOpportunities?.usedFallbackHackathons) ||
    (activeTab === 'internship' && cachedOpportunities?.usedFallbackInternships);

  const platformLinks = useMemo(
    () => buildPlatformSearchLinks(profile.targetCareer, profile.field),
    [profile.targetCareer, profile.field]
  );

  const handleOpenDetails = async (item: OpportunityItem, fit: OpportunitySkillFit) => {
    setDrawerItem(item);
    setDrawerExplanation('');
    setDrawerLoading(true);
    try {
      const explanation = await fetchOpportunityFitExplanation(item, profile, fit);
      setDrawerExplanation(explanation);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleAddMissing = async (item: OpportunityItem, missingSkills: string[]) => {
    if (missingSkills.length === 0) return;
    setActionError(null);
    setRoadmapToast(null);
    setAddingOppId(item.id);
    try {
      const res = await onAddMissingSkills(missingSkills, item.title);
      setRoadmapToast({
        title: `Added ${res.addedSkills.join(', ')} to your roadmap`,
        detail: `${res.addedCount} targeted module${res.addedCount === 1 ? '' : 's'} curated for "${item.title}" without disturbing completed steps.`,
      });
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not add missing skills to your roadmap right now. Please try again.'
      );
    } finally {
      setAddingOppId(null);
    }
  };

  const drawerFit = useMemo(() => {
    if (!drawerItem) return null;
    return computeOpportunitySkillFit(drawerItem, assessments);
  }, [drawerItem, assessments]);

  const tabMeta: Array<{ id: OpportunityTab; label: string; count: number }> = [
    {
      id: 'hackathon',
      label: 'Hackathons',
      count: cachedOpportunities?.hackathons.length ?? 0,
    },
    {
      id: 'internship',
      label: 'Internships',
      count: cachedOpportunities?.internships.length ?? 0,
    },
    {
      id: 'job_role',
      label: 'Job Roles',
      count: cachedOpportunities?.jobRoles.length ?? 0,
    },
    {
      id: 'saved',
      label: 'Saved',
      count: savedOpportunities.length,
    },
  ];

  const categoryLabel = (cat: OpportunityCategory) => {
    if (cat === 'hackathon') return 'Hackathon';
    if (cat === 'internship') return 'Internship';
    return 'Job Role';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Opportunities for you
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Real hackathons, internships, and career roles matched strictly against your verified
            skills.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 sm:w-72">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search opportunities or skills..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => void loadOpportunities(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            {isLoading ? 'Scouting...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Mentor Tip Banner + Live Agent Activity Toggle */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-indigo-800">Mentor Insight</p>
            <p className="text-sm text-slate-800 mt-0.5 leading-relaxed">{liveMentorTip}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {Object.keys(assessments).length === 0 && (
            <button
              type="button"
              onClick={onNavigateToAssess}
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap cursor-pointer"
            >
              Verify a Skill
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowActivityPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 whitespace-nowrap cursor-pointer"
          >
            <Activity className="h-3.5 w-3.5" />
            Live Agent Activity ({scoutActivityLog.length})
          </button>
        </div>
      </div>

      {/* Collapsible Live Agent Activity Panel */}
      {showActivityPanel && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Live Agent Activity Panel (Scout · Gap Analyst · Planner · Curator)
              </h2>
              <p className="text-xs text-slate-500">
                Persisted hand-offs logged while evaluating opportunities against your verified
                skills.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowActivityPanel(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Hide
            </button>
          </div>
          {scoutActivityLog.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {scoutActivityLog.slice(0, 12).map((entry) => (
                <div key={entry.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-indigo-700">
                      {entry.fromAgent} to {entry.toAgent}:
                    </span>{' '}
                    <span className="text-slate-700">{entry.message}</span>
                  </div>
                  <span className="text-slate-400 tabular-nums shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No Scout hand-offs recorded yet. Click Refresh to scout opportunities.
            </p>
          )}
        </div>
      )}

      {/* Success Toast when adding missing skills */}
      {roadmapToast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-900">{roadmapToast.title}</p>
              <p className="text-xs text-emerald-800 mt-0.5">{roadmapToast.detail}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onNavigateToRoadmap}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap cursor-pointer"
            >
              View Roadmap
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setRoadmapToast(null)}
              aria-label="Dismiss notification"
              className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {tabMeta.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSkillFilter('all');
                  }}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}{' '}
                  <span className="ml-1 text-[11px] font-mono text-slate-400 tabular-nums">
                    ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          {cachedOpportunities?.cachedAt && (
            <span className="text-xs text-slate-500 tabular-nums">
              Cached:{' '}
              {new Date(cachedOpportunities.cachedAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
          <select
            aria-label="Filter by skill"
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            {availableSkills.map((sk) => (
              <option key={sk} value={sk}>
                {sk === 'all' ? 'All skills' : sk}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by mode"
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as 'all' | OpportunityMode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">All modes (Online / Remote / Offline)</option>
            <option value="online">Online</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="offline">Offline</option>
          </select>

          <select
            aria-label="Filter by cost"
            value={costFilter}
            onChange={(e) => setCostFilter(e.target.value as 'all' | OpportunityCost)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">Any cost (Free / Paid)</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>

          <select
            aria-label="Filter by readiness"
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value as 'all' | ReadinessBand)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">All readiness levels</option>
            <option value="ready-now">Ready now</option>
            <option value="ready-soon">Ready in 4 weeks</option>
            <option value="stretch">Stretch goal</option>
          </select>
        </div>
      </div>

      {/* Friendly fallback notice when grounding is unavailable or returned zero verified links */}
      {showFallbackNotice && !isLoading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs font-medium text-amber-900">
            Showing popular opportunities while we refresh live ones. Every fallback listing uses a
            verified program URL.
          </p>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void loadOpportunities(true)}
            className="text-xs font-semibold text-amber-900 underline hover:text-amber-700 whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            Try live search again
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-100 bg-white p-5">
            <p className="text-sm font-semibold text-indigo-700 mb-3">
              Opportunity Scout is searching live listings and matching them against your verified
              skills...
            </p>
            <SkeletonRows count={3} />
          </div>
        </div>
      )}

      {/* Responsive Opportunities Grid */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredItems.map(({ item, fit }) => {
            const isSaved = savedIds.has(item.id);
            const isAdding = addingOppId === item.id;
            const matchBadgeClass =
              fit.matchPercent >= 70
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : fit.matchPercent >= 40
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-red-50 text-red-700 border-red-200';

            const readinessTextClass =
              fit.readinessBand === 'ready-now'
                ? 'text-emerald-700'
                : fit.readinessBand === 'ready-soon'
                  ? 'text-amber-700'
                  : 'text-slate-600';

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between gap-4 transition-all hover:border-indigo-200"
              >
                <div className="space-y-3.5">
                  {/* Top Meta + Match % + Bookmark */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-semibold text-indigo-700">
                          {categoryLabel(item.category)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{item.organization || 'Partner'}</span>
                        {item.isVerifiedFallback && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium">Verified source</span>
                          </>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-900 leading-snug">
                        {item.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-xl border px-2.5 py-1 text-xs font-bold tabular-nums ${matchBadgeClass}`}
                        title="Calculated strictly from your verified assessment scores"
                      >
                        {fit.matchPercent}% Match
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleSaveOpportunity(item)}
                        aria-label={isSaved ? `Remove ${item.title} from saved` : `Save ${item.title}`}
                        className={`rounded-xl border p-2 transition-colors cursor-pointer ${
                          isSaved
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Category-specific fields */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="capitalize truncate">
                        {item.mode} · {item.location || 'Not listed'}
                      </span>
                    </div>

                    {item.category !== 'job_role' && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          Deadline: {item.dateOrDeadline || 'Not listed'}
                        </span>
                      </div>
                    )}

                    {item.category === 'hackathon' && (
                      <div className="flex items-center gap-1.5 truncate col-span-2">
                        <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">
                          Prize: {item.prizeOrStipend || 'Not listed'}
                        </span>
                      </div>
                    )}

                    {item.category === 'internship' && (
                      <>
                        <div className="flex items-center gap-1.5 truncate">
                          <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Stipend: {item.prizeOrStipend || 'Not listed'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Compass className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Duration: {item.duration || 'Not listed'}
                          </span>
                        </div>
                      </>
                    )}

                    {item.category === 'job_role' && (
                      <div className="flex items-center gap-1.5 truncate col-span-1">
                        <Briefcase className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate">
                          {item.prizeOrStipend || 'Estimate: Market range'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Overview / Job Role Responsibilities */}
                  {item.overview && (
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {item.overview}
                    </p>
                  )}

                  {item.category === 'job_role' && (
                    <div className="space-y-2 text-xs">
                      {item.careerPath && item.careerPath.length > 0 && (
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">Career path: </span>
                          <span>{item.careerPath.join(' > ')}</span>
                        </div>
                      )}
                      {item.responsibilities && item.responsibilities.length > 0 && (
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                          {item.responsibilities.slice(0, 2).map((resp, idx) => (
                            <li key={idx}>{resp}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Skill Match Chips (Matched Green, Partial Amber, Missing Red) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">
                        Verified Skill Breakdown
                      </span>
                      <span className={`font-semibold tabular-nums ${readinessTextClass}`}>
                        {fit.readinessLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fit.matchedSkills.map((sk) => (
                        <span
                          key={`m-${sk}`}
                          className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                        >
                          ✓ {sk}
                        </span>
                      ))}
                      {fit.partialSkills.map((sk) => (
                        <span
                          key={`p-${sk}`}
                          className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                        >
                          ~ {sk}
                        </span>
                      ))}
                      {fit.missingSkills.map((sk) => (
                        <span
                          key={`x-${sk}`}
                          className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
                        >
                          ! {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isAdding || fit.missingSkills.length === 0}
                    onClick={() => void handleAddMissing(item, fit.missingSkills)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isAdding
                      ? 'Updating roadmap...'
                      : fit.missingSkills.length === 0
                        ? 'All skills verified'
                        : 'Add missing skills to my roadmap'}
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleOpenDetails(item, fit)}
                      className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
          <Layers className="h-9 w-9 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            {activeTab === 'saved'
              ? 'No saved opportunities yet'
              : 'No opportunities match your active filters'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {activeTab === 'saved'
              ? 'Bookmark any hackathon, internship, or job role across the other tabs to track it here.'
              : 'Try clearing a filter or searching live directly on the platforms below.'}
          </p>
          {activeTab !== 'saved' && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSkillFilter('all');
                setModeFilter('all');
                setCostFilter('all');
                setReadinessFilter('all');
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Always-visible "Search live on" Platform Row */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Search live on trusted platforms
            </h2>
            <p className="text-xs text-slate-500">
              Direct live searches pre-filled for <strong>{profile.targetCareer}</strong>
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 w-32 shrink-0">Hackathons:</span>
            {platformLinks
              .filter((l) => l.group === 'hackathon')
              .map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  {link.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 w-32 shrink-0">
              Internships &amp; Jobs:
            </span>
            {platformLinks
              .filter((l) => l.group === 'internship_job')
              .map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  {link.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
          </div>
        </div>
      </div>

      {/* Opportunity Details Side Drawer */}
      {drawerItem && drawerFit && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[1px]">
          <div
            className="fixed inset-0"
            onClick={() => setDrawerItem(null)}
            aria-hidden="true"
          />
          <aside
            aria-label="Opportunity Details"
            className="relative z-10 w-full max-w-lg bg-white border-l border-slate-200 h-full overflow-y-auto p-6 space-y-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold text-indigo-700">
                  {categoryLabel(drawerItem.category)} · {drawerItem.organization}
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  {drawerItem.title}
                </h2>
                <p className="text-xs text-slate-500 mt-1 capitalize">
                  {drawerItem.mode} · {drawerItem.location || 'Not listed'} ·{' '}
                  {drawerFit.matchPercent}% verified match ({drawerFit.readinessLabel})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerItem(null)}
                aria-label="Close details drawer"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Why this fits you (Mentor Agent) */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-800">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Why this fits you (AI Mentor)
              </div>
              {drawerLoading ? (
                <SkeletonRows count={2} />
              ) : (
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {drawerExplanation}
                </p>
              )}
            </div>

            {/* Full Description & Metadata */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700">Full Description</h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {drawerItem.overview || 'No additional description listed.'}
              </p>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                {drawerItem.dateOrDeadline && (
                  <div>
                    <span className="text-slate-500 block">Date / Deadline</span>
                    <strong className="text-slate-900">{drawerItem.dateOrDeadline}</strong>
                  </div>
                )}
                {drawerItem.prizeOrStipend && (
                  <div>
                    <span className="text-slate-500 block">
                      {drawerItem.category === 'job_role'
                        ? 'Salary Range'
                        : drawerItem.category === 'hackathon'
                          ? 'Prize'
                          : 'Stipend'}
                    </span>
                    <strong className="text-slate-900">{drawerItem.prizeOrStipend}</strong>
                  </div>
                )}
                {drawerItem.duration && (
                  <div>
                    <span className="text-slate-500 block">Duration</span>
                    <strong className="text-slate-900">{drawerItem.duration}</strong>
                  </div>
                )}
                {drawerItem.sourceLabel && (
                  <div>
                    <span className="text-slate-500 block">Source Verification</span>
                    <strong className="text-emerald-700">{drawerItem.sourceLabel}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Job Role Responsibilities & Career Path */}
            {drawerItem.category === 'job_role' && (
              <div className="space-y-4">
                {drawerItem.careerPath && drawerItem.careerPath.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">Career Path</h3>
                    <p className="text-sm font-medium text-indigo-800">
                      {drawerItem.careerPath.join('  >  ')}
                    </p>
                  </div>
                )}
                {drawerItem.experienceLevels && drawerItem.experienceLevels.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">Experience Levels</h3>
                    <p className="text-xs text-slate-700">
                      {drawerItem.experienceLevels.join(' · ')}
                    </p>
                  </div>
                )}
                {drawerItem.responsibilities && drawerItem.responsibilities.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">
                      Daily Responsibilities
                    </h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                      {drawerItem.responsibilities.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Required Skills */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700">Required Skills vs Your Verified Scores</h3>
              <div className="flex flex-wrap gap-1.5">
                {drawerFit.matchedSkills.map((s) => (
                  <span
                    key={`dm-${s}`}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                  >
                    ✓ {s} (Matched)
                  </span>
                ))}
                {drawerFit.partialSkills.map((s) => (
                  <span
                    key={`dp-${s}`}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                  >
                    ~ {s} (Partial)
                  </span>
                ))}
                {drawerFit.missingSkills.map((s) => (
                  <span
                    key={`dx-${s}`}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                  >
                    ! {s} (Missing)
                  </span>
                ))}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={addingOppId === drawerItem.id || drawerFit.missingSkills.length === 0}
                onClick={() => void handleAddMissing(drawerItem, drawerFit.missingSkills)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-45 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {addingOppId === drawerItem.id
                  ? 'Adding...'
                  : drawerFit.missingSkills.length === 0
                    ? 'All skills verified'
                    : 'Add missing skills to my roadmap'}
              </button>

              {drawerItem.sourceUrl && (
                <a
                  href={drawerItem.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Apply / View Source
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
