import React, { useState } from 'react';
import {
  Briefcase,
  Check,
  FileText,
  Globe,
  Layers,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  ArrowLeft,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import {
  AppLanguage,
  BudgetPreference,
  CareerField,
  ClaimedSkill,
  LearnerProfile,
  SkillLevel,
  StudyFormat,
} from '../types/skillpilot';
import {
  CAREER_DOMAINS,
  SUGGESTED_SKILLS,
  TARGET_CAREERS,
  getDomainPreset,
} from '../constants/presets';
import { SUPPORTED_LANGUAGES, getStrings } from '../constants/i18n';
import { runProfilerAgent } from '../services/skillpilotApi';
import { AgentLoadingBanner, FriendlyErrorCard, InfoTooltip } from './ui/StateBlocks';
import { NexPathLogo } from './ui/NexPathLogo';

interface OnboardingWizardProps {
  initialProfile: LearnerProfile;
  onComplete: (profile: LearnerProfile) => Promise<void>;
  onLanguageChange?: (language: AppLanguage) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

export function OnboardingWizard({
  initialProfile,
  onComplete,
  onLanguageChange,
  isSubmitting,
  submitError,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [field, setField] = useState<CareerField>(initialProfile.field || 'Medical & Healthcare');
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>(
    initialProfile.preferredLanguage || 'en'
  );
  const [name, setName] = useState(initialProfile.name);
  const [educationOrRole, setEducationOrRole] = useState(initialProfile.educationOrRole);
  const [resumeText, setResumeText] = useState(initialProfile.resumeText || '');
  const [skills, setSkills] = useState<ClaimedSkill[]>(initialProfile.existingSkills);
  const [skillInput, setSkillInput] = useState('');
  const [skillLevelInput, setSkillLevelInput] = useState<SkillLevel>('Intermediate');
  const [certInput, setCertInput] = useState('');
  const [certifications, setCertifications] = useState<string[]>(initialProfile.certifications);
  const [projectInput, setProjectInput] = useState('');
  const [projects, setProjects] = useState<string[]>(initialProfile.projects);
  const domainPreset = getDomainPreset(field);
  const [targetCareer, setTargetCareer] = useState(
    initialProfile.targetCareer || domainPreset.careers[0]
  );
  const [customCareer, setCustomCareer] = useState('');
  const [useCustomCareer, setUseCustomCareer] = useState(field === 'Other / Custom');
  const [weeklyHours, setWeeklyHours] = useState(initialProfile.weeklyHours || 6);
  const [budget, setBudget] = useState<BudgetPreference>(initialProfile.budget || 'free-only');
  const [preferredFormat, setPreferredFormat] = useState<StudyFormat>(
    initialProfile.preferredFormat || 'video'
  );

  const [profilerLoading, setProfilerLoading] = useState(false);
  const [profilerError, setProfilerError] = useState<string | null>(null);
  const [profilerSuccess, setProfilerSuccess] = useState<string | null>(null);
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const strings = getStrings(preferredLanguage);
  const domainCareers = field === 'Other / Custom' ? TARGET_CAREERS : domainPreset.careers;
  const domainSkills = field === 'Other / Custom' ? SUGGESTED_SKILLS : domainPreset.skills;

  const resolvedCareer = useCustomCareer
    ? customCareer.trim() || domainCareers[0] || 'Specialist'
    : targetCareer;

  const handleFieldSelect = (nextField: CareerField) => {
    setField(nextField);
    if (nextField === 'Other / Custom') {
      setUseCustomCareer(true);
    } else {
      const preset = getDomainPreset(nextField);
      setUseCustomCareer(false);
      setTargetCareer(preset.careers[0]);
    }
  };

  const handleLanguageSelect = (nextLang: AppLanguage) => {
    setPreferredLanguage(nextLang);
    onLanguageChange?.(nextLang);
  };

  const handleExtractResume = async () => {
    setProfilerError(null);
    setProfilerSuccess(null);
    setProfilerLoading(true);
    try {
      const extracted = await runProfilerAgent(resumeText);
      if (extracted.name && !name.trim()) setName(extracted.name);
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
      if (extracted.certifications?.length) {
        setCertifications((prev) => Array.from(new Set([...prev, ...extracted.certifications])));
      }
      if (extracted.projects?.length) {
        setProjects((prev) => Array.from(new Set([...prev, ...extracted.projects])));
      }
      if (extracted.suggestedTargetCareer) {
        if (TARGET_CAREERS.includes(extracted.suggestedTargetCareer)) {
          setUseCustomCareer(false);
          setTargetCareer(extracted.suggestedTargetCareer);
        } else {
          setUseCustomCareer(true);
          setCustomCareer(extracted.suggestedTargetCareer);
        }
      }
      setProfilerSuccess(
        `Profiler Agent extracted ${extracted.skills.length} skills and ${extracted.projects.length} projects from your background.`
      );
    } catch (err) {
      setProfilerError(
        err instanceof Error ? err.message : 'Unable to extract resume details. Please try again.'
      );
    } finally {
      setProfilerLoading(false);
    }
  };

  const addSkill = (skillName: string, level: SkillLevel = skillLevelInput) => {
    const clean = skillName.trim();
    if (!clean) return;
    if (skills.some((s) => s.name.toLowerCase() === clean.toLowerCase())) return;
    setSkills([...skills, { name: clean, claimedLevel: level }]);
    setSkillInput('');
  };

  const updateSkillLevel = (index: number, claimedLevel: SkillLevel) => {
    setSkills((prev) => prev.map((s, i) => (i === index ? { ...s, claimedLevel } : s)));
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const addCertification = () => {
    const clean = certInput.trim();
    if (!clean) return;
    setCertifications([...certifications, clean]);
    setCertInput('');
  };

  const addProject = () => {
    const clean = projectInput.trim();
    if (!clean) return;
    setProjects([...projects, clean]);
    setProjectInput('');
  };

  const fillStarterExample = () => {
    const sample = getDomainPreset(field).sampleLearner;
    setName(sample.name);
    setEducationOrRole(sample.educationOrRole);
    setSkills(sample.skills);
    setProjects(sample.projects);
    setCertifications(sample.certifications);
    setTargetCareer(sample.targetCareer);
    setUseCustomCareer(false);
    setWeeklyHours(8);
    setBudget('free-only');
    setPreferredFormat('video');
    setValidationError(null);
  };

  const handleNext = () => {
    setValidationError(null);
    if (step === 1) {
      if (!name.trim() || !educationOrRole.trim()) {
        setValidationError('Please enter your name and your current role or education level.');
        return;
      }
    }
    if (step === 2 && skills.length === 0) {
      setValidationError('Add at least one existing skill so we can calibrate your assessment.');
      return;
    }
    if (step === 3 && !resolvedCareer.trim()) {
      setValidationError('Select or enter a target career role.');
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const handleSubmit = async () => {
    setValidationError(null);
    const now = new Date().toISOString();
    await onComplete({
      ...initialProfile,
      field,
      preferredLanguage,
      name: name.trim(),
      educationOrRole: educationOrRole.trim(),
      existingSkills: skills,
      certifications,
      projects,
      targetCareer: resolvedCareer,
      weeklyHours,
      budget,
      preferredFormat,
      resumeText: resumeText.trim(),
      onboardingComplete: true,
      updatedAt: now,
    });
  };

  const stepsMeta = [
    { num: 1, label: 'Background' },
    { num: 2, label: 'Current Skills' },
    { num: 3, label: 'Target Goal' },
    { num: 4, label: 'Launch Plan' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Clean Editorial Welcome Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <NexPathLogo size="md" showTagline />
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                  <Globe className="h-3.5 w-3.5 text-indigo-600" />
                  <select
                    aria-label={strings.languageLabel}
                    value={preferredLanguage}
                    onChange={(e) => handleLanguageSelect(e.target.value as AppLanguage)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={fillStarterExample}
                  className="text-xs font-medium text-slate-600 hover:text-indigo-700 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Fill sample
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    const now = new Date().toISOString();
                    const sample = getDomainPreset(field).sampleLearner;
                    await onComplete({
                      ...initialProfile,
                      field,
                      preferredLanguage,
                      name: sample.name,
                      educationOrRole: sample.educationOrRole,
                      existingSkills: sample.skills,
                      certifications: sample.certifications,
                      projects: sample.projects,
                      targetCareer: sample.targetCareer,
                      weeklyHours: 8,
                      budget: 'free-only',
                      preferredFormat: 'video',
                      onboardingComplete: true,
                      updatedAt: now,
                    });
                  }}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {isSubmitting ? 'Launching...' : strings.quickLaunch}
                </button>
              </div>
            </div>

            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                {strings.heroTitle}
              </h1>
              <p className="mt-2.5 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                {strings.heroSubtitle}
              </p>
            </div>

            {/* Wizard Progress Stepper */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              {stepsMeta.map((item) => {
                const isActive = step === item.num;
                const isDone = step > item.num;
                return (
                  <button
                    key={item.num}
                    type="button"
                    onClick={() => item.num < step && setStep(item.num)}
                    disabled={item.num > step}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900 cursor-pointer'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isDone ? <Check className="h-3 w-3" /> : item.num}
                    </span>
                    <span className="text-xs font-semibold truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200 relative min-h-[200px]">
            {!bannerLoadFailed ? (
              <img
                src="/src/assets/images/nexpath_welcome_banner.jpg"
                alt="Architectural ascending steps and path illustration representing NexPath skill progression"
                referrerPolicy="no-referrer"
                onError={() => setBannerLoadFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-blue-50 to-slate-100">
                <NexPathLogo size="lg" showTagline />
                <p className="text-sm font-semibold text-slate-800 mt-4">Multi-Agent Skill Navigation</p>
                <p className="text-xs text-slate-500 mt-1">
                  Profiler · Assessor · Gap Analyst · Curator · Mentor
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Main Wizard Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {validationError && <FriendlyErrorCard message={validationError} />}
          {submitError && (
            <FriendlyErrorCard
              message={submitError}
              onRetry={handleSubmit}
              retryLabel="Retry plan setup"
            />
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  1. Learner Background &amp; Optional Resume Scan
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Enter your basic details or paste your resume so the Profiler Agent can pre-fill
                  your skills and projects.
                </p>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-center text-sm font-semibold text-slate-800">
                  <Briefcase className="h-4 w-4 text-indigo-600 mr-2" />
                  {strings.selectFieldLabel}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {CAREER_DOMAINS.map((domain) => {
                    const active = field === domain.field;
                    return (
                      <button
                        key={domain.field}
                        type="button"
                        onClick={() => handleFieldSelect(domain.field)}
                        className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-indigo-600 bg-indigo-50/70'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <p className="text-sm font-bold text-slate-900">{domain.field}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {domain.description}
                        </p>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleFieldSelect('Other / Custom')}
                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      field === 'Other / Custom'
                        ? 'border-indigo-600 bg-indigo-50/70'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">Other / Custom</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Law, culinary arts, trades, engineering, or any specialized profession.
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={domainPreset.sampleLearner.name}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Current Education or Role
                  </label>
                  <input
                    type="text"
                    value={educationOrRole}
                    onChange={(e) => setEducationOrRole(e.target.value)}
                    placeholder={domainPreset.sampleLearner.educationOrRole}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="flex items-center text-sm font-semibold text-slate-800">
                      <FileText className="h-4 w-4 text-indigo-600 mr-2" />
                      Paste Resume or Bio Text (Optional)
                      <InfoTooltip text="Our Profiler Agent reads your pasted text and automatically extracts technical skills, claimed proficiency, projects, and certifications." />
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Saves time filling out skills manually.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExtractResume}
                    disabled={profilerLoading || resumeText.trim().length < 20}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {profilerLoading ? 'Extracting...' : 'Extract with Profiler Agent'}
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume summary, coursework, or experience here..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />

                {profilerLoading && (
                  <AgentLoadingBanner
                    agentName="Profiler Agent"
                    taskDescription="Reading your resume text and identifying skills, projects, and target role fit..."
                  />
                )}
                {profilerError && (
                  <FriendlyErrorCard message={profilerError} onRetry={handleExtractResume} />
                )}
                {profilerSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
                    {profilerSuccess}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  2. Claimed Skills, Certifications &amp; Projects
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Tell us what you know today. Next, NexPath will verify these claims with
                  short adaptive challenges.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Add Existing Skills &amp; Self-Assessed Level
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill(skillInput);
                      }
                    }}
                    placeholder={`Type a skill (e.g., ${domainSkills.slice(0, 3).join(', ')})`}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <select
                    value={skillLevelInput}
                    onChange={(e) => setSkillLevelInput(e.target.value as SkillLevel)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => addSkill(skillInput)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Add Skill
                  </button>
                </div>

                {/* Quick Skill Suggestions */}
                <div className="pt-1">
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    Quick add suggestions for {field}:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {domainSkills
                      .filter((s) => !skills.some((ex) => ex.name.toLowerCase() === s.toLowerCase()))
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addSkill(s, 'Intermediate')}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer"
                        >
                          + {s}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Added Skills Table */}
                {skills.length > 0 && (
                  <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {skills.map((item, idx) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-4 px-4 py-2.5"
                      >
                        <span className="text-sm font-medium text-slate-900">{item.name}</span>
                        <div className="flex items-center gap-3">
                          <select
                            value={item.claimedLevel}
                            onChange={(e) =>
                              updateSkillLevel(idx, e.target.value as SkillLevel)
                            }
                            aria-label={`Level for ${item.name}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                          >
                            <option value="Beginner">Claimed: Beginner</option>
                            <option value="Intermediate">Claimed: Intermediate</option>
                            <option value="Advanced">Claimed: Advanced</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeSkill(idx)}
                            aria-label={`Remove ${item.name}`}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certifications & Projects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Certifications (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={certInput}
                      onChange={(e) => setCertInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCertification();
                        }
                      }}
                      placeholder="e.g., AWS Cloud Practitioner"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addCertification}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  {certifications.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {certifications.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200"
                        >
                          <span>{c}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCertifications((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Projects Built (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectInput}
                      onChange={(e) => setProjectInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addProject();
                        }
                      }}
                      placeholder="e.g., E-commerce REST API"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addProject}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  {projects.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {projects.map((p, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200"
                        >
                          <span>{p}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setProjects((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  3. Target Career &amp; Study Preferences
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  We calibrate your skill gap analysis and weekly roadmap pace around these goals.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center text-sm font-medium text-slate-700">
                  <Target className="h-4 w-4 text-indigo-600 mr-2" />
                  {strings.targetCareerLabel} ({field})
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={useCustomCareer ? '__custom__' : targetCareer}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setUseCustomCareer(true);
                      } else {
                        setUseCustomCareer(false);
                        setTargetCareer(e.target.value);
                      }
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {domainCareers.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                    <option value="__custom__">Custom role...</option>
                  </select>

                  {useCustomCareer && (
                    <input
                      type="text"
                      value={customCareer}
                      onChange={(e) => setCustomCareer(e.target.value)}
                      placeholder="Enter custom role (e.g., Pediatric Nurse, STEM Curriculum Lead)"
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Weekly Study Time</span>
                    <span className="font-mono text-sm font-semibold text-indigo-700 tabular-nums">
                      {weeklyHours} hrs/wk
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={25}
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <p className="text-xs text-slate-500">
                    Controls how many modules are scheduled each week.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                  <span className="block text-sm font-medium text-slate-700">Resource Budget</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBudget('free-only')}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                        budget === 'free-only'
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Free only
                    </button>
                    <button
                      type="button"
                      onClick={() => setBudget('paid-ok')}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                        budget === 'paid-ok'
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Paid OK
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Curator strictly filters catalog resources by your budget.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                  <span className="block text-sm font-medium text-slate-700">Preferred Format</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['hands-on', 'video', 'reading'] as StudyFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setPreferredFormat(fmt)}
                        className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                          preferredFormat === fmt
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Each week still gives you video, reading, and practice options.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  4. Review Profile &amp; Generate Initial Roadmap
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Confirm your details. Our Gap Analyst and Curator agents will map your baseline
                  readiness and curate a prerequisite-ordered roadmap.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    Learner Profile
                  </div>
                  <p className="text-base font-bold text-slate-900">{name}</p>
                  <p className="text-sm text-slate-600">{educationOrRole}</p>
                  <p className="text-xs text-slate-500 pt-1">
                    Field: <strong className="text-slate-800">{field}</strong> · Target Career:{' '}
                    <strong className="text-slate-800">{resolvedCareer}</strong>
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    Study Schedule &amp; Preferences
                  </div>
                  <p className="text-sm text-slate-700 tabular-nums">
                    <strong>{weeklyHours} hours/week</strong> ·{' '}
                    {budget === 'free-only' ? 'Free resources only' : 'Free & paid courses'} ·{' '}
                    Prefers <span className="capitalize">{preferredFormat}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {skills.length} claimed skills · {projects.length} projects ·{' '}
                    {certifications.length} certifications
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  Claimed Skills Ready for Verification
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
                  {skills.map((s) => (
                    <span key={s.name}>
                      <strong className="font-medium text-slate-900">{s.name}</strong>{' '}
                      <span className="text-slate-400">({s.claimedLevel})</span>
                    </span>
                  ))}
                </div>
              </div>

              {isSubmitting && (
                <AgentLoadingBanner
                  agentName="Gap Analyst & Curator Agents"
                  taskDescription="Comparing your skills against target job requirements and curating verified resources from our catalog..."
                />
              )}
            </div>
          )}

          {/* Wizard Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              {strings.backBtn}
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                {strings.continueBtn}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Generating Your Plan...' : strings.generatePlanBtn}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
