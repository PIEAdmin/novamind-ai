import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, db } from './firebase-config';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, limit as firestoreLimit, Timestamp, serverTimestamp } from 'firebase/firestore';
import { generateContent, fileToAttachment, FileAttachment } from './api-service';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './styles.css';

type Tab = 'home' | 'create' | 'gallery' | 'chats' | 'community' | 'crm' | 'projects';
type AgentMode = 'general' | 'competitor-analysis' | 'ad-maker' | 'logo-maker' | 'email-assistant' | 'fact-checker' | 'idea-spark';
type EmailMode = 'compose' | 'reply' | 'sequences' | 'polish';
type ToastType = 'success' | 'info' | 'warning' | 'error';
type ThemeMode = 'dark' | 'light';
type LangCode = 'en' | 'es' | 'fr';
type ChatTagLabel = '' | 'Content' | 'Email' | 'Design' | 'Research' | 'Marketing' | 'Ideas';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  imageUrl?: string;
  isError?: boolean;
}

interface ChatDoc {
  id: string;
  title: string;
  messages: ChatMessage[];
  agentMode: string;
  industry: string;
  model: string;
  contentType: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isShared: boolean;
  shareId: string | null;
  tag?: ChatTagLabel;
}

interface PromptTemplate {
  id: string;
  prompt: string;
  industry: string;
  agentMode: string;
  contentType: string;
  model: string;
  label: string;
  createdAt: Timestamp;
}

interface HistoryItem {
  id: string;
  prompt: string;
  contentType: string;
  model: string;
  agentMode: string;
  industry: string;
  resultPreview: string;
  imageUrl: string | null;
  isFavorite: boolean;
  createdAt: Timestamp;
}

const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
  en: {
    home: 'Home', create: 'Create', gallery: 'Gallery', chats: 'Chats', community: 'Community', crm: 'CRM', projects: 'Projects',
    signOut: 'Sign Out', signIn: 'Sign In', createAccount: 'Create Account', generate: 'Generate', thinking: 'Thinking...', newChat: 'New Chat',
    searchChats: 'Search chats...', searchHistory: 'Search creations...', noResults: 'No results found', noChats: 'No chats yet', noCreations: 'No creations yet',
    yourAIToolkit: 'Your AI Toolkit', createAmazingContent: 'Create Amazing Content with AI', startCreating: 'Start Creating',
    welcomeToNovaMind: 'Welcome to NovaMind AI', monthlyUsage: 'Monthly Usage', used: 'Used', limit: 'Limit', created: 'Created',
    tryOneOfThese: 'Try one of these:', typeYourReply: 'Type your reply below...', offline: "You're offline — some features may not work. We'll reconnect automatically.", backOnline: 'Back online!',
    exportPDF: 'PDF', exportWord: 'Word', copy: 'Copy', share: 'Share', publish: 'Publish', download: 'Download',
    darkMode: 'Dark Mode', lightMode: 'Light Mode', shortcuts: 'Shortcuts',
    myCreations: 'My Creations', myChats: 'My Chats', communityGallery: 'Community Gallery',
    reply: 'Reply', continue_: 'Continue', delete_: 'Delete', aiAgents: 'AI Agents', quickTools: 'Quick Tools',
    thisMonth: 'This Month', totalGenerations: 'Total Generations', textGens: 'Text', imageGens: 'Images', recentActivity: 'Recent Activity',
    industry: 'Industry', all: 'All', favorites: 'Favorites',
    factCheck: 'Fact-Check & Verify', ideaSpark: 'Idea Spark', tapToDictate: '🎤 Tap to dictate',
    listening: '🔴 Listening...', moodWriter: 'Mood / Tone', voiceNotSupported: 'Speech recognition is not supported in this browser. Try Chrome or Safari.',
  },
  es: {
    home: 'Inicio', create: 'Crear', gallery: 'Galería', chats: 'Chats', community: 'Comunidad', crm: 'CRM', projects: 'Proyectos',
    signOut: 'Cerrar Sesión', signIn: 'Iniciar Sesión', createAccount: 'Crear Cuenta', generate: 'Generar', thinking: 'Pensando...', newChat: 'Nuevo Chat',
    searchChats: 'Buscar chats...', searchHistory: 'Buscar creaciones...', noResults: 'Sin resultados', noChats: 'Aún no hay chats', noCreations: 'Aún no hay creaciones',
    yourAIToolkit: 'Tu Kit de IA', createAmazingContent: 'Crea Contenido Increíble con IA', startCreating: 'Empezar a Crear',
    welcomeToNovaMind: 'Bienvenido a NovaMind AI', monthlyUsage: 'Uso Mensual', used: 'Usado', limit: 'Límite', created: 'Creado',
    tryOneOfThese: 'Prueba uno de estos:', typeYourReply: 'Escribe tu respuesta...', offline: 'Sin conexión — algunas funciones pueden no funcionar.', backOnline: '¡Conexión restaurada!',
    exportPDF: 'PDF', exportWord: 'Word', copy: 'Copiar', share: 'Compartir', publish: 'Publicar', download: 'Descargar',
    darkMode: 'Modo Oscuro', lightMode: 'Modo Claro', shortcuts: 'Atajos',
    myCreations: 'Mis Creaciones', myChats: 'Mis Chats', communityGallery: 'Galería Comunitaria',
    reply: 'Responder', continue_: 'Continuar', delete_: 'Eliminar', aiAgents: 'Agentes IA', quickTools: 'Herramientas',
    thisMonth: 'Este Mes', totalGenerations: 'Total Generaciones', textGens: 'Texto', imageGens: 'Imágenes', recentActivity: 'Actividad Reciente',
    industry: 'Industria', all: 'Todos', favorites: 'Favoritos',
    factCheck: 'Verificar Hechos', ideaSpark: 'Chispa de Ideas', tapToDictate: '🎤 Toca para dictar',
    listening: '🔴 Escuchando...', moodWriter: 'Tono', voiceNotSupported: 'El reconocimiento de voz no es compatible con este navegador. Prueba Chrome o Safari.',
  },
  fr: {
    home: 'Accueil', create: 'Créer', gallery: 'Galerie', chats: 'Chats', community: 'Communauté', crm: 'CRM', projects: 'Projets',
    signOut: 'Déconnexion', signIn: 'Connexion', createAccount: 'Créer un Compte', generate: 'Générer', thinking: 'Réflexion...', newChat: 'Nouveau Chat',
    searchChats: 'Rechercher des chats...', searchHistory: 'Rechercher des créations...', noResults: 'Aucun résultat', noChats: 'Pas encore de chats', noCreations: 'Pas encore de créations',
    yourAIToolkit: 'Votre Boîte à Outils IA', createAmazingContent: 'Créez du Contenu Incroyable avec l\'IA', startCreating: 'Commencer à Créer',
    welcomeToNovaMind: 'Bienvenue sur NovaMind AI', monthlyUsage: 'Utilisation Mensuelle', used: 'Utilisé', limit: 'Limite', created: 'Créé',
    tryOneOfThese: 'Essayez l\'un de ceux-ci:', typeYourReply: 'Tapez votre réponse...', offline: 'Hors ligne — certaines fonctionnalités peuvent ne pas fonctionner.', backOnline: 'De retour en ligne!',
    exportPDF: 'PDF', exportWord: 'Word', copy: 'Copier', share: 'Partager', publish: 'Publier', download: 'Télécharger',
    darkMode: 'Mode Sombre', lightMode: 'Mode Clair', shortcuts: 'Raccourcis',
    myCreations: 'Mes Créations', myChats: 'Mes Chats', communityGallery: 'Galerie Communautaire',
    reply: 'Répondre', continue_: 'Continuer', delete_: 'Supprimer', aiAgents: 'Agents IA', quickTools: 'Outils Rapides',
    thisMonth: 'Ce Mois', totalGenerations: 'Total Générations', textGens: 'Texte', imageGens: 'Images', recentActivity: 'Activité Récente',
    industry: 'Industrie', all: 'Tous', favorites: 'Favoris',
    factCheck: 'Vérification des Faits', ideaSpark: 'Étincelle d\'Idées', tapToDictate: '🎤 Appuyez pour dicter',
    listening: '🔴 Écoute en cours...', moodWriter: 'Ton', voiceNotSupported: 'La reconnaissance vocale n\'est pas prise en charge par ce navigateur. Essayez Chrome ou Safari.',
  },
};

const CHAT_TAGS: { id: ChatTagLabel; icon: string; label: string }[] = [
  { id: '', icon: '📋', label: 'All' },
  { id: 'Content', icon: '📝', label: 'Content' },
  { id: 'Email', icon: '📧', label: 'Email' },
  { id: 'Design', icon: '🎨', label: 'Design' },
  { id: 'Research', icon: '🔍', label: 'Research' },
  { id: 'Marketing', icon: '📢', label: 'Marketing' },
  { id: 'Ideas', icon: '💡', label: 'Ideas' },
];

const PERSONAL_TOOL_STARTERS: Record<string, { icon: string; text: string }[]> = {
  'fridge-chef': [
    { icon: '🥚', text: 'Eggs, cheese, spinach, and bread' },
    { icon: '🍗', text: 'Chicken thighs, rice, broccoli, soy sauce' },
    { icon: '🥫', text: 'Canned tuna, pasta, garlic, olive oil' },
  ],
  'day-planner': [
    { icon: '📋', text: 'Gym, grocery shopping, 2 meetings, cook dinner, read for 30 min' },
    { icon: '🏠', text: 'Work from home: 3 client calls, write report, lunch break, evening walk' },
    { icon: '📚', text: 'Study for exam, laundry, meal prep, 1 hour coding practice' },
  ],
  'itinerary': [
    { icon: '🗼', text: 'Paris for 5 days on a $2000 budget' },
    { icon: '🏖️', text: 'Bali for a week, budget-friendly, include beaches and temples' },
    { icon: '🗽', text: 'New York City for 3 days, first-time visitor, $1500 budget' },
  ],
  'summarizer': [
    { icon: '📖', text: 'Chapter 5 of my biology textbook on cell division' },
    { icon: '📰', text: 'This 2000-word article about climate change policies' },
    { icon: '📄', text: 'These meeting notes into 5 key takeaways' },
  ],
  'flashcards': [
    { icon: '🧠', text: 'Chapter 3 of AP Psychology: Memory and Learning' },
    { icon: '🇪🇸', text: 'Spanish vocabulary: food, restaurants, and ordering' },
    { icon: '⚗️', text: 'Organic chemistry functional groups and reactions' },
  ],
  'essay-outline': [
    { icon: '📝', text: 'The impact of social media on mental health (argumentative)' },
    { icon: '🌍', text: 'Climate change solutions for developing nations (research paper)' },
    { icon: '💼', text: 'Why remote work is the future of business (persuasive)' },
  ],
  'resume': [
    { icon: '💻', text: 'Software Engineer position at Google — 3 years experience' },
    { icon: '📊', text: 'Marketing Manager at a startup — career changer from teaching' },
    { icon: '🏥', text: 'Registered Nurse position — new grad with clinical rotations' },
  ],
  'interview': [
    { icon: '🖥️', text: 'Senior Frontend Developer at a fintech startup' },
    { icon: '📈', text: 'Product Manager at a Fortune 500 company' },
    { icon: '🎨', text: 'UX Designer at a design agency — portfolio review' },
  ],
  'contract': [
    { icon: '🏠', text: 'This apartment lease agreement — highlight red flags' },
    { icon: '💼', text: 'This freelance contract — what should I negotiate?' },
    { icon: '📱', text: 'This software terms of service — privacy concerns' },
  ],
  'video-hook': [
    { icon: '💰', text: 'Side hustles that actually work in 2024' },
    { icon: '🍳', text: 'Easy meal prep for busy professionals' },
    { icon: '📱', text: 'iPhone hidden features most people don\'t know' },
  ],
  'faceless-script': [
    { icon: '🧠', text: 'Top 10 psychology facts that will blow your mind' },
    { icon: '💡', text: 'How billionaires think differently — wealth mindset' },
    { icon: '🌌', text: 'The most terrifying places in the universe' },
  ],
  'aesthetic-prompt': [
    { icon: '🌅', text: 'Cozy autumn cabin with warm lighting and falling leaves' },
    { icon: '🏙️', text: 'Cyberpunk neon cityscape at night with rain reflections' },
    { icon: '🌸', text: 'Studio Ghibli-inspired peaceful countryside with wildflowers' },
  ],
};

const detectChatTag = (agentMode: string, contentType: string): ChatTagLabel => {
  if (agentMode === 'email-assistant') return 'Email';
  if (agentMode === 'ad-maker') return 'Marketing';
  if (agentMode === 'logo-maker') return 'Design';
  if (agentMode === 'competitor-analysis') return 'Research';
  if (agentMode === 'fact-checker') return 'Research';
  if (agentMode === 'idea-spark') return 'Ideas';
  if (agentMode === 'general' && contentType === 'image') return 'Design';
  if (agentMode === 'general' && contentType === 'text') return 'Content';
  return 'Content';
};

