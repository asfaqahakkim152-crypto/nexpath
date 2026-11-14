import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Compass,
  RefreshCw,
  Target,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LearnerWorkspace } from '../types/skillpilot';
import { AgentLoadingBanner, FriendlyErrorCard } from './ui/StateBlocks';

interface CareerMatchViewProps {
  workspace: LearnerWorkspace;
  isRefreshing: boolean;
  error: string | null;
  onRefreshAnalysis: () => Promise<void>;
  onAssessSkill: (skill: string) => void;
}

export function CareerMatchView({
  workspace,
  isRefreshing,
  error,
  onRefreshAnalysis,
  onAssessSkill,
}: CareerMatchViewProps) {
  const [chartType, setChartType] = useState<'radar' | 'bar'>('radar');
  const { analysis, profile } = workspace;

  if (isRefreshing) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Skill Analysis &amp; Career Match
        </h1>
        <AgentLoadingBanner
          agentName="Gap Analyst Agent"
          taskDescription={`Evaluating your verified skills against "${profile.targetCareer}" benchmarks...`}
        />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Skill Analysis &amp; Career Match
        </h1>
        {error && <FriendlyErrorCard message={error} onRetry={onRefreshAnalysis} />}
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
          <Compass className="h-10 w-10 text-indigo-600 mx-auto" />
          <h2 className="font-display text-lg font-bold text-slate-900">
            No career gap analysis generated yet
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Run the Gap Analyst Agent to compare your current capabilities against{' '}
            <strong>{profile.targetCareer}</strong>.
          </p>
          <button
            type="button"
            onClick={onRefreshAnalysis}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Analyze Career Match
          </button>
        </div>
      </div>
    );
  }

  const strongCount = analysis.skills.filter((s) => s.status === 'strong').length;
  const developingCount = analysis.skills.filter((s) => s.status === 'developing').length;
  const gapCount = analysis.skills.filter((s) => s.status === 'gap').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Skill Analysis &amp; Career Match
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Benchmarked against <strong className="text-slate-900">{analysis.targetCareer}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshAnalysis}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recalculate Match
        </button>
      </div>

      {error && <FriendlyErrorCard message={error} onRetry={onRefreshAnalysis} />}

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Target className="h-4 w-4 text-indigo-600" />
            Job Readiness Score
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-slate-900 tabular-nums">
              {analysis.jobReadinessScore}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${analysis.jobReadinessScore}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Clock className="h-4 w-4 text-indigo-600" />
            Estimated Time to Ready
          </div>
          <p className="mt-2 font-display text-4xl font-bold text-slate-900 tabular-nums">
            {analysis.estimatedWeeksToReady}{' '}
            <span className="text-base font-medium text-slate-500">weeks</span>
          </p>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            Based on {profile.weeklyHours} study hours per week
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500">Skill Standing Breakdown</span>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2">
              <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                {strongCount}
              </p>
              <p className="text-[11px] font-semibold text-emerald-800">Strong</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2">
              <p className="font-mono text-lg font-bold text-amber-700 tabular-nums">
                {developingCount}
              </p>
              <p className="text-[11px] font-semibold text-amber-800">Medium</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-2">
              <p className="font-mono text-lg font-bold text-red-700 tabular-nums">{gapCount}</p>
              <p className="text-[11px] font-semibold text-red-800">Gap</p>
            </div>
          </div>
        </div>
      </div>

      {/* Analyst Summary + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Current vs. Required Skill Levels
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare your verified/estimated score against role expectations
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setChartType('radar')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  chartType === 'radar'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Radar
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  chartType === 'bar'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="h-3 w-3" />
                Bar
              </button>
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'radar' ? (
                <RadarChart data={analysis.skills}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11, fill: '#334155' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar
                    name="Required Level"
                    dataKey="requiredScore"
                    stroke="#94A3B8"
                    fill="#CBD5E1"
                    fillOpacity={0.35}
                  />
                  <Radar
                    name="Your Current Level"
                    dataKey="currentScore"
                    stroke="#4F46E5"
                    fill="#4F46E5"
                    fillOpacity={0.35}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Tooltip />
                </RadarChart>
              ) : (
                <BarChart data={analysis.skills} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    width={100}
                    tick={{ fontSize: 11, fill: '#334155' }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="currentScore" name="Your Level" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                  <Bar
                    dataKey="requiredScore"
                    name="Role Target"
                    fill="#CBD5E1"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
            {analysis.summary}
          </p>
        </div>

        {/* Color-Coded Skill Gap Breakdown */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-bold text-slate-900 mb-1">
            Color-Coded Skill Breakdown
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Green = Strong / Verified · Amber = Developing · Red = Priority Gap
          </p>

          <div className="divide-y divide-slate-200">
            {analysis.skills.map((item) => {
              const statusMeta =
                item.status === 'strong'
                  ? {
                      label: 'Strong',
                      textColor: 'text-emerald-700',
                      barColor: 'bg-emerald-600',
                      Icon: CheckCircle2,
                    }
                  : item.status === 'developing'
                    ? {
                        label: 'Medium',
                        textColor: 'text-amber-700',
                        barColor: 'bg-amber-500',
                        Icon: AlertTriangle,
                      }
                    : {
                        label: 'Gap',
                        textColor: 'text-red-700',
                        barColor: 'bg-red-600',
                        Icon: XCircle,
                      };

              const StatusIcon = statusMeta.Icon;

              return (
                <div key={item.skill} className="py-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 shrink-0 ${statusMeta.textColor}`} />
                      <span className="text-sm font-semibold text-slate-900">{item.skill}</span>
                      <span className={`text-xs font-semibold ${statusMeta.textColor}`}>
                        · {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                        {item.currentScore} / {item.requiredScore}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAssessSkill(item.skill)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer"
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        Verify
                      </button>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${statusMeta.barColor} transition-all duration-500`}
                      style={{ width: `${Math.min(100, item.currentScore)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">{item.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
