import {
  AppLanguage,
  CareerField,
  ClaimedSkill,
  LearnerProfile,
  LearnerWorkspace,
} from '../types/skillpilot';

export interface DomainPreset {
  field: CareerField;
  description: string;
  careers: string[];
  skills: string[];
  sampleLearner: {
    name: string;
    educationOrRole: string;
    targetCareer: string;
    skills: ClaimedSkill[];
    projects: string[];
    certifications: string[];
  };
}

export const CAREER_DOMAINS: DomainPreset[] = [
  {
    field: 'Medical & Healthcare',
    description: 'Nursing, clinical practice, public health, medical coding, and patient care.',
    careers: [
      'Registered Nurse (RN)',
      'Medical Resident / Clinical Prep',
      'Public Health Analyst',
      'Healthcare Administrator',
      'Medical Coding & Billing Specialist',
      'Pharmacist / Clinical Pharmacology',
    ],
    skills: [
      'Human Anatomy & Physiology',
      'Pharmacology',
      'Medical Terminology',
      'Patient Triage & Assessment',
      'Epidemiology & Public Health',
      'Electronic Health Records (EHR)',
      'Biostatistics',
      'Clinical Ethics & HIPAA',
      'CPR & Emergency Care',
    ],
    sampleLearner: {
      name: 'Dr. Priya Nair',
      educationOrRole: 'Final-Year Nursing & Clinical Care Graduate',
      targetCareer: 'Registered Nurse (RN)',
      skills: [
        { name: 'Human Anatomy & Physiology', claimedLevel: 'Intermediate' },
        { name: 'Medical Terminology', claimedLevel: 'Advanced' },
        { name: 'Pharmacology', claimedLevel: 'Beginner' },
        { name: 'Patient Triage & Assessment', claimedLevel: 'Intermediate' },
      ],
      projects: ['Community Vaccination Drive Audit', 'ICU Patient Handoff Checklist'],
      certifications: ['Basic Life Support (BLS)'],
    },
  },
  {
    field: 'Teaching & Education',
    description: 'K-12 teaching, higher education, curriculum design, and EdTech pedagogy.',
    careers: [
      'K-12 Classroom Teacher',
      'Instructional Designer',
      'University Lecturer / Professor',
      'Special Education Specialist',
      'EdTech Curriculum Lead',
      'ESL / Language Educator',
    ],
    skills: [
      'Curriculum Design',
      'Lesson Planning',
      'Classroom Management',
      'Formative Assessment',
      'Educational Psychology',
      'Inclusive Pedagogy',
      'EdTech & LMS Tools',
      'Differentiated Instruction',
      'Student Engagement',
    ],
    sampleLearner: {
      name: 'Elena Morales',
      educationOrRole: 'Graduate Student in Education & Pedagogy',
      targetCareer: 'Instructional Designer',
      skills: [
        { name: 'Lesson Planning', claimedLevel: 'Advanced' },
        { name: 'Curriculum Design', claimedLevel: 'Intermediate' },
        { name: 'Formative Assessment', claimedLevel: 'Intermediate' },
        { name: 'EdTech & LMS Tools', claimedLevel: 'Beginner' },
      ],
      projects: ['Blended Science Module for Grade 8', 'Rubric Bank for Project-Based Learning'],
      certifications: ['TESOL Teaching Foundations'],
    },
  },
  {
    field: 'Technology & Data',
    description: 'Software engineering, web development, data science, AI, and cloud systems.',
    careers: [
      'Full-Stack Developer',
      'Frontend Engineer',
      'Backend Engineer',
      'Data Analyst',
      'Machine Learning Engineer',
      'Cloud & DevOps Engineer',
    ],
    skills: [
      'HTML',
      'CSS',
      'JavaScript',
      'TypeScript',
      'React',
      'Node.js',
      'Python',
      'SQL',
      'Git',
      'REST APIs',
      'MongoDB',
      'Data Structures',
      'Machine Learning',
      'Statistics',
      'Power BI',
      'Cloud Basics',
    ],
    sampleLearner: {
      name: 'Aarav Patel',
      educationOrRole: 'Final-Year Computer Science Undergraduate',
      targetCareer: 'Full-Stack Developer',
      skills: [
        { name: 'HTML', claimedLevel: 'Intermediate' },
        { name: 'CSS', claimedLevel: 'Intermediate' },
        { name: 'JavaScript', claimedLevel: 'Advanced' },
        { name: 'SQL', claimedLevel: 'Beginner' },
      ],
      projects: ['Personal Portfolio Website', 'Campus Event Tracker App'],
      certifications: ['Responsive Web Design'],
    },
  },
  {
    field: 'Business & Finance',
    description: 'Financial analysis, operations, product management, accounting, and marketing.',
    careers: [
      'Financial Analyst',
      'Product Manager',
      'Business Operations Analyst',
      'Digital Marketing Strategist',
      'Supply Chain Coordinator',
      'Chartered Accounting Prep',
    ],
    skills: [
      'Excel',
      'Financial Modeling',
      'Accounting Principles',
      'Business Communication',
      'Project Management',
      'Market Research',
      'SQL',
      'Power BI',
      'Risk Management',
    ],
    sampleLearner: {
      name: 'Marcus Reed',
      educationOrRole: 'Junior Business & Finance Associate',
      targetCareer: 'Financial Analyst',
      skills: [
        { name: 'Excel', claimedLevel: 'Intermediate' },
        { name: 'Accounting Principles', claimedLevel: 'Intermediate' },
        { name: 'Financial Modeling', claimedLevel: 'Beginner' },
        { name: 'Business Communication', claimedLevel: 'Advanced' },
      ],
      projects: ['Quarterly Revenue Variance Workbook', 'Retail Unit Economics Model'],
      certifications: ['Corporate Finance Fundamentals'],
    },
  },
  {
    field: 'Design & Creative',
    description: 'UX/UI design, product design, visual communication, and content production.',
    careers: [
      'UX/UI Designer',
      'Product Designer',
      'Visual Brand Designer',
      'Motion & Video Producer',
    ],
    skills: [
      'Design Thinking',
      'Wireframing & Prototyping',
      'Typography & Layout',
      'User Research',
      'Accessibility (WCAG)',
      'Color Theory',
      'HTML',
      'CSS',
    ],
    sampleLearner: {
      name: 'Sora Takahashi',
      educationOrRole: 'Visual Design Student',
      targetCareer: 'UX/UI Designer',
      skills: [
        { name: 'Typography & Layout', claimedLevel: 'Intermediate' },
        { name: 'Wireframing & Prototyping', claimedLevel: 'Intermediate' },
        { name: 'User Research', claimedLevel: 'Beginner' },
        { name: 'Accessibility (WCAG)', claimedLevel: 'Beginner' },
      ],
      projects: ['Mobile Clinic Booking Prototype', 'Campus Wayfinding System'],
      certifications: ['Foundations of User Experience Design'],
    },
  },
];

