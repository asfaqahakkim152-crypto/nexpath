export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type StudyFormat = 'video' | 'reading' | 'hands-on';
export type BudgetPreference = 'free-only' | 'paid-ok';
export type ResourceCost = 'free' | 'paid';
export type AppLanguage = 'en' | 'hi' | 'ta' | 'es' | 'fr' | 'ar';

export type CareerField =
  | 'Technology & Data'
  | 'Medical & Healthcare'
  | 'Teaching & Education'
  | 'Business & Finance'
  | 'Design & Creative'
  | 'Other / Custom';

export type CatalogPlatform =
  | 'Coursera'
  | 'Udemy'
  | 'edX'
  | 'NPTEL/SWAYAM'
  | 'freeCodeCamp'
  | 'MDN'
  | 'YouTube'
  | 'LeetCode'
  | 'HackerRank'
  | 'W3Schools'
  | 'Kaggle Learn'
  | 'Khan Academy';

export interface CatalogResource {
  id: string;
  field?: CareerField | string;
  skill: string;
  platform: CatalogPlatform | string;
  channel?: string;
  title: string;
  url: string;
  level: SkillLevel;
  duration: string;
  cost: ResourceCost;
  format: StudyFormat;
  description: string;
  isSearchFallback?: boolean;
}

export interface ClaimedSkill {
  name: string;
  claimedLevel: SkillLevel;
}

export interface LearnerProfile {
  id: string;
  name: string;
  email?: string;
  field: CareerField;
  preferredLanguage: AppLanguage;
  educationOrRole: string;
  existingSkills: ClaimedSkill[];
  certifications: string[];
  projects: string[];
  targetCareer: string;
  weeklyHours: number;
  budget: BudgetPreference;
  preferredFormat: StudyFormat;
  resumeText?: string;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdaptiveQuestion {
  id: string;
  difficulty: SkillLevel;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface PracticalTask {
  prompt: string;
  starterHint: string;
  rubric: string[];
}

export interface SkillAssessmentPackage {
  skill: string;
  questions: {
    Beginner: AdaptiveQuestion[];
    Intermediate: AdaptiveQuestion[];
    Advanced: AdaptiveQuestion[];
  };
  practicalTask: PracticalTask;
}

export interface SkillAssessmentResult {
  skill: string;
  claimedLevel: SkillLevel;
  verifiedLevel: SkillLevel;
  mcqScore: number;
  practicalScore: number;
  verifiedScore: number;
  practicalFeedback: string;
  rubricBreakdown: { criterion: string; score: number; comment: string }[];
  answeredCount: number;
  correctCount: number;
  completedAt: string;
}

export interface SkillGapItem {
  skill: string;
  currentScore: number;
  requiredScore: number;
  status: 'strong' | 'developing' | 'gap';
  priority: 'High' | 'Medium' | 'Low';
  note: string;
}

export interface CareerAnalysis {
  targetCareer: string;
  jobReadinessScore: number;
  estimatedWeeksToReady: number;
  summary: string;
  skills: SkillGapItem[];
  analyzedAt: string;
}

export interface YouTubeSuggestion {
  id: string;
  title: string;
  channel: string;
  query: string;
  url: string;
  duration: string;
  reason: string;
  isDirectVideo?: boolean;
}

export interface RoadmapStep {
  id: string;
  week: number;
  order: number;
  skill: string;
  focusTitle: string;
  whyItMatters: string;
  targetLevel: SkillLevel;
  estimatedHours: number;
  completed: boolean;
  prerequisites?: string[];
  isRevisionModule?: boolean;
  isAccelerated?: boolean;
  adaptiveTag?: string;
  youtubeSuggestions?: YouTubeSuggestion[];
  resources: {
    video: CatalogResource;
    reading: CatalogResource;
    handsOn: CatalogResource;
  };
}

export interface AdaptiveNotice {
  id: string;
  trigger: 'low-score' | 'high-score' | 'goal-change' | 'mentor-command';
  title: string;
  message: string;
  createdAt: string;
}

export interface QuizHistoryPoint {
  id: string;
  date: string;
  label: string;
  skill: string;
  score: number;
  readinessAfter: number;
}

export type OpportunityCategory = 'hackathon' | 'internship' | 'job_role';
export type OpportunityMode = 'online' | 'offline' | 'remote' | 'hybrid';
export type OpportunityCost = 'free' | 'paid';
export type ReadinessBand = 'ready-now' | 'ready-soon' | 'stretch';

export interface OpportunityItem {
  id: string;
  category: OpportunityCategory;
  title: string;
  organization: string;
  mode: OpportunityMode;
  location: string;
  cost: OpportunityCost;
  dateOrDeadline?: string;
  prizeOrStipend?: string;
  duration?: string;
  overview?: string;
  responsibilities?: string[];
  requiredSkills: string[];
  niceToHaveSkills?: string[];
  experienceLevels?: string[];
  careerPath?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  isVerifiedFallback?: boolean;
  fetchedAt?: string;
}

export interface OpportunitySkillFit {
  matchPercent: number;
  matchedSkills: string[];
  partialSkills: string[];
  missingSkills: string[];
  readinessBand: ReadinessBand;
  readinessLabel: string;
  estimatedWeeks: number;
}

export interface ScoutActivityEntry {
  id: string;
  fromAgent: 'Scout' | 'Gap Analyst' | 'Planner' | 'Curator' | 'Mentor';
  toAgent: 'Gap Analyst' | 'Planner' | 'Curator' | 'Learner';
  message: string;
  timestamp: string;
}

export interface CachedOpportunitiesState {
  targetCareer: string;
  field: string;
  cachedAt: string;
  hackathons: OpportunityItem[];
  internships: OpportunityItem[];
  jobRoles: OpportunityItem[];
  usedFallbackHackathons: boolean;
  usedFallbackInternships: boolean;
  mentorTip?: string;
}

export interface ActivityLogEntry {
  id: string;
  type: 'onboarding' | 'assessment' | 'roadmap' | 'replan' | 'mentor' | 'goal' | 'opportunity';
  title: string;
  detail: string;
  timestamp: string;
}

export type ChatbotRole = 'mentor' | 'interviewer' | 'tutor';
export type ChatbotMode = 'fast' | 'balanced' | 'deep';

export interface MentorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  appliedAction?: string;
  roleLabel?: string;
  modelUsed?: string;
  isVoice?: boolean;
}

export interface ProgressState {
  streakDays: number;
  lastActiveDate: string;
  quizHistory: QuizHistoryPoint[];
  readinessHistory: { label: string; score: number; date: string }[];
  activityLog: ActivityLogEntry[];
}

export interface LearnerWorkspace {
  profile: LearnerProfile;
  assessments: Record<string, SkillAssessmentResult>;
  analysis: CareerAnalysis | null;
  roadmap: RoadmapStep[];
  adaptiveNotices: AdaptiveNotice[];
  mentorHistory: MentorMessage[];
  progress: ProgressState;
  savedOpportunities?: OpportunityItem[];
  cachedOpportunities?: CachedOpportunitiesState | null;
  scoutActivityLog?: ScoutActivityEntry[];
}
