import React, { useCallback, useEffect, useState } from 'react';
import {
  BookMarked,
  Briefcase,
  ClipboardCheck,
  Globe,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Target,
  UserCog,
} from 'lucide-react';
import {
  ActivityLogEntry,
  AppLanguage,
  CachedOpportunitiesState,
  ChatbotMode,
  ChatbotRole,
  LearnerProfile,
  LearnerWorkspace,
  MentorMessage,
  OpportunityItem,
  ScoutActivityEntry,
  SkillAssessmentResult,
  SkillLevel,
} from './types/skillpilot';
import { createEmptyWorkspace } from './constants/presets';
import { SUPPORTED_LANGUAGES, getStrings } from './constants/i18n';
import {
  addMissingSkillsToRoadmap,
  analyzeAndCurate,
  fetchWorkspaceFromServer,
  getActiveLearnerId,
  loadLocalWorkspace,
  saveWorkspaceToServer,
  sendMentorChat,
  setActiveLearnerId,
  triggerAdaptiveReplan,
} from './services/skillpilotApi';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OverviewDashboard } from './components/OverviewDashboard';
import { SkillAssessmentView } from './components/SkillAssessmentView';
import { CareerMatchView } from './components/CareerMatchView';
import { RoadmapView } from './components/RoadmapView';
import { CatalogView } from './components/CatalogView';
import { OpportunitiesView } from './components/OpportunitiesView';
import { MentorChatView } from './components/MentorChatView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { SkeletonRows } from './components/ui/StateBlocks';
import { NexPathLogo } from './components/ui/NexPathLogo';

type ActiveTab =
  | 'overview'
  | 'assess'
  | 'match'
  | 'roadmap'
  | 'catalog'
  | 'opportunities'
  | 'mentor'
  | 'profile';

function updateStreak(prevStreak: number, lastDate: string): { streakDays: number; lastActiveDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (lastDate === today) {
    return { streakDays: Math.max(1, prevStreak), lastActiveDate: today };
  }
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (lastDate === yesterday) {
    return { streakDays: prevStreak + 1, lastActiveDate: today };
  }
  return { streakDays: 1, lastActiveDate: today };
}

function makeLog(
  type: ActivityLogEntry['type'],
  title: string,
  detail: string
): ActivityLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    detail,
    timestamp: new Date().toISOString(),
  };
}

