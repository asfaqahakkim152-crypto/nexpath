import { AppLanguage } from '../types/skillpilot';

export interface LanguageOption {
  code: AppLanguage;
  label: string;
  nativeName: string;
  aiInstructionName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', aiInstructionName: 'English' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', aiInstructionName: 'Hindi' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', aiInstructionName: 'Tamil' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', aiInstructionName: 'Spanish' },
  { code: 'fr', label: 'French', nativeName: 'Français', aiInstructionName: 'French' },
  { code: 'ar', label: 'Arabic', nativeName: 'العربية', aiInstructionName: 'Arabic' },
];

export interface UIStrings {
  navOverview: string;
  navAssess: string;
  navMatch: string;
  navRoadmap: string;
  navCatalog: string;
  navOpportunities: string;
  navMentor: string;
  navProfile: string;
  welcomeBack: string;
  verifyASkill: string;
  jobReadiness: string;
  roadmapProgress: string;
  learningStreak: string;
  skillsVerified: string;
  roadmapTitle: string;
  graphView: string;
  timelineView: string;
  youtubeRecommendations: string;
  startVoiceCall: string;
  endVoiceCall: string;
  languageLabel: string;
  quickLaunch: string;
  continueBtn: string;
  backBtn: string;
  generatePlanBtn: string;
  heroTitle: string;
  heroSubtitle: string;
  selectFieldLabel: string;
  targetCareerLabel: string;
}