export const ALL_CAREER_FIELDS: CareerField[] = CAREER_DOMAINS.map((d) => d.field);

export function getDomainPreset(field: CareerField): DomainPreset {
  return CAREER_DOMAINS.find((d) => d.field === field) || CAREER_DOMAINS[0];
}

export const SUGGESTED_SKILLS: string[] = Array.from(
  new Set(CAREER_DOMAINS.flatMap((d) => d.skills))
);

export const TARGET_CAREERS: string[] = Array.from(
  new Set(CAREER_DOMAINS.flatMap((d) => d.careers))
);

export function createEmptyWorkspace(
  learnerId = 'learner-1',
  preferredLanguage: AppLanguage = 'en'
): LearnerWorkspace {
  const now = new Date().toISOString();
  const profile: LearnerProfile = {
    id: learnerId,
    name: '',
    field: 'Medical & Healthcare',
    preferredLanguage,
    educationOrRole: '',
    existingSkills: [],
    certifications: [],
    projects: [],
    targetCareer: 'Registered Nurse (RN)',
    weeklyHours: 6,
    budget: 'free-only',
    preferredFormat: 'video',
    resumeText: '',
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };

  return {
    profile,
    assessments: {},
    analysis: null,
    roadmap: [],
    adaptiveNotices: [],
    mentorHistory: [
      {
        id: 'mentor-welcome',
        role: 'assistant',
        content:
          'Welcome to NexPath. Ask me anytime to explain difficult concepts, adjust your weekly pace, or practice interviews across your chosen field.',
        timestamp: now,
      },
    ],
    progress: {
      streakDays: 1,
      lastActiveDate: now.slice(0, 10),
      quizHistory: [],
      readinessHistory: [],
      activityLog: [],
    },
  };
}

export function createStarterSampleSkills(field: CareerField = 'Medical & Healthcare'): ClaimedSkill[] {
  return getDomainPreset(field).sampleLearner.skills;
}
