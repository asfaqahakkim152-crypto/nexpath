import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { GoogleGenAI, Modality, ThinkingLevel, Type } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'learners.json');
const CATALOG_PATH = path.join(__dirname, 'src', 'data', 'catalog.json');
const FALLBACK_OPPORTUNITIES_PATH = path.join(__dirname, 'src', 'data', 'opportunitiesFallback.json');

interface CatalogItem {
  id: string;
  field?: string;
  skill: string;
  platform: string;
  channel?: string;
  title: string;
  url: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  cost: 'free' | 'paid';
  format: 'video' | 'reading' | 'hands-on';
  description: string;
  isSearchFallback?: boolean;
}

interface ServerOpportunityItem {
  id: string;
  category: 'hackathon' | 'internship' | 'job_role';
  title: string;
  organization: string;
  mode: 'online' | 'offline' | 'remote' | 'hybrid';
  location: string;
  cost: 'free' | 'paid';
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

function loadCatalog(): CatalogItem[] {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw) as CatalogItem[];
}

function loadFallbackOpportunities(): ServerOpportunityItem[] {
  try {
    const raw = fs.readFileSync(FALLBACK_OPPORTUNITIES_PATH, 'utf-8');
    return JSON.parse(raw) as ServerOpportunityItem[];
  } catch {
    return [];
  }
}

const CATALOG = loadCatalog();
const CATALOG_BY_ID = new Map<string, CatalogItem>(CATALOG.map((item) => [item.id, item]));
const FALLBACK_OPPORTUNITIES = loadFallbackOpportunities();

