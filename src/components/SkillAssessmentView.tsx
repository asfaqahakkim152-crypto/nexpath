import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  HelpCircle,
  Plus,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  AdaptiveQuestion,
  LearnerWorkspace,
  SkillAssessmentPackage,
  SkillAssessmentResult,
  SkillLevel,
} from '../types/skillpilot';
import {
  generateAdaptiveQuiz,
  gradePracticalSubmission,
} from '../services/skillpilotApi';
import { AgentLoadingBanner, FriendlyErrorCard } from './ui/StateBlocks';

interface SkillAssessmentViewProps {
  workspace: LearnerWorkspace;
  preselectedSkill?: string | null;
  onAssessmentComplete: (result: SkillAssessmentResult) => Promise<void>;
  onAddClaimedSkill: (skill: string, level: SkillLevel) => void;
}

export function SkillAssessmentView({
  workspace,
  preselectedSkill,
  onAssessmentComplete,
  onAddClaimedSkill,
}: SkillAssessmentViewProps) {
  const { profile, assessments } = workspace;
  const allSkills = Array.from(
    new Set([
      ...profile.existingSkills.map((s) => s.name),
      ...(workspace.analysis?.skills.map((s) => s.skill) || []),
    ])
  );

  const [selectedSkill, setSelectedSkill] = useState<string>(
    preselectedSkill || allSkills[0] || 'JavaScript'
  );
  const [customSkillInput, setCustomSkillInput] = useState('');

  // Assessment state machine: 'idle' | 'loading' | 'mcq' | 'practical' | 'grading' | 'result'
  const [phase, setPhase] = useState<
    'idle' | 'loading' | 'mcq' | 'practical' | 'grading' | 'result'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<SkillAssessmentPackage | null>(null);

  // Adaptive MCQ progression (5 questions)
  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState<SkillLevel>('Intermediate');
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<AdaptiveQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [weightedPoints, setWeightedPoints] = useState(0);
  const [maxPossiblePoints, setMaxPossiblePoints] = useState(0);
  const [difficultyTrail, setDifficultyTrail] = useState<SkillLevel[]>([]);

  // Practical task state
  const [practicalAnswer, setPracticalAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);

  // Final result
  const [latestResult, setLatestResult] = useState<SkillAssessmentResult | null>(null);

  const getClaimedLevel = (skillName: string): SkillLevel => {
    const found = profile.existingSkills.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase()
    );
    return found?.claimedLevel || 'Beginner';
  };

  const pickNextQuestion = (
    pack: SkillAssessmentPackage,
    diff: SkillLevel,
    alreadyUsed: string[]
  ): AdaptiveQuestion => {
    const order: SkillLevel[] =
      diff === 'Advanced'
        ? ['Advanced', 'Intermediate', 'Beginner']
        : diff === 'Beginner'
          ? ['Beginner', 'Intermediate', 'Advanced']
          : ['Intermediate', 'Advanced', 'Beginner'];

    for (const tier of order) {
      const candidate = pack.questions[tier].find((q) => !alreadyUsed.includes(q.id));
      if (candidate) return candidate;
    }
    return pack.questions[diff][0] || pack.questions.Intermediate[0];
  };

  const startAssessment = async (skillName = selectedSkill) => {
    setError(null);
    setPhase('loading');
    const claimed = getClaimedLevel(skillName);
    try {
      const generated = await generateAdaptiveQuiz(
        skillName,
        claimed,
        profile.targetCareer,
        profile.field,
        profile.preferredLanguage
      );
      const startDiff: SkillLevel = claimed;
      const firstQ = pickNextQuestion(generated, startDiff, []);
      setPkg(generated);
      setQuestionIndex(0);
      setCurrentDifficulty(firstQ.difficulty);
      setUsedIds([firstQ.id]);
      setActiveQuestion(firstQ);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setCorrectCount(0);
      setWeightedPoints(0);
      setMaxPossiblePoints(0);
      setDifficultyTrail([firstQ.difficulty]);
      setPracticalAnswer('');
      setShowHint(false);
      setLatestResult(null);
      setPhase('mcq');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not prepare assessment. Please try again.'
      );
      setPhase('idle');
    }
  };

  const handleCheckAnswer = () => {
    if (selectedOption === null || !activeQuestion) return;
    setIsAnswerChecked(true);
    const weight =
      activeQuestion.difficulty === 'Advanced'
        ? 25
        : activeQuestion.difficulty === 'Intermediate'
          ? 20
          : 15;
    const isCorrect = selectedOption === activeQuestion.correctIndex;
    setMaxPossiblePoints((p) => p + weight);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setWeightedPoints((p) => p + weight);
    }
  };

  const handleNextQuestion = () => {
    if (!pkg || !activeQuestion) return;
    const isCorrect = selectedOption === activeQuestion.correctIndex;
    if (questionIndex >= 4) {
      setPhase('practical');
      return;
    }

    // Adaptive step: harder on correct, easier on wrong
    let nextDiff: SkillLevel = currentDifficulty;
    if (isCorrect) {
      nextDiff = currentDifficulty === 'Beginner' ? 'Intermediate' : 'Advanced';
    } else {
      nextDiff = currentDifficulty === 'Advanced' ? 'Intermediate' : 'Beginner';
    }

    const nextQ = pickNextQuestion(pkg, nextDiff, usedIds);
    setQuestionIndex((i) => i + 1);
    setCurrentDifficulty(nextQ.difficulty);
    setUsedIds((prev) => [...prev, nextQ.id]);
    setActiveQuestion(nextQ);
    setDifficultyTrail((prev) => [...prev, nextQ.difficulty]);
    setSelectedOption(null);
    setIsAnswerChecked(false);
  };

  const handleSubmitPractical = async () => {
    if (!pkg) return;
    setError(null);
    setPhase('grading');
    const mcqScore =
      maxPossiblePoints > 0
        ? Math.round((weightedPoints / maxPossiblePoints) * 100)
        : Math.round((correctCount / 5) * 100);
    const claimed = getClaimedLevel(pkg.skill);

    try {
      const graded = await gradePracticalSubmission({
        skill: pkg.skill,
        claimedLevel: claimed,
        mcqScore,
        practicalPrompt: pkg.practicalTask.prompt,
        rubric: pkg.practicalTask.rubric,
        answer: practicalAnswer,
      });

      const fullResult: SkillAssessmentResult = {
        ...graded,
        answeredCount: 5,
        correctCount,
        completedAt: new Date().toISOString(),
      };

      setLatestResult(fullResult);
      setPhase('result');
      await onAssessmentComplete(fullResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade practical submission.');
      setPhase('practical');
    }
  };

  const handleAddAndSelectSkill = () => {
    const clean = customSkillInput.trim();
    if (!clean) return;
    onAddClaimedSkill(clean, 'Beginner');
    setSelectedSkill(clean);
    setCustomSkillInput('');
  };

  const existingResult = assessments[selectedSkill];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Skill Assessment (Claimed vs. Verified)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Each skill test runs a 5-question adaptive quiz followed by a rubric-graded practical
            challenge.
          </p>
        </div>
      </div>

      {error && (
        <FriendlyErrorCard
          message={error}
          onRetry={() => (phase === 'practical' ? handleSubmitPractical() : startAssessment())}
        />
      )}

      {/* Skill Selector Strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {allSkills.map((sk) => {
              const verified = assessments[sk];
              const isSelected = selectedSkill === sk;
              return (
                <button
                  key={sk}
                  type="button"
                  disabled={phase === 'mcq' || phase === 'loading' || phase === 'grading'}
                  onClick={() => {
                    setSelectedSkill(sk);
                    setPhase('idle');
                    setError(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{sk}</span>
                  {verified && (
                    <span
                      className={`font-mono tabular-nums ${
                        isSelected ? 'text-indigo-100' : 'text-emerald-700'
                      }`}
                    >
                      {verified.verifiedScore}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={customSkillInput}
              onChange={(e) => setCustomSkillInput(e.target.value)}
              placeholder="Assess another skill..."
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddAndSelectSkill}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Phase: Idle */}
      {phase === 'idle' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Verify {selectedSkill}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Claimed Level: <strong className="text-slate-900">{getClaimedLevel(selectedSkill)}</strong>
                {' · '}5 adaptive MCQs + 1 practical problem
              </p>
            </div>
            <button
              type="button"
              onClick={() => startAssessment(selectedSkill)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardCheck className="h-4 w-4" />
              {existingResult ? 'Retake Assessment' : 'Start Assessment'}
            </button>
          </div>

          {existingResult && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  Latest Result: Claimed {existingResult.claimedLevel} → Verified{' '}
                  {existingResult.verifiedLevel}
                </span>
                <span className="font-mono text-base font-bold text-indigo-700 tabular-nums">
                  {existingResult.verifiedScore}/100
                </span>
              </div>
              <p className="text-sm text-slate-600">{existingResult.practicalFeedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Phase: Loading */}
      {phase === 'loading' && (
        <AgentLoadingBanner
          agentName="Assessor Agent"
          taskDescription={`Crafting adaptive Beginner, Intermediate, and Advanced questions plus a practical coding challenge for ${selectedSkill}...`}
        />
      )}

      {/* Phase: Adaptive 5-Question MCQ */}
      {phase === 'mcq' && activeQuestion && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-600">
                Question {questionIndex + 1} of 5 · Adaptive Difficulty: {activeQuestion.difficulty}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-10 rounded-full transition-colors ${
                      i < questionIndex
                        ? 'bg-emerald-500'
                        : i === questionIndex
                          ? 'bg-indigo-600'
                          : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Path: {difficultyTrail.join(' → ')}
            </span>
          </div>

          <h3 className="font-display text-lg font-bold text-slate-900 leading-snug">
            {activeQuestion.question}
          </h3>

          <div className="space-y-2.5">
            {activeQuestion.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectOption = idx === activeQuestion.correctIndex;
              let borderStyle = 'border-slate-200 bg-white hover:bg-slate-50';
              if (isAnswerChecked) {
                if (isCorrectOption) borderStyle = 'border-emerald-500 bg-emerald-50/70';
                else if (isSelected && !isCorrectOption)
                  borderStyle = 'border-red-400 bg-red-50/70';
              } else if (isSelected) {
                borderStyle = 'border-indigo-600 bg-indigo-50/60';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isAnswerChecked}
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left text-sm transition-colors cursor-pointer ${borderStyle}`}
                >
                  <span className="text-slate-800 font-medium">{opt}</span>
                  {isAnswerChecked && isCorrectOption && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  )}
                  {isAnswerChecked && isSelected && !isCorrectOption && (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {isAnswerChecked && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">
                {selectedOption === activeQuestion.correctIndex
                  ? 'Correct — next question will step up in difficulty'
                  : 'Not quite — next question will reinforce fundamentals'}
              </p>
              <p>{activeQuestion.explanation}</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            {!isAnswerChecked ? (
              <button
                type="button"
                disabled={selectedOption === null}
                onClick={handleCheckAnswer}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
              >
                Check Answer
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextQuestion}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {questionIndex >= 4 ? 'Proceed to Practical Task' : 'Next Question'}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Phase: Practical Challenge */}
      {(phase === 'practical' || phase === 'grading') && pkg && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600">
              <Code2 className="h-4 w-4" />
              Part 2 of 2 · Practical Task ({pkg.skill})
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              MCQ completed: {correctCount}/5 correct
            </span>
          </div>

          <h3 className="font-display text-lg font-bold text-slate-900">
            {pkg.practicalTask.prompt}
          </h3>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Grading Rubric</p>
            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
              {pkg.practicalTask.rubric.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowHint((h) => !h)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline pt-1 cursor-pointer"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showHint ? 'Hide hint' : 'Show starter hint'}
            </button>
            {showHint && (
              <p className="text-xs text-slate-700 bg-white rounded-lg border border-slate-200 p-2.5">
                {pkg.practicalTask.starterHint}
              </p>
            )}
          </div>

          <textarea
            rows={7}
            value={practicalAnswer}
            onChange={(e) => setPracticalAnswer(e.target.value)}
            disabled={phase === 'grading'}
            placeholder="Write your code snippet, query, or step-by-step technical solution here..."
            className="w-full rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />

          {phase === 'grading' && (
            <AgentLoadingBanner
              agentName="Assessor & Adaptive Re-planner"
              taskDescription="Grading your practical submission against the rubric and updating your career readiness..."
            />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={phase === 'grading' || !practicalAnswer.trim()}
              onClick={handleSubmitPractical}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              {phase === 'grading' ? 'Grading...' : 'Submit for Rubric Grading'}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Verification Outcome */}
      {phase === 'result' && latestResult && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  latestResult.verifiedScore >= 80
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : latestResult.verifiedScore < 50
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  {latestResult.skill} Verification Complete
                </h3>
                <p className="text-sm font-semibold text-indigo-700 mt-0.5">
                  Claimed: {latestResult.claimedLevel} → Verified: {latestResult.verifiedLevel}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs font-semibold text-slate-500">Verified Score</span>
              <p className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                {latestResult.verifiedScore}
                <span className="text-base font-normal text-slate-400">/100</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold text-slate-500">Adaptive MCQ Score</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                {latestResult.mcqScore}%{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({latestResult.correctCount}/5 correct)
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold text-slate-500">Practical Rubric Score</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                {latestResult.practicalScore}%
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Assessor Feedback</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              {latestResult.practicalFeedback}
            </p>
            {latestResult.rubricBreakdown.length > 0 && (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {latestResult.rubricBreakdown.map((r, i) => (
                  <div key={i} className="p-3.5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{r.criterion}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{r.comment}</p>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-800 tabular-nums shrink-0">
                      {r.score}/100
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {latestResult.verifiedScore < 50 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <strong>Adaptive Re-planner triggered:</strong> Because your verified score is under
              50%, NexPath inserted a hands-on revision module for {latestResult.skill} at the
              front of your roadmap.
            </div>
          )}

          {latestResult.verifiedScore > 85 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
              <strong>Fast-track unlocked:</strong> Because you scored above 85%, introductory{' '}
              {latestResult.skill} modules were skipped and your roadmap was upgraded to advanced
              patterns.
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Assess Another Skill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