const DICTIONARY: Record<AppLanguage, UIStrings> = {
  en: {
    navOverview: 'Overview',
    navAssess: 'Skill Assessment',
    navMatch: 'Career Match',
    navRoadmap: 'Learning Roadmap',
    navCatalog: 'Course Catalog',
    navOpportunities: 'Opportunities',
    navMentor: 'AI Mentor & Voice',
    navProfile: 'Profile & Goal',
    welcomeBack: 'Welcome back',
    verifyASkill: 'Verify a Skill',
    jobReadiness: 'Job Readiness',
    roadmapProgress: 'Roadmap Progress',
    learningStreak: 'Learning Streak',
    skillsVerified: 'Skills Verified',
    roadmapTitle: 'Personalized Learning Roadmap',
    graphView: 'Graph View',
    timelineView: 'Timeline View',
    youtubeRecommendations: 'Recommended YouTube Suggestions',
    startVoiceCall: 'Start Voice Conversation',
    endVoiceCall: 'End Voice',
    languageLabel: 'Language',
    quickLaunch: 'Quick Launch Demo',
    continueBtn: 'Continue',
    backBtn: 'Back',
    generatePlanBtn: 'Save & Generate My Roadmap',
    heroTitle: 'Build a verified learning path for any career field',
    heroSubtitle:
      'Whether you are in Medicine, Teaching, Technology, Business, or Design, NexPath verifies your skills, finds gaps, and builds an interactive roadmap.',
    selectFieldLabel: 'Career Field / Domain',
    targetCareerLabel: 'Target Career Role',
  },
  hi: {
    navOverview: 'डैशबोर्ड',
    navAssess: 'कौशल मूल्यांकन',
    navMatch: 'करियर मिलान',
    navRoadmap: 'लर्निंग रोडमैप',
    navCatalog: 'कोर्स कैटलॉग',
    navOpportunities: 'अवसर केंद्र',
    navMentor: 'AI मेंटर और वॉइस',
    navProfile: 'प्रोफ़ाइल और लक्ष्य',
    welcomeBack: 'वापसी पर स्वागत है',
    verifyASkill: 'कौशल सत्यापित करें',
    jobReadiness: 'करियर तैयारी',
    roadmapProgress: 'रोडमैप प्रगति',
    learningStreak: 'लर्निंग स्ट्रीक',
    skillsVerified: 'सत्यापित कौशल',
    roadmapTitle: 'व्यक्तिगत लर्निंग रोडमैप',
    graphView: 'ग्राफ़ दृश्य',
    timelineView: 'टाइमलाइन दृश्य',
    youtubeRecommendations: 'अनुशंसित YouTube सुझाव',
    startVoiceCall: 'वॉइस बातचीत शुरू करें',
    endVoiceCall: 'वॉइस समाप्त करें',
    languageLabel: 'भाषा',
    quickLaunch: 'त्वरित डेमो शुरू करें',
    continueBtn: 'आगे बढ़ें',
    backBtn: 'पीछे',
    generatePlanBtn: 'सहेजें और रोडमैप बनाएं',
    heroTitle: 'किसी भी करियर क्षेत्र के लिए सत्यापित लर्निंग पथ बनाएं',
    heroSubtitle:
      'चाहे आप मेडिकल, शिक्षण, टेक्नोलॉजी, बिज़नेस या डिज़ाइन में हों—NexPath आपके कौशल की जांच कर व्यक्तिगत रोडमैप तैयार करता है।',
    selectFieldLabel: 'करियर क्षेत्र',
    targetCareerLabel: 'लक्ष्य करियर भूमिका',
  },
  ta: {
    navOverview: 'முகப்பு',
    navAssess: 'திறன் மதிப்பீடு',
    navMatch: 'தொழில் பொருத்தம்',
    navRoadmap: 'கற்றல் வரைபடம்',
    navCatalog: 'பாடப் பட்டியல்',
    navOpportunities: 'வாய்ப்புகள்',
    navMentor: 'AI வழிகாட்டி & குரல்',
    navProfile: 'சுயவிவரம் & இலக்கு',
    welcomeBack: 'நல்வரவு',
    verifyASkill: 'திறனைச் சரிபார்',
    jobReadiness: 'வேலை தயார்நிலை',
    roadmapProgress: 'வழிகாட்டி முன்னேற்றம்',
    learningStreak: 'தொடர் கற்றல்',
    skillsVerified: 'சரிபார்க்கப்பட்ட திறன்கள்',
    roadmapTitle: 'தனிப்பயன் கற்றல் வரைபடம்',
    graphView: 'வரைபடக் காட்சி',
    timelineView: 'காலவரிசை காட்சி',
    youtubeRecommendations: 'பரிந்துரைக்கப்பட்ட YouTube பாடங்கள்',
    startVoiceCall: 'குரல் உரையாடலைத் தொடங்கு',
    endVoiceCall: 'குரல் நிறுத்து',
    languageLabel: 'மொழி',
    quickLaunch: 'மாதிரி தொடங்கவும்',
    continueBtn: 'தொடரவும்',
    backBtn: 'பின்செல்',
    generatePlanBtn: 'சேமித்து வரைபடம் உருவாக்கு',
    heroTitle: 'எந்தத் துறைக்கும் சரிபார்க்கப்பட்ட கற்றல் பாதையை உருவாக்குங்கள்',
    heroSubtitle:
      'மருத்துவம், கற்பித்தல், தொழில்நுட்பம், வணிகம் என எந்தத் துறையிலும் உங்கள் திறன்களைச் சரிபார்த்து தனிப்பயன் கற்றல் வரைபடத்தைப் பெறுங்கள்.',
    selectFieldLabel: 'தொழில் துறை',
    targetCareerLabel: 'இலக்குப் பணி',
  },
  es: {
    navOverview: 'Resumen',
    navAssess: 'Evaluación',
    navMatch: 'Afinidad Laboral',
    navRoadmap: 'Ruta de Aprendizaje',
    navCatalog: 'Catálogo',
    navOpportunities: 'Oportunidades',
    navMentor: 'Mentor IA y Voz',
    navProfile: 'Perfil y Meta',
    welcomeBack: 'Bienvenido de nuevo',
    verifyASkill: 'Verificar Habilidad',
    jobReadiness: 'Preparación Laboral',
    roadmapProgress: 'Progreso de Ruta',
    learningStreak: 'Racha de Estudio',
    skillsVerified: 'Habilidades Verificadas',
    roadmapTitle: 'Ruta de Aprendizaje Personalizada',
    graphView: 'Vista de Grafo',
    timelineView: 'Vista Cronológica',
    youtubeRecommendations: 'Sugerencias de YouTube',
    startVoiceCall: 'Iniciar Voz en Vivo',
    endVoiceCall: 'Finalizar Voz',
    languageLabel: 'Idioma',
    quickLaunch: 'Demo Rápida',
    continueBtn: 'Continuar',
    backBtn: 'Atrás',
    generatePlanBtn: 'Guardar y Generar Ruta',
    heroTitle: 'Construye una ruta verificada para cualquier carrera',
    heroSubtitle:
      'Medicina, Educación, Tecnología, Negocios o Diseño: NexPath evalúa tus habilidades, detecta brechas y diseña tu mapa de estudio.',
    selectFieldLabel: 'Área Profesional',
    targetCareerLabel: 'Rol Objetivo',
  },
  fr: {
    navOverview: 'Aperçu',
    navAssess: 'Évaluation',
    navMatch: 'Adéquation Métier',
    navRoadmap: 'Parcours',
    navCatalog: 'Catalogue',
    navOpportunities: 'Opportunités',
    navMentor: 'Mentor IA & Voix',
    navProfile: 'Profil & Objectif',
    welcomeBack: 'Bon retour',
    verifyASkill: 'Vérifier une compétence',
    jobReadiness: 'Préparation Emploi',
    roadmapProgress: 'Avancement',
    learningStreak: 'Série d’étude',
    skillsVerified: 'Compétences vérifiées',
    roadmapTitle: 'Parcours d’apprentissage personnalisé',
    graphView: 'Vue Graphe',
    timelineView: 'Vue Chronologique',
    youtubeRecommendations: 'Suggestions YouTube',
    startVoiceCall: 'Démarrer l’appel vocal',
    endVoiceCall: 'Terminer la voix',
    languageLabel: 'Langue',
    quickLaunch: 'Démo Rapide',
    continueBtn: 'Continuer',
    backBtn: 'Retour',
    generatePlanBtn: 'Enregistrer et générer',
    heroTitle: 'Créez un parcours vérifié dans tous les domaines',
    heroSubtitle:
      'Médecine, Enseignement, Technologie, Finance ou Design : NexPath vérifie vos acquis et trace votre feuille de route.',
    selectFieldLabel: 'Domaine professionnel',
    targetCareerLabel: 'Métier visé',
  },
  ar: {
    navOverview: 'نظرة عامة',
    navAssess: 'تقييم المهارات',
    navMatch: 'تطابق المهنة',
    navRoadmap: 'خريطة التعلم',
    navCatalog: 'دليل الدورات',
    navOpportunities: 'الفرص المهنية',
    navMentor: 'الموجه الذكي والصوت',
    navProfile: 'الملف والهدف',
    welcomeBack: 'مرحبًا بعودتك',
    verifyASkill: 'تحقق من مهارة',
    jobReadiness: 'الجاهزية للوظيفة',
    roadmapProgress: 'تقدم الخريطة',
    learningStreak: 'سلسلة التعلم',
    skillsVerified: 'مهارات موثقة',
    roadmapTitle: 'خريطة التعلم المخصصة',
    graphView: 'عرض المخطط الشبكي',
    timelineView: 'العرض الزمني',
    youtubeRecommendations: 'اقتراحات يوتيوب الموصى بها',
    startVoiceCall: 'بدء محادثة صوتية',
    endVoiceCall: 'إنهاء الصوت',
    languageLabel: 'اللغة',
    quickLaunch: 'تشغيل تجريبي سريع',
    continueBtn: 'متابعة',
    backBtn: 'رجوع',
    generatePlanBtn: 'حفظ وإنشاء الخريطة',
    heroTitle: 'ابنِ مسار تعلم موثقًا لأي مجال مهني',
    heroSubtitle:
      'في الطب أو التعليم أو التكنولوجيا أو الأعمال، يتحقق NexPath من مهاراتك ويبني لك خريطة تعلم تفاعلية.',
    selectFieldLabel: 'المجال المهني',
    targetCareerLabel: 'الوظيفة المستهدفة',
  },
};

export function getStrings(lang?: AppLanguage): UIStrings {
  return DICTIONARY[lang || 'en'] || DICTIONARY.en;
}

export function getLanguageName(lang?: AppLanguage): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.aiInstructionName || 'English';
}