const INDUSTRIES = [
  { id: 'general', name: 'General', icon: '🌐' },
  { id: 'real-estate', name: 'Real Estate', icon: '🏠' },
  { id: 'restaurant', name: 'Restaurant & Food', icon: '🍽️' },
  { id: 'fitness', name: 'Fitness & Wellness', icon: '💪' },
  { id: 'legal', name: 'Legal', icon: '⚖️' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥' },
  { id: 'ecommerce', name: 'E-Commerce', icon: '🛒' },
  { id: 'salon', name: 'Salon & Beauty', icon: '💇' },
  { id: 'automotive', name: 'Automotive', icon: '🚗' },
  { id: 'education', name: 'Education', icon: '🎓' },
  { id: 'finance', name: 'Finance & Accounting', icon: '💰' },
  { id: 'construction', name: 'Construction', icon: '🏗️' },
  { id: 'photography', name: 'Photography', icon: '📸' },
  { id: 'nonprofit', name: 'Nonprofit', icon: '❤️' },
  { id: 'tech-startup', name: 'Tech Startup', icon: '🚀' },
  { id: 'travel', name: 'Travel & Tourism', icon: '✈️' },
  { id: 'insurance', name: 'Insurance', icon: '🛡️' },
  { id: 'marketing', name: 'Marketing Agency', icon: '📣' },
  { id: 'retail', name: 'Retail', icon: '🏪' },
  { id: 'dental', name: 'Dental', icon: '🦷' },
  { id: 'veterinary', name: 'Veterinary', icon: '🐾' },
  { id: 'cleaning', name: 'Cleaning Service', icon: '🧹' },
  { id: 'consulting', name: 'Consulting', icon: '📊' },
  { id: 'plumbing', name: 'Plumbing & HVAC', icon: '🔧' },
  { id: 'church', name: 'Church & Ministry', icon: '⛪' }
];

const AGENTS: { id: AgentMode; name: string; icon: string; desc: string; badge?: string }[] = [
  { id: 'general', name: 'AI Assistant', icon: '✨', desc: 'General AI content' },
  { id: 'competitor-analysis', name: 'Competitor Analysis', icon: '🔍', desc: 'SWOT & market intel', badge: 'NEW' },
  { id: 'ad-maker', name: 'Ad Maker', icon: '📢', desc: 'Ad copy & creatives' },
  { id: 'logo-maker', name: 'Logo Maker', icon: '🎨', desc: 'AI logo design' },
  { id: 'email-assistant', name: 'Email Assistant', icon: '📧', desc: 'Professional emails' },
  { id: 'fact-checker', name: 'Fact-Check & Verify', icon: '🔍', desc: 'Verify claims & facts', badge: 'NEW' },
  { id: 'idea-spark', name: 'Idea Spark', icon: '💡', desc: 'Creative brainstorming', badge: 'NEW' },
];

const EMAIL_MODE_PROMPTS: Record<EmailMode, (tone: string) => string> = {
  'compose': (tone: string) => `You are a professional email writer. Compose a polished, ready-to-send email based on the user's request.
Include: Subject line, greeting, body, call-to-action, professional sign-off.
Also provide: 2 alternative subject lines and a follow-up timing suggestion.
Tone: ${tone}`,
  'reply': (tone: string) => `You are an expert email responder. The user will paste an email they received. Write the perfect professional reply.
Analyze the sender's tone and intent, then craft a response that:
- Addresses all points raised
- Maintains professionalism
- Includes a clear next step or CTA
Tone: ${tone}
Provide the reply email only (with subject line for reply).`,
  'sequences': (tone: string) => `You are an email sequence strategist. Create a multi-step email sequence (3-5 emails) for the user's goal.
For each email provide:
- Email # and suggested send timing (e.g., "Day 1", "Day 3", "Day 7")
- Subject line
- Full email body
- Goal of this specific email in the sequence
Make each email progressively build urgency/value.
Tone: ${tone}`,
  'polish': (tone: string) => `You are a professional editor. The user will paste a rough email draft. Rewrite it to be polished, professional, and effective.
Provide:
- The polished version
- A brief "What I changed" summary (3-5 bullet points)
- A rate (1-10) of the original vs polished version
Tone: ${tone}`,
};

const EMAIL_MODES: { id: EmailMode; icon: string; label: string }[] = [
  { id: 'compose', icon: '📝', label: 'Compose' },
  { id: 'reply', icon: '↩️', label: 'Reply' },
  { id: 'sequences', icon: '📧', label: 'Sequences' },
  { id: 'polish', icon: '✨', label: 'Polish' },
];

const EMAIL_TONES = ['Formal', 'Friendly', 'Persuasive', 'Apologetic', 'Follow-Up', 'Urgent'];

const AGENT_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  'general': '',
  'competitor-analysis': `You are a competitive intelligence analyst. Analyze the given competitor concisely. Use this structure:
## 🔍 Overview (2-3 sentences)
## 📊 SWOT Analysis (3 bullets each: Strengths, Weaknesses, Opportunities, Threats)
## 💡 Market Gaps (3 specific gaps to exploit)
## 🎯 How to Differentiate (3 positioning strategies)
## 📝 Marketing Copy (2 taglines positioning against them)
Be specific and actionable.`,
  'ad-maker': `You are an ad copywriter. Create compelling ad copy for the specified platform. Include:
## 🎯 Campaign Brief (2 sentences)
## 📝 Headlines (3 options)
## 📱 Body Copy
## 🚀 CTAs (3 options)
## #️⃣ Hashtags (5-8)
Be punchy, benefit-driven, and conversion-focused.`,
  'logo-maker': `You are a brand identity designer. Provide a logo concept with:
## 🎨 Concept (visual description)
## 🌈 Colors (3 hex codes with reasoning)
## 🔤 Typography (font recommendations)
## 📰 Layout (icon, horizontal, stacked variants)
Suggest switching to GPT Image for AI-generated visuals.`,
  'email-assistant': `You are a professional email writer. Write a polished email with Subject line, greeting, body, CTA, and sign-off. Include 2 alternative subject lines and a follow-up tip. Adapt tone to context.`,
  'fact-checker': `You are a rigorous fact-checker. Analyze the following text for:
1) Factual accuracy — identify any claims that are false, misleading, or unverifiable.
2) Potential plagiarism indicators — flag any text that appears to be commonly found verbatim in other sources.
3) Source credibility assessment.
Rate overall reliability on a scale: ✅ Verified / ⚠️ Partially Verified / ❌ Unverified.
Format your response with clear sections and confidence levels.`,
  'idea-spark': `You are a creative ideation engine. Given a keyword or topic, generate a burst of creative inspiration formatted as:
## 🎯 Headlines
(3 catchy, click-worthy headlines)
## 📐 Content Angles
(3 unique approaches to cover this topic)
## 🔮 Metaphors & Hooks
(3 vivid metaphors or opening hooks)
## 🔗 Unexpected Connections
(2 cross-industry or surprising angles)
Be bold, original, and inspiring.`
};

const AGENT_SUGGESTIONS: Record<AgentMode, { icon: string; text: string }[]> = {
  'general': [
    { icon: '📧', text: 'Write a professional follow-up email to a potential client' },
    { icon: '📱', text: 'Create an Instagram caption for a product launch' },
    { icon: '📝', text: 'Write a compelling "About Us" page for my business' },
    { icon: '🎨', text: 'Design a modern logo for a tech startup called "NexGen"' }
  ],
  'competitor-analysis': [
    { icon: '🔍', text: 'Analyze my top competitor [Company Name] in the [industry] space' },
    { icon: '📊', text: 'SWOT analysis of Starbucks for a local coffee shop owner' },
    { icon: '💡', text: 'Find market gaps in the fitness app industry that I can exploit' },
    { icon: '🎯', text: 'How should I position my cleaning service against Stanley Steemer?' }
  ],
  'ad-maker': [
    { icon: '📱', text: 'Create a Facebook ad for my new fitness coaching program at $99/month' },
    { icon: '🎯', text: 'Write Google Search ad copy for a personal injury law firm' },
    { icon: '📸', text: 'Instagram carousel ad copy for a new skincare product launch' },
    { icon: '📧', text: 'Email marketing campaign for a restaurant grand opening' }
  ],
  'logo-maker': [
    { icon: '🏪', text: 'Design a modern minimalist logo for a boutique coffee shop called "Brew & Co"' },
    { icon: '💼', text: 'Create a professional logo concept for a financial consulting firm' },
    { icon: '🎨', text: 'Logo ideas for a children\'s art studio called "Little Picasso"' },
    { icon: '🚀', text: 'Tech startup logo for an AI-powered scheduling app called "TimeFlow"' }
  ],
  'email-assistant': [
    { icon: '🤝', text: 'Write a cold outreach email to pitch my marketing services to a local business' },
    { icon: '📋', text: 'Follow-up email after a sales meeting where the client seemed interested' },
    { icon: '🙏', text: 'Professional apology email for a delayed project delivery' },
    { icon: '🎉', text: 'Customer welcome email sequence for new subscribers' }
  ],
  'fact-checker': [
    { icon: '📰', text: 'Check if this article about AI replacing 80% of jobs by 2030 is accurate' },
    { icon: '🔬', text: 'Verify: "Humans only use 10% of their brain capacity"' },
    { icon: '📊', text: 'Fact-check this marketing claim about our competitor\'s market share' },
    { icon: '🧪', text: 'Is this health article about intermittent fasting scientifically accurate?' }
  ],
  'idea-spark': [
    { icon: '🚀', text: 'Sustainable fashion for Gen Z' },
    { icon: '🍕', text: 'Local pizza restaurant social media content' },
    { icon: '💡', text: 'AI in education — fresh angles for a blog series' },
    { icon: '🎬', text: 'True crime podcast launch — unique hooks and angles' }
  ]
};

const PERSONAL_TOOLS = [
  // Daily Life & Home
  { id: 'fridge-chef', name: 'Fridge Chef', icon: '🍳', desc: 'Tell it what\'s in your fridge. Get a recipe in seconds.', pillar: 'home', prompt: 'I have these ingredients in my fridge: ' },
  { id: 'day-planner', name: 'Day-Planner Tetris', icon: '📅', desc: 'Drop in your tasks, get a perfectly blocked schedule.', pillar: 'home', prompt: 'Here are my tasks for today: ' },
  { id: 'itinerary', name: 'Budget Itinerary Builder', icon: '✈️', desc: 'Dream trip. Real budget. Every detail planned.', pillar: 'home', prompt: 'Plan a trip to ' },
  // Education & Learning
  { id: 'summarizer', name: 'Textbook Summarizer', icon: '📚', desc: 'Paste a chapter, get the key highlights.', pillar: 'education', prompt: 'Summarize this text into key points: ' },
  { id: 'flashcards', name: 'Flashcard Generator', icon: '🎴', desc: 'Paste your notes, get study-ready flashcards.', pillar: 'education', prompt: 'Create flashcards from these notes: ' },
  { id: 'essay-outline', name: 'Essay Outline Architect', icon: '📐', desc: 'From blank page to structured outline in 30 seconds.', pillar: 'education', prompt: 'Create an essay outline about: ' },
  // Career & Money
  { id: 'resume', name: 'Resume ATS Tailor', icon: '📄', desc: 'Paste the job listing. Get a resume that gets read.', pillar: 'career', prompt: 'Tailor my resume for this job listing: ' },
  { id: 'interview', name: 'Interview Simulator', icon: '💬', desc: 'Practice tough questions. Get real-time coaching.', pillar: 'career', prompt: 'Simulate an interview for the position of: ' },
  { id: 'contract', name: 'Lease/Contract Translator', icon: '📜', desc: 'Upload the fine print. Get plain English.', pillar: 'career', prompt: 'Translate this contract into plain English: ' },
  // Creator & Social
  { id: 'video-hook', name: 'Short-Form Video Hook', icon: '🎥', desc: 'Scroll-stopping hooks for TikTok, Reels, Shorts.', pillar: 'creator', prompt: 'Write 5 scroll-stopping hooks for a video about: ' },
  { id: 'faceless-script', name: 'Faceless Video Scriptwriter', icon: '🎬', desc: 'Full scripts for faceless YouTube channels.', pillar: 'creator', prompt: 'Write a faceless YouTube video script about: ' },
  { id: 'aesthetic-prompt', name: 'Aesthetic Prompt Architect', icon: '🎨', desc: 'Describe your vibe. Get AI art prompts that nail it.', pillar: 'creator', prompt: 'Create AI art prompts for this aesthetic: ' },
];

const PILLAR_INFO: Record<string, { name: string; icon: string; color: string }> = {
  home: { name: 'Daily Life & Home', icon: '🏠', color: '#FF6B6B' },
  education: { name: 'Education & Learning', icon: '🎓', color: '#4ECDC4' },
  career: { name: 'Career & Money', icon: '💼', color: '#45B7D1' },
  creator: { name: 'Creator & Social', icon: '🎬', color: '#96CEB4' },
};

const renderMarkdown = (text: string): string => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^(---|(\\*\\*\\*))$/gm, '<hr>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  const lines = html.split('\n');
  let result = '';
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^[\-\*] (.+)/);
    const olMatch = line.match(/^\d+\. (.+)/);

    if (ulMatch) {
      if (!inUl) { result += '<ul>'; inUl = true; }
      result += `<li>${ulMatch[1]}</li>`;
      continue;
    } else if (inUl) {
      result += '</ul>'; inUl = false;
    }

    if (olMatch) {
      if (!inOl) { result += '<ol>'; inOl = true; }
      result += `<li>${olMatch[1]}</li>`;
      continue;
    } else if (inOl) {
      result += '</ol>'; inOl = false;
    }

    if (line.startsWith('<h') || line.startsWith('<hr') || line.startsWith('<pre>') || line.startsWith('<ul>') || line.startsWith('<ol>')) {
      result += line;
    } else if (line.trim() === '') {
      result += '<br>';
    } else {
      result += `<p>${line}</p>`;
    }
  }
  if (inUl) result += '</ul>';
  if (inOl) result += '</ol>';

  return result;
};

const generateShareId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};