function resolveInitialTab(): ActiveTab {
  if (typeof window === 'undefined') return 'overview';
  const pathSlug = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const hashSlug = window.location.hash.replace(/^#/, '').toLowerCase();
  const slug = pathSlug || hashSlug;
  const validTabs: ActiveTab[] = [
    'overview',
    'assess',
    'match',
    'roadmap',
    'opportunities',
    'catalog',
    'mentor',
    'profile',
  ];
  return validTabs.includes(slug as ActiveTab) ? (slug as ActiveTab) : 'overview';
}

export default function App() {
  const [workspace, setWorkspace] = useState<LearnerWorkspace | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [activeTab, setActiveTabState] = useState<ActiveTab>(resolveInitialTab);
  const [preselectedAssessSkill, setPreselectedAssessSkill] = useState<string | null>(null);
  const [mentorInitialPrompt, setMentorInitialPrompt] = useState<string | null>(null);

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'overview' ? '/' : `/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveTabState(resolveInitialTab());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [matchRefreshing, setMatchRefreshing] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [mentorSending, setMentorSending] = useState(false);
  const [mentorError, setMentorError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      const id = getActiveLearnerId();
      const serverWs = await fetchWorkspaceFromServer(id);
      const localWs = loadLocalWorkspace(id);
      const raw = serverWs || localWs || createEmptyWorkspace(id);
      const chosen: LearnerWorkspace = {
        ...raw,
        profile: {
          ...raw.profile,
          field: raw.profile.field || 'Technology & Data',
          preferredLanguage: raw.profile.preferredLanguage || 'en',
        },
        savedOpportunities: raw.savedOpportunities || [],
        cachedOpportunities: raw.cachedOpportunities || null,
        scoutActivityLog: raw.scoutActivityLog || [],
      };
      if (active) {
        setWorkspace(chosen);
        setBootLoading(false);
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, []);

  const persistWorkspace = useCallback(async (next: LearnerWorkspace) => {
    setWorkspace(next);
    await saveWorkspaceToServer(next);
  }, []);

  const handleLanguageChange = useCallback(
    (language: AppLanguage) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const next: LearnerWorkspace = {
          ...prev,
          profile: {
            ...prev.profile,
            preferredLanguage: language,
            updatedAt: new Date().toISOString(),
          },
        };
        void saveWorkspaceToServer(next);
        return next;
      });
    },
    []
  );

  const handleOnboardingComplete = async (completedProfile: LearnerProfile) => {
    if (!workspace) return;
    setOnboardingError(null);
    setOnboardingSubmitting(true);
    try {
      const { analysis, roadmap } = await analyzeAndCurate(completedProfile, workspace.assessments);
      const now = new Date().toISOString();
      const next: LearnerWorkspace = {
        ...workspace,
        profile: completedProfile,
        analysis,
        roadmap,
        progress: {
          ...workspace.progress,
          readinessHistory: [
            {
              label: 'Baseline',
              score: analysis.jobReadinessScore,
              date: now,
            },
          ],
          activityLog: [
            makeLog(
              'onboarding',
              `Initialized plan for ${completedProfile.targetCareer}`,
              `${roadmap.length} weekly modules curated · Baseline readiness ${analysis.jobReadinessScore}%`
            ),
            ...workspace.progress.activityLog,
          ],
        },
      };
      await persistWorkspace(next);
      setActiveTab('overview');
    } catch (err) {
      setOnboardingError(
        err instanceof Error
          ? err.message
          : 'Could not generate your initial roadmap. Please try again.'
      );
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handleAddClaimedSkill = (skillName: string, level: SkillLevel) => {
    if (!workspace) return;
    const exists = workspace.profile.existingSkills.some(
      (s) => s.name.toLowerCase() === skillName.toLowerCase()
    );
    if (exists) return;
    const updated: LearnerWorkspace = {
      ...workspace,
      profile: {
        ...workspace.profile,
        existingSkills: [...workspace.profile.existingSkills, { name: skillName, claimedLevel: level }],
        updatedAt: new Date().toISOString(),
      },
    };
    void persistWorkspace(updated);
  };

  const handleAssessmentComplete = async (result: SkillAssessmentResult) => {
    if (!workspace) return;
    const nextAssessments = {
      ...workspace.assessments,
      [result.skill]: result,
    };

    // Update skill score in current analysis if present
    let nextAnalysis = workspace.analysis;
    if (nextAnalysis) {
      const updatedSkills = nextAnalysis.skills.map((s) => {
        if (s.skill.toLowerCase() !== result.skill.toLowerCase()) return s;
        const status: 'strong' | 'developing' | 'gap' =
          result.verifiedScore >= s.requiredScore - 5
            ? 'strong'
            : result.verifiedScore >= s.requiredScore - 25
              ? 'developing'
              : 'gap';
        return {
          ...s,
          currentScore: result.verifiedScore,
          status,
          note: `Verified via adaptive assessment (${result.verifiedScore}/100 · ${result.verifiedLevel}).`,
        };
      });

      const avgCurrent =
        updatedSkills.length > 0
          ? Math.round(
              updatedSkills.reduce(
                (acc, s) => acc + Math.min(100, (s.currentScore / Math.max(1, s.requiredScore)) * 100),
                0
              ) / updatedSkills.length
            )
          : nextAnalysis.jobReadinessScore;

      nextAnalysis = {
        ...nextAnalysis,
        jobReadinessScore: Math.max(0, Math.min(100, avgCurrent)),
        skills: updatedSkills,
        analyzedAt: new Date().toISOString(),
      };
    }

    let nextRoadmap = workspace.roadmap;
    let nextNotices = workspace.adaptiveNotices;
    let nextMentorHistory = workspace.mentorHistory;
    const logs: ActivityLogEntry[] = [
      makeLog(
        'assessment',
        `Verified ${result.skill}: ${result.verifiedScore}/100`,
        `Claimed ${result.claimedLevel} → Verified ${result.verifiedLevel}`
      ),
    ];

    // Automatic Adaptive Re-planning on < 50% or > 85%
    if (result.verifiedScore < 50 || result.verifiedScore > 85) {
      try {
        const triggerType = result.verifiedScore < 50 ? 'low-score' : 'high-score';
        const replanned = await triggerAdaptiveReplan({
          trigger: triggerType,
          skill: result.skill,
          score: result.verifiedScore,
          profile: workspace.profile,
          roadmap: nextRoadmap,
        });
        nextRoadmap = replanned.updatedRoadmap;
        nextNotices = [replanned.notice, ...nextNotices];
        nextMentorHistory = [
          ...nextMentorHistory,
          {
            id: `mentor-replan-${Date.now()}`,
            role: 'assistant',
            content: replanned.notice.message,
            timestamp: new Date().toISOString(),
            appliedAction: replanned.notice.title,
          },
        ];
        logs.unshift(
          makeLog('replan', replanned.notice.title, replanned.notice.message)
        );
      } catch {
        // Non-fatal if replan helper hiccups; assessment is still saved
      }
    }

    const streak = updateStreak(
      workspace.progress.streakDays,
      workspace.progress.lastActiveDate
    );

    const historyPoint = {
      id: `q-${Date.now()}`,
      date: result.completedAt,
      label: `${result.skill} #${workspace.progress.quizHistory.length + 1}`,
      skill: result.skill,
      score: result.verifiedScore,
      readinessAfter: nextAnalysis?.jobReadinessScore ?? 50,
    };

    const nextWorkspace: LearnerWorkspace = {
      ...workspace,
      assessments: nextAssessments,
      analysis: nextAnalysis,
      roadmap: nextRoadmap,
      adaptiveNotices: nextNotices,
      mentorHistory: nextMentorHistory,
      progress: {
        ...workspace.progress,
        ...streak,
        quizHistory: [...workspace.progress.quizHistory, historyPoint],
        activityLog: [...logs, ...workspace.progress.activityLog],
      },
    };

    await persistWorkspace(nextWorkspace);
  };

  const handleRefreshAnalysis = async () => {
    if (!workspace) return;
    setMatchError(null);
    setMatchRefreshing(true);
    try {
      const { analysis, roadmap } = await analyzeAndCurate(
        workspace.profile,
        workspace.assessments
      );
      const next: LearnerWorkspace = {
        ...workspace,
        analysis,
        roadmap: workspace.roadmap.length > 0 ? workspace.roadmap : roadmap,
        progress: {
          ...workspace.progress,
          activityLog: [
            makeLog(
              'goal',
              `Refreshed career match for ${workspace.profile.targetCareer}`,
              `Job readiness: ${analysis.jobReadinessScore}% · Estimated ${analysis.estimatedWeeksToReady} weeks`
            ),
            ...workspace.progress.activityLog,
          ],
        },
      };
      await persistWorkspace(next);
    } catch (err) {
      setMatchError(
        err instanceof Error ? err.message : 'Unable to refresh career match analysis.'
      );
    } finally {
      setMatchRefreshing(false);
    }
  };

  const handleToggleStepComplete = (stepId: string) => {
    if (!workspace) return;
    let toggledStepTitle = '';
    let newCompletedState = false;
    const nextRoadmap = workspace.roadmap.map((step) => {
      if (step.id !== stepId) return step;
      toggledStepTitle = step.focusTitle;
      newCompletedState = !step.completed;
      return { ...step, completed: newCompletedState };
    });

    const completedCount = nextRoadmap.filter((s) => s.completed).length;
    const streak = updateStreak(
      workspace.progress.streakDays,
      workspace.progress.lastActiveDate
    );

    const nextWorkspace: LearnerWorkspace = {
      ...workspace,
      roadmap: nextRoadmap,
      progress: {
        ...workspace.progress,
        ...streak,
        activityLog: newCompletedState
          ? [
              makeLog(
                'roadmap',
                `Completed module: ${toggledStepTitle}`,
                `${completedCount} of ${nextRoadmap.length} roadmap steps finished`
              ),
              ...workspace.progress.activityLog,
            ]
          : workspace.progress.activityLog,
      },
    };
    void persistWorkspace(nextWorkspace);
  };

  const handleDismissNotice = (id: string) => {
    if (!workspace) return;
    void persistWorkspace({
      ...workspace,
      adaptiveNotices: workspace.adaptiveNotices.filter((n) => n.id !== id),
    });
  };

  const handleAppendVoiceMessage = useCallback(
    (msg: MentorMessage) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const next: LearnerWorkspace = {
          ...prev,
          mentorHistory: [...prev.mentorHistory, msg],
        };
        void saveWorkspaceToServer(next);
        return next;
      });
    },
    []
  );

  const handleSendMentorMessage = async (
    message: string,
    options?: { role: ChatbotRole; mode: ChatbotMode }
  ) => {
    if (!workspace) return;
    setMentorError(null);
    setMentorSending(true);

    const role = options?.role || 'mentor';
    const mode = options?.mode || 'balanced';
    const roleLabelMap: Record<ChatbotRole, string> = {
      mentor: 'Study Mentor',
      interviewer: 'Mock Interviewer',
      tutor: 'Concept Tutor',
    };

    const userMsg: MentorMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    const optimisticHistory = [...workspace.mentorHistory, userMsg];
    setWorkspace({ ...workspace, mentorHistory: optimisticHistory });

    try {
      const mentorResp = await sendMentorChat({
        message,
        history: workspace.mentorHistory.map((m) => ({ role: m.role, content: m.content })),
        role,
        mode,
        language: workspace.profile.preferredLanguage,
        workspaceContext: {
          profile: {
            name: workspace.profile.name,
            field: workspace.profile.field,
            preferredLanguage: workspace.profile.preferredLanguage,
            educationOrRole: workspace.profile.educationOrRole,
            targetCareer: workspace.profile.targetCareer,
            weeklyHours: workspace.profile.weeklyHours,
            budget: workspace.profile.budget,
            preferredFormat: workspace.profile.preferredFormat,
            existingSkills: workspace.profile.existingSkills,
          },
          assessments: Object.fromEntries(
            Object.entries(workspace.assessments).map(([k, v]) => [
              k,
              {
                claimedLevel: v.claimedLevel,
                verifiedLevel: v.verifiedLevel,
                verifiedScore: v.verifiedScore,
              },
            ])
          ),
          analysis: workspace.analysis,
          roadmap: workspace.roadmap.map((s) => ({
            id: s.id,
            week: s.week,
            skill: s.skill,
            focusTitle: s.focusTitle,
            targetLevel: s.targetLevel,
            estimatedHours: s.estimatedHours,
            completed: s.completed,
          })),
        },
      });

      let nextRoadmap = workspace.roadmap;
      let nextProfile = workspace.profile;
      let nextNotices = workspace.adaptiveNotices;
      let appliedAction: string | undefined;
      const extraLogs: ActivityLogEntry[] = [];

      if (mentorResp.shouldReplan && mentorResp.replanInstruction) {
        const replanned = await triggerAdaptiveReplan({
          trigger: 'mentor-command',
          instruction: mentorResp.replanInstruction,
          profile: workspace.profile,
          roadmap: workspace.roadmap,
        });
        nextRoadmap = replanned.updatedRoadmap;
        if (replanned.newWeeklyHours) {
          nextProfile = {
            ...nextProfile,
            weeklyHours: replanned.newWeeklyHours,
            updatedAt: new Date().toISOString(),
          };
        }
        nextNotices = [replanned.notice, ...nextNotices];
        appliedAction = replanned.notice.title;
        extraLogs.push(
          makeLog('replan', replanned.notice.title, replanned.notice.message)
        );
      }

      const assistantMsg: MentorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: mentorResp.reply,
        timestamp: new Date().toISOString(),
        appliedAction,
        roleLabel: roleLabelMap[role],
        modelUsed: mentorResp.modelUsed,
      };

      const finalWorkspace: LearnerWorkspace = {
        ...workspace,
        profile: nextProfile,
        roadmap: nextRoadmap,
        adaptiveNotices: nextNotices,
        mentorHistory: [...optimisticHistory, assistantMsg],
        progress: {
          ...workspace.progress,
          activityLog: [...extraLogs, ...workspace.progress.activityLog],
        },
      };
      await persistWorkspace(finalWorkspace);
    } catch (err) {
      setMentorError(
        err instanceof Error ? err.message : 'Mentor is temporarily unavailable. Please try again.'
      );
    } finally {
      setMentorSending(false);
    }
  };

  const handleSaveProfileAndReplan = async (
    updatedProfile: LearnerProfile,
    goalChanged: boolean
  ) => {
    if (!workspace) return;
    setProfileError(null);
    setProfileSaving(true);
    try {
      if (goalChanged) {
        const { analysis, roadmap } = await analyzeAndCurate(
          updatedProfile,
          workspace.assessments
        );
        const notice = {
          id: `notice-goal-${Date.now()}`,
          trigger: 'goal-change' as const,
          title: `Roadmap re-planned for ${updatedProfile.targetCareer}`,
          message: `Recalculated skill gaps and curated ${roadmap.length} prerequisite-ordered modules aligned to ${updatedProfile.targetCareer}.`,
          createdAt: new Date().toISOString(),
        };
        const next: LearnerWorkspace = {
          ...workspace,
          profile: updatedProfile,
          analysis,
          roadmap,
          adaptiveNotices: [notice, ...workspace.adaptiveNotices],
          progress: {
            ...workspace.progress,
            activityLog: [
              makeLog('goal', notice.title, notice.message),
              ...workspace.progress.activityLog,
            ],
          },
        };
        await persistWorkspace(next);
      } else {
        await persistWorkspace({
          ...workspace,
          profile: updatedProfile,
        });
      }
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not update profile and roadmap.'
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpdateCachedOpportunities = useCallback(
    (cache: CachedOpportunitiesState, scoutLogs: ScoutActivityEntry[]) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const mergedScoutLogs = [...scoutLogs, ...(prev.scoutActivityLog || [])].slice(0, 40);
        const next: LearnerWorkspace = {
          ...prev,
          cachedOpportunities: cache,
          scoutActivityLog: mergedScoutLogs,
        };
        void saveWorkspaceToServer(next);
        return next;
      });
    },
    []
  );

  const handleToggleSaveOpportunity = useCallback((item: OpportunityItem) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const existing = prev.savedOpportunities || [];
      const isAlreadySaved = existing.some((s) => s.id === item.id);
      const nextSaved = isAlreadySaved
        ? existing.filter((s) => s.id !== item.id)
        : [item, ...existing];
      const nextLog: ActivityLogEntry = makeLog(
        'opportunity',
        isAlreadySaved ? `Removed saved opportunity: ${item.title}` : `Saved opportunity: ${item.title}`,
        `${item.organization} · ${item.category}`
      );
      const next: LearnerWorkspace = {
        ...prev,
        savedOpportunities: nextSaved,
        progress: {
          ...prev.progress,
          activityLog: [nextLog, ...prev.progress.activityLog],
        },
      };
      void saveWorkspaceToServer(next);
      return next;
    });
  }, []);

  const handleAddOpportunityMissingSkills = useCallback(
    async (
      missingSkills: string[],
      opportunityTitle: string
    ): Promise<{ addedCount: number; addedSkills: string[] }> => {
      if (!workspace) {
        throw new Error('Workspace not ready.');
      }
      const res = await addMissingSkillsToRoadmap({
        missingSkills,
        opportunityTitle,
        profile: workspace.profile,
        existingRoadmap: workspace.roadmap,
      });

      const next: LearnerWorkspace = {
        ...workspace,
        roadmap: res.updatedRoadmap,
        adaptiveNotices: [res.notice, ...workspace.adaptiveNotices],
        scoutActivityLog: [...res.scoutLogs, ...(workspace.scoutActivityLog || [])].slice(0, 40),
        progress: {
          ...workspace.progress,
          activityLog: [
            makeLog(
              'opportunity',
              `Added ${res.addedSkills.join(', ')} from "${opportunityTitle}"`,
              `${res.addedCount} roadmap module(s) curated by Planner & Curator`
            ),
            ...workspace.progress.activityLog,
          ],
        },
      };
      await persistWorkspace(next);
      return { addedCount: res.addedCount, addedSkills: res.addedSkills };
    },
    [workspace, persistWorkspace]
  );

  const handleResetWorkspace = () => {
    const currentLang = workspace?.profile.preferredLanguage || 'en';
    const newId = `learner-${Date.now()}`;
    setActiveLearnerId(newId);
    const fresh = createEmptyWorkspace(newId, currentLang);
    setWorkspace(fresh);
    setActiveTab('overview');
  };

  if (bootLoading || !workspace) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <NexPathLogo size="lg" />
        </div>
        <SkeletonRows count={4} />
      </div>
    );
  }

  if (!workspace.profile.onboardingComplete) {
    return (
      <OnboardingWizard
        initialProfile={workspace.profile}
        onComplete={handleOnboardingComplete}
        onLanguageChange={handleLanguageChange}
        isSubmitting={onboardingSubmitting}
        submitError={onboardingError}
      />
    );
  }

  const strings = getStrings(workspace.profile.preferredLanguage);

  const navItems: Array<{ id: ActiveTab; label: string; Icon: React.ElementType }> = [
    { id: 'overview', label: strings.navOverview, Icon: LayoutDashboard },
    { id: 'assess', label: strings.navAssess, Icon: ClipboardCheck },
    { id: 'match', label: strings.navMatch, Icon: Target },
    { id: 'roadmap', label: strings.navRoadmap, Icon: MapIcon },
    { id: 'opportunities', label: strings.navOpportunities, Icon: Briefcase },
    { id: 'catalog', label: strings.navCatalog, Icon: BookMarked },
    { id: 'mentor', label: strings.navMentor, Icon: MessageSquare },
    { id: 'profile', label: strings.navProfile, Icon: UserCog },
  ];

  const mobilePrimaryTabs: Array<{ id: ActiveTab; label: string; Icon: React.ElementType }> = [
    { id: 'overview', label: strings.navOverview.split(' ')[0], Icon: LayoutDashboard },
    { id: 'assess', label: strings.navAssess.split(' ')[0], Icon: ClipboardCheck },
    { id: 'roadmap', label: strings.navRoadmap.split(' ')[0], Icon: MapIcon },
    { id: 'opportunities', label: strings.navOpportunities.split(' ')[0], Icon: Briefcase },
    { id: 'mentor', label: strings.navMentor.split(' ')[0], Icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center px-5 border-b border-slate-200">
          <NexPathLogo size="md" />
        </div>

        <nav className="flex-1 p-4 space-y-1" aria-label="Primary Navigation">
          {navItems.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
              <Globe className="h-3.5 w-3.5 text-indigo-600" />
              {strings.languageLabel}
            </span>
            <select
              aria-label={strings.languageLabel}
              value={workspace.profile.preferredLanguage}
              onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-full text-left rounded-xl bg-slate-50 p-3 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <p className="text-sm font-semibold text-slate-900 truncate">
              {workspace.profile.name}
            </p>
            <p className="text-xs text-indigo-700 font-medium truncate mt-0.5">
              {workspace.profile.field}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {workspace.profile.targetCareer}
            </p>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Header */}
      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <NexPathLogo size="sm" />
        <div className="flex items-center gap-2.5">
          <select
            aria-label={strings.languageLabel}
            value={workspace.profile.preferredLanguage}
            onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setActiveTab('match')}
            className={`text-xs font-semibold cursor-pointer ${
              activeTab === 'match' ? 'text-indigo-600' : 'text-slate-600'
            }`}
          >
            {strings.navMatch.split(' ')[0]}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`text-xs font-semibold cursor-pointer ${
              activeTab === 'catalog' ? 'text-indigo-600' : 'text-slate-600'
            }`}
          >
            {strings.navCatalog.split(' ')[0]}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`text-xs font-semibold cursor-pointer ${
              activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-600'
            }`}
          >
            {strings.navProfile.split(' ')[0]}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 pb-20 lg:pb-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activeTab === 'overview' && (
            <OverviewDashboard
              workspace={workspace}
              onNavigate={(tab) => setActiveTab(tab)}
              onDismissNotice={handleDismissNotice}
            />
          )}

          {activeTab === 'assess' && (
            <SkillAssessmentView
              workspace={workspace}
              preselectedSkill={preselectedAssessSkill}
              onAssessmentComplete={handleAssessmentComplete}
              onAddClaimedSkill={handleAddClaimedSkill}
            />
          )}

          {activeTab === 'match' && (
            <CareerMatchView
              workspace={workspace}
              isRefreshing={matchRefreshing}
              error={matchError}
              onRefreshAnalysis={handleRefreshAnalysis}
              onAssessSkill={(skill) => {
                setPreselectedAssessSkill(skill);
                setActiveTab('assess');
              }}
            />
          )}

          {activeTab === 'roadmap' && (
            <RoadmapView
              workspace={workspace}
              onToggleStepComplete={handleToggleStepComplete}
              onDismissNotice={handleDismissNotice}
              onAskMentorAboutStep={(skill) => {
                setMentorInitialPrompt(
                  `Give me practical study tips and key concepts to focus on for ${skill} in my roadmap.`
                );
                setActiveTab('mentor');
              }}
            />
          )}

          {activeTab === 'opportunities' && (
            <OpportunitiesView
              workspace={workspace}
              onUpdateCachedOpportunities={handleUpdateCachedOpportunities}
              onToggleSaveOpportunity={handleToggleSaveOpportunity}
              onAddMissingSkills={handleAddOpportunityMissingSkills}
              onNavigateToRoadmap={() => setActiveTab('roadmap')}
              onNavigateToAssess={() => setActiveTab('assess')}
            />
          )}

          {activeTab === 'catalog' && <CatalogView />}

          {activeTab === 'mentor' && (
            <MentorChatView
              workspace={workspace}
              initialPrompt={mentorInitialPrompt}
              onClearInitialPrompt={() => setMentorInitialPrompt(null)}
              onSendMessage={handleSendMentorMessage}
              onAppendVoiceMessage={handleAppendVoiceMessage}
              isSending={mentorSending}
              error={mentorError}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileSettingsView
              profile={workspace.profile}
              onSaveAndReplan={handleSaveProfileAndReplan}
              onResetWorkspace={handleResetWorkspace}
              isSaving={profileSaving}
              error={profileError}
            />
          )}
        </div>
        <footer className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 pb-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">NexPath · Your next path, planned by AI.</span>
          <span>Personalized Learning &amp; Career Readiness</span>
        </footer>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white grid grid-cols-5"
      >
        {mobilePrimaryTabs.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-medium cursor-pointer ${
                active ? 'text-indigo-600 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4.5 w-4.5 mb-0.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
