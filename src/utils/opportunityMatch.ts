import {
  OpportunityItem,
  OpportunitySkillFit,
  ReadinessBand,
  SkillAssessmentResult,
} from '../types/skillpilot';

function findVerifiedScore(
  skillName: string,
  assessments: Record<string, SkillAssessmentResult>
): number | null {
  const target = skillName.toLowerCase().trim();
  if (!target) return null;

  for (const [key, res] of Object.entries(assessments)) {
    const k = key.toLowerCase().trim();
    if (k === target || k.includes(target) || target.includes(k)) {
      return res.verifiedScore;
    }
  }
  return null;
}

/**
 * Computes skill fit strictly from VERIFIED assessment scores (never claimed skills).
 */
export function computeOpportunitySkillFit(
  opportunity: OpportunityItem,
  assessments: Record<string, SkillAssessmentResult>
): OpportunitySkillFit {
  const mustHave = opportunity.requiredSkills || [];
  const niceToHave = opportunity.niceToHaveSkills || [];
  const allSkills = Array.from(new Set([...mustHave, ...niceToHave]));

  const matchedSkills: string[] = [];
  const partialSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of allSkills) {
    const score = findVerifiedScore(skill, assessments);
    if (score === null || score < 40) {
      missingSkills.push(skill);
    } else if (score >= 70) {
      matchedSkills.push(skill);
    } else {
      partialSkills.push(skill);
    }
  }

  // Weight requiredSkills heavily (100% if no niceToHave, otherwise 80/20 split)
  const mustHaveTotal = Math.max(1, mustHave.length);
  let mustCredit = 0;
  let mustMissingCount = 0;
  for (const s of mustHave) {
    if (matchedSkills.includes(s)) mustCredit += 1;
    else if (partialSkills.includes(s)) mustCredit += 0.5;
    else mustMissingCount += 1;
  }

  let matchPercent = Math.round((mustCredit / mustHaveTotal) * 100);
  if (niceToHave.length > 0 && mustHave.length > 0) {
    let niceCredit = 0;
    for (const s of niceToHave) {
      if (matchedSkills.includes(s)) niceCredit += 1;
      else if (partialSkills.includes(s)) niceCredit += 0.5;
    }
    const niceRatio = niceCredit / niceToHave.length;
    const mustRatio = mustCredit / mustHaveTotal;
    matchPercent = Math.round((mustRatio * 0.8 + niceRatio * 0.2) * 100);
  }

  matchPercent = Math.max(0, Math.min(100, matchPercent));

  let readinessBand: ReadinessBand = 'stretch';
  let readinessLabel = 'Stretch goal';
  let estimatedWeeks = Math.max(4, mustMissingCount * 2 + 2);

  if (mustMissingCount === 0 && matchPercent >= 70) {
    readinessBand = 'ready-now';
    readinessLabel = 'Ready now';
    estimatedWeeks = 0;
  } else if (mustMissingCount <= 2 && matchPercent >= 35) {
    readinessBand = 'ready-soon';
    const weeks = Math.max(2, Math.min(4, mustMissingCount * 2));
    readinessLabel = `Ready in ${weeks} weeks`;
    estimatedWeeks = weeks;
  }

  return {
    matchPercent,
    matchedSkills,
    partialSkills,
    missingSkills,
    readinessBand,
    readinessLabel,
    estimatedWeeks,
  };
}

export interface PlatformSearchLink {
  name: string;
  url: string;
  group: 'hackathon' | 'internship_job';
}

export function buildPlatformSearchLinks(targetCareer: string, field?: string): PlatformSearchLink[] {
  const query = `${targetCareer || 'software'}${field && field !== 'Other / Custom' ? ` ${field.split('&')[0].trim()}` : ''}`.trim();
  const q = encodeURIComponent(query);
  const roleQ = encodeURIComponent(targetCareer || 'intern');
  const slug = (targetCareer || 'developer').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return [
    {
      name: 'Devfolio',
      url: `https://devfolio.co/hackathons?search=${q}`,
      group: 'hackathon',
    },
    {
      name: 'Unstop (Hackathons)',
      url: `https://unstop.com/hackathons?search=${roleQ}`,
      group: 'hackathon',
    },
    {
      name: 'HackerEarth',
      url: `https://www.hackerearth.com/challenges/hackathon/?q=${roleQ}`,
      group: 'hackathon',
    },
    {
      name: 'Devpost',
      url: `https://devpost.com/hackathons?search=${q}`,
      group: 'hackathon',
    },
    {
      name: 'MLH',
      url: `https://mlh.io/seasons/2025/events?q=${roleQ}`,
      group: 'hackathon',
    },
    {
      name: 'Internshala',
      url: `https://internshala.com/internships/${slug}-internship`,
      group: 'internship_job',
    },
    {
      name: 'LinkedIn',
      url: `https://www.linkedin.com/jobs/search/?keywords=${roleQ}`,
      group: 'internship_job',
    },
    {
      name: 'Naukri',
      url: `https://www.naukri.com/${slug}-jobs`,
      group: 'internship_job',
    },
    {
      name: 'Unstop (Internships & Jobs)',
      url: `https://unstop.com/internships?search=${roleQ}`,
      group: 'internship_job',
    },
  ];
}
