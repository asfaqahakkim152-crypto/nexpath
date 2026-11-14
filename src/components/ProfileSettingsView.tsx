import React, { useState } from 'react';
import { FileText, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import {
  AppLanguage,
  BudgetPreference,
  CareerField,
  ClaimedSkill,
  LearnerProfile,
  SkillLevel,
  StudyFormat,
} from '../types/skillpilot';
import { ALL_CAREER_FIELDS, TARGET_CAREERS, getDomainPreset } from '../constants/presets';
import { SUPPORTED_LANGUAGES } from '../constants/i18n';
import { runProfilerAgent } from '../services/skillpilotApi';
import { AgentLoadingBanner, FriendlyErrorCard } from './ui/StateBlocks';

interface ProfileSettingsViewProps {
  profile: LearnerProfile;
  onSaveAndReplan: (updatedProfile: LearnerProfile, goalChanged: boolean) => Promise<void>;
  onResetWorkspace: () => void;
  isSaving: boolean;
  error: string | null;
}

export function ProfileSettingsView({
  profile,
  onSaveAndReplan,
  onResetWorkspace,
  isSaving,
  error,
}: ProfileSettingsViewProps) {
  const [name, setName] = useState(profile.name);
  const [field, setField] = useState<CareerField>(profile.field || 'Medical & Healthcare');
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>(
    profile.preferredLanguage || 'en'
  );
  const [educationOrRole, setEducationOrRole] = useState(profile.educationOrRole);
  const [targetCareer, setTargetCareer] = useState(profile.targetCareer);
  const [customCareer, setCustomCareer] = useState(
    TARGET_CAREERS.includes(profile.targetCareer) ? '' : profile.targetCareer
  );
  const [useCustom, setUseCustom] = useState(!TARGET_CAREERS.includes(profile.targetCareer));
  const [weeklyHours, setWeeklyHours] = useState(profile.weeklyHours);
  const [budget, setBudget] = useState<BudgetPreference>(profile.budget);
  const [preferredFormat, setPreferredFormat] = useState<StudyFormat>(profile.preferredFormat);
  const [skills, setSkills] = useState<ClaimedSkill[]>(profile.existingSkills);
  const [newSkill, setNewSkill] = useState('');
  const [newLevel, setNewLevel] = useState<SkillLevel>('Intermediate');
  const [resumeText, setResumeText] = useState(profile.resumeText || '');
  const [profilerLoading, setProfilerLoading] = useState(false);
  const [profilerError, setProfilerError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const availableCareers =
    field === 'Other / Custom' ? TARGET_CAREERS : getDomainPreset(field).careers;

  const resolvedCareer = useCustom ? customCareer.trim() || profile.targetCareer : targetCareer;
  const goalChanged =
    resolvedCareer.toLowerCase() !== profile.targetCareer.toLowerCase() ||
    field !== profile.field ||
    preferredLanguage !== profile.preferredLanguage;

  const handleExtract = async () => {
    setProfilerError(null);
    setProfilerLoading(true);
    try {
      const extracted = await runProfilerAgent(resumeText);
      if (extracted.educationOrRole) setEducationOrRole(extracted.educationOrRole);
      if (extracted.skills?.length) {
        setSkills((prev) => {
          const merged = [...prev];
          for (const s of extracted.skills) {
            if (!merged.some((m) => m.name.toLowerCase() === s.name.toLowerCase())) {
              merged.push(s);
            }
          }
          return merged;
        });
      }
    } catch (err) {
      setProfilerError(err instanceof Error ? err.message : 'Resume scan failed.');
    } finally {
      setProfilerLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedToast(null);
    await onSaveAndReplan(
      {
        ...profile,
        name: name.trim() || profile.name,
        field,
        preferredLanguage,
        educationOrRole: educationOrRole.trim() || profile.educationOrRole,
        targetCareer: resolvedCareer,
        weeklyHours,
        budget,
        preferredFormat,
        existingSkills: skills,
        resumeText,
        updatedAt: new Date().toISOString(),
      },
      goalChanged || budget !== profile.budget
    );
    setSavedToast(
      goalChanged
        ? `Updated to ${field} · ${resolvedCareer}. Gap analysis & roadmap refreshed.`
        : 'Profile settings saved.'
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Profile &amp; Career Goal
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Changing your target career or budget automatically recomputes skill gaps and updates
            your roadmap.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetWorkspace}
          className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline self-start sm:self-center cursor-pointer"
        >
          Start New Learner Profile
        </button>
      </div>

      {error && <FriendlyErrorCard message={error} />}
      {savedToast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {savedToast}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="font-display text-base font-bold text-slate-900">
            Identity &amp; Target Role
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Education / Current Role
              </label>
              <input
                type="text"
                value={educationOrRole}
                onChange={(e) => setEducationOrRole(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Career Field / Domain
              </label>
              <select
                value={field}
                onChange={(e) => {
                  const nextField = e.target.value as CareerField;
                  setField(nextField);
                  if (nextField === 'Other / Custom') {
                    setUseCustom(true);
                  } else {
                    const preset = getDomainPreset(nextField);
                    setUseCustom(false);
                    setTargetCareer(preset.careers[0]);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {ALL_CAREER_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="Other / Custom">Other / Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Preferred Language
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as AppLanguage)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} ({l.label})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Target Career Goal
              </label>
              <select
                value={useCustom ? '__custom__' : targetCareer}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setUseCustom(true);
                  } else {
                    setUseCustom(false);
                    setTargetCareer(e.target.value);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {availableCareers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="__custom__">Custom role...</option>
              </select>
            </div>
            {useCustom && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Custom Target Role
                </label>
                <input
                  type="text"
                  value={customCareer}
                  onChange={(e) => setCustomCareer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Weekly Study Hours ({weeklyHours} hrs)
              </label>
              <input
                type="range"
                min={2}
                max={25}
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Budget</label>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value as BudgetPreference)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="free-only">Free resources only</option>
                <option value="paid-ok">Free &amp; paid courses OK</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Preferred Format
              </label>
              <select
                value={preferredFormat}
                onChange={(e) => setPreferredFormat(e.target.value as StudyFormat)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="hands-on">Hands-on</option>
                <option value="video">Video</option>
                <option value="reading">Reading</option>
              </select>
            </div>
          </div>
        </div>

        {/* Claimed Skills Editor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">Claimed Skills</h2>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              placeholder="Add skill..."
              className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value as SkillLevel)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const clean = newSkill.trim();
                if (!clean) return;
                if (!skills.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
                  setSkills([...skills, { name: clean, claimedLevel: newLevel }]);
                }
                setNewSkill('');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {skills.map((sk, idx) => (
              <div key={sk.name} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-slate-900">{sk.name}</span>
                <div className="flex items-center gap-3">
                  <select
                    value={sk.claimedLevel}
                    onChange={(e) =>
                      setSkills((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, claimedLevel: e.target.value as SkillLevel }
                            : item
                        )
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSkills((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resume Re-Scan */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center text-sm font-bold text-slate-900">
              <FileText className="h-4 w-4 text-indigo-600 mr-2" />
              Resume Text (Profiler Agent)
            </label>
            <button
              type="button"
              disabled={profilerLoading || resumeText.trim().length < 20}
              onClick={handleExtract}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {profilerLoading ? 'Scanning...' : 'Scan & Merge Skills'}
            </button>
          </div>
          <textarea
            rows={4}
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste updated resume or coursework..."
            className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {profilerError && <FriendlyErrorCard message={profilerError} onRetry={handleExtract} />}
        </div>

        {isSaving && (
          <AgentLoadingBanner
            agentName="Gap Analyst & Curator"
            taskDescription="Recomputing your skill gaps and curating a refreshed roadmap..."
          />
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {goalChanged ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Save Goal &amp; Re-plan Roadmap
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Profile Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