function ensureStore(): Record<string, unknown> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({}, null, 2), 'utf-8');
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, unknown>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function safeJsonParse<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt extracting outermost JSON object or array if grounded text includes prose
    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    const firstArr = cleaned.indexOf('[');
    const lastArr = cleaned.lastIndexOf(']');
    if (firstObj !== -1 && lastObj > firstObj && (firstArr === -1 || firstObj < firstArr)) {
      try {
        return JSON.parse(cleaned.slice(firstObj, lastObj + 1)) as T;
      } catch {
        // continue to array check
      }
    }
    if (firstArr !== -1 && lastArr > firstArr) {
      try {
        return JSON.parse(cleaned.slice(firstArr, lastArr + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const modelCooldownUntil = new Map<string, number>();

function isModelAvailable(modelName: string): boolean {
  const until = modelCooldownUntil.get(modelName) ?? 0;
  return Date.now() >= until;
}

function recordModelFailure(modelName: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GenerateRequestsPerDay') || raw.includes('PerDay')) {
    const match = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
    const delayMs = match ? Math.min(Number(match[1]) * 1000, 30 * 60 * 1000) : 15 * 60 * 1000;
    modelCooldownUntil.set(modelName, Date.now() + Math.max(delayMs, 5 * 60 * 1000));
    return;
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    modelCooldownUntil.set(modelName, Date.now() + 20 * 1000);
  }
}

function isRetryableOrQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('timed out') ||
    msg.includes('fetch failed')
  );
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    primaryModel?: string;
    fallbackModel?: string;
    contents: string;
    thinkingLevel?: ThinkingLevel;
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    tools?: Array<Record<string, unknown>>;
    timeoutMs?: number;
  }
) {
  const requestedPrimary = params.primaryModel || 'gemini-3.1-flash-lite';
  const requestedFallback = params.fallbackModel || 'gemini-4-hydrogen';
  const timeoutMs = params.timeoutMs || 28000;

  const buildConfig = (modelName: string) => {
    const cfg: Record<string, unknown> = {};
    if (params.systemInstruction) cfg.systemInstruction = params.systemInstruction;
    if (params.responseMimeType) cfg.responseMimeType = params.responseMimeType;
    if (params.responseSchema) cfg.responseSchema = params.responseSchema;
    if (params.tools) cfg.tools = params.tools;
    if (modelName === 'gemini-4-hydrogen' && params.thinkingLevel) {
      cfg.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    }
    return cfg;
  };

  const candidates = Array.from(new Set([requestedPrimary, requestedFallback, 'gemini-3.1-flash-lite']));
  const activeModels = candidates.filter((m) => isModelAvailable(m));
  const orderedModels = activeModels.length > 0 ? activeModels : ['gemini-3.1-flash-lite'];

  let lastErr: unknown;
  for (let i = 0; i < orderedModels.length; i++) {
    const modelName = orderedModels[i];
    try {
      return await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: buildConfig(modelName) as never,
        }),
        timeoutMs,
        modelName
      );
    } catch (err) {
      lastErr = err;
      recordModelFailure(modelName, err);
      const raw = err instanceof Error ? err.message : String(err);
      if (i < orderedModels.length - 1 && (isRetryableOrQuotaError(err) || raw.includes('NOT_FOUND'))) {
        console.warn(`[NexPath AI Fallback] Model (${modelName}) failed, trying ${orderedModels[i + 1]}: ${raw.slice(0, 180)}`);
        continue;
      }
      if (isRetryableOrQuotaError(err)) {
        const retryModel = 'gemini-3.1-flash-lite';
        await new Promise((r) => setTimeout(r, 1500));
        return await withTimeout(
          ai.models.generateContent({
            model: retryModel,
            contents: params.contents,
            config: buildConfig(retryModel) as never,
          }),
          timeoutMs,
          `${retryModel}-retry`
        );
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All AI models failed.');
}

async function withRetries<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function buildSearchFallbackResource(
  skill: string,
  format: 'video' | 'reading' | 'hands-on',
  level: 'Beginner' | 'Intermediate' | 'Advanced',
  budget: 'free-only' | 'paid-ok'
): CatalogItem {
  const encoded = encodeURIComponent(skill);
  if (format === 'video') {
    if (budget === 'paid-ok') {
      return {
        id: `search-coursera-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        skill,
        platform: 'Coursera',
        title: `Search "${skill}" Courses on Coursera`,
        url: `https://www.coursera.org/search?query=${encoded}`,
        level,
        duration: 'Self-paced',
        cost: 'paid',
        format: 'video',
        description: `Explore curated university and industry courses for ${skill} on Coursera.`,
        isSearchFallback: true,
      };
    }
    return {
      id: `search-youtube-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      skill,
      platform: 'YouTube',
      title: `Search "${skill} tutorial" on YouTube`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(skill + ' tutorial')}`,
      level,
      duration: 'Self-paced',
      cost: 'free',
      format: 'video',
      description: `Video tutorials and walkthroughs for ${skill}.`,
      isSearchFallback: true,
    };
  }
  if (format === 'reading') {
    return {
      id: `search-coursera-read-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      skill,
      platform: 'Coursera',
      title: `Explore "${skill}" Guides & Syllabi on Coursera`,
      url: `https://www.coursera.org/search?query=${encoded}`,
      level,
      duration: 'Self-paced',
      cost: 'free',
      format: 'reading',
      description: `Browse structured reading syllabi and audit materials for ${skill}.`,
      isSearchFallback: true,
    };
  }
  return {
    id: `search-udemy-lab-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    skill,
    platform: budget === 'paid-ok' ? 'Udemy' : 'YouTube',
    title:
      budget === 'paid-ok'
        ? `Search "${skill}" Hands-on Projects on Udemy`
        : `Search "${skill} hands on project" on YouTube`,
    url:
      budget === 'paid-ok'
        ? `https://www.udemy.com/courses/search/?q=${encoded}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(skill + ' project tutorial')}`,
    level,
    duration: 'Self-paced',
    cost: budget === 'paid-ok' ? 'paid' : 'free',
    format: 'hands-on',
    description: `Hands-on project exercises and guided builds for ${skill}.`,
    isSearchFallback: true,
  };
}

function selectCatalogResourcesForSkill(
  skill: string,
  targetLevel: 'Beginner' | 'Intermediate' | 'Advanced',
  budget: 'free-only' | 'paid-ok',
  suggestedIds?: { videoId?: string; readingId?: string; handsOnId?: string }
): { video: CatalogItem; reading: CatalogItem; handsOn: CatalogItem } {
  const norm = skill.trim().toLowerCase();

  const isEligibleCost = (item: CatalogItem) =>
    budget === 'paid-ok' ? true : item.cost === 'free';

  const pickByFormat = (
    format: 'video' | 'reading' | 'hands-on',
    suggestedId?: string
  ): CatalogItem => {
    if (suggestedId && CATALOG_BY_ID.has(suggestedId)) {
      const candidate = CATALOG_BY_ID.get(suggestedId)!;
      if (candidate.format === format && isEligibleCost(candidate)) {
        return candidate;
      }
    }
    const exactMatches = CATALOG.filter(
      (item) =>
        item.format === format &&
        isEligibleCost(item) &&
        (item.skill.toLowerCase() === norm ||
          norm.includes(item.skill.toLowerCase()) ||
          item.skill.toLowerCase().includes(norm))
    );
    if (exactMatches.length > 0) {
      const levelMatch = exactMatches.find((m) => m.level === targetLevel);
      return levelMatch || exactMatches[0];
    }
    // Check if there is any format match for this skill in catalog (still honoring cost)
    const anySkillMatch = CATALOG.filter(
      (item) =>
        isEligibleCost(item) &&
        (item.skill.toLowerCase() === norm ||
          norm.includes(item.skill.toLowerCase()) ||
          item.skill.toLowerCase().includes(norm))
    );
    if (anySkillMatch.length > 0 && format === 'hands-on') {
      const preferPractice = anySkillMatch.find(
        (m) => m.format === 'hands-on' || m.format === 'reading'
      );
      if (preferPractice) return preferPractice;
    }
    return buildSearchFallbackResource(skill, format, targetLevel, budget);
  };

  return {
    video: pickByFormat('video', suggestedIds?.videoId),
    reading: pickByFormat('reading', suggestedIds?.readingId),
    handsOn: pickByFormat('hands-on', suggestedIds?.handsOnId),
  };
}

function getLanguageInstruction(code?: string): string {
  const map: Record<string, string> = {
    en: 'English',
    hi: 'Hindi (हिन्दी)',
    ta: 'Tamil (தமிழ்)',
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    ar: 'Arabic (العربية)',
  };
  const label = (code && map[code]) || 'English';
  if (label === 'English') return 'Respond in clear English.';
  return `Respond in natural, clear ${label}. Keep JSON property names in English as required by the schema, and write all human-facing text values in ${label}.`;
}

function buildYouTubeSuggestionsForStep(
  skill: string,
  field: string,
  languageCode: string,
  aiTopicSuggestions?: Array<{ title: string; channel: string; query: string; duration: string; reason: string }>
) {
  const norm = skill.toLowerCase();
  const catalogYts = CATALOG.filter(
    (item) =>
      item.platform === 'YouTube' &&
      (item.skill.toLowerCase() === norm ||
        norm.includes(item.skill.toLowerCase()) ||
        item.skill.toLowerCase().includes(norm))
  ).map((item) => ({
    id: item.id,
    title: item.title,
    channel: item.channel || 'YouTube Educator',
    query: `${skill} ${field}`,
    url: item.url,
    duration: item.duration,
    reason: item.description,
    isDirectVideo: item.url.includes('/watch?') || item.url.includes('/playlist?'),
  }));

  const extra = (aiTopicSuggestions || []).slice(0, 3).map((sug, idx) => {
    const langHint = languageCode && languageCode !== 'en' ? ` ${getLanguageInstruction(languageCode).split(' ')[3] || ''}` : '';
    const searchQuery = `${sug.query || skill}${langHint}`.trim();
    return {
      id: `yt-sug-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx + 1}`,
      title: sug.title,
      channel: sug.channel || 'Recommended YouTube Search',
      query: searchQuery,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
      duration: sug.duration || '15-45 min',
      reason: sug.reason || `Focused ${skill} walkthrough for ${field}.`,
      isDirectVideo: false,
    };
  });

  const combined = [...catalogYts, ...extra];
  if (combined.length === 0) {
    combined.push({
      id: `yt-fallback-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `${skill} Complete Course & Walkthrough`,
      channel: 'YouTube Learning Search',
      query: `${skill} ${field} full tutorial`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill} ${field} tutorial`)}`,
      duration: 'Self-paced',
      reason: `Curated YouTube search results for ${skill} in ${field}.`,
      isDirectVideo: false,
    });
  }
  return combined.slice(0, 3);
}

function summarizeAiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  console.error('[NexPath AI Error]', raw);
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'The Gemini API key could not be verified. Please check Settings > Secrets.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI requests are temporarily rate-limited. Please wait a few seconds and try again.',
    };
  }
  return {
    status: 500,
    message: 'NexPath could not reach the AI engine right now. Please try again.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'NexPath' });
  });

  // Curated catalog endpoint
  app.get('/api/catalog', (_req: Request, res: Response) => {
    res.json({ items: CATALOG });
  });

  // Persistence endpoints (file-backed store in .data/learners.json)
  app.get('/api/learners', (_req: Request, res: Response) => {
    const store = ensureStore();
    const summaries = Object.values(store).map((entry: unknown) => {
      const workspace = entry as {
        profile?: {
          id?: string;
          name?: string;
          targetCareer?: string;
          updatedAt?: string;
          onboardingComplete?: boolean;
        };
      };
      return {
        id: workspace.profile?.id || 'default',
        name: workspace.profile?.name || 'Learner',
        targetCareer: workspace.profile?.targetCareer || '',
        updatedAt: workspace.profile?.updatedAt || '',
        onboardingComplete: Boolean(workspace.profile?.onboardingComplete),
      };
    });
    res.json({ learners: summaries });
  });

  app.get('/api/learner/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || 'default');
    const store = ensureStore();
    if (!store[id]) {
      res.status(404).json({ error: 'Learner workspace not found.' });
      return;
    }
    res.json({ workspace: store[id] });
  });

  app.put('/api/learner/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || 'default');
    const { workspace } = req.body as { workspace?: unknown };
    if (!workspace) {
      res.status(400).json({ error: 'Workspace payload is required.' });
      return;
    }
    const store = ensureStore();
    store[id] = workspace;
    writeStore(store);
    res.json({ ok: true });
  });

  app.delete('/api/learner/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || 'default');
    const store = ensureStore();
    delete store[id];
    writeStore(store);
    res.json({ ok: true });
  });

  // 1. Profiler Agent: extract profile & skills from resume text
  app.post('/api/agents/profiler', async (req: Request, res: Response) => {
    try {
      const { resumeText } = req.body as { resumeText?: string };
      if (!resumeText || resumeText.trim().length < 20) {
        res.status(400).json({
          error: 'Please paste at least a short paragraph of your resume or background.',
        });
        return;
      }
      const ai = getAiClient();
      const response = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        contents: `Extract structured learner profile details from the following resume or bio text:\n\n${resumeText.slice(0, 8000)}`,
        thinkingLevel: ThinkingLevel.LOW,
        systemInstruction:
          'You are the NexPath Profiler Agent. Parse resumes accurately without inventing credentials. Infer conservative skill levels (Beginner, Intermediate, Advanced) based on projects and experience.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Full name if mentioned, otherwise empty string.' },
            educationOrRole: {
              type: Type.STRING,
              description: 'Current role, degree, or academic standing.',
            },
            skills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  claimedLevel: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
                },
                required: ['name', 'claimedLevel'],
              },
            },
            certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
            projects: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedTargetCareer: {
              type: Type.STRING,
              description: 'Best matching target role such as Full-Stack Developer, Data Analyst, Machine Learning Engineer, Frontend Engineer, Backend Engineer, or Cloud Engineer.',
            },
          },
          required: ['educationOrRole', 'skills', 'certifications', 'projects', 'suggestedTargetCareer'],
        },
      });

      const parsed = safeJsonParse(response.text, null);
      if (!parsed) {
        res.status(502).json({ error: 'Unable to parse resume structure. Please try again.' });
        return;
      }
      res.json(parsed);
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2a. Assessor Agent: Generate adaptive 3-tier question bank + practical task for a skill across ANY field
  app.post('/api/agents/assessor/quiz', async (req: Request, res: Response) => {
    try {
      const { skill, claimedLevel, targetCareer, field, language } = req.body as {
        skill?: string;
        claimedLevel?: string;
        targetCareer?: string;
        field?: string;
        language?: string;
      };
      if (!skill) {
        res.status(400).json({ error: 'Skill name is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        contents: `Generate an adaptive assessment package for the skill "${skill}".
Career Domain / Field: ${field || 'General Professional'}.
Learner claimed level: ${claimedLevel || 'Intermediate'}.
Target career context: ${targetCareer || 'Target Role'}.
${getLanguageInstruction(language)}

Create:
- 3 Beginner multiple-choice questions (foundational concepts)
- 3 Intermediate multiple-choice questions (applied real-world scenarios or case analysis)
- 3 Advanced multiple-choice questions (complex problem solving, optimization, or clinical/pedagogical/technical judgment)
- 1 practical short-answer, case-study, lesson-plan, or coding challenge appropriate for "${skill}" in ${field || 'their field'}, with 3 clear rubric criteria.`,
        systemInstruction:
          `You are the NexPath Assessor Agent across all disciplines (Medical & Healthcare, Teaching & Education, Technology, Business, Design). Write unambiguous, domain-authentic questions with 4 distinct options and a clear explanation. ${getLanguageInstruction(language)}`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            beginner: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
              },
            },
            intermediate: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
              },
            },
            advanced: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
              },
            },
            practicalTask: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                starterHint: { type: Type.STRING },
                rubric: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['prompt', 'starterHint', 'rubric'],
            },
          },
          required: ['beginner', 'intermediate', 'advanced', 'practicalTask'],
        },
      });

      const raw = safeJsonParse<{
        beginner?: Array<Record<string, unknown>>;
        intermediate?: Array<Record<string, unknown>>;
        advanced?: Array<Record<string, unknown>>;
        practicalTask?: { prompt: string; starterHint: string; rubric: string[] };
      }>(response.text, {});

      if (!raw.beginner?.length || !raw.intermediate?.length || !raw.advanced?.length || !raw.practicalTask) {
        res.status(502).json({ error: 'Assessment generation returned incomplete data. Please try again.' });
        return;
      }

      const tag = (items: Array<Record<string, unknown>>, difficulty: 'Beginner' | 'Intermediate' | 'Advanced') =>
        items.slice(0, 3).map((q, idx) => ({
          id: String(q.id || `${difficulty.toLowerCase()}-${idx + 1}`),
          difficulty,
          question: String(q.question || ''),
          options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex: Math.min(3, Math.max(0, Number(q.correctIndex ?? 0))),
          explanation: String(q.explanation || ''),
        }));

      res.json({
        skill,
        questions: {
          Beginner: tag(raw.beginner, 'Beginner'),
          Intermediate: tag(raw.intermediate, 'Intermediate'),
          Advanced: tag(raw.advanced, 'Advanced'),
        },
        practicalTask: raw.practicalTask,
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2b. Assessor Agent: Grade practical submission against rubric & compute verified score
  app.post('/api/agents/assessor/grade', async (req: Request, res: Response) => {
    try {
      const { skill, claimedLevel, mcqScore, practicalPrompt, rubric, answer } = req.body as {
        skill?: string;
        claimedLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
        mcqScore?: number;
        practicalPrompt?: string;
        rubric?: string[];
        answer?: string;
      };
      if (!skill || !practicalPrompt) {
        res.status(400).json({ error: 'Skill and practical prompt are required.' });
        return;
      }
      const trimmedAnswer = (answer || '').trim();
      if (!trimmedAnswer) {
        res.status(400).json({ error: 'Please write a solution or explanation before submitting.' });
        return;
      }

      const ai = getAiClient();
      const response = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        contents: `Grade this learner's practical task submission for "${skill}".
Task Prompt: ${practicalPrompt}
Rubric Criteria:
${(rubric || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Learner Submission:
${trimmedAnswer.slice(0, 4000)}`,
        systemInstruction:
          'You are the NexPath Assessor Agent. Grade fairly and strictly against the rubric criteria. Provide actionable, encouraging technical feedback.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            practicalScore: { type: Type.INTEGER, description: 'Score from 0 to 100' },
            feedback: { type: Type.STRING, description: 'Concise 2-3 sentence constructive feedback.' },
            rubricBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  criterion: { type: Type.STRING },
                  score: { type: Type.INTEGER, description: 'Score 0 to 100 for this criterion' },
                  comment: { type: Type.STRING },
                },
                required: ['criterion', 'score', 'comment'],
              },
            },
          },
          required: ['practicalScore', 'feedback', 'rubricBreakdown'],
        },
      });

      const graded = safeJsonParse<{
        practicalScore?: number;
        feedback?: string;
        rubricBreakdown?: { criterion: string; score: number; comment: string }[];
      }>(response.text, {});

      const practicalScore = Math.max(0, Math.min(100, Number(graded.practicalScore ?? 60)));
      const safeMcq = Math.max(0, Math.min(100, Number(mcqScore ?? 60)));
      const verifiedScore = Math.round(safeMcq * 0.6 + practicalScore * 0.4);
      const verifiedLevel: 'Beginner' | 'Intermediate' | 'Advanced' =
        verifiedScore >= 80 ? 'Advanced' : verifiedScore >= 55 ? 'Intermediate' : 'Beginner';

      res.json({
        skill,
        claimedLevel: claimedLevel || 'Beginner',
        verifiedLevel,
        mcqScore: safeMcq,
        practicalScore,
        verifiedScore,
        practicalFeedback: graded.feedback || 'Evaluated against the task rubric.',
        rubricBreakdown: graded.rubricBreakdown || [],
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Gap Analyst & Curator Agent: Multi-field career gap analysis, dependency graph, and YouTube + Catalog curation
  app.post('/api/agents/analyze-and-curate', async (req: Request, res: Response) => {
    try {
      const { profile, assessments } = req.body as {
        profile?: {
          name?: string;
          field?: string;
          preferredLanguage?: string;
          educationOrRole?: string;
          existingSkills?: { name: string; claimedLevel: string }[];
          certifications?: string[];
          projects?: string[];
          targetCareer?: string;
          weeklyHours?: number;
          budget?: 'free-only' | 'paid-ok';
          preferredFormat?: 'video' | 'reading' | 'hands-on';
        };
        assessments?: Record<
          string,
          { verifiedScore: number; verifiedLevel: string; claimedLevel: string }
        >;
      };

      if (!profile || !profile.targetCareer) {
        res.status(400).json({ error: 'Learner profile and target career are required.' });
        return;
      }

      const budget = profile.budget || 'free-only';
      const weeklyHours = Math.max(1, Number(profile.weeklyHours || 6));
      const field = profile.field || 'General Professional';
      const lang = profile.preferredLanguage || 'en';

      const compactCatalog = CATALOG.filter((c) => {
        const costOk = budget === 'paid-ok' ? true : c.cost === 'free';
        if (!costOk) return false;
        if (!profile.field || profile.field === 'Other / Custom') return true;
        return !c.field || c.field === profile.field;
      })
        .slice(0, 32)
        .map((c) => ({
          id: c.id,
          skill: c.skill,
          platform: c.platform,
          title: c.title,
          level: c.level,
          format: c.format,
        }));

      const ai = getAiClient();
      const response = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        timeoutMs: 22000,
        contents: `Analyze this learner's readiness for the target career "${profile.targetCareer}" in the field "${field}", and design a dependency-graph learning roadmap.
${getLanguageInstruction(lang)}

Learner Profile:
- Field / Domain: ${field}
- Education/Role: ${profile.educationOrRole || 'Not specified'}
- Weekly Study Hours: ${weeklyHours} hours/week
- Preferred Format: ${profile.preferredFormat || 'video'}
- Budget: ${budget}
- Claimed Skills: ${JSON.stringify(profile.existingSkills || [])}
- Verified Assessments: ${JSON.stringify(assessments || {})}
- Projects: ${JSON.stringify(profile.projects || [])}
- Certifications: ${JSON.stringify(profile.certifications || [])}

Curated Catalog Resources (ONLY reference IDs from this list when available; leave empty string if no catalog item matches):
${JSON.stringify(compactCatalog)}

Requirements:
1. Identify 6 to 8 core skills required for "${profile.targetCareer}" in "${field}".
2. Compare currentScore vs requiredScore, and classify status ("strong", "developing", "gap").
3. Order 5 to 7 roadmap steps from foundational prerequisites to advanced mastery across weeks.
4. For each step, list "prerequisites" (names of earlier roadmap skills in this plan that this step depends on, empty array for Week 1 roots) so we can render an interactive dependency graph!
5. For each step, pick matching videoId, readingId, handsOnId from the catalog (or empty string if none matches) AND provide 2 targeted "youtubeTopics" (topic title, educator/channel style, search query, duration estimate, and why it helps).`,
        systemInstruction:
          `You are the NexPath Multi-Domain Gap Analyst & Curator Agent supporting Medical, Teaching, Technology, Business, and Design fields. Never invent course URLs. Strictly select catalog IDs from the provided JSON catalog and provide helpful YouTube search topic recommendations. ${getLanguageInstruction(lang)}`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobReadinessScore: { type: Type.INTEGER, description: 'Overall percentage 0 to 100' },
            estimatedWeeksToReady: { type: Type.INTEGER },
            summary: { type: Type.STRING, description: '2-3 sentence executive summary of strengths and top gaps.' },
            skills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  skill: { type: Type.STRING },
                  currentScore: { type: Type.INTEGER },
                  requiredScore: { type: Type.INTEGER },
                  status: { type: Type.STRING, enum: ['strong', 'developing', 'gap'] },
                  priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
                  note: { type: Type.STRING },
                },
                required: ['skill', 'currentScore', 'requiredScore', 'status', 'priority', 'note'],
              },
            },
            roadmapSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  week: { type: Type.INTEGER },
                  skill: { type: Type.STRING },
                  focusTitle: { type: Type.STRING },
                  whyItMatters: { type: Type.STRING },
                  targetLevel: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
                  estimatedHours: { type: Type.INTEGER },
                  prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
                  videoId: { type: Type.STRING },
                  readingId: { type: Type.STRING },
                  handsOnId: { type: Type.STRING },
                  youtubeTopics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        channel: { type: Type.STRING },
                        query: { type: Type.STRING },
                        duration: { type: Type.STRING },
                        reason: { type: Type.STRING },
                      },
                      required: ['title', 'channel', 'query', 'duration', 'reason'],
                    },
                  },
                },
                required: [
                  'week',
                  'skill',
                  'focusTitle',
                  'whyItMatters',
                  'targetLevel',
                  'estimatedHours',
                  'prerequisites',
                  'videoId',
                  'readingId',
                  'handsOnId',
                  'youtubeTopics',
                ],
              },
            },
          },
          required: ['jobReadinessScore', 'estimatedWeeksToReady', 'summary', 'skills', 'roadmapSteps'],
        },
      });

      const raw = safeJsonParse<{
        jobReadinessScore?: number;
        estimatedWeeksToReady?: number;
        summary?: string;
        skills?: Array<{
          skill: string;
          currentScore: number;
          requiredScore: number;
          status: 'strong' | 'developing' | 'gap';
          priority: 'High' | 'Medium' | 'Low';
          note: string;
        }>;
        roadmapSteps?: Array<{
          week: number;
          skill: string;
          focusTitle: string;
          whyItMatters: string;
          targetLevel: 'Beginner' | 'Intermediate' | 'Advanced';
          estimatedHours: number;
          prerequisites?: string[];
          videoId?: string;
          readingId?: string;
          handsOnId?: string;
          youtubeTopics?: Array<{
            title: string;
            channel: string;
            query: string;
            duration: string;
            reason: string;
          }>;
        }>;
      }>(response.text, {});

      if (!raw.skills?.length || !raw.roadmapSteps?.length) {
        res.status(502).json({ error: 'Could not generate career gap analysis. Please try again.' });
        return;
      }

      const now = new Date().toISOString();
      const analysis = {
        targetCareer: profile.targetCareer,
        jobReadinessScore: Math.max(0, Math.min(100, Number(raw.jobReadinessScore ?? 50))),
        estimatedWeeksToReady: Math.max(1, Number(raw.estimatedWeeksToReady ?? 6)),
        summary: raw.summary || `Gap analysis for ${profile.targetCareer}.`,
        skills: raw.skills.map((s) => ({
          ...s,
          currentScore: Math.max(0, Math.min(100, Number(s.currentScore))),
          requiredScore: Math.max(0, Math.min(100, Number(s.requiredScore))),
        })),
        analyzedAt: now,
      };

      const roadmap = raw.roadmapSteps.map((step, index) => ({
        id: `step-${Date.now()}-${index + 1}`,
        week: Math.max(1, Number(step.week || index + 1)),
        order: index + 1,
        skill: step.skill,
        focusTitle: step.focusTitle,
        whyItMatters: step.whyItMatters,
        targetLevel: step.targetLevel || 'Intermediate',
        estimatedHours: Math.max(1, Number(step.estimatedHours || weeklyHours)),
        completed: false,
        prerequisites: Array.isArray(step.prerequisites) ? step.prerequisites : [],
        youtubeSuggestions: buildYouTubeSuggestionsForStep(
          step.skill,
          field,
          lang,
          step.youtubeTopics
        ),
        resources: selectCatalogResourcesForSkill(step.skill, step.targetLevel || 'Intermediate', budget, {
          videoId: step.videoId,
          readingId: step.readingId,
          handsOnId: step.handsOnId,
        }),
      }));

      res.json({ analysis, roadmap });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. Adaptive Re-planner Agent: handles low score (<50%), high score (>85%), or mentor adjustments
  app.post('/api/agents/replan', async (req: Request, res: Response) => {
    try {
      const { trigger, skill, score, instruction, profile, roadmap } = req.body as {
        trigger?: 'low-score' | 'high-score' | 'mentor-command';
        skill?: string;
        score?: number;
        instruction?: string;
        profile?: {
          targetCareer?: string;
          weeklyHours?: number;
          budget?: 'free-only' | 'paid-ok';
          preferredFormat?: 'video' | 'reading' | 'hands-on';
        };
        roadmap?: Array<{
          id: string;
          week: number;
          order: number;
          skill: string;
          focusTitle: string;
          whyItMatters: string;
          targetLevel: 'Beginner' | 'Intermediate' | 'Advanced';
          estimatedHours: number;
          completed: boolean;
          isRevisionModule?: boolean;
          isAccelerated?: boolean;
          adaptiveTag?: string;
          resources: {
            video: CatalogItem;
            reading: CatalogItem;
            handsOn: CatalogItem;
          };
        }>;
      };

      const budget = profile?.budget || 'free-only';
      const currentRoadmap = Array.isArray(roadmap) ? [...roadmap] : [];

      if (trigger === 'low-score' && skill) {
        const ai = getAiClient();
        const mentorResp = await generateWithFallback(ai, {
          primaryModel: 'gemini-3.1-flash-lite',
          fallbackModel: 'gemini-4-hydrogen',
          contents: `The learner scored ${score}% on the "${skill}" skill assessment (below 50%).
Target career: ${profile?.targetCareer || 'their target role'}.
We are inserting a targeted revision module for ${skill} and prioritizing hands-on interactive practice over passive video.
Write a warm, clear, motivating 2-sentence Mentor explanation explaining why this revision module helps them build confidence.`,
          thinkingLevel: ThinkingLevel.LOW,
        });

        const revisionResources = selectCatalogResourcesForSkill(skill, 'Beginner', budget);
        // Swap primary video slot to hands-on style or prioritize hands-on first in step
        const revisionStep = {
          id: `rev-${Date.now()}`,
          week: 1,
          order: 1,
          skill,
          focusTitle: `${skill} Core Foundations & Guided Revision`,
          whyItMatters: `Strengthens fundamental ${skill} mental models with hands-on drills before advancing to complex tasks.`,
          targetLevel: 'Beginner' as const,
          estimatedHours: Math.max(2, Math.min(4, Number(profile?.weeklyHours || 4))),
          completed: false,
          isRevisionModule: true,
          adaptiveTag: 'Revision module · Swapped to hands-on practice',
          resources: {
            video: revisionResources.handsOn,
            reading: revisionResources.reading,
            handsOn: revisionResources.handsOn,
          },
        };

        // Shift uncompleted steps down by 1 week if they collide, keeping completed steps intact
        const shifted = currentRoadmap.map((step, idx) => ({
          ...step,
          week: step.completed ? step.week : step.week + 1,
          order: idx + 2,
        }));

        const updatedRoadmap = [revisionStep, ...shifted].map((s, idx) => ({
          ...s,
          order: idx + 1,
        }));

        res.json({
          updatedRoadmap,
          notice: {
            id: `notice-${Date.now()}`,
            trigger: 'low-score',
            title: `Adaptive revision added for ${skill}`,
            message:
              mentorResp.text?.trim() ||
              `Your ${skill} score (${score}%) showed a few foundational gaps, so I inserted a focused hands-on revision module at Week 1 to lock in the core concepts before you move forward.`,
            createdAt: new Date().toISOString(),
          },
        });
        return;
      }

      if (trigger === 'high-score' && skill) {
        const ai = getAiClient();
        const mentorResp = await generateWithFallback(ai, {
          primaryModel: 'gemini-3.1-flash-lite',
          fallbackModel: 'gemini-4-hydrogen',
          contents: `The learner scored ${score}% on "${skill}" (above 85%!).
We are skipping introductory modules for ${skill} and upgrading their roadmap to an advanced challenge module.
Write an encouraging 2-sentence Mentor message celebrating this mastery and explaining the accelerated step.`,
          thinkingLevel: ThinkingLevel.LOW,
        });

        let upgraded = false;
        const nextRoadmap = currentRoadmap
          .filter((step) => {
            if (
              step.skill.toLowerCase() === skill.toLowerCase() &&
              step.targetLevel === 'Beginner' &&
              !step.completed
            ) {
              upgraded = true;
              return false;
            }
            return true;
          })
          .map((step) => {
            if (step.skill.toLowerCase() === skill.toLowerCase() && !step.completed) {
              upgraded = true;
              return {
                ...step,
                focusTitle: `Advanced ${skill} Architecture & Production Patterns`,
                targetLevel: 'Advanced' as const,
                isAccelerated: true,
                adaptiveTag: 'Basics skipped · Advanced track',
                resources: selectCatalogResourcesForSkill(skill, 'Advanced', budget),
              };
            }
            return step;
          });

        if (!upgraded) {
          nextRoadmap.unshift({
            id: `adv-${Date.now()}`,
            week: 1,
            order: 1,
            skill,
            focusTitle: `Advanced ${skill} Systems & Interview Mastery`,
            whyItMatters: `Since you verified ${score}% proficiency in ${skill}, jump straight to production-level mastery.`,
            targetLevel: 'Advanced',
            estimatedHours: Math.max(3, Math.min(6, Number(profile?.weeklyHours || 5))),
            completed: false,
            isAccelerated: true,
            adaptiveTag: 'Basics skipped · Advanced track',
            resources: selectCatalogResourcesForSkill(skill, 'Advanced', budget),
          });
        }

        const reindexed = nextRoadmap.map((s, i) => ({
          ...s,
          order: i + 1,
          week: s.completed ? s.week : Math.max(1, Math.ceil((i + 1) / 1.5)),
        }));

        res.json({
          updatedRoadmap: reindexed,
          notice: {
            id: `notice-${Date.now()}`,
            trigger: 'high-score',
            title: `Fast-tracked ${skill} to Advanced`,
            message:
              mentorResp.text?.trim() ||
              `Strong result (${score}%) in ${skill}! I removed introductory material and upgraded your plan to an advanced module so you spend zero time repeating what you already know.`,
            createdAt: new Date().toISOString(),
          },
        });
        return;
      }

      // Mentor-driven custom replan (e.g., "Make my plan easier", "I only have 3 hours a week")
      const ai = getAiClient();
      const response = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        contents: `Update this learner's roadmap schedule based on their request: "${instruction || 'Adjust pace'}".
Current weekly hours: ${profile?.weeklyHours || 6}
Current uncompleted steps:
${JSON.stringify(
  currentRoadmap.map((s) => ({
    id: s.id,
    week: s.week,
    skill: s.skill,
    focusTitle: s.focusTitle,
    targetLevel: s.targetLevel,
    estimatedHours: s.estimatedHours,
    completed: s.completed,
  }))
)}`,
        systemInstruction:
          'You are the NexPath Adaptive Re-planner. Keep completed steps unchanged. Adjust week numbers, estimatedHours, and focusTitle/targetLevel of uncompleted steps to match the learner request.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            newWeeklyHours: { type: Type.INTEGER },
            summaryTitle: { type: Type.STRING },
            explanation: { type: Type.STRING },
            adjustedSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  week: { type: Type.INTEGER },
                  focusTitle: { type: Type.STRING },
                  targetLevel: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
                  estimatedHours: { type: Type.INTEGER },
                },
                required: ['id', 'week', 'focusTitle', 'targetLevel', 'estimatedHours'],
              },
            },
          },
          required: ['newWeeklyHours', 'summaryTitle', 'explanation', 'adjustedSteps'],
        },
      });

      const parsed = safeJsonParse<{
        newWeeklyHours?: number;
        summaryTitle?: string;
        explanation?: string;
        adjustedSteps?: Array<{
          id: string;
          week: number;
          focusTitle: string;
          targetLevel: 'Beginner' | 'Intermediate' | 'Advanced';
          estimatedHours: number;
        }>;
      }>(response.text, {});

      const adjustMap = new Map((parsed.adjustedSteps || []).map((a) => [a.id, a]));
      const updatedRoadmap = currentRoadmap.map((step) => {
        if (step.completed) return step;
        const patch = adjustMap.get(step.id);
        if (!patch) return step;
        return {
          ...step,
          week: Math.max(1, patch.week),
          focusTitle: patch.focusTitle || step.focusTitle,
          targetLevel: patch.targetLevel || step.targetLevel,
          estimatedHours: Math.max(1, patch.estimatedHours || step.estimatedHours),
          adaptiveTag: 'Pace updated by Mentor',
          resources: selectCatalogResourcesForSkill(step.skill, patch.targetLevel || step.targetLevel, budget),
        };
      });

      res.json({
        updatedRoadmap,
        newWeeklyHours: parsed.newWeeklyHours || profile?.weeklyHours || 6,
        notice: {
          id: `notice-${Date.now()}`,
          trigger: 'mentor-command',
          title: parsed.summaryTitle || 'Roadmap adapted to your schedule',
          message: parsed.explanation || 'Updated your roadmap pace and module intensity.',
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. AI Mentor Agent: Multi-turn ai.chats with role system instructions, language, and speed/reasoning modes
  app.post('/api/agents/mentor', async (req: Request, res: Response) => {
    try {
      const { message, history, workspaceContext, role, mode, language } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        workspaceContext?: {
          profile?: Record<string, unknown>;
          assessments?: Record<string, unknown>;
          analysis?: Record<string, unknown>;
          roadmap?: Array<Record<string, unknown>>;
        };
        role?: 'mentor' | 'interviewer' | 'tutor';
        mode?: 'fast' | 'balanced' | 'deep';
        language?: string;
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const ai = getAiClient();
      const langLine = getLanguageInstruction(language);

      const roleInstructions: Record<string, string> = {
        mentor: `You are NexPath's AI Study Mentor for any field (Medical, Teaching, Technology, Business, Design). Be warm, concise, practical, and grounded strictly in the learner's profile, verified vs claimed scores, career gaps, and roadmap steps. ${langLine}
If the learner asks to modify their roadmap (for example: "Make my plan easier", "I only have 3 hours a week", "Focus more on Pharmacology", "Slow down my schedule"), set shouldReplan=true and provide a clear replanInstruction describing the exact change.`,
        interviewer: `You are NexPath's Mock Interviewer tailored to the learner's domain and target role (e.g. clinical nursing scenarios for Medical, classroom scenarios for Teaching, case/technical questions for Business or Tech). Ask one focused question at a time and evaluate answers constructively. ${langLine}`,
        tutor: `You are NexPath's Concept Tutor. Break down complex concepts in the learner's field into clear intuition, practical real-world examples, and a quick comprehension check. ${langLine}`,
      };

      const selectedRole = role && roleInstructions[role] ? role : 'mentor';
      const selectedMode = mode || 'balanced';
      const wantsHydrogen = selectedMode === 'deep' && isModelAvailable('gemini-4-hydrogen');
      const primaryModel = wantsHydrogen ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';

      const thinkingConfigFor = (modelName: string) =>
        modelName !== 'gemini-4-hydrogen'
          ? undefined
          : selectedMode === 'deep'
            ? { thinkingLevel: ThinkingLevel.HIGH }
            : selectedMode === 'balanced'
              ? { thinkingLevel: ThinkingLevel.LOW }
              : undefined;

      const chatHistory = (history || [])
        .slice(-10)
        .filter((h) => h.content && h.content.trim())
        .map((h) => ({
          role: h.role === 'user' ? ('user' as const) : ('model' as const),
          parts: [{ text: h.content.slice(0, 1500) }],
        }));

      const compactContext = workspaceContext
        ? {
            profile: workspaceContext.profile,
            assessments: workspaceContext.assessments,
            analysisSummary: workspaceContext.analysis
              ? {
                  targetCareer: workspaceContext.analysis.targetCareer,
                  jobReadinessScore: workspaceContext.analysis.jobReadinessScore,
                  skills: workspaceContext.analysis.skills,
                }
              : null,
            roadmap: Array.isArray(workspaceContext.roadmap)
              ? workspaceContext.roadmap.slice(0, 12)
              : [],
          }
        : {};

      const mentorSchema = {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: 'Helpful, clear response.' },
          shouldReplan: {
            type: Type.BOOLEAN,
            description: 'True only if the learner asked to change roadmap pace, difficulty, hours, or focus.',
          },
          replanInstruction: {
            type: Type.STRING,
            description: 'Short instruction for the Adaptive Re-planner if shouldReplan is true, else empty string.',
          },
        },
        required: ['reply', 'shouldReplan', 'replanInstruction'],
      };

      let usedModel = primaryModel;
      let response;
      const runMentorChat = (modelName: string) => {
        const tc = thinkingConfigFor(modelName);
        const chat = ai.chats.create({
          model: modelName,
          history: chatHistory,
          config: {
            ...(tc ? { thinkingConfig: tc } : {}),
            systemInstruction: `${roleInstructions[selectedRole]}

Learner Workspace Context:
${JSON.stringify(compactContext)}`,
            responseMimeType: 'application/json',
            responseSchema: mentorSchema,
          },
        });
        return withTimeout(chat.sendMessage({ message }), 28000, `mentor-${modelName}`);
      };

      try {
        response = await runMentorChat(primaryModel);
      } catch (mentorErr) {
        recordModelFailure(primaryModel, mentorErr);
        const fallbackModel =
          primaryModel === 'gemini-4-hydrogen'
            ? 'gemini-3.1-flash-lite'
            : isModelAvailable('gemini-4-hydrogen')
              ? 'gemini-4-hydrogen'
              : 'gemini-3.1-flash-lite';
        console.warn('[NexPath Mentor Fallback]', mentorErr instanceof Error ? mentorErr.message : String(mentorErr));
        usedModel = fallbackModel;
        try {
          response = await runMentorChat(fallbackModel);
        } catch (secondErr) {
          recordModelFailure(fallbackModel, secondErr);
          await new Promise((r) => setTimeout(r, 1000));
          usedModel = 'gemini-3.1-flash-lite';
          response = await runMentorChat('gemini-3.1-flash-lite');
        }
      }

      const parsed = safeJsonParse<{
        reply?: string;
        shouldReplan?: boolean;
        replanInstruction?: string;
      }>(response.text, {
        reply: 'I am here to help you stay on track. Tell me which skill or topic you want to tackle next!',
        shouldReplan: false,
        replanInstruction: '',
      });

      res.json({
        reply: parsed.reply || 'Let us focus on your next priority step together.',
        shouldReplan: Boolean(parsed.shouldReplan),
        replanInstruction: parsed.replanInstruction || '',
        modelUsed: usedModel,
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 6. Opportunities Hub: Fallback Curated Opportunities
  app.get('/api/opportunities/fallback', (_req: Request, res: Response) => {
    res.json({ items: FALLBACK_OPPORTUNITIES });
  });

  // 7. Opportunity Scout Agent: Job Roles (strict JSON) + Grounded Search (Hackathons & Internships) + Scout -> Gap Analyst Handoff
  app.post('/api/agents/opportunity-scout', async (req: Request, res: Response) => {
    try {
      const { profile, assessments } = req.body as {
        profile?: {
          field?: string;
          preferredLanguage?: string;
          targetCareer?: string;
          educationOrRole?: string;
          existingSkills?: Array<{ name: string; claimedLevel: string }>;
        };
        assessments?: Record<string, { verifiedScore: number; verifiedLevel: string }>;
      };

      const targetCareer = profile?.targetCareer || 'Software Engineer';
      const field = profile?.field || 'Technology & Data';
      const lang = profile?.preferredLanguage || 'en';
      const verifiedAssessments = assessments || {};
      const langLine = getLanguageInstruction(lang);

      const normalizeMode = (val?: string): 'online' | 'offline' | 'remote' | 'hybrid' => {
        const lower = (val || '').toLowerCase();
        if (lower.includes('remote')) return 'remote';
        if (lower.includes('hybrid')) return 'hybrid';
        if (lower.includes('offline') || lower.includes('in-person') || lower.includes('onsite')) return 'offline';
        return 'online';
      };

      const cleanOptionalField = (val?: string): string => {
        const v = (val || '').trim();
        if (!v || /^(tbd|unknown|n\/a|none|null|undefined)$/i.test(v)) return 'Not listed';
        return v;
      };

      const ai = getAiClient();

      // A. Generate Job Roles via strict JSON schema
      let jobRoles: ServerOpportunityItem[] = [];
      try {
        const rolesResp = await generateWithFallback(ai, {
          primaryModel: 'gemini-3.1-flash-lite',
          fallbackModel: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
          contents: `Design 4 realistic, distinct Job Roles aligned to the learner's target career "${targetCareer}" in "${field}".
Learner background: ${profile?.educationOrRole || 'Early-career learner'}.
${langLine}
Ensure every salary range string starts with "Estimate:" (for example: "Estimate: $70,000 - $95,000 / year" or regional equivalent) and include clear careerPath steps (Intern > Junior > Mid > Senior).`,
          systemInstruction: `You are the Opportunity Scout Agent generating structured job role blueprints in strict JSON. Never invent external URLs. Label all salary ranges clearly as "Estimate: ...". ${langLine}`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              roles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    industryTrack: { type: Type.STRING },
                    mode: { type: Type.STRING, enum: ['online', 'offline', 'remote', 'hybrid'] },
                    location: { type: Type.STRING },
                    overview: { type: Type.STRING },
                    responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mustHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    niceToHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    experienceLevels: { type: Type.ARRAY, items: { type: Type.STRING } },
                    careerPath: { type: Type.ARRAY, items: { type: Type.STRING } },
                    salaryEstimate: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'industryTrack',
                    'mode',
                    'location',
                    'overview',
                    'responsibilities',
                    'mustHaveSkills',
                    'niceToHaveSkills',
                    'experienceLevels',
                    'careerPath',
                    'salaryEstimate',
                  ],
                },
              },
            },
            required: ['roles'],
          },
        });

        const parsedRoles = safeJsonParse<{
          roles?: Array<{
            title: string;
            industryTrack: string;
            mode: string;
            location: string;
            overview: string;
            responsibilities: string[];
            mustHaveSkills: string[];
            niceToHaveSkills: string[];
            experienceLevels: string[];
            careerPath: string[];
            salaryEstimate: string;
          }>;
        }>(rolesResp.text, { roles: [] });

        jobRoles = (parsedRoles.roles || []).slice(0, 6).map((r, idx) => ({
          id: `role-${Date.now()}-${idx + 1}`,
          category: 'job_role',
          title: r.title,
          organization: r.industryTrack || field,
          mode: normalizeMode(r.mode),
          location: cleanOptionalField(r.location) || 'Global / Hybrid',
          cost: 'free',
          overview: r.overview,
          responsibilities: (r.responsibilities || []).slice(0, 5),
          requiredSkills: (r.mustHaveSkills || []).slice(0, 6),
          niceToHaveSkills: (r.niceToHaveSkills || []).slice(0, 4),
          experienceLevels:
            r.experienceLevels?.length ? r.experienceLevels : ['Intern', 'Junior', 'Mid', 'Senior'],
          careerPath: r.careerPath?.length ? r.careerPath : ['Intern', 'Junior', 'Mid', 'Senior'],
          prizeOrStipend: r.salaryEstimate?.toLowerCase().includes('estimate')
            ? r.salaryEstimate
            : `Estimate: ${r.salaryEstimate || 'Varies by region & level'}`,
          fetchedAt: new Date().toISOString(),
        }));
      } catch {
        // Fallback deterministic role blueprint if Job Roles call fails
        jobRoles = [
          {
            id: `role-fb-1`,
            category: 'job_role',
            title: targetCareer,
            organization: field,
            mode: 'hybrid',
            location: 'Global / Hybrid',
            cost: 'free',
            overview: `Core practitioner role focused on ${targetCareer} responsibilities within ${field}.`,
            responsibilities: [
              `Apply core ${field} workflows and domain standards`,
              'Collaborate across multidisciplinary teams to deliver measurable outcomes',
              'Maintain documentation, quality checks, and continuous learning',
            ],
            requiredSkills:
              (profile?.existingSkills || []).slice(0, 4).map((s) => s.name).length > 0
                ? (profile?.existingSkills || []).slice(0, 4).map((s) => s.name)
                : [field, 'Problem Solving', 'Communication'],
            niceToHaveSkills: ['Project Management', 'Data Analysis'],
            experienceLevels: ['Intern', 'Junior', 'Mid', 'Senior'],
            careerPath: ['Intern', 'Junior', 'Mid', 'Senior'],
            prizeOrStipend: 'Estimate: Entry to Mid-level market range (varies by region)',
            fetchedAt: new Date().toISOString(),
          },
        ];
      }

      // B. Grounded Google Search for Hackathons & Internships
      const fetchGroundedCategory = async (
        cat: 'hackathon' | 'internship'
      ): Promise<{ items: ServerOpportunityItem[]; usedFallback: boolean }> => {
        const nowLabel = new Date().toISOString().slice(0, 10);
        const prompt =
          cat === 'hackathon'
            ? `Search the web for current or upcoming real ${field} and "${targetCareer}" hackathons, innovation challenges, or competitions (reference date: ${nowLabel}).
Return ONLY a valid JSON object (no extra commentary) of shape:
{ "items": [ { "title": "...", "organization": "...", "mode": "online|offline|remote|hybrid", "location": "...", "cost": "free|paid", "dateOrDeadline": "...", "prizeOrStipend": "...", "overview": "...", "requiredSkills": ["..."], "sourceUrl": "exact url from search results" } ] }
Rules:
- Only include items you actually found in Google Search results.
- Never invent dates, prizes, or URLs; write "Not listed" if a date or prize is not explicitly shown in search results.
- Include 4 to 6 relevant hackathons.`
            : `Search the web for current real ${field} and "${targetCareer}" internships or early-career student programs (reference date: ${nowLabel}).
Return ONLY a valid JSON object (no extra commentary) of shape:
{ "items": [ { "title": "...", "organization": "...", "mode": "online|offline|remote|hybrid", "location": "...", "cost": "free|paid", "dateOrDeadline": "...", "prizeOrStipend": "...", "duration": "...", "overview": "...", "requiredSkills": ["..."], "sourceUrl": "exact url from search results" } ] }
Rules:
- Only include items you actually found in Google Search results.
- Never invent stipends, deadlines, durations, or URLs; write "Not listed" if not explicitly shown.
- Include 4 to 6 relevant internships.`;

        try {
          const resp = await generateWithFallback(ai, {
            primaryModel: 'gemini-3.1-flash-lite',
            fallbackModel: 'gemini-4-hydrogen',
            thinkingLevel: ThinkingLevel.LOW,
            timeoutMs: 22000,
            contents: prompt,
            tools: [{ googleSearch: {} }],
            systemInstruction: `You are the NexPath Opportunity Scout Agent. Use Google Search grounding to find real opportunities. Always output valid JSON with an "items" array. ${langLine}`,
          });

          const groundingMeta = resp.candidates?.[0]?.groundingMetadata;
          const rawChunks = groundingMeta?.groundingChunks || [];
          const supports = groundingMeta?.groundingSupports || [];
          const chunks = rawChunks.filter((c) => Boolean(c.web?.uri && c.web.uri.startsWith('http')));

          const parsed = safeJsonParse<{
            items?: Array<{
              title?: string;
              organization?: string;
              mode?: string;
              location?: string;
              cost?: string;
              dateOrDeadline?: string;
              prizeOrStipend?: string;
              duration?: string;
              overview?: string;
              requiredSkills?: string[];
              sourceUrl?: string;
            }>;
          }>(resp.text, { items: [] });

          const verifiedItems: ServerOpportunityItem[] = [];
          const chunkUris = chunks.map((c) => ({
            uri: c.web!.uri!,
            title: (c.web?.title || '').toLowerCase(),
          }));

          for (let i = 0; i < (parsed.items || []).length; i++) {
            const raw = parsed.items![i];
            if (!raw.title || chunkUris.length === 0) continue;

            // Match ONLY against real URLs returned in groundingChunks
            const rawUrl = (raw.sourceUrl || '').trim();
            let matchedChunk = chunkUris.find((c) => c.uri === rawUrl);

            if (!matchedChunk && rawUrl) {
              try {
                const rawHost = new URL(rawUrl).hostname.replace(/^www\./, '');
                matchedChunk = chunkUris.find(
                  (c) => c.uri.includes(rawHost) || c.title.includes(rawHost)
                );
              } catch {
                // ignore invalid rawUrl
              }
            }

            if (!matchedChunk && supports.length > 0) {
              const titleLower = raw.title.toLowerCase();
              const orgLower = (raw.organization || '').toLowerCase();
              const matchingSupport = supports.find((sup) => {
                const seg = (sup.segment?.text || '').toLowerCase();
                return (
                  seg.includes(titleLower) ||
                  (orgLower.length > 2 && seg.includes(orgLower))
                );
              });
              const chunkIdx = matchingSupport?.groundingChunkIndices?.find(
                (idx) => rawChunks[idx]?.web?.uri && rawChunks[idx].web!.uri!.startsWith('http')
              );
              if (chunkIdx !== undefined) {
                matchedChunk = {
                  uri: rawChunks[chunkIdx].web!.uri!,
                  title: (rawChunks[chunkIdx].web?.title || '').toLowerCase(),
                };
              }
            }

            if (!matchedChunk) {
              const titleWords = raw.title
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 3);
              const orgLower = (raw.organization || '').toLowerCase();
              matchedChunk = chunkUris.find(
                (c) =>
                  (orgLower.length > 2 && c.title.includes(orgLower)) ||
                  titleWords.some((w) => c.title.includes(w))
              );
            }

            // Strictly discard anything without a real grounding chunk URL
            if (!matchedChunk) continue;

            verifiedItems.push({
              id: `${cat}-live-${Date.now()}-${i + 1}`,
              category: cat,
              title: raw.title.trim(),
              organization: cleanOptionalField(raw.organization),
              mode: normalizeMode(raw.mode),
              location: cleanOptionalField(raw.location),
              cost: (raw.cost || '').toLowerCase() === 'paid' ? 'paid' : 'free',
              dateOrDeadline: cleanOptionalField(raw.dateOrDeadline),
              prizeOrStipend: cleanOptionalField(raw.prizeOrStipend),
              duration: cat === 'internship' ? cleanOptionalField(raw.duration) : undefined,
              overview: raw.overview?.trim() || `${raw.title} hosted by ${raw.organization || 'partner organizer'}.`,
              requiredSkills:
                Array.isArray(raw.requiredSkills) && raw.requiredSkills.length > 0
                  ? raw.requiredSkills.slice(0, 6)
                  : [field, targetCareer],
              sourceUrl: matchedChunk.uri,
              sourceLabel: matchedChunk.title ? `Grounded source: ${matchedChunk.title}` : 'Live grounded source',
              isVerifiedFallback: false,
              fetchedAt: new Date().toISOString(),
            });
          }

          if (verifiedItems.length > 0) {
            return { items: verifiedItems.slice(0, 6), usedFallback: false };
          }
        } catch {
          // Fall through cleanly to curated verified fallback
        }

        const fallbackList = FALLBACK_OPPORTUNITIES.filter((f) => f.category === cat).map((f) => ({
          ...f,
          fetchedAt: new Date().toISOString(),
        }));
        return { items: fallbackList, usedFallback: true };
      };

      const [hackRes, intRes] = await Promise.all([
        fetchGroundedCategory('hackathon'),
        fetchGroundedCategory('internship'),
      ]);

      // C. Scout -> Gap Analyst Handoff Logs & Mentor Tip (using VERIFIED scores only)
      const allOpportunities = [...hackRes.items, ...intRes.items, ...jobRoles];
      const verifiedKeys = Object.keys(verifiedAssessments).map((k) => k.toLowerCase());
      const scoutLogs: Array<{
        id: string;
        fromAgent: 'Scout' | 'Gap Analyst';
        toAgent: 'Gap Analyst' | 'Learner';
        message: string;
        timestamp: string;
      }> = [];

      let readyNowCount = 0;
      const missingFrequency = new Map<string, number>();

      for (const opp of allOpportunities) {
        const reqs = opp.requiredSkills || [];
        let matched = 0;
        const missingForOpp: string[] = [];

        for (const reqSkill of reqs) {
          const rLower = reqSkill.toLowerCase();
          const matchedKey = Object.keys(verifiedAssessments).find((k) => {
            const kl = k.toLowerCase();
            return kl === rLower || kl.includes(rLower) || rLower.includes(kl);
          });
          const score = matchedKey ? verifiedAssessments[matchedKey].verifiedScore : null;
          if (score !== null && score >= 70) {
            matched += 1;
          } else if (score === null || score < 40) {
            missingForOpp.push(reqSkill);
            missingFrequency.set(reqSkill, (missingFrequency.get(reqSkill) || 0) + 1);
          }
        }

        if (missingForOpp.length === 0 && reqs.length > 0 && matched === reqs.length) {
          readyNowCount += 1;
        }

        if (scoutLogs.length < 4) {
          if (missingForOpp.length > 0) {
            const firstMissing = missingForOpp[0];
            const hasAnyVerified = verifiedKeys.some(
              (vk) => vk.includes(firstMissing.toLowerCase()) || firstMissing.toLowerCase().includes(vk)
            );
            scoutLogs.push({
              id: `scout-${Date.now()}-${scoutLogs.length + 1}`,
              fromAgent: 'Scout',
              toAgent: 'Gap Analyst',
              message: hasAnyVerified
                ? `${opp.category === 'job_role' ? 'Role' : opp.category === 'hackathon' ? 'Hackathon' : 'Internship'} "${opp.title}" needs ${firstMissing}; verified score below target threshold.`
                : `${opp.category === 'job_role' ? 'Role' : opp.category === 'hackathon' ? 'Hackathon' : 'Internship'} "${opp.title}" needs ${firstMissing}, learner has no verified ${firstMissing} score.`,
              timestamp: new Date().toISOString(),
            });
          } else {
            scoutLogs.push({
              id: `scout-${Date.now()}-${scoutLogs.length + 1}`,
              fromAgent: 'Scout',
              toAgent: 'Gap Analyst',
              message: `Verified match found for "${opp.title}" — all ${reqs.length} required skills cleared.`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      const topMissingEntry = Array.from(missingFrequency.entries()).sort((a, b) => b[1] - a[1])[0];
      const mentorTip =
        verifiedKeys.length === 0
          ? `Verify your skills in Skill Assessment to unlock personalized Match % scores — ${allOpportunities.length} opportunities are queued for ${targetCareer}.`
          : topMissingEntry
            ? `You are ready for ${readyNowCount} ${readyNowCount === 1 ? 'opportunity' : 'opportunities'} today. Verify or learn ${topMissingEntry[0]} to unlock ${topMissingEntry[1]} more.`
            : `You are ready for ${readyNowCount} opportunities today across ${targetCareer}!`;

      res.json({
        hackathons: hackRes.items,
        internships: intRes.items,
        jobRoles,
        usedFallbackHackathons: hackRes.usedFallback,
        usedFallbackInternships: intRes.usedFallback,
        mentorTip,
        scoutLogs,
        cachedAt: new Date().toISOString(),
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 8. Opportunity Details Mentor Explanation ("Why this fits you")
  app.post('/api/agents/opportunity-fit', async (req: Request, res: Response) => {
    try {
      const { opportunity, profile, fit } = req.body as {
        opportunity?: ServerOpportunityItem;
        profile?: {
          name?: string;
          field?: string;
          preferredLanguage?: string;
          targetCareer?: string;
        };
        fit?: {
          matchPercent: number;
          matchedSkills: string[];
          partialSkills: string[];
          missingSkills: string[];
          readinessLabel: string;
        };
      };

      if (!opportunity) {
        res.status(400).json({ error: 'Opportunity payload is required.' });
        return;
      }

      const lang = profile?.preferredLanguage || 'en';
      const ai = getAiClient();
      const resp = await generateWithFallback(ai, {
        primaryModel: 'gemini-3.1-flash-lite',
        fallbackModel: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        contents: `Write a concise, practical "Why this fits you" mentoring note (3-4 sentences) for ${profile?.name || 'the learner'} (target career: ${profile?.targetCareer || 'their goal'} in ${profile?.field || 'their field'}).
${getLanguageInstruction(lang)}

Opportunity: ${opportunity.title} (${opportunity.category}) by ${opportunity.organization}
Verified Match %: ${fit?.matchPercent ?? 0}% (${fit?.readinessLabel || 'Stretch goal'})
Matched verified skills: ${fit?.matchedSkills?.join(', ') || 'None yet'}
Partial skills: ${fit?.partialSkills?.join(', ') || 'None'}
Missing verified skills: ${fit?.missingSkills?.join(', ') || 'None'}

Explain how this aligns with their strengths and give one concrete action for any missing skills.`,
      });

      res.json({
        explanation:
          resp.text?.trim() ||
          `This opportunity aligns directly with your ${profile?.targetCareer || 'career'} trajectory (${fit?.matchPercent ?? 0}% verified match). Focus on verifying or practicing ${fit?.missingSkills?.[0] || 'the core required skills'} to strengthen your application.`,
      });
    } catch {
      res.json({
        explanation:
          'This opportunity connects directly to your target role. Review the highlighted missing skills below and add them to your roadmap to raise your verified readiness score before applying.',
      });
    }
  });

  // 9. Planner + Curator Targeted Update: Add missing opportunity skills to learner's roadmap
  app.post('/api/agents/roadmap-add-skills', async (req: Request, res: Response) => {
    try {
      const { missingSkills, opportunityTitle, profile, existingRoadmap } = req.body as {
        missingSkills?: string[];
        opportunityTitle?: string;
        profile?: {
          field?: string;
          preferredLanguage?: string;
          targetCareer?: string;
          weeklyHours?: number;
          budget?: 'free-only' | 'paid-ok';
        };
        existingRoadmap?: Array<{
          id: string;
          week: number;
          order: number;
          skill: string;
          focusTitle: string;
          whyItMatters: string;
          targetLevel: 'Beginner' | 'Intermediate' | 'Advanced';
          estimatedHours: number;
          completed: boolean;
          prerequisites?: string[];
          adaptiveTag?: string;
          resources: unknown;
        }>;
      };

      const skillsToAdd = Array.from(
        new Set((missingSkills || []).map((s) => s.trim()).filter(Boolean))
      ).slice(0, 4);

      if (skillsToAdd.length === 0) {
        res.status(400).json({ error: 'No missing skills provided to add.' });
        return;
      }

      const currentRoadmap = Array.isArray(existingRoadmap) ? [...existingRoadmap] : [];
      const existingSkillNames = new Set(
        currentRoadmap.filter((s) => !s.completed).map((s) => s.skill.toLowerCase())
      );

      const genuinelyNewSkills = skillsToAdd.filter(
        (s) => !existingSkillNames.has(s.toLowerCase())
      );
      const targetSkills = genuinelyNewSkills.length > 0 ? genuinelyNewSkills : skillsToAdd;

      const field = profile?.field || 'Technology & Data';
      const lang = profile?.preferredLanguage || 'en';
      const budget = profile?.budget || 'free-only';
      const weeklyHours = Math.max(1, Number(profile?.weeklyHours || 6));
      const maxWeek = currentRoadmap.reduce((m, s) => Math.max(m, s.week || 1), 0);
      const startWeek = Math.max(1, maxWeek + 1);

      const compactCatalog = CATALOG.filter((c) => {
        const costOk = budget === 'paid-ok' ? true : c.cost === 'free';
        if (!costOk) return false;
        if (!profile?.field || profile.field === 'Other / Custom') return true;
        return !c.field || c.field === profile.field;
      })
        .slice(0, 32)
        .map((c) => ({
          id: c.id,
          skill: c.skill,
          platform: c.platform,
          title: c.title,
          level: c.level,
          format: c.format,
        }));

      let generatedSteps: Array<{
        skill: string;
        focusTitle: string;
        whyItMatters: string;
        targetLevel: 'Beginner' | 'Intermediate' | 'Advanced';
        estimatedHours: number;
        videoId?: string;
        readingId?: string;
        handsOnId?: string;
        youtubeTopics?: Array<{
          title: string;
          channel: string;
          query: string;
          duration: string;
          reason: string;
        }>;
      }> = [];

      try {
        const ai = getAiClient();
        const resp = await generateWithFallback(ai, {
          primaryModel: 'gemini-3.1-flash-lite',
          fallbackModel: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
          contents: `Create targeted roadmap modules ONLY for these missing skills needed for "${opportunityTitle || 'target opportunity'}" (${profile?.targetCareer || 'Target Career'} in ${field}):
Missing Skills: ${JSON.stringify(targetSkills)}
Weekly hours available: ${weeklyHours}
${getLanguageInstruction(lang)}
Curated Catalog IDs (pick matching IDs when available, else empty string):
${JSON.stringify(compactCatalog)}`,
          systemInstruction: `You are the NexPath Planner & Curator Agents. Generate 1 focused module per requested missing skill without inventing URLs. ${getLanguageInstruction(lang)}`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    focusTitle: { type: Type.STRING },
                    whyItMatters: { type: Type.STRING },
                    targetLevel: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
                    estimatedHours: { type: Type.INTEGER },
                    videoId: { type: Type.STRING },
                    readingId: { type: Type.STRING },
                    handsOnId: { type: Type.STRING },
                    youtubeTopics: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          channel: { type: Type.STRING },
                          query: { type: Type.STRING },
                          duration: { type: Type.STRING },
                          reason: { type: Type.STRING },
                        },
                        required: ['title', 'channel', 'query', 'duration', 'reason'],
                      },
                    },
                  },
                  required: [
                    'skill',
                    'focusTitle',
                    'whyItMatters',
                    'targetLevel',
                    'estimatedHours',
                    'videoId',
                    'readingId',
                    'handsOnId',
                    'youtubeTopics',
                  ],
                },
              },
            },
            required: ['steps'],
          },
        });
        const parsed = safeJsonParse<{ steps?: typeof generatedSteps }>(resp.text, {});
        if (parsed.steps?.length) {
          generatedSteps = parsed.steps;
        }
      } catch {
        // Fallback deterministic module builder below
      }

      if (generatedSteps.length === 0) {
        generatedSteps = targetSkills.map((sk) => ({
          skill: sk,
          focusTitle: `${sk} Foundations for ${opportunityTitle || 'Opportunity Readiness'}`,
          whyItMatters: `Closes your verified gap in ${sk} so you qualify for ${opportunityTitle || 'this opportunity'}.`,
          targetLevel: 'Beginner',
          estimatedHours: Math.min(weeklyHours, 4),
        }));
      }

      const lastStepSkill = currentRoadmap.length > 0 ? currentRoadmap[currentRoadmap.length - 1].skill : null;

      const addedRoadmapSteps = generatedSteps.map((st, idx) => ({
        id: `opp-step-${Date.now()}-${idx + 1}`,
        week: startWeek + Math.floor(idx / 2),
        order: currentRoadmap.length + idx + 1,
        skill: st.skill,
        focusTitle: st.focusTitle,
        whyItMatters: st.whyItMatters,
        targetLevel: st.targetLevel || 'Beginner',
        estimatedHours: Math.max(1, Number(st.estimatedHours || 4)),
        completed: false,
        prerequisites: idx === 0 && lastStepSkill ? [lastStepSkill] : idx > 0 ? [generatedSteps[idx - 1].skill] : [],
        adaptiveTag: `Added from Opportunity: ${opportunityTitle || 'Scout'}`,
        youtubeSuggestions: buildYouTubeSuggestionsForStep(st.skill, field, lang, st.youtubeTopics),
        resources: selectCatalogResourcesForSkill(st.skill, st.targetLevel || 'Beginner', budget, {
          videoId: st.videoId,
          readingId: st.readingId,
          handsOnId: st.handsOnId,
        }),
      }));

      const updatedRoadmap = [...currentRoadmap, ...addedRoadmapSteps].map((s, idx) => ({
        ...s,
        order: idx + 1,
      }));

      const now = new Date().toISOString();
      const scoutLogs = [
        {
          id: `scout-plan-${Date.now()}-1`,
          fromAgent: 'Gap Analyst' as const,
          toAgent: 'Planner' as const,
          message: `${targetSkills.length} missing skill${targetSkills.length === 1 ? '' : 's'} for "${opportunityTitle || 'opportunity'}" (${targetSkills.join(', ')}). Adding to roadmap.`,
          timestamp: now,
        },
        {
          id: `scout-curate-${Date.now()}-2`,
          fromAgent: 'Planner' as const,
          toAgent: 'Curator' as const,
          message: `Curated ${addedRoadmapSteps.length} targeted module${addedRoadmapSteps.length === 1 ? '' : 's'} without disturbing existing completed steps.`,
          timestamp: now,
        },
      ];

      res.json({
        updatedRoadmap,
        addedCount: addedRoadmapSteps.length,
        addedSkills: targetSkills,
        notice: {
          id: `notice-opp-${Date.now()}`,
          trigger: 'mentor-command',
          title: `Added ${targetSkills.join(', ')} to your roadmap`,
          message: `Gap Analyst & Curator added ${addedRoadmapSteps.length} focused module(s) for "${opportunityTitle || 'your target opportunity'}" starting Week ${startWeek}.`,
          createdAt: now,
        },
        scoutLogs,
      });
    } catch (err) {
      const { status, message } = summarizeAiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Frontend serving (Vite dev middleware or static dist/)
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Real-time Voice Conversations via Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket, request) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const voiceName = reqUrl.searchParams.get('voice') || 'Zephyr';
    const roleParam = reqUrl.searchParams.get('role') || 'mentor';
    const targetCareer = reqUrl.searchParams.get('career') || 'Target Career';
    const learnerName = reqUrl.searchParams.get('name') || 'Learner';
    const weakSkills = reqUrl.searchParams.get('gaps') || '';
    const langParam = reqUrl.searchParams.get('lang') || 'en';
    const langInstruction = getLanguageInstruction(langParam);

    const rolePrompts: Record<string, string> = {
      mentor: `You are NexPath's live voice Study Mentor speaking with ${learnerName}, who is preparing for ${targetCareer}. ${weakSkills ? `Priority areas to strengthen: ${weakSkills}.` : ''} ${langInstruction} Keep spoken answers natural, encouraging, and concise (2-4 sentences per turn).`,
      interviewer: `You are NexPath's live voice Mock Interviewer interviewing ${learnerName} for a ${targetCareer} role. Ask one crisp spoken interview question at a time, listen to their answer, give brief spoken feedback, and follow up. ${langInstruction}`,
      tutor: `You are NexPath's live voice Concept Tutor helping ${learnerName} master concepts for ${targetCareer}. Explain ideas conversationally, check understanding with short questions, and keep responses concise for audio. ${langInstruction}`,
    };

    let liveSession: {
      sendRealtimeInput: (input: { audio?: { data: string; mimeType: string }; text?: string }) => void;
      sendClientContent: (input: { turns: Array<{ role: string; parts: Array<{ text: string }> }>; turnComplete?: boolean }) => void;
      close: () => void;
    } | null = null;
    let isClosing = false;
    let readySent = false;

    const sendReady = () => {
      if (!readySent && liveSession && clientWs.readyState === clientWs.OPEN) {
        readySent = true;
        clientWs.send(JSON.stringify({ type: 'ready' }));
      }
    };

    const tryLiveVersion = async (apiVersion: string): Promise<NonNullable<typeof liveSession>> => {
      const liveAi = getAiClient(apiVersion);
      let opened = false;
      return await liveAi.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: rolePrompts[roleParam] || rolePrompts.mentor,
        },
        callbacks: {
          onopen: () => {
            opened = true;
            sendReady();
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err: unknown) => {
            const ev = err as { message?: string; error?: { message?: string } };
            const rawMsg = ev?.message || ev?.error?.message || (err instanceof Error ? err.message : String(err));
            console.error(`[NexPath Live onerror (${apiVersion})]`, rawMsg);
            if (opened && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: 'error', message: rawMsg || 'Live voice session encountered an error.' }));
            }
          },
          onclose: (ev: unknown) => {
            const closeEv = ev as { code?: number; reason?: string };
            console.log(`[NexPath Live onclose (${apiVersion})]`, closeEv?.code, closeEv?.reason);
            if (opened && !isClosing && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: 'closed', code: closeEv?.code, reason: closeEv?.reason }));
            }
          },
        },
      });
    };

    const connectLive = async () => {
      try {
        try {
          liveSession = await tryLiveVersion('v1beta');
        } catch (betaErr) {
          console.warn('[NexPath Live] v1beta failed, retrying v1alpha:', betaErr instanceof Error ? betaErr.message : String(betaErr));
          liveSession = await tryLiveVersion('v1alpha');
        }
        sendReady();
      } catch (err) {
        console.error('[NexPath Live catch]', err);
        const { message } = summarizeAiError(err);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message }));
        }
      }
    };

    void connectLive();

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const payload = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        if (payload.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (payload.text) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: payload.text }] }],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NexPath server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NexPath server:', err);
  process.exit(1);
});
