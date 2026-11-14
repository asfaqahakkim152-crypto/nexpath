import {
  AdaptiveNotice,
  CareerAnalysis,
  CatalogResource,
  ClaimedSkill,
  LearnerProfile,
  LearnerWorkspace,
  OpportunityItem,
  OpportunitySkillFit,
  RoadmapStep,
  ScoutActivityEntry,
  SkillAssessmentPackage,
  SkillAssessmentResult,
  SkillLevel,
} from '../types/skillpilot';

const STORAGE_PREFIX = 'skillpilot_workspace_';
const ACTIVE_ID_KEY = 'skillpilot_active_learner_id';

export function getActiveLearnerId(): string {
  return localStorage.getItem(ACTIVE_ID_KEY) || 'learner-1';
}

export function setActiveLearnerId(id: string): void {
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

export function loadLocalWorkspace(id: string): LearnerWorkspace | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as LearnerWorkspace) : null;
  } catch {
    return null;
  }
}

export function saveLocalWorkspace(workspace: LearnerWorkspace): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${workspace.profile.id}`, JSON.stringify(workspace));
  } catch {
    // Ignore storage quota errors
  }
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong while contacting NexPath. Please try again.');
  }
  return data;
}

async function fetchWithRetry<T>(url: string, init?: RequestInit, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return await handleApiResponse<T>(res);
      }
      return await handleApiResponse<T>(res);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isValidation = msg.includes('required') || msg.includes('empty') || msg.includes('paste');
      if (i < retries && !isValidation) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function fetchWorkspaceFromServer(id: string): Promise<LearnerWorkspace | null> {
  try {
    const res = await fetch(`/api/learner/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    const data = await handleApiResponse<{ workspace: LearnerWorkspace }>(res);
    return data.workspace;
  } catch {
    return null;
  }
}

export async function saveWorkspaceToServer(workspace: LearnerWorkspace): Promise<void> {
  saveLocalWorkspace(workspace);
  try {
    await fetchWithRetry(`/api/learner/${encodeURIComponent(workspace.profile.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    });
  } catch {
    // Local cache remains intact if offline
  }
}

export async function fetchSavedLearners(): Promise<
  Array<{
    id: string;
    name: string;
    targetCareer: string;
    updatedAt: string;
    onboardingComplete: boolean;
  }>
> {
  try {
    const res = await fetch('/api/learners');
    const data = await handleApiResponse<{
      learners: Array<{
        id: string;
        name: string;
        targetCareer: string;
        updatedAt: string;
        onboardingComplete: boolean;
      }>;
    }>(res);
    return data.learners || [];
  } catch {
    return [];
  }
}

export async function runProfilerAgent(resumeText: string): Promise<{
  name?: string;
  educationOrRole: string;
  skills: ClaimedSkill[];
  certifications: string[];
  projects: string[];
  suggestedTargetCareer: string;
}> {
  return fetchWithRetry('/api/agents/profiler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText }),
  });
}

export async function generateAdaptiveQuiz(
  skill: string,
  claimedLevel: SkillLevel,
  targetCareer: string,
  field?: string,
  language?: string
): Promise<SkillAssessmentPackage> {
  return fetchWithRetry('/api/agents/assessor/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, claimedLevel, targetCareer, field, language }),
  });
}

export async function gradePracticalSubmission(payload: {
  skill: string;
  claimedLevel: SkillLevel;
  mcqScore: number;
  practicalPrompt: string;
  rubric: string[];
  answer: string;
}): Promise<{
  skill: string;
  claimedLevel: SkillLevel;
  verifiedLevel: SkillLevel;
  mcqScore: number;
  practicalScore: number;
  verifiedScore: number;
  practicalFeedback: string;
  rubricBreakdown: { criterion: string; score: number; comment: string }[];
}> {
  return fetchWithRetry('/api/agents/assessor/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function analyzeAndCurate(
  profile: LearnerProfile,
  assessments: Record<string, SkillAssessmentResult>
): Promise<{ analysis: CareerAnalysis; roadmap: RoadmapStep[] }> {
  return fetchWithRetry('/api/agents/analyze-and-curate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, assessments }),
  });
}

export async function triggerAdaptiveReplan(payload: {
  trigger: 'low-score' | 'high-score' | 'mentor-command';
  skill?: string;
  score?: number;
  instruction?: string;
  profile: LearnerProfile;
  roadmap: RoadmapStep[];
}): Promise<{
  updatedRoadmap: RoadmapStep[];
  newWeeklyHours?: number;
  notice: AdaptiveNotice;
}> {
  return fetchWithRetry('/api/agents/replan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function sendMentorChat(payload: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext: {
    profile: Partial<LearnerProfile>;
    assessments: Record<string, Partial<SkillAssessmentResult>>;
    analysis: CareerAnalysis | null;
    roadmap: Array<Partial<RoadmapStep>>;
  };
  role?: 'mentor' | 'interviewer' | 'tutor';
  mode?: 'fast' | 'balanced' | 'deep';
  language?: string;
}): Promise<{
  reply: string;
  shouldReplan: boolean;
  replanInstruction: string;
  modelUsed?: string;
}> {
  return fetchWithRetry('/api/agents/mentor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchCatalogResources(): Promise<CatalogResource[]> {
  const res = await fetch('/api/catalog');
  const data = await handleApiResponse<{ items: CatalogResource[] }>(res);
  return data.items || [];
}

export async function fetchFallbackOpportunities(): Promise<OpportunityItem[]> {
  try {
    const data = await fetchWithRetry<{ items: OpportunityItem[] }>('/api/opportunities/fallback');
    return data.items || [];
  } catch {
    return [];
  }
}

export async function runOpportunityScout(
  profile: LearnerProfile,
  assessments: Record<string, SkillAssessmentResult>
): Promise<{
  hackathons: OpportunityItem[];
  internships: OpportunityItem[];
  jobRoles: OpportunityItem[];
  usedFallbackHackathons: boolean;
  usedFallbackInternships: boolean;
  mentorTip: string;
  scoutLogs: ScoutActivityEntry[];
  cachedAt: string;
}> {
  return fetchWithRetry(
    '/api/agents/opportunity-scout',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, assessments }),
    },
    2
  );
}

export async function fetchOpportunityFitExplanation(
  opportunity: OpportunityItem,
  profile: LearnerProfile,
  fit: OpportunitySkillFit
): Promise<string> {
  try {
    const data = await fetchWithRetry<{ explanation: string }>(
      '/api/agents/opportunity-fit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity, profile, fit }),
      },
      2
    );
    return data.explanation;
  } catch {
    return `This opportunity aligns with your ${profile.targetCareer} path (${fit.matchPercent}% verified match). Add any missing skills to your roadmap to prepare faster.`;
  }
}

export async function addMissingSkillsToRoadmap(payload: {
  missingSkills: string[];
  opportunityTitle: string;
  profile: LearnerProfile;
  existingRoadmap: RoadmapStep[];
}): Promise<{
  updatedRoadmap: RoadmapStep[];
  addedCount: number;
  addedSkills: string[];
  notice: AdaptiveNotice;
  scoutLogs: ScoutActivityEntry[];
}> {
  return fetchWithRetry(
    '/api/agents/roadmap-add-skills',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    2
  );
}
