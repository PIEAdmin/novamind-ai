import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase-config';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, limit as firestoreLimit, Timestamp } from 'firebase/firestore';
import { generateContent } from './api-service';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './styles.css';

type Tab = 'home' | 'create' | 'gallery' | 'chats' | 'crm' | 'projects';
type AgentMode = 'general' | 'competitor-analysis' | 'ad-maker' | 'logo-maker' | 'email-assistant';
type EmailMode = 'compose' | 'reply' | 'sequences' | 'polish';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
  'email-assistant': `You are a professional email writer. Write a polished email with Subject line, greeting, body, CTA, and sign-off. Include 2 alternative subject lines and a follow-up tip. Adapt tone to context.`
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

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    if (!user) { setShowAuth(true); return; }
    const currentPrompt = prompt;
    const currentContentType = contentType;
    const currentModel = model;
    const currentAgentMode = agentMode;
    const currentIndustry = industry;
    setLastPrompt(currentPrompt);
    setLastContentType(currentContentType);
    setLastModel(currentModel);
    setGenerating(true); setResult(null);

    // Add user message to chat
    const userMsg: ChatMessage = { role: 'user', content: currentPrompt, timestamp: Date.now() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setPrompt('');

    try {
      const industryObj = INDUSTRIES.find(i => i.id === currentIndustry);
      let systemPrefix = '';

      if (currentAgentMode === 'email-assistant') {
        systemPrefix = getEmailSystemPrompt();
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your email specifically for this industry.`;
        }
      } else if (currentAgentMode !== 'general') {
        systemPrefix = AGENT_SYSTEM_PROMPTS[currentAgentMode];
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your analysis specifically for this industry.`;
        }
      } else if (currentIndustry !== 'general' && currentContentType === 'text') {
        systemPrefix = `You are an expert AI assistant specializing in the ${industryObj?.name} industry. Tailor your response specifically for ${industryObj?.name} professionals.`;
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
      const res = await generateContent(currentPrompt, currentContentType, currentModel, systemPrefix || undefined);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {} }

      // Add assistant message to chat
      const assistantContent = res?.content || res?.text || '';
      const assistantMsg: ChatMessage = { role: 'assistant', content: assistantContent, timestamp: Date.now() };
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
      await saveHistoryItem(currentPrompt, currentContentType, currentModel, currentAgentMode, currentIndustry, res);
    } catch (e: unknown) { 
      const err = e as { message?: string }; 
      const errorMsg: ChatMessage = { role: 'assistant', content: `⚠️ **Something went wrong:** ${err.message || 'Unknown error'}\n\nTap "Try Again" or type a new message.`, timestamp: Date.now() };
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

  const handleRegenerate = async () => {
    if (!lastPrompt || generating) return;
    setGenerating(true); setResult(null);
    try {
      const res = await generateContent(lastPrompt, lastContentType, lastModel, lastSystemPrompt || undefined);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
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

  const switchTab = (t: Tab) => setTab(t);
  if (loading) return null;

  // AUTH GATE: Require login before accessing any part of the app
  if (!user) {
    return (
      <div className="app-container">
        <nav className="navbar">
          <div className="logo-section">
            <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI" />
            <span className="logo-text">{isPersonalMode ? 'NovaMind Personal' : 'NovaMind AI'}</span>
          </div>
        </nav>
        <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <div className="auth-modal" style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <img src="/icon-192.png" alt="NovaMind AI" style={{ width: '64px', height: '64px', marginBottom: '16px' }} />
              <h2 style={{ margin: '0 0 8px' }}>{authMode === 'login' ? 'Welcome to NovaMind AI' : 'Create Your Account'}</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>
                {authMode === 'login'
                  ? (isPersonalMode ? 'Sign in or create an account to get started' : 'Sign in or create an account to get started')
                  : (isPersonalMode ? 'Join NovaMind Personal — AI for everyday life' : 'Start creating with NovaMind AI')}
              </p>
            </div>
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
            <div style={{ textAlign: 'center', margin: '16px 0 0' }}>
              {authMode === 'login' ? (
                <button onClick={() => { setAuthMode('signup'); setResetSent(false); setAuthError(''); }} style={{ background: 'transparent', border: '2px solid var(--primary, #6c63ff)', color: 'var(--primary, #6c63ff)', padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                  New here? Create a Free Account
                </button>
              ) : (
                <button onClick={() => { setAuthMode('login'); setResetSent(false); setAuthError(''); }} style={{ background: 'transparent', border: '2px solid var(--primary, #6c63ff)', color: 'var(--primary, #6c63ff)', padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                  Already have an account? Sign In
                </button>
              )}
            </div>
            <div className="powered-footer" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span>A Product of The PIE Group</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.min((usage.used / usage.limit) * 100, 100);
  const currentAgent = AGENTS.find(a => a.id === agentMode);
  const filteredHistory = historyFilter === 'favorites' ? history.filter(h => h.isFavorite) : history;

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

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo-section">
          <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI" />
          <span className="logo-text">{isPersonalMode ? 'NovaMind Personal' : 'NovaMind AI'}</span>
        </div>
        <button className="nav-btn btn-outline" onClick={() => signOut(auth)}>Sign Out</button>
      </nav>
      <div className="main-content">
        {tab === 'home' && isPersonalMode && (
          <>
            <div className="hero-section" style={{ textAlign: 'center', padding: '20px 0' }}>
              <h1 className="hero-title" style={{ fontSize: '1.6rem' }}>Your AI Toolkit 🛠️</h1>
              <p className="hero-subtitle">12 tools designed for real life — not enterprise jargon.</p>
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-value">{usage.used}</div><div className="stat-label">Used</div></div>
              <div className="stat-card"><div className="stat-value">{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</div><div className="stat-label">Limit</div></div>
              <div className="stat-card"><div className="stat-value">{creations.length}</div><div className="stat-label">Created</div></div>
            </div>
            {Object.entries(PILLAR_INFO).map(([key, pillar]) => (
              <div key={key} style={{ marginBottom: '24px' }}>
                <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{pillar.icon}</span> {pillar.name}
                </h3>
                <div className="tool-grid">
                  {PERSONAL_TOOLS.filter(t => t.pillar === key).map(tool => (
                    <div key={tool.id} className="tool-card" onClick={() => {
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
            <button className="nav-btn btn-primary btn-lg" onClick={() => switchTab('create')}>Start Creating</button>
          </div>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{usage.used}</div><div className="stat-label">Used</div></div>
            <div className="stat-card"><div className="stat-value">{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</div><div className="stat-label">Limit</div></div>
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
                <button key={agent.id} className={`agent-tab ${agentMode === agent.id ? 'active' : ''}`} onClick={() => { setAgentMode(agent.id); setPrompt(''); setResult(null); if (agent.id === 'logo-maker') { setModel('gpt-image-1'); setContentType('image'); } else if (model === 'gpt-image-1') { setModel('deepseek'); setContentType('text'); } if (agent.id !== 'email-assistant') { setEmailMode('compose'); setEmailTone('Formal'); } }}>
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
            <div className="model-selector">
              {[{ id: 'deepseek', l: 'DeepSeek' }, { id: 'gpt-image-1', l: 'GPT Image' }, { id: 'gpt-4o', l: 'GPT-4o' }].map(m => (
                <button key={m.id} className={`model-chip ${model === m.id ? 'active' : ''}`} onClick={() => { setModel(m.id); setContentType(m.id === 'gpt-image-1' ? 'image' : 'text'); }}>{m.l}</button>
              ))}
            </div>

            {/* Chat Messages Thread */}
            {chatMessages.length > 0 && (
              <div style={{ marginBottom: '16px', overflowY: 'auto', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} style={{
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
                      background: msg.role === 'user' ? 'var(--primary, #6c63ff)' : 'rgba(255,255,255,0.06)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #fff)',
                      fontSize: msg.role === 'assistant' ? '15px' : '14px',
                      lineHeight: '1.6',
                      wordBreak: 'break-word' as const,
                      border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    }}>
                      {msg.role === 'assistant' ? (
                        <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <button onClick={() => { navigator.clipboard.writeText(msg.content); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}>📋 Copy</button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <textarea className="prompt-input" style={{ paddingRight: '80px' }} placeholder={
                agentMode === 'competitor-analysis' ? 'Enter a competitor name or describe your market (e.g., "Analyze Mailchimp for a small email marketing startup")...' :
                agentMode === 'ad-maker' ? 'Describe your product/service and target platform (e.g., "Facebook ad for my yoga studio grand opening")...' :
                agentMode === 'email-assistant' ? getEmailPlaceholder() :
                agentMode === 'logo-maker' ? 'Describe the logo you want (e.g., "Modern minimalist logo for a tech startup called NexGen")...' :
                contentType === 'image' ? 'Describe the image...' : 'What to create?'
              } value={prompt} onChange={e => setPrompt(e.target.value)} />
              <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                {prompt && (
                  <button onClick={() => setPrompt('')} title="Clear" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
                <button onClick={() => {
                  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  if (!SR) { alert('Speech recognition is not supported in this browser. Try Chrome or Safari.'); return; }
                  const recognition = new SR();
                  recognition.lang = 'en-US';
                  recognition.interimResults = false;
                  recognition.maxAlternatives = 1;
                  recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript;
                    setPrompt(prev => prev ? prev + ' ' + transcript : transcript);
                  };
                  recognition.onerror = (event: any) => {
                    if (event.error === 'not-allowed') alert('Microphone access denied. Please allow microphone permissions.');
                  };
                  recognition.start();
                }} title="Voice input" style={{ background: 'rgba(108,99,255,0.2)', border: '1px solid rgba(108,99,255,0.3)', color: '#6c63ff', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎤</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="generate-btn" style={{ flex: 1 }} onClick={handleGenerate} disabled={generating || !prompt.trim()}>
                {generating ? 'Analyzing...' : agentMode === 'competitor-analysis' ? '🔍 Analyze Competitor' : agentMode === 'ad-maker' ? '📢 Create Ad' : agentMode === 'email-assistant' ? getEmailButtonText() : agentMode === 'logo-maker' ? '🎨 Design Logo' : chatMessages.length > 0 ? '💬 Send' : 'Generate'}
              </button>
              {user && prompt.trim() && !generating && (
                <button className="generate-btn" onClick={saveTemplate} disabled={savingTemplate}
                  style={{ flex: 'none', width: 'auto', padding: '0 16px', background: 'transparent', border: '2px solid var(--primary, #6c63ff)', color: 'var(--primary, #6c63ff)' }}
                  title="Save as template">
                  {savingTemplate ? '...' : '⭐ Save'}
                </button>
              )}
            </div>
            {generating && (
              <div className="generating-animation">
                <div className="typing-dots"><span></span><span></span><span></span></div>
                <p>{agentMode === 'competitor-analysis' ? 'Analyzing competitive landscape...' : agentMode === 'ad-maker' ? 'Crafting your ad copy...' : agentMode === 'email-assistant' ? 'Writing your email...' : 'AI is crafting your content...'}</p>
              </div>
            )}
            {result && !result.error && (result.imageUrl || chatMessages.length === 0) && (
              <div className="result-container">
                <div className="result-actions">
                  {!result.imageUrl && <button className="action-btn" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 Copy'}</button>}
                  {result.imageUrl && <button className="action-btn" onClick={handleDownload}>⬇️ Download</button>}
                  <button className="action-btn" onClick={handleRegenerate}>🔄 Regenerate</button>
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
            {!result && !generating && !prompt && chatMessages.length === 0 && (
              <div className="prompt-suggestions">
                <p className="suggestions-label">Try one of these:</p>
                <div className="suggestions-grid">
                  {(AGENT_SUGGESTIONS[agentMode] || AGENT_SUGGESTIONS['general']).map((s, i) => (
                    <button key={i} className="suggestion-chip" onClick={() => { setPrompt(s.text); if (s.icon === '🎨' && agentMode === 'general') { setModel('gpt-image-1'); setContentType('image'); } }}>
                      <span>{s.icon}</span> {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'gallery' && (<>
          <h3 className="section-title">My Creations</h3>
          {history.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(['all', 'favorites'] as const).map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)} className={`model-chip ${historyFilter === f ? 'active' : ''}`}>
                  {f === 'favorites' ? '⭐ Favorites' : 'All'}
                </button>
              ))}
            </div>
          )}
          {filteredHistory.length === 0 && creations.length === 0 ? (
            <div className="empty-state"><p>{historyFilter === 'favorites' ? 'No favorites yet — star items to save them here' : 'No creations yet'}</p></div>
          ) : (
            <div className="gallery-grid">
              {filteredHistory.map((h) => (
                <div key={h.id} className="gallery-card" style={{ cursor: 'pointer', position: 'relative' }}>
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
              <h3 className="section-title" style={{ margin: 0 }}>💬 My Chats</h3>
              <button onClick={() => { startNewChat(); setTab('create'); }}
                style={{ background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                ➕ New Chat
              </button>
            </div>
            {chats.length === 0 ? (
              <div className="empty-state">
                <p>No chats yet. Start a conversation to see it here!</p>
                <button className="nav-btn btn-primary" onClick={() => { startNewChat(); setTab('create'); }}>Start Chatting</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chats.map(chat => {
                  const agentInfo = AGENTS.find(a => a.id === chat.agentMode);
                  const lastMsg = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
                  return (
                    <div key={chat.id} style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
                      padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s'
                    }}>
                      <div onClick={() => loadChat(chat)} style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '18px' }}>{agentInfo?.icon || '✨'}</span>
                          <span style={{ fontWeight: 600, fontSize: '15px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title || 'Untitled Chat'}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', whiteSpace: 'nowrap' }}>{formatChatDate(chat.updatedAt)}</span>
                        </div>
                        {lastMsg && (
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #999)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '26px' }}>
                            {lastMsg.role === 'user' ? 'You: ' : 'AI: '}{lastMsg.content.substring(0, 80)}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', paddingLeft: '26px' }}>
                        <button onClick={() => loadChat(chat)} style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)', color: 'var(--primary, #6c63ff)', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          ▶ Continue
                        </button>
                        <button onClick={() => shareChat(chat.id)} style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          🔗 Share
                        </button>
                        <button onClick={() => deleteChat(chat.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'crm' && (['solopreneur','team','business','business_pro'].includes(usage.plan) ? <div className="empty-state"><h3>📇 CRM</h3><p>Manage contacts, deals & pipeline — coming soon in this view!</p><p>Use the full CRM features in your dashboard.</p></div> : <div className="empty-state"><h3>CRM</h3><p>Manage contacts, deals & activities</p><p className="upgrade-hint">Available on Solopreneur Hub and above</p><button className="nav-btn btn-primary" onClick={() => window.open('https://novamindai.studio/#pricing','_blank')}>Upgrade Now</button></div>)}
        {tab === 'projects' && (['solopreneur','team','business','business_pro'].includes(usage.plan) ? <div className="empty-state"><h3>📋 Projects</h3><p>Track projects & tasks with AI — coming soon in this view!</p><p>Use the full project management features in your dashboard.</p></div> : <div className="empty-state"><h3>Projects</h3><p>Track projects & tasks with AI</p><p className="upgrade-hint">Available on Solopreneur Hub and above</p><button className="nav-btn btn-primary" onClick={() => window.open('https://novamindai.studio/#pricing','_blank')}>Upgrade Now</button></div>)}
      </div>
      <nav className="bottom-nav">
        {(isPersonalMode 
            ? (['home','create','gallery','chats'] as Tab[])
            : (['home','create','chats','gallery','crm','projects'] as Tab[])
          ).map(id => (
          <button key={id} className={`bottom-nav-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)}>
            <span className="bottom-nav-icon">{{ home: '🏠', create: '✨', gallery: '🖼️', chats: '💬', crm: '📇', projects: '📋' }[id]}</span>
            {{ home: 'Home', create: 'Create', gallery: 'Gallery', chats: 'Chats', crm: 'CRM', projects: 'Projects' }[id]}
          </button>
        ))}
      </nav>

      {showOnboarding && user && (
        <div className="auth-overlay">
          <div className="auth-modal" style={{ maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
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
          <div className="auth-modal">
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