const App: React.FC = () => {
  // ===== EXISTING STATE =====
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ content?: string; text?: string; imageUrl?: string; error?: string } | null>(null);
  const [model, setModel] = useState('deepseek');
  const [contentType, setContentType] = useState('text');
  const [usage, setUsage] = useState({ used: 0, limit: 15, plan: 'free' });
  const [creations, setCreations] = useState<Array<{ id: string; prompt?: string; imageUrl?: string; model?: string; [key: string]: unknown }>>([]);
  const [copied, setCopied] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastContentType, setLastContentType] = useState('text');
  const [lastModel, setLastModel] = useState('deepseek');
  const [lastSystemPrompt, setLastSystemPrompt] = useState('');
  const [industry, setIndustry] = useState('general');
  const [imageStyle, setImageStyle] = useState('');
  const [imageSize, setImageSize] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('general');
  const [isPersonalMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'personal';
  });

  // Template & History state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'favorites'>('all');

  // Chat History state
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Email Agent Enhanced state
  const [emailMode, setEmailMode] = useState<EmailMode>('compose');
  const [emailTone, setEmailTone] = useState('Formal');
  const [routeNotification, setRouteNotification] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{name: string; type: string; preview?: string}[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Onboarding wizard state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState({
    displayName: '',
    businessName: '',
    industry: 'general',
    primaryUse: [] as string[],
    experienceLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    goals: [] as string[]
  });

  const [savingTemplate, setSavingTemplate] = useState(false);

  // ===== NEW FEATURE STATES =====

  // Feature 1: Dark/Light Mode
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem('novamind-theme') as ThemeMode) || 'dark'; } catch { return 'dark'; }
  });

  // Feature 3: Search
  const [searchQuery, setSearchQuery] = useState('');

  // Feature 4: Keyboard Shortcuts tooltip
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Feature 9: Toast system
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const [toastVisible, setToastVisible] = useState(false);

  // Feature 10: Offline indicator
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);

  // Feature 11: Multi-language
  const [language, setLanguage] = useState<LangCode>(() => {
    try { return (localStorage.getItem('novamind-lang') as LangCode) || 'en'; } catch { return 'en'; }
  });

  // Feature 13: Chat Tags
  const [chatTag, setChatTag] = useState<ChatTagLabel>('');

  // Feature: Voice-to-Text
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof Object> | null>(null);

  // Feature: Mood Writer
  const [moodTone, setMoodTone] = useState('');

  // Share & Community
  const [showShareMenu, setShowShareMenu] = useState<string | null>(null);
  const [communityPosts, setCommunityPosts] = useState<Array<Record<string, any>>>([]);
  const [communityLoading, setCommunityLoading] = useState(false);

  // Feature 11: Translation helper
  const T = TRANSLATIONS[language];

  // Feature 9: Enhanced Toast
  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }, []);

  // Feature 2: Export to PDF/Word
  const exportToPDF = useCallback((content: string, title?: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title || 'NovaMind Export'}</title><style>body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a2e;line-height:1.8;}h1,h2,h3{color:#6c63ff;}pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto;}code{background:#f0f0f5;padding:2px 6px;border-radius:4px;}hr{border:none;border-top:2px solid #e0e0e0;margin:24px 0;}.footer{text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e0e0e0;color:#999;font-size:12px;}</style></head><body>${renderMarkdown(content)}<div class="footer">Created with NovaMind AI — novamindai.studio</div></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, []);

  const exportToWord = useCallback((content: string, title?: string) => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title || 'NovaMind Export'}</title><style>body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.8;color:#1a1a2e;}h1,h2,h3{color:#6c63ff;}</style></head><body>${renderMarkdown(content)}<p style="text-align:center;color:#999;margin-top:40px;font-size:11px;">Created with NovaMind AI</p></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'novamind-export').replace(/[^a-zA-Z0-9]/g, '-')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported to Word! 📝');
  }, [showToast]);

  // Feature 1: Persist theme
  useEffect(() => {
    try { localStorage.setItem('novamind-theme', theme); } catch {}
  }, [theme]);

  // Feature 11: Persist language
  useEffect(() => {
    try { localStorage.setItem('novamind-lang', language); } catch {}
  }, [language]);

  // Feature 12: Update document title based on tab
  useEffect(() => {
    const titles: Record<Tab, string> = {
      home: 'NovaMind AI - Home', create: 'NovaMind AI - Create',
      gallery: 'NovaMind AI - Gallery', chats: 'NovaMind AI - Chats',
      community: 'NovaMind AI - Community', crm: 'NovaMind AI - CRM',
      projects: 'NovaMind AI - Projects'
    };
    document.title = titles[tab] || 'NovaMind AI';
  }, [tab]);

  // Feature 10: Online/offline detection
  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); showToast('✅ Back online!', 'success'); };
    const handleOffline = () => { setIsOffline(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [showToast]);

  // Feature 4: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'Enter') { e.preventDefault(); handleGenerate(); }
      if (meta && e.key === 'n') { e.preventDefault(); startNewChat(); setTab('create'); }
      if (meta && e.key === 'k') {
        e.preventDefault();
        if (tab === 'chats' || tab === 'gallery') {
          const searchInput = document.querySelector('.search-input-field') as HTMLInputElement;
          if (searchInput) searchInput.focus();
        } else {
          const promptInput = document.querySelector('.prompt-input') as HTMLTextAreaElement;
          if (promptInput) promptInput.focus();
        }
      }
      if (e.key === 'Escape') { setShowShareMenu(null); setShowShortcuts(false); setShowAuth(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, generating, prompt]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const loadTemplates = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, 'users', uid, 'templates'), orderBy('createdAt', 'desc'), firestoreLimit(20)));
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as PromptTemplate)));
    } catch (e) { console.error('Load templates err:', e); }
  };

  const loadHistory = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, 'users', uid, 'history'), orderBy('createdAt', 'desc'), firestoreLimit(100)));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as HistoryItem)));
    } catch (e) { console.error('Load history err:', e); }
  };

  const loadChats = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, 'users', uid, 'chats'), orderBy('updatedAt', 'desc'), firestoreLimit(50)));
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatDoc)));
    } catch (e) { console.error('Load chats err:', e); }
  };

  const saveTemplate = async () => {
    if (!user || !prompt.trim() || savingTemplate) return;
    if (templates.length >= 20) { alert('Max 20 templates. Delete one first.'); return; }
    setSavingTemplate(true);
    try {
      const templateData = {
        prompt: prompt.trim(),
        industry,
        agentMode,
        contentType,
        model,
        label: prompt.trim().substring(0, 40),
        createdAt: Timestamp.now()
      };
      const docRef = await addDoc(collection(db, 'users', user.uid, 'templates'), templateData);
      setTemplates(prev => [{ id: docRef.id, ...templateData }, ...prev].slice(0, 20));
    } catch (e) {
      console.error('Failed to save template:', e);
    }
    setSavingTemplate(false);
  };

  const deleteTemplate = async (templateId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'templates', templateId));
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (e) {
      console.error('Failed to delete template:', e);
    }
  };

  const applySettings = (p: string, ind: string, am: string, ct: string, mdl: string) => {
    setPrompt(p); setIndustry(ind || 'general'); setAgentMode((am || 'general') as AgentMode);
    setContentType(ct || 'text'); setModel(mdl || 'deepseek'); setResult(null);
  };
  const loadTemplate = (t: PromptTemplate) => applySettings(t.prompt, t.industry, t.agentMode, t.contentType, t.model);

  const saveHistoryItem = async (p: string, ct: string, m: string, am: string, ind: string, res: { content?: string; text?: string; imageUrl?: string } | null) => {
    if (!user) return;
    try {
      const d = { prompt: p, contentType: ct, model: m, agentMode: am, industry: ind, resultPreview: (res?.content || res?.text || '').substring(0, 500), imageUrl: res?.imageUrl || null, isFavorite: false, createdAt: Timestamp.now() };
      const ref = await addDoc(collection(db, 'users', user.uid, 'history'), d);
      setHistory(prev => [{ id: ref.id, ...d }, ...prev].slice(0, 100));
    } catch (e) { console.error('Failed to save history:', e); }
  };

  const toggleFavorite = async (hid: string) => {
    if (!user) return;
    const item = history.find(h => h.id === hid);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'history', hid), { isFavorite: !item.isFavorite });
      setHistory(prev => prev.map(h => h.id === hid ? { ...h, isFavorite: !h.isFavorite } : h));
    } catch (e) { console.error('Failed to toggle favorite:', e); }
  };

  const loadHistoryPrompt = (h: HistoryItem) => { applySettings(h.prompt, h.industry, h.agentMode, h.contentType, h.model); setTab('create'); };

  // Chat management functions
  const startNewChat = () => {
    setCurrentChatId(null);
    setChatMessages([]);
    setChatTitle('');
    setPrompt('');
    setResult(null);
    setMoodTone('');
  };

  const saveChatToFirestore = async (
    chatId: string | null,
    messages: ChatMessage[],
    title: string
  ): Promise<string> => {
    if (!user) return chatId || '';
    const chatData = {
      title: title.substring(0, 60),
      messages,
      agentMode,
      industry,
      model,
      contentType,
      updatedAt: Timestamp.now(),
      isShared: false,
      shareId: null,
      tag: detectChatTag(agentMode, contentType),
    };

    if (chatId) {
      await updateDoc(doc(db, 'users', user.uid, 'chats', chatId), chatData);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, ...chatData, id: chatId } as ChatDoc : c));
      return chatId;
    } else {
      const fullData = { ...chatData, createdAt: Timestamp.now() };
      const ref = await addDoc(collection(db, 'users', user.uid, 'chats'), fullData);
      const newChat: ChatDoc = { id: ref.id, ...fullData } as ChatDoc;
      setChats(prev => [newChat, ...prev]);
      return ref.id;
    }
  };

  const loadChat = (chat: ChatDoc) => {
    setCurrentChatId(chat.id);
    setChatMessages(chat.messages || []);
    setChatTitle(chat.title);
    setAgentMode((chat.agentMode || 'general') as AgentMode);
    setIndustry(chat.industry || 'general');
    setModel(chat.model || 'deepseek');
    setContentType(chat.contentType || 'text');
    setPrompt('');
    setResult(null);
    setTab('create');
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId));
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (currentChatId === chatId) {
        startNewChat();
      }
    } catch (e) {
      console.error('Failed to delete chat:', e);
    }
  };

  const shareChat = async (chatId: string) => {
    if (!user) return;
    try {
      const sid = generateShareId();
      await updateDoc(doc(db, 'users', user.uid, 'chats', chatId), { isShared: true, shareId: sid });
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, isShared: true, shareId: sid } : c));
      const link = `${window.location.origin}/shared/${sid}`;
      await navigator.clipboard.writeText(link);
      alert('Share link copied to clipboard!');
    } catch (e) {
      console.error('Failed to share chat:', e);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // Clear ALL user state
      setChatMessages([]);
      setCreations([]);
      setResult(null);
      setPrompt('');
      setTab('home');
      setTemplates([]);
      setHistory([]);
      setChats([]);
      setCurrentChatId(null);
      setUsage({ used: 0, limit: 15, plan: 'free' });
      setIndustry('general');
      setAgentMode('general');
    } catch (err) {
      alert('Sign out failed — please try again.');
      console.error('Sign out error:', err);
    }
  };


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); setLoading(false);
      if (u) {
        const usageDoc = await getDoc(doc(db, 'users', u.uid));
        if (usageDoc.exists()) {
          const data = usageDoc.data();
          const plan = data.plan || 'free';
          const limits: Record<string, number> = { free: 15, pro: 100, business: 999999, solopreneur: 999999, team: 999999, business_pro: 999999 };
          setUsage({ used: data.monthlyUsage || 0, limit: limits[plan] || 15, plan });
        }
        try {
          const q = query(collection(db, 'creations'), where('userId', '==', u.uid), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          setCreations(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; [key: string]: unknown })));
        } catch {}
        // Load templates, history, and chats
        loadTemplates(u.uid);
        loadHistory(u.uid);
        loadChats(u.uid);
        // Check if onboarding is needed
        if (usageDoc.exists()) {
          const data = usageDoc.data();
          if (!data.onboardingComplete) {
            setShowOnboarding(true);
            setOnboardingStep(0);
            if (u.displayName) setOnboardingData(prev => ({ ...prev, displayName: u.displayName || '' }));
          } else {
            if (data.defaultIndustry) setIndustry(data.defaultIndustry);
          }
        } else {
          // New user — no doc yet, show onboarding
          setShowOnboarding(true);
          setOnboardingStep(0);
          if (u.displayName) setOnboardingData(prev => ({ ...prev, displayName: u.displayName || '' }));
        }
      } else {
        setTemplates([]);
        setHistory([]);
        setChats([]);
      }
    });
    return unsub;
  }, []);


  const ONBOARDING_USES = [
    { id: 'content', label: '✍️ Content Writing', desc: 'Blog posts, articles, copy' },
    { id: 'marketing', label: '📣 Marketing & Ads', desc: 'Ad copy, social posts, campaigns' },
    { id: 'email', label: '📧 Email & Comms', desc: 'Professional emails, outreach' },
    { id: 'images', label: '🎨 Image Generation', desc: 'Logos, graphics, AI art' },
    { id: 'code', label: '💻 Code & Tech', desc: 'Programming, debugging, scripts' },
    { id: 'analysis', label: '📊 Analysis & Research', desc: 'Market research, competitor intel' },
  ];

  const ONBOARDING_GOALS = [
    { id: 'save-time', label: '⏱️ Save Time', desc: 'Automate repetitive tasks' },
    { id: 'grow-business', label: '📈 Grow My Business', desc: 'Marketing, leads, sales' },
    { id: 'better-content', label: '✨ Create Better Content', desc: 'Higher quality output' },
    { id: 'reduce-costs', label: '💰 Reduce Costs', desc: 'Replace expensive tools/services' },
    { id: 'learn-ai', label: '🧠 Learn AI', desc: 'Explore what AI can do' },
    { id: 'team-productivity', label: '👥 Team Productivity', desc: 'Help my team work smarter' },
  ];

  const completeOnboarding = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        onboardingComplete: true,
        displayName: onboardingData.displayName || user.displayName || '',
        businessName: onboardingData.businessName || '',
        defaultIndustry: onboardingData.industry || 'general',
        primaryUse: onboardingData.primaryUse || [],
        experienceLevel: onboardingData.experienceLevel || 'beginner',
        goals: onboardingData.goals || [],
        onboardedAt: Timestamp.now()
      }, { merge: true });
      setIndustry(onboardingData.industry || 'general');
      setShowOnboarding(false);
    } catch (e) {
      console.error('Failed to save onboarding:', e);
    }
  };

  const skipOnboarding = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { onboardingComplete: true, onboardedAt: Timestamp.now() }, { merge: true });
    } catch (e) { console.error(e); }
    setShowOnboarding(false);
  };

  const toggleOnboardingArray = (arr: string[], item: string) => {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  };

  const handleAuth = async () => {
    setAuthError('');
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
      setShowAuth(false);
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {} }
    } catch (e: unknown) { const err = e as { code?: string; message?: string }; 
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') setAuthError('No account found with that email. Try "Create a Free Account" below!');
      else if (err.code === 'auth/wrong-password') setAuthError('Incorrect password. Try again or use "Forgot Password".');
      else if (err.code === 'auth/email-already-in-use') setAuthError('An account with this email already exists. Try signing in instead!');
      else if (err.code === 'auth/weak-password') setAuthError('Password must be at least 6 characters.');
      else if (err.code === 'auth/invalid-email') setAuthError('Please enter a valid email address.');
      else setAuthError(err.message?.replace('Firebase: ', '') || 'Something went wrong. Please try again.'); }
  };


  const handleResetPassword = async () => {
    if (!email.trim()) { setAuthError('Enter your email address first'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      setAuthError('');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setAuthError(err.message?.replace('Firebase: ', '') || 'Failed to send reset email');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowAuth(false);
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {} }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError(err.message?.replace('Firebase: ', '') || 'Google sign-in failed');
      }
    }
  };

  const getEmailSystemPrompt = (): string => {
    return EMAIL_MODE_PROMPTS[emailMode](emailTone);
  };

  // 🧠 Smart Agent Router — detects intent from General and auto-switches
  const detectAndRoute = (userPrompt: string): { agent: AgentMode; model?: string; contentType?: string; personalTool?: string; notification?: string } | null => {
    const p = userPrompt.toLowerCase();

    // Logo detection
    if (/\b(logo|brand.*logo|design.*logo|create.*logo|make.*logo|logo.*design|company.*logo|business.*logo|icon.*design)\b/.test(p)) {
      return { agent: 'logo-maker', model: 'gpt-image-1', contentType: 'image', notification: '🎨 Switching to Logo Maker...' };
    }

    // Ad/advertising detection
    if (/\b(ad copy|advertisement|facebook ad|instagram ad|google ad|create.*ad|write.*ad|marketing.*ad|ad campaign|social media ad|tiktok ad|youtube ad|linkedin ad|promote|promotional)\b/.test(p)) {
      return { agent: 'ad-maker', notification: '📢 Switching to Ad Maker...' };
    }

    // Email detection
    if (/\b(write.*email|draft.*email|compose.*email|send.*email|email.*to|professional email|follow.?up email|cold email|outreach email|reply.*email|email.*sequence|email.*campaign|newsletter)\b/.test(p)) {
      return { agent: 'email-assistant', notification: '📧 Switching to Email Assistant...' };
    }

    // Fact-check detection
    if (/\b(fact.?check|verify|plagiarism|is this true|check if|is it true|debunk|accurate|fake news|misinformation|check this)\b/.test(p)) {
      return { agent: 'fact-checker', notification: '🔍 Switching to Fact-Check & Verify...' };
    }

    // Idea spark / brainstorm detection
    if (/\b(brainstorm|ideas|inspire|spark|creative ideas|ideate|idea.*for|content ideas|angles|hooks for)\b/.test(p)) {
      return { agent: 'idea-spark', notification: '💡 Switching to Idea Spark...' };
    }

    // Competitor analysis detection
    if (/\b(competitor|competition|swot|market analysis|analyze.*company|compare.*with|vs\b|versus|competitive.*analysis|market.*research|industry.*analysis|benchmark)\b/.test(p)) {
      return { agent: 'competitor-analysis', notification: '🔍 Switching to Competitor Analysis...' };
    }

    // Personal tool detection (only in personal mode)
    if (isPersonalMode) {
      if (/\b(recipe|cook|fridge|ingredients|meal|dinner|lunch|breakfast|what.*make.*eat)\b/.test(p)) {
        return { agent: 'general', personalTool: 'fridge-chef', notification: '🍳 Switching to Fridge Chef...' };
      }
      if (/\b(schedule|planner|plan.*day|organize.*day|time.*block|to.?do|task.*list|daily.*plan)\b/.test(p)) {
        return { agent: 'general', personalTool: 'day-planner', notification: '📅 Switching to Day Planner...' };
      }
      if (/\b(trip|travel|itinerary|vacation|flight|hotel|plan.*trip|visit.*city|budget.*travel)\b/.test(p)) {
        return { agent: 'general', personalTool: 'itinerary', notification: '✈️ Switching to Itinerary Builder...' };
      }
      if (/\b(summarize|summary|textbook|chapter|key.*points|study.*guide|tldr|tl;dr)\b/.test(p)) {
        return { agent: 'general', personalTool: 'summarizer', notification: '📚 Switching to Textbook Summarizer...' };
      }
      if (/\b(flashcard|study.*card|quiz.*card|flash.*card|memorize|study.*notes)\b/.test(p)) {
        return { agent: 'general', personalTool: 'flashcards', notification: '🎴 Switching to Flashcard Generator...' };
      }
      if (/\b(essay|outline|thesis|paragraph.*structure|essay.*structure|paper.*outline)\b/.test(p)) {
        return { agent: 'general', personalTool: 'essay-outline', notification: '📐 Switching to Essay Outline...' };
      }
      if (/\b(resume|cv|cover.*letter|job.*application|ats|tailor.*resume)\b/.test(p)) {
        return { agent: 'general', personalTool: 'resume', notification: '📄 Switching to Resume Tailor...' };
      }
      if (/\b(interview|mock.*interview|practice.*interview|interview.*question|interview.*prep)\b/.test(p)) {
        return { agent: 'general', personalTool: 'interview', notification: '💬 Switching to Interview Simulator...' };
      }
      if (/\b(contract|lease|fine.*print|legal.*document|terms.*conditions|translate.*contract)\b/.test(p)) {
        return { agent: 'general', personalTool: 'contract', notification: '📜 Switching to Contract Translator...' };
      }
      if (/\b(hook|tiktok|reel|shorts|scroll.*stop|video.*hook|viral.*hook)\b/.test(p)) {
        return { agent: 'general', personalTool: 'video-hook', notification: '🎥 Switching to Video Hook Writer...' };
      }
      if (/\b(faceless|youtube.*script|video.*script|faceless.*video|narration.*script)\b/.test(p)) {
        return { agent: 'general', personalTool: 'faceless-script', notification: '🎬 Switching to Script Writer...' };
      }
      if (/\b(ai.*art|aesthetic|prompt.*architect|art.*prompt|midjourney|stable.*diffusion|image.*prompt|art.*style)\b/.test(p)) {
        return { agent: 'general', personalTool: 'aesthetic-prompt', notification: '🎨 Switching to Prompt Architect...' };
      }
    }

    return null; // Stay in General
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: {name: string; type: string; preview?: string}[] = [];
    Array.from(files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) { alert(`${file.name} is too large (max 10MB)`); return; }
      newFiles.push(file);
      const info: {name: string; type: string; preview?: string} = { name: file.name, type: file.type };
      if (file.type.startsWith('image/')) {
        info.preview = URL.createObjectURL(file);
      }
      newPreviews.push(info);
    });
    setPendingFiles(prev => [...prev, ...newFiles]);
    setAttachedFiles(prev => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => { const n = [...prev]; if (n[index]?.preview) URL.revokeObjectURL(n[index].preview!); n.splice(index, 1); return n; });
    setPendingFiles(prev => { const n = [...prev]; n.splice(index, 1); return n; });
  };

  const clearFiles = () => {
    attachedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setAttachedFiles([]);
    setPendingFiles([]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    if (!user) { setShowAuth(true); return; }
    const currentPrompt = prompt;
    const currentContentType = contentType;
    const currentModel = model;
    const currentAgentMode = agentMode;
    const currentIndustry = industry;
    // 🧠 Smart routing: if in General, detect intent and auto-switch
    let activeAgentMode = currentAgentMode;
    let activeContentType = currentContentType;
    let activeModel = currentModel;

    if (currentAgentMode === 'general') {
      const route = detectAndRoute(currentPrompt);
      if (route) {
        activeAgentMode = route.agent;
        if (route.model) activeModel = route.model;
        if (route.contentType) activeContentType = route.contentType;
        // Update UI to show the switch
        setRouteNotification(route.notification || '');
        setTimeout(() => setRouteNotification(''), 3000);
        setAgentMode(route.agent);
        if (route.model) setModel(route.model);
        if (route.contentType) setContentType(route.contentType);
        // For personal tools, enhance the prompt with the tool's system context
        if (route.personalTool) {
          const tool = PERSONAL_TOOLS.find(t => t.id === route.personalTool);
          if (tool) {
            // Tool context will be added via system prompt
            (window as unknown as Record<string, unknown>).__activePersonalTool = tool;
          }
        }
      }
    }

    // 🤖 Smart Model Selection — NovaMind picks the best AI automatically
    const pLower = currentPrompt.toLowerCase();
    const hasImageAttachments = pendingFiles.some(f => f.type.startsWith('image/'));

    // Image generation → GPT Image
    if (/\b(generate.*image|create.*image|draw|design|make.*picture|make.*image|illustration|render|visualize|create.*graphic|poster|banner|infographic|logo|icon)\b/.test(pLower) && !hasImageAttachments) {
      activeModel = 'gpt-image-1';
      activeContentType = 'image';
      setModel('gpt-image-1');
      setContentType('image');
    }
    // Image analysis (uploaded images) → GPT-4o
    else if (hasImageAttachments) {
      activeModel = 'gpt-4o';
      setModel('gpt-4o');
    }
    // Complex reasoning, analysis, code review, detailed comparisons → GPT-4o
    else if (/\b(analyze.*in.?depth|complex.*analysis|detailed.*comparison|advanced.*code|debug.*code|refactor|architecture|strategic.*plan|financial.*model|legal.*review|technical.*spec)\b/.test(pLower)) {
      activeModel = 'gpt-4o';
      setModel('gpt-4o');
    }
    // Everything else (text, email, summaries, general chat) → DeepSeek (fastest + cheapest)
    else if (activeModel !== 'gpt-image-1') {
      activeModel = 'deepseek';
      setModel('deepseek');
    }

    setLastPrompt(currentPrompt);
    setLastContentType(activeContentType);
    setLastModel(activeModel);
    setGenerating(true); setResult(null);

    // Add user message to chat
    const fileLabel = attachedFiles.length > 0 ? `\n📎 ${attachedFiles.map(f => f.name).join(', ')}` : '';
    const userMsg: ChatMessage = { role: 'user', content: currentPrompt + fileLabel, timestamp: Date.now() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setPrompt('');

    try {
      const industryObj = INDUSTRIES.find(i => i.id === currentIndustry);
      let systemPrefix = '';

      // Check for personal tool routing
      const personalTool = (window as unknown as Record<string, unknown>).__activePersonalTool as { id: string; name: string; prompt: string } | undefined;
      if (personalTool) {
        systemPrefix = `You are NovaMind's ${personalTool.name} assistant. The user is asking for help related to: ${personalTool.name}. Provide detailed, helpful, and personalized results. Be friendly and conversational.`;
        delete (window as unknown as Record<string, unknown>).__activePersonalTool;
      } else if (activeAgentMode === 'email-assistant') {
        systemPrefix = getEmailSystemPrompt();
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your email specifically for this industry.`;
        }
      } else if (activeAgentMode !== 'general') {
        systemPrefix = AGENT_SYSTEM_PROMPTS[activeAgentMode];
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your analysis specifically for this industry.`;
        }
      } else if (currentIndustry !== 'general' && currentContentType === 'text') {
        systemPrefix = `You are an expert AI assistant specializing in the ${industryObj?.name} industry. Tailor your response specifically for ${industryObj?.name} professionals.`;
      }

      // Inject Mood Tone if selected
      if (moodTone) {
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `Write in a ${moodTone} tone.`;
      }

      // Personalize — address the user by name if available
      const firstName = user?.displayName?.split(' ')[0] || '';
      if (firstName) {
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `The user's name is ${firstName}. Address them by name naturally — use it in greetings, transitions, or when it feels conversational, but don't force it into every sentence.`;
      }

      // Build conversation context from last 10 messages
      const contextMessages = updatedMessages.slice(-10);
      if (contextMessages.length > 1) {
        const conversationContext = contextMessages.slice(0, -1).map(m =>
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n\n');
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `Previous conversation:\n${conversationContext}\n\nNow respond to the user's latest message:`;
      }

      setLastSystemPrompt(systemPrefix || '');
      // Process file attachments
      let fileAttachments: FileAttachment[] | undefined;
      if (pendingFiles.length > 0) {
        fileAttachments = await Promise.all(pendingFiles.map(f => fileToAttachment(f)));
        // Auto-switch to GPT-4o for image analysis if images attached and using deepseek
        const hasImages = pendingFiles.some(f => f.type.startsWith('image/'));
        if (hasImages && activeModel === 'deepseek') {
          activeModel = 'gpt-4o';
          setModel('gpt-4o');
        }
        clearFiles();
      }
      // 🎨 Inject Image Studio enhancements into prompt
      let finalPrompt = currentPrompt;
      if (activeContentType === 'image' || activeModel === 'gpt-image-1') {
        const styleMap: Record<string, string> = {
          professional: 'Professional style — clean, corporate, polished, high-end commercial quality.',
          minimalist: 'Minimalist style — simple, modern, clean lines, lots of white space, elegant.',
          luxury: 'Luxury style — gold accents, premium feel, elegant, sophisticated, rich colors.',
          playful: 'Playful style — bright vibrant colors, fun, energetic, cheerful, dynamic.',
          vintage: 'Vintage/retro style — warm muted tones, nostalgic feel, classic typography.',
          neon: 'Neon/cyberpunk style — vibrant glowing colors, futuristic, dark background with neon lights.',
          watercolor: 'Watercolor art style — soft washes of color, artistic, painterly, delicate textures.',
          flat: 'Flat design style — bold geometric shapes, solid colors, no gradients or shadows, modern graphic design.',
          '3d': '3D render style — realistic 3D rendering, depth, shadows, volumetric lighting, photorealistic.',
        };
        const styleHint = imageStyle && styleMap[imageStyle] ? `\n\nStyle: ${styleMap[imageStyle]}` : '';
        const sizeHint = imageSize ? `\n\nImage dimensions: ${imageSize}` : '';
        finalPrompt = currentPrompt + styleHint + sizeHint;
      }
      const res = await generateContent(finalPrompt, activeContentType, activeModel, systemPrefix || undefined, fileAttachments);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {} }

      // Add assistant message to chat — handle images vs text
      const isImageResult = !!(res?.imageUrl || res?.type === 'image');
      const assistantContent = isImageResult 
        ? (res?.content?.startsWith?.('data:') ? '🎨 Here\'s your generated image!' : (res?.content || res?.text || '🎨 Image generated!'))
        : (res?.content || res?.text || '');
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: assistantContent, 
        timestamp: Date.now(),
        ...(isImageResult && res?.imageUrl ? { imageUrl: res.imageUrl } : {})
      };
      const allMessages = [...updatedMessages, assistantMsg];
      setChatMessages(allMessages);

      // Auto-generate title from first prompt
      const title = chatTitle || currentPrompt.substring(0, 60);
      setChatTitle(title);

      // Save/update chat in Firestore
      try {
        const newChatId = await saveChatToFirestore(currentChatId, allMessages, title);
        setCurrentChatId(newChatId);
      } catch (chatErr) {
        console.error('Failed to save chat:', chatErr);
      }

      // Save to history after successful generation
      await saveHistoryItem(currentPrompt, activeContentType, activeModel, activeAgentMode, currentIndustry, res);
    } catch (e: unknown) { 
      const err = e as { message?: string }; 
      const errorMsg: ChatMessage = { role: 'assistant', content: `⚠️ **Something went wrong:** ${err.message || 'Unknown error'}`, isError: true, timestamp: Date.now() };
      setChatMessages(prev => [...prev, errorMsg]);
      setPrompt(currentPrompt);
      setResult(null);
    }
    setGenerating(false);
  };


  const handleCopy = () => {
    const text = result?.content || result?.text || '';
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleDownload = () => {
    if (!result?.imageUrl) return;
    const a = document.createElement('a');
    a.href = result.imageUrl;
    a.download = 'novamind-creation.png';
    a.click();
  };


  // ====== SHARE & COMMUNITY FUNCTIONS ======
  // (state and showToast moved to component state section above)

  const shareToSocial = async (platform: string, text: string, imageUrl?: string) => {
    const appUrl = 'https://novamind-ai-app.netlify.app';
    const tagline = 'Made with NovaMind AI ✨ Try it free';
    // Never share raw base64 data as text — detect and replace with a friendly message
    const isBase64 = text.startsWith('data:image/') || text.startsWith('data:');
    const cleanText = isBase64 ? '🎨 Check out what I created with AI!' : text.substring(0, 200);
    const fullText = `${cleanText}\n\n${tagline}`;

    // Try native share API first for images (mobile gets proper image sharing)
    if (imageUrl && imageUrl.startsWith('data:image/') && navigator.share) {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const file = new File([blob], 'novamind-creation.webp', { type: blob.type || 'image/webp' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ text: fullText + ' ' + appUrl, files: [file] });
          showToast(`Shared! 🎉`, 'success');
          setShowShareMenu(null);
          return;
        }
      } catch (e) {
        // If native share cancelled or failed, fall through to URL-based sharing
        if ((e as Error)?.name === 'AbortError') { setShowShareMenu(null); return; }
      }
    }

    const encodedText = encodeURIComponent(fullText);
    const encodedUrl = encodeURIComponent(appUrl);
    
    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    };
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400');
      showToast(`Shared to ${platform}! 🎉`, 'success');
    }
    setShowShareMenu(null);
  };

  const handleShareDownload = async (imageUrl: string, filename?: string) => {
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename || `novamind-creation-${Date.now()}.webp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Downloaded! 📥');
    } catch { showToast('Download failed'); }
  };

  const handleCopyShareLink = (text: string) => {
    const shareMsg = `${text.substring(0, 200)}\n\nMade with NovaMind AI ✨ — https://novamind-ai-app.netlify.app`;
    navigator.clipboard.writeText(shareMsg);
    showToast('Link copied! 🔗');
    setShowShareMenu(null);
  };

  const publishToCommunity = async (prompt: string, content: string, imageUrl?: string | null) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'communityGallery'), {
        userId: user.uid,
        displayName: user.displayName || 'Anonymous Creator',
        prompt: prompt.substring(0, 200),
        content: content.substring(0, 1000),
        imageUrl: imageUrl || null,
        likes: 0,
        likedBy: [],
        comments: [],
        createdAt: serverTimestamp(),
        featured: false,
      });
      showToast('Published to Community! 🌟');
    } catch (err) {
      console.error('Publish failed:', err);
      showToast('Failed to publish');
    }
  };

  const loadCommunityPosts = async () => {
    setCommunityLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'communityGallery'),
        orderBy('createdAt', 'desc'),
        firestoreLimit(50)
      ));
      setCommunityPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Load community failed:', err); }
    setCommunityLoading(false);
  };

  const handleLikePost = async (postId: string) => {
    if (!user) return;
    const postRef = doc(db, 'communityGallery', postId);
    const post = communityPosts.find(p => p.id === postId);
    if (!post) return;
    const likedBy = post.likedBy || [];
    const alreadyLiked = likedBy.includes(user.uid);
    try {
      if (alreadyLiked) {
        await updateDoc(postRef, { likes: Math.max(0, (post.likes || 0) - 1), likedBy: likedBy.filter((id: string) => id !== user.uid) });
      } else {
        await updateDoc(postRef, { likes: (post.likes || 0) + 1, likedBy: [...likedBy, user.uid] });
      }
      setCommunityPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        likes: alreadyLiked ? Math.max(0, (p.likes || 0) - 1) : (p.likes || 0) + 1,
        likedBy: alreadyLiked ? (p.likedBy || []).filter((id: string) => id !== user.uid) : [...(p.likedBy || []), user.uid]
      } : p));
    } catch (err) { console.error('Like failed:', err); }
  };

  const handleRegenerate = async () => {
    if (!lastPrompt || generating) return;
    setGenerating(true); setResult(null);
    try {
      const res = await generateContent(lastPrompt, lastContentType, lastModel, lastSystemPrompt || undefined);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
      // Add regenerated result to chat
      const isImg = !!(res?.imageUrl || res?.type === 'image');
      const regenContent = isImg
        ? (res?.content?.startsWith?.('data:') ? '🎨 Here\'s your regenerated image!' : (res?.content || res?.text || '🎨 Image regenerated!'))
        : (res?.content || res?.text || '');
      const regenMsg: ChatMessage = { role: 'assistant', content: regenContent, timestamp: Date.now(), ...(isImg && res?.imageUrl ? { imageUrl: res.imageUrl } : {}) };
      setChatMessages(prev => [...prev, regenMsg]);
    } catch (e: unknown) { const err = e as { message?: string }; setResult({ error: err.message }); }
    setGenerating(false);
  };

  const selectAgent = (agentId: AgentMode) => {
    setAgentMode(agentId);
    setPrompt('');
    setResult(null);
    if (agentId === 'logo-maker') {
      setModel('gpt-image-1');
      setContentType('image');
    } else {
      setModel('deepseek');
      setContentType('text');
    }
    // Reset email mode when switching away
    if (agentId !== 'email-assistant') {
      setEmailMode('compose');
      setEmailTone('Formal');
    }
    setTab('create');
  };

  // Voice-to-Text toggle
  const toggleVoiceRecognition = () => {
    const win = window as unknown as Record<string, unknown>;
    const SRConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SRConstructor) {
      alert(T.voiceNotSupported);
      return;
    }
    if (isListening && recognitionRef.current) {
      (recognitionRef.current as { stop: () => void }).stop();
      setIsListening(false);
      return;
    }
    const recognition = new (SRConstructor as { new(): { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void } })();
    recognition.lang = language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setPrompt(prev => {
        const base = prev.replace(/\u200B.*$/, '').trimEnd();
        const newText = finalTranscript + (interim ? '\u200B' + interim : '');
        return base ? base + ' ' + newText : newText;
      });
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') alert('Microphone access denied. Please allow microphone permissions.');
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Clean up zero-width space markers from interim results
      setPrompt(prev => prev.replace(/\u200B/g, ''));
    };
    recognition.start();
    setIsListening(true);
  };

  const switchTab = (t: Tab) => { setTab(t); if (t === 'community' && communityPosts.length === 0) loadCommunityPosts(); };
  if (loading) return null;

  // AUTH GATE: Require login before accessing any part of the app
  if (!user) {
    return (
      <div className="app-container" data-theme={theme}>
        <nav className="navbar" role="navigation">
          <div className="logo-section">
            <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI" />
            <span className="logo-text">{isPersonalMode ? 'NovaMind Personal' : 'NovaMind AI'}</span>
          </div>
        </nav>
        <div className="main-content" role="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <div className="auth-modal" style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <img src="/icon-192.png" alt="NovaMind AI" style={{ width: '64px', height: '64px', marginBottom: '16px' }} />
              <h2 style={{ margin: '0 0 8px' }}>{authMode === 'login' ? 'Welcome to NovaMind AI' : 'Create Your Account'}</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>{authMode === 'login' ? 'Sign in to continue' : 'Start creating with AI'}</p>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
            <input className="auth-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} aria-label="Password" />
            {authMode === 'login' && (
              <p style={{ textAlign: 'right', margin: '-4px 0 0 0' }}>
                <span onClick={handleResetPassword} style={{ color: 'var(--accent, #a855f7)', fontSize: '13px', cursor: 'pointer' }}>Forgot Password?</span>
              </p>
            )}
            {resetSent && <p style={{ color: '#4ade80', fontSize: '13px', margin: 0, textAlign: 'center' }}>✅ Password reset email sent! Check your inbox.</p>}
            <button className="generate-btn" onClick={handleAuth}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary, #999)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <button className="generate-btn" onClick={handleGoogleSignIn} style={{ background: '#fff', color: '#333', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <p className="auth-toggle" style={{ fontSize: '15px' }}>{authMode === 'login' ? "Don't have an account? " : "Already have an account? "}<span onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setResetSent(false); }} style={{ fontWeight: 700, textDecoration: 'underline' }}>{authMode === 'login' ? 'Create One Free' : 'Sign In'}</span></p>
          </div>
        </div>
      </div>
    );
  }
  
  // Feature 3: Search filtering
  const filteredHistory = history.filter(h => {
    const matchesFilter = historyFilter === 'all' || h.isFavorite;
    if (!searchQuery.trim()) return matchesFilter;
    const q = searchQuery.toLowerCase();
    return matchesFilter && ((h.prompt || '').toLowerCase().includes(q) || (h.resultPreview || '').toLowerCase().includes(q));
  });

  // Feature 13: Tag-filtered chats + Feature 3: Search
  const filteredChats = chats.filter(chat => {
    const matchesTag = !chatTag || (chat.tag === chatTag);
    if (!searchQuery.trim()) return matchesTag;
    const q = searchQuery.toLowerCase();
    const matchesSearch = (chat.title || '').toLowerCase().includes(q) ||
      (chat.messages || []).some((m: ChatMessage) => m.content.toLowerCase().includes(q));
    return matchesTag && matchesSearch;
  });

  // Feature 5: Dashboard stats computation
  const dashboardStats = React.useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = history.filter(h => {
      if (!h.createdAt) return false;
      const d = h.createdAt instanceof Timestamp ? h.createdAt.toDate() : new Date((h.createdAt as unknown as { seconds: number }).seconds * 1000);
      return d >= monthStart;
    });
    const textCount = thisMonth.filter(h => h.contentType === 'text').length;
    const imageCount = thisMonth.filter(h => h.contentType === 'image').length;
    const byAgent: Record<string, number> = {};
    thisMonth.forEach(h => {
      const name = h.agentMode || 'general';
      byAgent[name] = (byAgent[name] || 0) + 1;
    });
    const recent = [...history].sort((a, b) => {
      const at = a.createdAt instanceof Timestamp ? a.createdAt.seconds : (a.createdAt as unknown as { seconds: number })?.seconds || 0;
      const bt = b.createdAt instanceof Timestamp ? b.createdAt.seconds : (b.createdAt as unknown as { seconds: number })?.seconds || 0;
      return bt - at;
    }).slice(0, 5);
    return { total: thisMonth.length, textCount, imageCount, byAgent, recent };
  }, [history]);

  const pct = Math.min((usage.used / usage.limit) * 100, 100);
  const currentAgent = AGENTS.find(a => a.id === agentMode);
  // filteredHistory defined above with search support

  const getEmailPlaceholder = (): string => {
    switch (emailMode) {
      case 'compose': return 'Describe the email you need (e.g., "Follow-up email after a client meeting about their website redesign")...';
      case 'reply': return 'Paste the email you received and describe the reply you want...';
      case 'sequences': return 'Describe your goal for the email sequence (e.g., "Nurture leads who downloaded our whitepaper")...';
      case 'polish': return 'Paste your rough email draft here and we\'ll polish it into a professional message...';
    }
  };

  const getEmailButtonText = (): string => {
    switch (emailMode) {
      case 'compose': return '📧 Write Email';
      case 'reply': return '↩️ Draft Reply';
      case 'sequences': return '📧 Generate Sequence';
      case 'polish': return '✨ Polish Email';
    }
  };

  const getEmailBannerText = (): { title: string; desc: string } => {
    switch (emailMode) {
      case 'compose': return { title: '📝 Compose Mode', desc: 'Tell us the context — get a polished, ready-to-send email with subject line, body, and follow-up tips.' };
      case 'reply': return { title: '↩️ Reply Mode', desc: 'Paste an email you received — we\'ll analyze the tone and craft the perfect professional response.' };
      case 'sequences': return { title: '📧 Sequences Mode', desc: 'Describe your goal — get a multi-step email sequence with timing, subject lines, and progressive messaging.' };
      case 'polish': return { title: '✨ Polish Mode', desc: 'Paste your rough draft — get a professionally rewritten version with a summary of improvements.' };
    }
  };

  const formatChatDate = (ts: Timestamp | { seconds: number } | undefined): string => {
    if (!ts) return '';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date((ts as { seconds: number }).seconds * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };


  // ======= RENDER =======
  return (
    <div className="app-container" data-theme={theme === 'light' ? 'light' : undefined}>
      {/* ===== CSS for Features 1,7,8,9 ===== */}
      <style>{`
        [data-theme="light"] { --bg: #f5f5f7; --surface: #ffffff; --text-primary: #1a1a2e; --text-secondary: #666; --border-color: #e0e0e0; --primary: #6c63ff; }
        [data-theme="light"] .navbar { background: #ffffff; border-bottom: 1px solid #e0e0e0; }
        [data-theme="light"] .bottom-nav { background: #ffffff; border-top: 1px solid #e0e0e0; }
        [data-theme="light"] .auth-modal { background: #ffffff; }
        [data-theme="light"] .create-area { color: #1a1a2e; }
        [data-theme="light"] .prompt-input { background: #f0f0f5; color: #1a1a2e; border-color: #d0d0d8; }
        [data-theme="light"] .generate-btn { color: #fff; }
        [data-theme="light"] .agent-card, [data-theme="light"] .tool-card, [data-theme="light"] .stat-card, [data-theme="light"] .gallery-card { background: #ffffff; border-color: #e0e0e0; color: #1a1a2e; }
        [data-theme="light"] .industry-chip { background: #f0f0f5; color: #333; border-color: #d0d0d8; }
        [data-theme="light"] .industry-chip.active { background: rgba(108,99,255,0.15); color: #6c63ff; border-color: #6c63ff; }
        [data-theme="light"] .model-chip { background: #f0f0f5; color: #333; border-color: #d0d0d8; }
        [data-theme="light"] .model-chip.active { background: #6c63ff; color: #fff; }
        [data-theme="light"] .result-container { background: #ffffff; border-color: #e0e0e0; }
        [data-theme="light"] .result-area { color: #1a1a2e; }
        [data-theme="light"] .suggestion-chip { background: #f0f0f5; color: #333; border-color: #d0d0d8; }
        [data-theme="light"] .agent-tab { color: #333; }
        [data-theme="light"] .agent-tab.active { color: #6c63ff; }
        [data-theme="light"] .section-title { color: #1a1a2e; }
        [data-theme="light"] .markdown-content { color: #1a1a2e; }
        [data-theme="light"] .markdown-content h1, [data-theme="light"] .markdown-content h2, [data-theme="light"] .markdown-content h3 { color: #1a1a2e; }
        [data-theme="light"] .markdown-content code { background: #f0f0f5; color: #e11d48; }
        [data-theme="light"] .markdown-content pre { background: #1a1a2e; color: #e0e0e0; }
        [data-theme="light"] .empty-state { color: #666; }
        [data-theme="light"] .hero-title { color: #1a1a2e; }
        [data-theme="light"] .hero-subtitle { color: #666; }
        [data-theme="light"] .usage-bar { background: #e0e0e0; }
        [data-theme="light"] .powered-footer { color: #999; }
        [data-theme="light"] .auth-error { background: rgba(239,68,68,0.1); }
        [data-theme="light"] .auth-input { background: #f0f0f5; color: #1a1a2e; border-color: #d0d0d8; }
        [data-theme="light"] .agent-info-banner { background: rgba(108,99,255,0.06); border-color: rgba(108,99,255,0.15); color: #333; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes toastSlideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes toastProgress { from { width: 100%; } to { width: 0%; } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        .slide-up { animation: slideUp 0.4s ease-out; }
        .scale-in { animation: scaleIn 0.2s ease-out; }
        .shimmer-dots span { background: linear-gradient(90deg, rgba(108,99,255,0.3), rgba(108,99,255,0.8), rgba(108,99,255,0.3)); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
        .tool-card, .agent-card, .stat-card, .gallery-card { transition: transform 0.2s, box-shadow 0.2s; }
        .tool-card:hover, .agent-card:hover, .gallery-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        @media (max-width: 768px) {
          .agent-selector-bar { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
          .agent-tab-name { display: none; }
          .industry-chips { max-height: 120px; overflow-y: auto; }
          .model-selector { flex-wrap: wrap; }
          .result-actions { flex-wrap: wrap; }
        }
        @media (max-width: 480px) {
          .hero-title { font-size: 1.3rem !important; }
          .stats-row { grid-template-columns: repeat(3, 1fr); gap: 8px; }
          .tool-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .agent-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
        }
        .toast-container { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 99999; animation: toastSlideDown 0.3s ease-out; }
        .toast-box { display: flex; align-items: center; gap: 10px; padding: 14px 24px; border-radius: 14px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 32px rgba(0,0,0,0.3); min-width: 280px; position: relative; overflow: hidden; }
        .toast-success { background: linear-gradient(135deg, #059669, #10b981); color: #fff; }
        .toast-info { background: linear-gradient(135deg, #2563eb, #3b82f6); color: #fff; }
        .toast-warning { background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; }
        .toast-error { background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; }
        .toast-progress { position: absolute; bottom: 0; left: 0; height: 3px; background: rgba(255,255,255,0.4); animation: toastProgress 3s linear forwards; }
        .search-input-field { width: 100%; padding: 10px 16px 10px 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); color: var(--text-primary, #fff); font-size: 14px; outline: none; }
        .search-input-field:focus { border-color: var(--primary, #6c63ff); }
        [data-theme="light"] .search-input-field { background: #f0f0f5; color: #1a1a2e; border-color: #d0d0d8; }
        .shortcuts-panel { position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--surface, #1a1a2e); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 16px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,0.4); min-width: 240px; animation: scaleIn 0.2s ease-out; }
        [data-theme="light"] .shortcuts-panel { background: #fff; border-color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
        .lang-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 6px 10px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
        .lang-btn:hover, .lang-btn.active { background: rgba(108,99,255,0.2); border-color: rgba(108,99,255,0.4); }
        [data-theme="light"] .lang-btn { background: #f0f0f5; border-color: #d0d0d8; }
        .offline-banner { background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; text-align: center; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 10px; margin-bottom: 12px; animation: fadeIn 0.3s ease-out; }
        .export-btn { padding: 4px 12px; font-size: 12px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .export-btn:hover { background: rgba(108,99,255,0.15); color: var(--primary, #6c63ff); }
        [data-theme="light"] .export-btn { background: #f0f0f5; color: #333; border-color: #d0d0d8; }
        .dashboard-bar { height: 24px; border-radius: 6px; background: linear-gradient(90deg, #6c63ff, #3b82f6); transition: width 0.5s ease; }
        .dashboard-card { background: linear-gradient(135deg, rgba(108,99,255,0.1), rgba(59,130,246,0.1)); border: 1px solid rgba(108,99,255,0.2); border-radius: 14px; padding: 16px; }
        [data-theme="light"] .dashboard-card { background: linear-gradient(135deg, rgba(108,99,255,0.06), rgba(59,130,246,0.06)); }
        .starter-chip { padding: 8px 14px; font-size: 13px; background: rgba(108,99,255,0.1); color: var(--primary, #6c63ff); border: 1px solid rgba(108,99,255,0.25); border-radius: 10px; cursor: pointer; transition: all 0.2s; }
        .starter-chip:hover { background: rgba(108,99,255,0.2); transform: translateY(-1px); }
        @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
        .mic-btn-listening { animation: micPulse 1.2s ease-in-out infinite; background: #ef4444 !important; border-color: #ef4444 !important; color: #fff !important; }
        .listening-indicator { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #ef4444; font-weight: 600; animation: pulse 1.5s ease-in-out infinite; }
        .mood-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .mood-chip { padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 20px; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: var(--text-primary, #ccc); transition: all 0.2s ease; white-space: nowrap; }
        .mood-chip:hover { background: rgba(108,99,255,0.12); border-color: rgba(108,99,255,0.3); transform: translateY(-1px); }
        .mood-chip.active { background: var(--primary, #6c63ff); color: #fff; border-color: var(--primary, #6c63ff); box-shadow: 0 0 12px rgba(108,99,255,0.35); }
        [data-theme="light"] .mood-chip { background: #f0f0f5; color: #333; border-color: #d0d0d8; }
        [data-theme="light"] .mood-chip.active { background: #6c63ff; color: #fff; border-color: #6c63ff; }
        .fact-check-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-right: 6px; }
        .badge-verified { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .badge-partial { background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.3); }
        .badge-unverified { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .idea-card { background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.15); border-radius: 14px; padding: 16px; margin-bottom: 10px; position: relative; }
        .idea-card h2 { font-size: 16px; margin: 0 0 8px 0; }
        .idea-card-copy { position: absolute; top: 10px; right: 10px; padding: 4px 10px; font-size: 11px; background: rgba(108,99,255,0.15); color: var(--primary, #6c63ff); border: 1px solid rgba(108,99,255,0.25); border-radius: 8px; cursor: pointer; }
        .idea-card-copy:hover { background: rgba(108,99,255,0.25); }
      `}</style>

      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div className="logo-section">
          <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI Logo" />
          <span className="logo-text">{isPersonalMode ? 'NovaMind Personal' : 'NovaMind AI'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['en', 'es', 'fr'] as const).map(lang => (
              <button key={lang} className={`lang-btn ${language === lang ? 'active' : ''}`}
                onClick={() => setLanguage(lang)} aria-label={`Switch to ${lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'French'}`}>
                {lang === 'en' ? '🇺🇸' : lang === 'es' ? '🇪🇸' : '🇫🇷'}
              </button>
            ))}
          </div>
          <button onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? T.lightMode : T.darkMode}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 12px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowShortcuts(!showShortcuts)} aria-label={T.shortcuts}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 12px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>
              ⌨️
            </button>
            {showShortcuts && (
              <div className="shortcuts-panel scale-in" role="tooltip">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>⌨️ {T.shortcuts}</div>
                {[
                  ['⌘/Ctrl + Enter', 'Generate'],
                  ['⌘/Ctrl + N', 'New Chat'],
                  ['⌘/Ctrl + K', 'Focus Search/Prompt'],
                  ['Escape', 'Close Menus'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-secondary, #999)' }}>{desc}</span>
                    <kbd style={{ background: 'rgba(108,99,255,0.15)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>{key}</kbd>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="nav-btn btn-outline" onClick={handleSignOut} role="button"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' }}>
            🚪 {T.signOut}
          </button>
        </div>
      </nav>

      <div className="main-content" role="main">
        {isOffline && (
          <div className="offline-banner" role="alert" aria-live="polite">
            📡 {T.offline}
          </div>
        )}

        {tab === 'home' && isPersonalMode && (
          <>
            <div className="hero-section" style={{ textAlign: 'center', padding: '20px 0' }}>
              <h1 className="hero-title" style={{ fontSize: '1.6rem' }}>Your AI Toolkit 🛠️</h1>
              <p className="hero-subtitle">12 tools designed for real life — not enterprise jargon.</p>
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-value">{usage.used}</div><div className="stat-label">{T.used}</div></div>
              <div className="stat-card"><div className="stat-value">{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</div><div className="stat-label">{T.limit}</div></div>
              <div className="stat-card"><div className="stat-value">{creations.length}</div><div className="stat-label">{T.created}</div></div>
            </div>
            {/* Feature 5: Personal Dashboard */}
            <div style={{ marginBottom: '24px' }}>
              <h3 className="section-title">{T.thisMonth}</h3>
              <div className="dashboard-card" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary, #6c63ff)' }}>{dashboardStats.total}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #999)' }}>{T.totalGenerations}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6' }}>{dashboardStats.textCount}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #999)' }}>{T.textGens}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#a855f7' }}>{dashboardStats.imageCount}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #999)' }}>{T.imageGens}</div>
                  </div>
                </div>
                {Object.entries(dashboardStats.byAgent).slice(0, 5).map(([agent, count]) => (
                  <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary, #999)', minWidth: '80px' }}>{agent}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div className="dashboard-bar" style={{ width: `${Math.min(100, (count as number / Math.max(1, dashboardStats.total)) * 100)}%` }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '24px', textAlign: 'right' }}>{count as number}</span>
                  </div>
                ))}
              </div>
              {dashboardStats.recent.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', color: 'var(--text-secondary, #999)', marginBottom: '8px' }}>{T.recentActivity}</h4>
                  {dashboardStats.recent.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' }}>
                      <span>{item.contentType === 'image' ? '🎨' : '📝'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(item.prompt || '').substring(0, 50)}</span>
                      <span style={{ color: 'var(--text-secondary, #999)', fontSize: '11px' }}>{item.model}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {Object.entries(PILLAR_INFO).map(([key, pillar]) => (
              <div key={key} style={{ marginBottom: '24px' }}>
                <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{pillar.icon}</span> {pillar.name}
                </h3>
                <div className="tool-grid">
                  {PERSONAL_TOOLS.filter(t => t.pillar === key).map(tool => (
                    <div key={tool.id} className="tool-card" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') (e.target as HTMLElement).click(); }} onClick={() => {
                      setAgentMode('general');
                      setModel('deepseek');
                      setContentType('text');
                      setPrompt(tool.prompt);
                      setResult(null);
                      switchTab('create');
                    }} style={{ borderTop: `3px solid ${pillar.color}` }}>
                      <div className="tool-icon">{tool.icon}</div>
                      <div className="tool-name">{tool.name}</div>
                      <div className="tool-desc">{tool.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="powered-footer">
              <span>A Product of The PIE Group</span> · <a href="mailto:admin@allexapiegroup.com">Contact</a>
            </div>
          </>
        )}
        
        {tab === 'home' && !isPersonalMode && (<>
          <div className="hero-section">
            <h1 className="hero-title">Create Amazing Content with AI</h1>
            <p className="hero-subtitle">Text, images, code and more — powered by premium AI at a fraction of the cost.</p>
            <button className="nav-btn btn-primary btn-lg" onClick={() => switchTab('create')}>{T.startCreating}</button>
          </div>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{usage.used}</div><div className="stat-label">{T.used}</div></div>
            <div className="stat-card"><div className="stat-value">{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</div><div className="stat-label">{T.limit}</div></div>
            <div className="stat-card"><div className="stat-value">{creations.length}</div><div className="stat-label">Created</div></div>
          </div>
          <div className="usage-bar-container">
            <div className="usage-label"><span>Monthly Usage</span><span>{usage.used}/{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</span></div>
            <div className="usage-bar"><div className={`usage-fill ${pct > 80 ? 'warning' : ''}`} style={{ width: `${pct}%` }} /></div>
          </div>
          
          <h3 className="section-title">AI Agents</h3>
          <div className="agent-grid">
            {AGENTS.map((agent) => (
              <div key={agent.id} className={`agent-card ${agentMode === agent.id ? 'active' : ''}`} onClick={() => selectAgent(agent.id)}>
                {agent.badge && <span className="agent-badge">{agent.badge}</span>}
                <div className="agent-icon">{agent.icon}</div>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-desc">{agent.desc}</div>
              </div>
            ))}
          </div>

          <h3 className="section-title">Quick Tools</h3>
          <div className="tool-grid">
            {[{ icon: '✍️', name: 'Write', desc: 'Articles & copy', type: 'text' },{ icon: '🎨', name: 'Image', desc: 'AI artwork', type: 'image' },{ icon: '💻', name: 'Code', desc: 'Write code', type: 'text' },{ icon: '📧', name: 'Email', desc: 'Pro emails', type: 'text' },{ icon: '📄', name: 'Summary', desc: 'Summarize', type: 'text' },{ icon: '💡', name: 'Ideas', desc: 'Brainstorm', type: 'text' }].map((t, i) => (
              <div key={i} className="tool-card" onClick={() => { setContentType(t.type); setModel(t.type === 'image' ? 'gpt-image-1' : 'deepseek'); setAgentMode('general'); switchTab('create'); }}>
                <div className="tool-icon">{t.icon}</div><div className="tool-name">{t.name}</div><div className="tool-desc">{t.desc}</div>
              </div>
            ))}
          </div>
          <div className="powered-footer">
            <span>A Product of The PIE Group</span> · <a href="mailto:admin@allexapiegroup.com">Contact</a>
          </div>
        </>)}
        
        {tab === 'create' && (
          <div className="create-area">
            {!isPersonalMode && (<div className="agent-selector-bar">
              {AGENTS.map(agent => (
                <button key={agent.id} className={`agent-tab ${agentMode === agent.id ? 'active' : ''}`} onClick={() => { setAgentMode(agent.id); setPrompt(''); setResult(null); if (agent.id === 'logo-maker') { setModel('gpt-image-1'); setContentType('image'); } else if (model === 'gpt-image-1') { setModel('deepseek'); setContentType('text'); } if (agent.id !== 'email-assistant') { setEmailMode('compose'); setEmailTone('Formal'); } if (agent.id === 'fact-checker' || agent.id === 'idea-spark') { setModel('deepseek'); setContentType('text'); } }}>
                  <span className="agent-tab-icon">{agent.icon}</span>
                  <span className="agent-tab-name">{agent.name}</span>
                  {agent.badge && <span className="agent-tab-badge">{agent.badge}</span>}
                </button>
              ))}
            </div>)}

            {/* Chat title and new chat button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                {chatTitle ? `💬 ${chatTitle}` : `${currentAgent?.icon || '✨'} ${currentAgent?.name || 'Create Something Amazing'}`}
              </h3>
              <button onClick={startNewChat} style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)', color: 'var(--primary, #6c63ff)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ➕ New Chat
              </button>
            </div>
            
            {agentMode === 'competitor-analysis' && (
              <div className="agent-info-banner">
                <strong>🔍 Competitor Analysis Agent</strong>
                <p>Enter a competitor name, website, or describe your market — get a full SWOT analysis, market gaps, and ready-to-use positioning copy.</p>
              </div>
            )}
            {agentMode === 'ad-maker' && (
              <div className="agent-info-banner">
                <strong>📢 Ad Maker Agent</strong>
                <p>Describe your product and target platform — get headlines, body copy, CTAs, hashtags, and A/B testing tips.</p>
              </div>
            )}
            {agentMode === 'email-assistant' && (
              <>
                {/* Email Mode Selector */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {EMAIL_MODES.map(em => (
                    <button key={em.id} onClick={() => setEmailMode(em.id)}
                      style={{
                        padding: '10px 6px', borderRadius: '10px', border: emailMode === em.id ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.1)',
                        background: emailMode === em.id ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary, #fff)',
                        cursor: 'pointer', textAlign: 'center', fontSize: '12px', transition: 'all 0.2s'
                      }}>
                      <div style={{ fontSize: '18px', marginBottom: '2px' }}>{em.icon}</div>
                      <div style={{ fontWeight: emailMode === em.id ? 700 : 500 }}>{em.label}</div>
                    </button>
                  ))}
                </div>
                {/* Tone Selector */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block', fontWeight: 600 }}>Tone</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {EMAIL_TONES.map(tone => (
                      <button key={tone} onClick={() => setEmailTone(tone)}
                        className={`industry-chip ${emailTone === tone ? 'active' : ''}`}
                        style={{ fontSize: '12px', padding: '6px 12px' }}>
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="agent-info-banner">
                  <strong>{getEmailBannerText().title}</strong>
                  <p>{getEmailBannerText().desc}</p>
                </div>
              </>
            )}
            {agentMode === 'logo-maker' && (
              <div className="agent-info-banner">
                <strong>🎨 Logo Maker Agent</strong>
                <p>Describe your brand — get logo concepts with color palettes, typography, and usage guidelines. Switch to GPT Image for AI-generated visuals.</p>
              </div>
            )}
            {agentMode === 'fact-checker' && (
              <div className="agent-info-banner">
                <strong>🔍 Fact-Check & Verify</strong>
                <p>Paste any claim, article, or statement — get a detailed fact-check with accuracy ratings, plagiarism indicators, and source credibility assessment.</p>
              </div>
            )}
            {agentMode === 'idea-spark' && (
              <div className="agent-info-banner">
                <strong>💡 Idea Spark</strong>
                <p>Enter a keyword, topic, or challenge — get a creative burst with headlines, content angles, metaphors, and unexpected cross-industry connections.</p>
              </div>
            )}

            {user && templates.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>⭐ My Templates</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {templates.map(tmpl => (
                    <div key={tmpl.id} onClick={() => loadTemplate(tmpl)} className="industry-chip" style={{ maxWidth: '220px', gap: '6px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tmpl.label}</span>
                      <span onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); }} style={{ opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}>×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isPersonalMode && (<div className="industry-selector">
              <label className="selector-label">Industry</label>
              <div className="industry-chips">
                {INDUSTRIES.map(ind => (
                  <button key={ind.id} className={`industry-chip ${industry === ind.id ? 'active' : ''}`} onClick={() => setIndustry(ind.id)}>
                    <span>{ind.icon}</span> {ind.name}
                  </button>
                ))}
              </div>
            </div>)}
            <div className="model-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary, #888)', fontWeight: 500 }}>🤖 AI Model (auto-selected):</span>
              {[{ id: 'deepseek', l: '⚡ DeepSeek' }, { id: 'gpt-image-1', l: '🎨 GPT Image' }, { id: 'gpt-4o', l: '✨ GPT-4o' }].map(m => (
                <button key={m.id} className={`model-chip ${model === m.id ? 'active' : ''}`} onClick={() => { setModel(m.id); setContentType(m.id === 'gpt-image-1' ? 'image' : 'text'); }}>{m.l}</button>
              ))}
            </div>

            {/* 🎚️ Mood Writer — Tone Selector */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary, #888)', fontWeight: 500 }}>🎚️ {T.moodWriter}:</span>
                {moodTone && <button onClick={() => setMoodTone('')} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Clear</button>}
              </div>
              <div className="mood-bar">
                {[
                  { id: 'friendly', label: '😊 Friendly' },
                  { id: 'professional', label: '💼 Professional' },
                  { id: 'humorous', label: '😂 Humorous' },
                  { id: 'urgent', label: '🔥 Urgent' },
                  { id: 'empathetic', label: '💖 Empathetic' },
                  { id: 'creative', label: '🎨 Creative' },
                  { id: 'concise', label: '⚡ Concise' },
                ].map(mood => (
                  <button key={mood.id} className={`mood-chip ${moodTone === mood.id ? 'active' : ''}`}
                    onClick={() => setMoodTone(prev => prev === mood.id ? '' : mood.id)}>
                    {mood.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 🎨 Image Studio — Style & Size Presets */}
            {(model === 'gpt-image-1' || contentType === 'image') && (
              <div style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>🎨</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>Image Studio</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', marginLeft: 'auto' }}>Optional — enhance your prompt automatically</span>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #aaa)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Style</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { id: '', label: '🔘 Auto', desc: '' },
                      { id: 'professional', label: '💼 Professional', desc: 'Clean, corporate, polished' },
                      { id: 'minimalist', label: '⬜ Minimalist', desc: 'Simple, modern, clean lines' },
                      { id: 'luxury', label: '👑 Luxury', desc: 'Gold accents, premium, elegant' },
                      { id: 'playful', label: '🎉 Playful', desc: 'Bright colors, fun, energetic' },
                      { id: 'vintage', label: '📷 Vintage', desc: 'Retro, warm tones, nostalgic' },
                      { id: 'neon', label: '💜 Neon', desc: 'Vibrant, glowing, futuristic' },
                      { id: 'watercolor', label: '🎨 Watercolor', desc: 'Soft, artistic, painterly' },
                      { id: 'flat', label: '📐 Flat Design', desc: 'Bold shapes, solid colors' },
                      { id: '3d', label: '🧊 3D Render', desc: 'Realistic 3D, depth, shadows' },
                    ].map(s => (
                      <button key={s.id} onClick={() => setImageStyle(s.id)}
                        title={s.desc}
                        style={{
                          padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '20px', cursor: 'pointer',
                          background: imageStyle === s.id ? 'var(--primary, #6c63ff)' : 'rgba(255,255,255,0.06)',
                          color: imageStyle === s.id ? '#fff' : 'var(--text-primary, #ccc)',
                          border: imageStyle === s.id ? '1px solid var(--primary, #6c63ff)' : '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.2s ease'
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #aaa)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Size / Format</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { id: '', label: '🔘 Auto', dim: '' },
                      { id: '1024x1024', label: '📱 Instagram Post', dim: '1:1 Square' },
                      { id: '1792x1024', label: '🖥️ Website Banner', dim: '16:9 Landscape' },
                      { id: '1024x1792', label: '📲 Story / Reel', dim: '9:16 Portrait' },
                      { id: '1792x1024', label: '📘 Facebook Cover', dim: 'Landscape' },
                      { id: '1024x1024', label: '🎴 Logo / Icon', dim: '1:1 Square' },
                      { id: '1792x1024', label: '📊 Presentation', dim: '16:9 Landscape' },
                      { id: '1024x1792', label: '📄 Flyer / Poster', dim: 'Portrait' },
                    ].map((s, i) => (
                      <button key={`${s.id}-${i}`} onClick={() => setImageSize(s.id)}
                        style={{
                          padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '20px', cursor: 'pointer',
                          background: imageSize === s.id ? 'var(--primary, #6c63ff)' : 'rgba(255,255,255,0.06)',
                          color: imageSize === s.id ? '#fff' : 'var(--text-primary, #ccc)',
                          border: imageSize === s.id ? '1px solid var(--primary, #6c63ff)' : '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.2s ease'
                        }}>
                        {s.label} {s.dim && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '4px' }}>({s.dim})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chat Messages Thread */}
            {chatMessages.length > 0 && (
              <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #999)', fontWeight: 600 }}>
                  💬 {chatTitle || 'Conversation'} · {chatMessages.filter(m => m.role === 'user').length} messages
                </div>
                <button onClick={() => { startNewChat(); }} style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)', color: 'var(--primary, #6c63ff)', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  ➕ New Chat
                </button>
              </div>
              <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '12px', scrollBehavior: 'smooth' as const }}>
                {chatMessages.map((msg, idx) => {
                  const isLastAssistant = msg.role === 'assistant' && idx === chatMessages.length - 1;
                  const endsWithQuestion = msg.role === 'assistant' && /\?\s*$/.test(msg.content.trim());
                  return (
                  <div key={idx} className="fade-in" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: '14px'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                      {msg.role === 'user' ? '👤 You' : '✨ NovaMind'}
                    </div>
                    <div style={{
                      maxWidth: '95%',
                      width: msg.role === 'assistant' ? '100%' : 'auto',
                      padding: msg.role === 'assistant' ? '16px 18px' : '10px 16px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' ? 'var(--primary, #6c63ff)' : msg.isError ? 'rgba(255,80,80,0.1)' : (endsWithQuestion && isLastAssistant) ? 'rgba(108,99,255,0.12)' : 'rgba(255,255,255,0.06)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #fff)',
                      fontSize: msg.role === 'assistant' ? '15px' : '14px',
                      lineHeight: '1.6',
                      wordBreak: 'break-word' as const,
                      border: msg.isError ? '1px solid rgba(255,80,80,0.3)' : (endsWithQuestion && isLastAssistant) ? '1px solid rgba(108,99,255,0.3)' : msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    }}>
                      {msg.imageUrl ? (
                        <div>
                          <img src={msg.imageUrl} alt="Generated" style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', marginBottom: '8px' }} />
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>{msg.content}</p>
                        </div>
                      ) : msg.role === 'assistant' ? (
                        <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', position: 'relative' }}>
                        {msg.isError ? (<>
                          <button onClick={() => { setChatMessages(prev => prev.filter((_, i) => i !== idx)); setPrompt(chatMessages.filter(m => m.role === 'user').pop()?.content || ''); }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>🔄 Try Again</button>
                          <button onClick={() => { setResult(null); setPrompt(''); setChatMessages([]); setCurrentChatId(null); setChatTitle(''); }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'transparent', color: 'var(--text-primary)', border: '2px solid var(--border-color, #333)', borderRadius: '10px', cursor: 'pointer' }}>← Start Over</button>
                        </>) : (<>
                        <button onClick={() => { navigator.clipboard.writeText(msg.imageUrl || msg.content); showToast('Copied! 📋'); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}>📋 {T.copy}</button>
                        {!msg.imageUrl && <button className="export-btn" onClick={() => exportToPDF(msg.content)} aria-label={T.exportPDF}>📄 {T.exportPDF}</button>}
                        {!msg.imageUrl && <button className="export-btn" onClick={() => exportToWord(msg.content)} aria-label={T.exportWord}>📝 {T.exportWord}</button>}
                        <button onClick={() => setShowShareMenu(showShareMenu === `chat-${idx}` ? null : `chat-${idx}`)} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🔗 Share</button>
                        {msg.imageUrl && <button onClick={() => handleShareDownload(msg.imageUrl!, `novamind-${Date.now()}.webp`)} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}>📥 Save</button>}
                        {msg.imageUrl && (
                          <>
                            <button onClick={() => { const originalPrompt = chatMessages.filter(m => m.role === 'user').pop()?.content || ''; setPrompt(`Create 3 different variations of: ${originalPrompt}`); setModel('gpt-image-1'); setContentType('image'); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🎲 Variations</button>
                            <button onClick={() => { const originalPrompt = chatMessages.filter(m => m.role === 'user').pop()?.content || ''; setPrompt(`Refine this image: ${originalPrompt}. Make it `); setModel('gpt-image-1'); setContentType('image'); setTimeout(() => { const ta = document.querySelector('.prompt-input') as HTMLTextAreaElement; if(ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 100); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', cursor: 'pointer' }}>✏️ Refine</button>
                          </>
                        )}
                        <button onClick={() => publishToCommunity(chatMessages.find(m => m.role === 'user')?.content || '', msg.content, msg.imageUrl)} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,165,0,0.15)', color: '#ffa500', border: '1px solid rgba(255,165,0,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🌟 Publish</button>
                        </>)}
                        {showShareMenu === `chat-${idx}` && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'var(--surface, #1a1a2e)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '8px', display: 'flex', gap: '6px', zIndex: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                            <button onClick={() => shareToSocial('twitter', msg.content, msg.imageUrl)} style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(29,161,242,0.15)', color: '#1da1f2', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>𝕏</button>
                            <button onClick={() => shareToSocial('facebook', msg.content, msg.imageUrl)} style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(66,103,178,0.15)', color: '#4267b2', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>fb</button>
                            <button onClick={() => shareToSocial('linkedin', msg.content, msg.imageUrl)} style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(0,119,181,0.15)', color: '#0077b5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>in</button>
                            <button onClick={() => shareToSocial('whatsapp', msg.content, msg.imageUrl)} style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(37,211,102,0.15)', color: '#25d366', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>wa</button>
                            <button onClick={() => handleCopyShareLink(msg.content)} style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>🔗</button>
                          </div>
                        )}
                      </div>
                    )}
                    {endsWithQuestion && isLastAssistant && (
                      <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--primary, #6c63ff)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>💬</span> Type your reply below...
                      </div>
                    )}
                  </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              </>
            )}

            <div style={{ position: 'relative' }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = '#6c63ff'; }}
              onDragLeave={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = ''; }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = ''; handleFileSelect(e.dataTransfer.files); }}>
              {isListening && (
                <div className="listening-indicator" style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🔴</span> {T.listening}
                  <button onClick={toggleVoiceRecognition} style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '12px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>⏹ Stop</button>
                </div>
              )}
              <textarea className="prompt-input" style={{ paddingRight: '120px', ...(chatMessages.length > 0 ? { borderColor: 'rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.05)' } : {}), ...(isListening ? { borderColor: '#ef4444', background: 'rgba(239,68,68,0.05)' } : {}) }} placeholder={
                chatMessages.length > 0 ? 'Type your reply here...' :
                agentMode === 'competitor-analysis' ? 'Enter a competitor name or describe your market (e.g., "Analyze Mailchimp for a small email marketing startup")...' :
                agentMode === 'ad-maker' ? 'Describe your product/service and target platform (e.g., "Facebook ad for my yoga studio grand opening")...' :
                agentMode === 'email-assistant' ? getEmailPlaceholder() :
                agentMode === 'logo-maker' ? 'Describe the logo you want (e.g., "Modern minimalist logo for a tech startup called NexGen")...' :
                agentMode === 'fact-checker' ? 'Paste a claim, article, or statement to verify...' :
                agentMode === 'idea-spark' ? 'Enter a keyword, topic, or challenge...' :
                contentType === 'image' ? 'Describe the image...' : T.tapToDictate
              } value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && prompt.trim() && !generating) { e.preventDefault(); handleGenerate(); }}} />
              {/* File attachment preview */}
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {attachedFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '10px', padding: '6px 12px', fontSize: '13px' }}>
                      {f.preview ? (
                        <img src={f.preview} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
                      ) : (
                        <span>📄</span>
                      )}
                      <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }} multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.md" style={{ display: 'none' }} />
              <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button onClick={() => fileInputRef.current?.click()} title="Attach file" aria-label="Attach file" style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.25)', color: '#6c63ff', fontSize: '16px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📎</button>
                {prompt && (
                  <button onClick={() => setPrompt('')} title="Clear" aria-label="Clear prompt" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
                <button onClick={toggleVoiceRecognition}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                  aria-label={isListening ? 'Stop listening' : 'Voice input'}
                  className={isListening ? 'mic-btn-listening' : ''}
                  style={{ background: isListening ? '#ef4444' : 'rgba(108,99,255,0.2)', border: `1px solid ${isListening ? '#ef4444' : 'rgba(108,99,255,0.3)'}`, color: isListening ? '#fff' : '#6c63ff', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎤</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="generate-btn" style={{ flex: 1 }} onClick={handleGenerate} disabled={generating || isOffline || (!prompt.trim() && pendingFiles.length === 0)}>
                {generating ? '⏳ Thinking...' : chatMessages.length > 0 ? '💬 Reply' : agentMode === 'competitor-analysis' ? '🔍 Analyze Competitor' : agentMode === 'ad-maker' ? '📢 Create Ad' : agentMode === 'email-assistant' ? getEmailButtonText() : agentMode === 'logo-maker' ? '🎨 Design Logo' : agentMode === 'fact-checker' ? '🔍 Fact-Check' : agentMode === 'idea-spark' ? '💡 Spark Ideas' : '✨ Generate'}
              </button>
              {user && prompt.trim() && !generating && (
                <button className="generate-btn" onClick={saveTemplate} disabled={savingTemplate}
                  style={{ flex: 'none', width: 'auto', padding: '0 16px', background: 'transparent', border: '2px solid var(--primary, #6c63ff)', color: 'var(--primary, #6c63ff)' }}
                  title="Save as template">
                  {savingTemplate ? '...' : '⭐ Save'}
                </button>
              )}
            </div>
            {routeNotification && (
              <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 20px', borderRadius: '12px', margin: '12px 0', textAlign: 'center', fontSize: '15px', fontWeight: '600', boxShadow: '0 4px 15px rgba(102,126,234,0.3)' }}>
                {routeNotification}
              </div>
            )}
            {generating && (
              <div className="generating-animation" aria-live="polite">
                <div className="typing-dots shimmer-dots"><span></span><span></span><span></span></div>
                <p>{agentMode === 'competitor-analysis' ? 'Analyzing competitive landscape...' : agentMode === 'ad-maker' ? 'Crafting your ad copy...' : agentMode === 'email-assistant' ? 'Writing your email...' : agentMode === 'fact-checker' ? 'Verifying claims & checking facts...' : agentMode === 'idea-spark' ? 'Generating creative inspiration...' : 'AI is crafting your content...'}</p>
              </div>
            )}
            {result && !result.error && (result.imageUrl || chatMessages.length === 0) && (
              <div className="result-container slide-up">
                <div className="result-actions" style={{ position: 'relative' }}>
                  {!result.imageUrl && <button className="action-btn" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 ' + T.copy}</button>}
                  {!result.imageUrl && <button className="export-btn" onClick={() => exportToPDF(result.content || result.text || '')} aria-label={T.exportPDF}>📄 {T.exportPDF}</button>}
                  {!result.imageUrl && <button className="export-btn" onClick={() => exportToWord(result.content || result.text || '')} aria-label={T.exportWord}>📝 {T.exportWord}</button>}
                  {result.imageUrl && <button className="action-btn" onClick={handleDownload}>⬇️ Download</button>}
                  <button className="action-btn" onClick={handleRegenerate}>🔄 Regenerate</button>
                  {result.imageUrl && (
                    <>
                      <button className="action-btn" onClick={() => { setPrompt(`Create 3 different variations of this concept: ${lastPrompt}`); setModel('gpt-image-1'); setContentType('image'); }} style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>🎲 Variations</button>
                      <button className="action-btn" onClick={() => { setPrompt(`Refine this image: ${lastPrompt}. Make it `); setModel('gpt-image-1'); setContentType('image'); setTimeout(() => { const ta = document.querySelector('.prompt-input') as HTMLTextAreaElement; if(ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 100); }} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>✏️ Refine</button>
                    </>
                  )}
                  <button className="action-btn" onClick={() => setShowShareMenu(showShareMenu === 'result' ? null : 'result')} style={{ background: 'rgba(108,99,255,0.2)', color: 'var(--primary, #6c63ff)' }}>🔗 Share</button>
                  <button className="action-btn" onClick={() => publishToCommunity(lastPrompt, result.content || result.text || '', result.imageUrl)} style={{ background: 'rgba(255,165,0,0.15)', color: '#ffa500' }}>🌟 Publish to Community</button>
                  {showShareMenu === 'result' && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--surface, #1a1a2e)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '10px', display: 'flex', gap: '8px', zIndex: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                      <button onClick={() => shareToSocial('twitter', result.content || result.text || '', result.imageUrl)} style={{ padding: '10px 14px', fontSize: '14px', background: 'rgba(29,161,242,0.15)', color: '#1da1f2', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>𝕏 Tweet</button>
                      <button onClick={() => shareToSocial('facebook', result.content || result.text || '', result.imageUrl)} style={{ padding: '10px 14px', fontSize: '14px', background: 'rgba(66,103,178,0.15)', color: '#4267b2', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>📘 Facebook</button>
                      <button onClick={() => shareToSocial('linkedin', result.content || result.text || '', result.imageUrl)} style={{ padding: '10px 14px', fontSize: '14px', background: 'rgba(0,119,181,0.15)', color: '#0077b5', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>💼 LinkedIn</button>
                      <button onClick={() => shareToSocial('whatsapp', result.content || result.text || '', result.imageUrl)} style={{ padding: '10px 14px', fontSize: '14px', background: 'rgba(37,211,102,0.15)', color: '#25d366', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>💬 WhatsApp</button>
                      <button onClick={() => handleCopyShareLink(result.content || result.text || '')} style={{ padding: '10px 14px', fontSize: '14px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>🔗 Copy Link</button>
                    </div>
                  )}
                </div>
                <div className="result-area">
                  {result.imageUrl ? <img className="result-image" src={result.imageUrl} alt="" /> : <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content || result.text || '') }} />}
                </div>
              </div>
            )}
            {result?.error && (
              <div className="result-area" style={{ textAlign: 'center' }}>
                <div className="error-text" style={{ marginBottom: '16px' }}>{result.error}</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="action-btn" onClick={() => { setResult(null); setPrompt(lastPrompt || ''); }} style={{ padding: '12px 24px', fontSize: '15px', fontWeight: 600, background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                    🔄 Try Again
                  </button>
                  <button className="action-btn" onClick={() => { setResult(null); setPrompt(''); setChatMessages([]); setCurrentChatId(null); setChatTitle(''); }} style={{ padding: '12px 24px', fontSize: '15px', fontWeight: 600, background: 'transparent', color: 'var(--text-primary)', border: '2px solid var(--border-color, #333)', borderRadius: '12px', cursor: 'pointer' }}>
                    ← Start Over
                  </button>
                </div>
              </div>
            )}
            {/* Feature 6: Personal Tool Starters */}
            {isPersonalMode && prompt && !generating && chatMessages.length === 0 && (() => {
              const matchedTool = PERSONAL_TOOLS.find(t => prompt.startsWith(t.prompt.substring(0, 20)));
              const toolId = matchedTool?.id;
              const starters = toolId ? PERSONAL_TOOL_STARTERS[toolId] : null;
              if (!starters) return null;
              return (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary, #999)', marginBottom: '8px' }}>💡 Try one of these:</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {starters.map((s, i) => (
                      <button key={i} className="starter-chip" onClick={() => setPrompt(s.text)}>
                        {s.icon} {s.text}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
                        {!result && !generating && !prompt && chatMessages.length === 0 && (
              <div className="prompt-suggestions">
                <p className="suggestions-label">Try one of these:</p>
                <div className="suggestions-grid">
                  {(AGENT_SUGGESTIONS[agentMode] || AGENT_SUGGESTIONS['general']).map((s, i) => (
                    <button key={i} className="suggestion-chip" role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") (e.target as HTMLElement).click(); }} onClick={() => { setPrompt(s.text); if (s.icon === '🎨' && agentMode === 'general') { setModel('gpt-image-1'); setContentType('image'); } }}>
                      <span>{s.icon}</span> {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {tab === 'gallery' && (<>
          <h3 className="section-title">{T.myCreations}</h3>
          {/* Feature 3: Search Gallery */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
            <input className="search-input-field" placeholder={T.searchHistory} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer' }} aria-label="Clear search">✕</button>}
          </div>
          {history.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(['all', 'favorites'] as const).map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)} className={`model-chip ${historyFilter === f ? 'active' : ''}`}>
                  {f === 'favorites' ? '⭐ Favorites' : 'All'}
                </button>
              ))}
            </div>
          )}
          {searchQuery && filteredHistory.length === 0 ? (
            <div className="empty-state"><p>{T.noResults}</p></div>
          ) : filteredHistory.length === 0 && creations.length === 0 ? (
            <div className="empty-state"><p>{historyFilter === 'favorites' ? 'No favorites yet — star items to save them here' : 'No creations yet'}</p></div>
          ) : (
            <div className="gallery-grid">
              {filteredHistory.map((h) => (
                <div key={h.id} className="gallery-card" role="button" tabIndex={0} style={{ cursor: 'pointer', position: 'relative' }}>
                  <div onClick={() => toggleFavorite(h.id)} style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2, cursor: 'pointer', fontSize: '20px', filter: h.isFavorite ? 'none' : 'grayscale(1) opacity(0.4)' }}>⭐</div>
                  <div onClick={() => loadHistoryPrompt(h)}>
                    {h.imageUrl && <img src={h.imageUrl} alt="" />}
                    <div className="gallery-card-body">
                      <div className="gallery-card-title">{h.prompt?.substring(0, 60)}</div>
                      {!h.imageUrl && h.resultPreview && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary, #999)', marginTop: '4px', lineHeight: 1.4, overflow: 'hidden', maxHeight: '3.6em' }}>{h.resultPreview.substring(0, 120)}</div>
                      )}
                      <div className="gallery-card-meta">{h.model} · {h.agentMode !== 'general' ? AGENTS.find(a => a.id === h.agentMode)?.name || h.agentMode : h.contentType}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', padding: '0 12px 12px', flexWrap: 'wrap' }}>
                    <button onClick={(e) => { e.stopPropagation(); setShowShareMenu(showShareMenu === `gal-${h.id}` ? null : `gal-${h.id}`); }} style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: '6px', cursor: 'pointer' }}>🔗 Share</button>
                    <button onClick={(e) => { e.stopPropagation(); publishToCommunity(h.prompt || '', h.resultPreview || '', h.imageUrl); }} style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(255,165,0,0.1)', color: '#ffa500', border: '1px solid rgba(255,165,0,0.2)', borderRadius: '6px', cursor: 'pointer' }}>🌟 Publish</button>
                    {showShareMenu === `gal-${h.id}` && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => shareToSocial('twitter', h.prompt || '')} style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(29,161,242,0.15)', color: '#1da1f2', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>𝕏</button>
                        <button onClick={() => shareToSocial('facebook', h.prompt || '')} style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(66,103,178,0.15)', color: '#4267b2', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>fb</button>
                        <button onClick={() => shareToSocial('linkedin', h.prompt || '')} style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(0,119,181,0.15)', color: '#0077b5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>in</button>
                        <button onClick={() => handleCopyShareLink(h.prompt || '')} style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🔗</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {historyFilter === 'all' && creations.filter(c => !history.some(h => h.prompt === c.prompt)).map((c, i) => (
                <div key={`l-${i}`} className="gallery-card">
                  {c.imageUrl && <img src={c.imageUrl as string} alt="" />}
                  <div className="gallery-card-body"><div className="gallery-card-title">{(c.prompt as string)?.substring(0, 60)}</div><div className="gallery-card-meta">{c.model as string}</div></div>
                </div>
              ))}
            </div>
          )}
        </>)}


                {/* Chats Tab */}
        {tab === 'chats' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 className="section-title" style={{ margin: 0 }}>💬 {T.myChats}</h3>
              <button onClick={() => { startNewChat(); setTab('create'); }}
                style={{ background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                ➕ {T.newChat}
              </button>
            </div>
            {/* Feature 3: Search Chats */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
              <input className="search-input-field" placeholder={T.searchChats} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer' }} aria-label="Clear search">✕</button>}
            </div>
            {/* Feature 13: Chat Tag Filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
              {CHAT_TAGS.map(tag => (
                <button key={tag.id} className={`model-chip ${chatTag === tag.id ? 'active' : ''}`}
                  onClick={() => setChatTag(tag.id)} role="button" tabIndex={0}>
                  {tag.icon} {tag.label}
                </button>
              ))}
            </div>
            {filteredChats.length === 0 ? (
              <div className="empty-state">
                <p>{searchQuery || chatTag ? T.noResults : T.noChats}</p>
                <button className="nav-btn btn-primary" onClick={() => { startNewChat(); setTab('create'); }}>Start Chatting</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredChats.map(chat => {
                  const agentInfo = AGENTS.find(a => a.id === chat.agentMode);
                  const lastMsg = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
                  const msgCount = chat.messages ? chat.messages.length : 0;
                  const userMsgCount = chat.messages ? chat.messages.filter((m: any) => m.role === 'user').length : 0;
                  return (
                    <div key={chat.id} style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)',
                      padding: '16px', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onClick={() => { loadChat(chat); setTab('create'); }}>
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '20px' }}>{agentInfo?.icon || '✨'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title || 'Untitled Chat'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary, #999)', marginTop: '2px' }}>
                              {agentInfo?.name || 'General'} · {userMsgCount} {userMsgCount === 1 ? 'message' : 'messages'} · {formatChatDate(chat.updatedAt)}
                              {chat.tag && <span onClick={e => { e.stopPropagation(); const tags: ChatTagLabel[] = ['Content', 'Email', 'Design', 'Research', 'Marketing', 'Ideas']; const idx = tags.indexOf(chat.tag || '' as ChatTagLabel); const nextTag = tags[(idx + 1) % tags.length]; updateDoc(doc(db, 'chats', chat.id), { tag: nextTag }).then(() => { setChats(prev => prev.map(c => c.id === chat.id ? { ...c, tag: nextTag } : c)); }); }} style={{ background: 'rgba(108,99,255,0.1)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }} role="button" tabIndex={0}>{chat.tag}</span>}
                            </div>
                          </div>
                        </div>
                        {lastMsg && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary, #999)', margin: 0, paddingLeft: '28px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', lineHeight: '1.4' }}>
                            {lastMsg.role === 'user' ? '👤 ' : '✨ '}{lastMsg.content.substring(0, 120)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', paddingLeft: '28px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { loadChat(chat); setTab('create'); }} style={{ background: 'var(--primary, #6c63ff)', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                          ▶ Continue
                        </button>
                        <button onClick={() => shareChat(chat.id)} style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                          🔗 Share
                        </button>
                        <button onClick={() => deleteChat(chat.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}


                {tab === 'community' && (<>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 className="section-title" style={{ margin: 0 }}>🌟 Community Gallery</h3>
            <button onClick={loadCommunityPosts} className="nav-btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              {communityLoading ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary, #999)', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
            Discover what others are creating with NovaMind AI. Like your favorites and share your own! 🎨
          </p>
          {communityPosts.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🌟</div>
              <h3 style={{ marginBottom: '8px' }}>The Gallery Awaits!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Be the first to publish a creation and inspire others.</p>
              <button className="nav-btn btn-primary" onClick={() => switchTab('create')}>✨ Start Creating</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {communityPosts.map(post => {
                const isLiked = user && (post.likedBy || []).includes(user.uid);
                return (
                  <div key={post.id} style={{ background: 'var(--surface, #1a1a2e)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(108,99,255,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                    {post.imageUrl && (
                      <img src={post.imageUrl} alt="" style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                    )}
                    <div style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                          {(post.displayName || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>{post.displayName || 'Anonymous'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #999)' }}>{post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}</div>
                        </div>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary, #ccc)', marginBottom: '8px', lineHeight: 1.5 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Prompt:</span> {post.prompt}
                      </p>
                      {!post.imageUrl && post.content && (
                        <div style={{ fontSize: '13px', color: 'var(--text-primary, #eee)', background: 'rgba(255,255,255,0.04)', padding: '10px', borderRadius: '8px', marginBottom: '8px', maxHeight: '100px', overflow: 'hidden', lineHeight: 1.5 }}>
                          {post.content.substring(0, 200)}{post.content.length > 200 ? '...' : ''}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                        <button onClick={() => handleLikePost(post.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', fontSize: '13px', background: isLiked ? 'rgba(255,75,75,0.15)' : 'rgba(255,255,255,0.06)', color: isLiked ? '#ff4b4b' : 'rgba(255,255,255,0.6)', border: isLiked ? '1px solid rgba(255,75,75,0.3)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>
                          {isLiked ? '❤️' : '🤍'} {post.likes || 0}
                        </button>
                        <button onClick={() => { shareToSocial('twitter', post.prompt || post.content, post.imageUrl); }} style={{ padding: '6px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', cursor: 'pointer' }}>
                          🔗 Share
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}
        {tab === 'crm' && (['solopreneur','team','business','business_pro'].includes(usage.plan) ? <div className="empty-state"><h3>📇 CRM</h3><p>Manage contacts, deals & pipeline — coming soon in this view!</p><p>Use the full CRM features in your dashboard.</p></div> : <div className="empty-state"><h3>CRM</h3><p>Manage contacts, deals & activities</p><p className="upgrade-hint">Available on Solopreneur Hub and above</p><button className="nav-btn btn-primary" onClick={() => window.open('https://novamindai.studio/#pricing','_blank')}>Upgrade Now</button></div>)}
        {tab === 'projects' && (['solopreneur','team','business','business_pro'].includes(usage.plan) ? <div className="empty-state"><h3>📋 Projects</h3><p>Track projects & tasks with AI — coming soon in this view!</p><p>Use the full project management features in your dashboard.</p></div> : <div className="empty-state"><h3>Projects</h3><p>Track projects & tasks with AI</p><p className="upgrade-hint">Available on Solopreneur Hub and above</p><button className="nav-btn btn-primary" onClick={() => window.open('https://novamindai.studio/#pricing','_blank')}>Upgrade Now</button></div>)}
      </div>
      {/* Feature 9: Enhanced Toast */}
      {toastVisible && (
        <div className="toast-container" aria-live="polite">
          <div className={`toast-box toast-${toastType}`}>
            <span>{toastType === 'success' ? '✅' : toastType === 'info' ? 'ℹ️' : toastType === 'warning' ? '⚠️' : '❌'}</span>
            <span>{toastMsg}</span>
            <div className="toast-progress" />
          </div>
        </div>
      )}
      <nav className="bottom-nav" role="navigation" aria-label="Bottom navigation">
        {(isPersonalMode 
            ? (['home','create','gallery','community','chats'] as Tab[])
            : (['home','create','chats','gallery','community','crm','projects'] as Tab[])
          ).map(id => (
          <button key={id} className={`bottom-nav-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="bottom-nav-icon">{{ home: '🏠', create: '✨', gallery: '🖼️', chats: '💬', community: '🌟', crm: '📇', projects: '📋' }[id]}</span>
            {{ home: T.home, create: T.create, gallery: T.gallery, chats: T.chats, community: T.community, crm: T.crm, projects: T.projects }[id]}
          </button>
        ))}
      </nav>

      {showOnboarding && user && (
        <div className="auth-overlay">
          <div className="auth-modal scale-in" style={{ maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
            {/* Progress bar */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {[0,1,2,3,4].map(s => (
                <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: s <= onboardingStep ? 'var(--primary, #6c63ff)' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
            
            {onboardingStep === 0 && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👋 Welcome to NovaMind AI!</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>Let's personalize your experience. This takes about 30 seconds.</p>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Your Name</label>
                <input className="auth-input" placeholder="Enter your name" value={onboardingData.displayName} onChange={e => setOnboardingData(prev => ({ ...prev, displayName: e.target.value }))} />
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Business Name <span style={{ opacity: 0.5 }}>(optional)</span></label>
                <input className="auth-input" placeholder="Your company or brand name" value={onboardingData.businessName} onChange={e => setOnboardingData(prev => ({ ...prev, businessName: e.target.value }))} />
              </>
            )}

            {onboardingStep === 1 && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏢 What's your industry?</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>We'll tailor AI responses to your field.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                  {INDUSTRIES.map(ind => (
                    <div key={ind.id} onClick={() => setOnboardingData(prev => ({ ...prev, industry: ind.id }))}
                      style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', fontSize: '13px', border: onboardingData.industry === ind.id ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.1)', background: onboardingData.industry === ind.id ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.03)', transition: 'all 0.2s' }}>
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{ind.icon}</div>
                      <div>{ind.name}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🎯 What will you use AI for?</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>Select all that apply — we'll highlight the right tools.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ONBOARDING_USES.map(u => (
                    <div key={u.id} onClick={() => setOnboardingData(prev => ({ ...prev, primaryUse: toggleOnboardingArray(prev.primaryUse, u.id) }))}
                      style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', border: onboardingData.primaryUse.includes(u.id) ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.1)', background: onboardingData.primaryUse.includes(u.id) ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.03)', transition: 'all 0.2s' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: onboardingData.primaryUse.includes(u.id) ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: onboardingData.primaryUse.includes(u.id) ? 'var(--primary, #6c63ff)' : 'transparent', flexShrink: 0 }}>{onboardingData.primaryUse.includes(u.id) ? '✓' : ''}</div>
                      <div><div style={{ fontWeight: 600, fontSize: '14px' }}>{u.label}</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{u.desc}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {onboardingStep === 3 && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🧠 Your AI experience?</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>We'll adjust tips and complexity accordingly.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {([
                    { id: 'beginner' as const, icon: '🌱', label: 'Beginner', desc: "I'm new to AI — guide me through everything" },
                    { id: 'intermediate' as const, icon: '🌿', label: 'Intermediate', desc: "I've used ChatGPT or similar tools before" },
                    { id: 'advanced' as const, icon: '🌳', label: 'Advanced', desc: "I use AI daily and know prompt engineering" }
                  ]).map(level => (
                    <div key={level.id} onClick={() => setOnboardingData(prev => ({ ...prev, experienceLevel: level.id }))}
                      style={{ padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', border: onboardingData.experienceLevel === level.id ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.1)', background: onboardingData.experienceLevel === level.id ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.03)', transition: 'all 0.2s' }}>
                      <div style={{ fontSize: '28px' }}>{level.icon}</div>
                      <div><div style={{ fontWeight: 600, fontSize: '15px' }}>{level.label}</div><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{level.desc}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {onboardingStep === 4 && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🚀 What are your goals?</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>Select what matters most — we'll customize your dashboard.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ONBOARDING_GOALS.map(g => (
                    <div key={g.id} onClick={() => setOnboardingData(prev => ({ ...prev, goals: toggleOnboardingArray(prev.goals, g.id) }))}
                      style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', border: onboardingData.goals.includes(g.id) ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.1)', background: onboardingData.goals.includes(g.id) ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.03)', transition: 'all 0.2s' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: onboardingData.goals.includes(g.id) ? '2px solid var(--primary, #6c63ff)' : '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: onboardingData.goals.includes(g.id) ? 'var(--primary, #6c63ff)' : 'transparent', flexShrink: 0 }}>{onboardingData.goals.includes(g.id) ? '✓' : ''}</div>
                      <div><div style={{ fontWeight: 600, fontSize: '14px' }}>{g.label}</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.desc}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {onboardingStep > 0 && (
                <button className="generate-btn" onClick={() => setOnboardingStep(prev => prev - 1)}
                  style={{ flex: 'none', width: 'auto', padding: '12px 20px', background: 'transparent', border: '2px solid rgba(255,255,255,0.15)', color: 'var(--text-primary, #fff)' }}>
                  ← Back
                </button>
              )}
              {onboardingStep < 4 ? (
                <button className="generate-btn" onClick={() => setOnboardingStep(prev => prev + 1)} style={{ flex: 1 }}>
                  {onboardingStep === 0 && !onboardingData.displayName.trim() ? 'Skip →' : 'Continue →'}
                </button>
              ) : (
                <button className="generate-btn" onClick={completeOnboarding} style={{ flex: 1 }}>
                  🚀 Let's Go!
                </button>
              )}
            </div>
            <p onClick={skipOnboarding} style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.6 }}>Skip setup for now</p>
          </div>
        </div>
      )}
      {showAuth && (
        <div className="auth-overlay" onClick={e => e.target === e.currentTarget && setShowAuth(false)}>
          <div className="auth-modal scale-in">
            <h2>{authMode === 'login' ? 'Welcome to NovaMind AI' : 'Create Your Account'}</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '8px 0 20px', fontSize: 14 }}>{authMode === 'login' ? 'Sign in to NovaMind AI' : 'Start creating with NovaMind AI'}</p>
            {authError && <div className="auth-error">{authError}</div>}
            <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="auth-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            {authMode === 'login' && (
              <p style={{ textAlign: 'right', margin: '-4px 0 0 0' }}>
                <span onClick={handleResetPassword} style={{ color: 'var(--accent, #a855f7)', fontSize: '13px', cursor: 'pointer' }}>Forgot Password?</span>
              </p>
            )}
            {resetSent && <p style={{ color: '#4ade80', fontSize: '13px', margin: 0, textAlign: 'center' }}>✅ Password reset email sent! Check your inbox.</p>}
            <button className="generate-btn" onClick={handleAuth}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary, #999)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <button className="generate-btn" onClick={handleGoogleSignIn} style={{ background: '#fff', color: '#333', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <p className="auth-toggle" style={{ fontSize: '15px' }}>{authMode === 'login' ? "Don't have an account? " : "Already have an account? "}<span onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setResetSent(false); }} style={{ fontWeight: 700, textDecoration: 'underline' }}>{authMode === 'login' ? 'Create One Free' : 'Sign In'}</span></p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
