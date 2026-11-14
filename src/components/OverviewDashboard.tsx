import React from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  Map as MapIcon,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LearnerWorkspace } from '../types/skillpilot';
import { getStrings } from '../constants/i18n';

interface OverviewDashboardProps {
  workspace: LearnerWorkspace;
  onNavigate: (
    tab:
      | 'overview'
      | 'assess'
      | 'match'
      | 'roadmap'
      | 'catalog'
      | 'opportunities'
      | 'mentor'
      | 'profile'
  ) => void;
  onDismissNotice: (id: string) => void;
}

export function OverviewDashboard({
  workspace,
  onNavigate,
  onDismissNotice,
}: OverviewDashboardProps) {
  const { profile, assessments, analysis, roadmap, progress, adaptiveNotices } = workspace;
  const strings = getStrings(profile.preferredLanguage);

  const totalSteps = roadmap.length;
  const completedSteps = roadmap.filter((s) => s.completed).length;
  const roadmapPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const verifiedCount = Object.keys(assessments).length;
  const readiness = analysis?.jobReadinessScore ?? 0;

  const assessmentList = Object.values(assessments);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {strings.welcomeBack}, {profile.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {profile.field ? (
              <>
                <span className="font-medium text-indigo-700">{profile.field}</span> ·{' '}
              </>
            ) : null}
            <strong className="text-slate-900">{profile.targetCareer}</strong> ·{' '}
            <span className="tabular-nums">{profile.weeklyHours} hrs/week</span> ·{' '}
            {profile.budget === 'free-only' ? 'Free resources' : 'Free & paid'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('assess')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardCheck className="h-4 w-4" />
            {strings.verifyASkill}
          </button>
        </div>
      </div>

      {/* Adaptive Re-planning Notices */}
      {adaptiveNotices.length > 0 && (
        <div className="space-y-3">
          {adaptiveNotices.slice(0, 2).map((notice) => (
            <div
              key={notice.id}
              className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                  <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">{notice.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('roadmap')}
                  className="text-xs font-semibold text-indigo-700 hover:underline whitespace-nowrap cursor-pointer"
                >
                  View updated plan
                </button>
                <button
                  type="button"
                  onClick={() => onDismissNotice(notice.id)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{strings.jobReadiness}</span>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {readiness}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {analysis ? `Est. ${analysis.estimatedWeeksToReady} weeks to target` : 'Run career analysis'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{strings.roadmapProgress}</span>
            <MapIcon className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {completedSteps}/{totalSteps}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${roadmapPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{strings.learningStreak}</span>
            <Flame className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {progress.streakDays} {progress.streakDays === 1 ? 'day' : 'days'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Consistent study builds momentum
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{strings.skillsVerified}</span>
            <Award className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {verifiedCount}/{profile.existingSkills.length || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {verifiedCount === 0
              ? 'Take an adaptive quiz to verify'
              : 'Claimed vs verified benchmarked'}
          </p>
        </div>
      </div>

      {/* Main Content Split: Quiz History Chart + Claimed vs Verified Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Quiz Score &amp; Readiness History
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tracks verified assessment scores and job readiness over time
              </p>
            </div>
          </div>

          {progress.quizHistory.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progress.quizHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name="Verified Score (%)"
                    stroke="#4F46E5"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#4F46E5' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="readinessAfter"
                    name="Job Readiness (%)"
                    stroke="#16A34A"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#16A34A' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <ClipboardCheck className="h-9 w-9 text-slate-400 mb-2.5" />
              <p className="text-sm font-semibold text-slate-800">No assessments completed yet</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Complete your first 5-question adaptive skill quiz and practical task to chart your
                verified score history.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('assess')}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Start First Assessment
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Skills Verified Over Time
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Claimed self-rating vs verified assessment result
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('match')}
              className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              Full gap chart
            </button>
          </div>

          {assessmentList.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {assessmentList.map((item) => {
                const isStrong = item.verifiedScore >= 75;
                const isLow = item.verifiedScore < 50;
                return (
                  <div key={item.skill} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.skill}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Claimed: {item.claimedLevel} → Verified: {item.verifiedLevel}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          isStrong
                            ? 'text-emerald-700'
                            : isLow
                              ? 'text-red-600'
                              : 'text-amber-700'
                        }`}
                      >
                        {item.verifiedScore}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                Your claimed skills are waiting for verification
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {profile.existingSkills.map((s) => s.name).join(' · ') || 'No claimed skills yet'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('assess')}
                className="mt-4 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Go to Skill Assessment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Recent Activity Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persisted timeline of assessments, roadmap completions, and adaptive updates
            </p>
          </div>
        </div>

        {progress.activityLog.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {progress.activityLog.slice(0, 8).map((entry) => (
              <div key={entry.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                    <p className="text-xs text-slate-500">{entry.detail}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">
                  {new Date(entry.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No activity logged yet.</p>
        )}
      </div>
    </div>
  );
}
