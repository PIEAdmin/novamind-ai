import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase-config';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, limit as firestoreLimit, Timestamp, serverTimestamp } from 'firebase/firestore';
import { generateContent, fileToAttachment, FileAttachment } from './api-service';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './styles.css';

type Tab = 'home' | 'create' | 'gallery' | 'chats' | 'community' | 'crm' | 'projects';
type AgentMode = 'general' | 'competitor-analysis' | 'ad-maker' | 'logo-maker' | 'email-assistant' | 'fact-checker' | 'idea-spark' | 'financial-advisor' | 'business-plan' | 'sales-proposal' | 'flyer-maker';
type EmailMode = 'compose' | 'reply' | 'sequences' | 'polish';

type ToastType = 'success' | 'info' | 'warning' | 'error';
type ThemeMode = 'dark' | 'light';
type LangCode = 'en' | 'es' | 'fr';
type ChatTagLabel = '' | 'Content' | 'Email' | 'Design' | 'Research' | 'Marketing' | 'Ideas' | 'Finance' | 'Sales';

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
  { id: 'fact-checker', name: 'Fact Checker', icon: '✅', desc: 'Verify claims & info', badge: 'NEW' },
  { id: 'idea-spark', name: 'Idea Spark', icon: '💡', desc: 'Brainstorm & ideation', badge: 'NEW' },
  { id: 'financial-advisor', name: 'Financial Advisor', icon: '💰', desc: 'Pricing strategy, profit margins, cash flow projections, break-even analysis & expense advice', badge: 'NEW' },
  { id: 'business-plan', name: 'Business Plan Generator', icon: '📋', desc: 'Complete business plans with executive summary, market analysis, revenue model & growth strategy', badge: 'NEW' },
  { id: 'sales-proposal', name: 'Sales Proposal Writer', icon: '📝', desc: 'Professional proposals, quotes, pitch decks & client presentations tailored by industry', badge: 'NEW' },
  { id: 'flyer-maker', name: 'Flyer Maker', icon: '📄', desc: 'Professional print-ready flyers, posters & event promotions', badge: 'NEW' },
];

const COMING_SOON_FEATURES: { icon: string; name: string; desc: string }[] = [
  { icon: '📧', name: 'Smart Inbox', desc: 'AI reads, drafts & manages your email replies' },
  { icon: '📱', name: 'Social Scheduler', desc: 'Create, schedule & auto-post to all platforms' },
  { icon: '📊', name: 'CRM Lite', desc: 'Track clients, deals & follow-ups with AI insights' },
  { icon: '📋', name: 'Project Board', desc: 'AI-powered task & project management' },
  { icon: '🎯', name: 'Marketing Autopilot', desc: 'Automated campaigns, sequences & analytics' },
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
  'fact-checker': `You are a meticulous fact-checker and research analyst. When given a claim, statement, or piece of information:
## \u2705 Verdict (True / Partially True / False / Unverifiable)
## \ud83d\udcca Evidence (3-5 bullet points with sources where possible)
## \ud83d\udd0d Context (important nuance or missing context)
## \ud83d\udcdd Summary (2-3 sentence plain-English explanation)
Be objective, cite sources when possible, and clearly distinguish between verified facts and opinions.`,
  'idea-spark': `You are a creative brainstorming partner and idea generator. When given a topic or challenge:
## \ud83d\udca1 Top Ideas (5-7 creative ideas, ranked by potential)
## \ud83c\udfaf Quick Wins (2-3 ideas that can be executed immediately)
## \ud83d\ude80 Moonshot (1 ambitious, high-impact idea)
## \ud83d\udd17 Connections (unexpected links between the topic and other fields)
## \ud83d\udccb Next Steps (3 concrete actions to start with the best idea)
Be creative, think laterally, and don't be afraid of unconventional suggestions.`,
  'financial-advisor': `You are a comprehensive financial advisor for small businesses. Help users with:
## 💰 Pricing Strategy & Profit Margins
- Analyze pricing models and suggest optimal price points
- Calculate profit margins and markup percentages
## 📊 Cash Flow Forecasting
- Create cash flow projections and forecasts
- Identify potential cash flow gaps
## 📈 Break-Even Analysis
- Calculate break-even points with clear formulas
- Show units/revenue needed to break even
## 💸 Expense Management
- Categorize and analyze expenses
- Suggest cost reduction strategies
## 🏦 Financial Health
- Revenue model analysis and optimization
- Financial health assessment and KPIs
- Tax preparation guidance and deduction tips
- Budget planning and allocation
Format responses with clear tables, calculations, and actionable steps.
Always ask what industry/business type for relevant benchmarks.
Include specific numbers and percentages when possible.`,
  'business-plan': `You are a professional business plan writer. Generate comprehensive, investor-ready business plans with:
## 📋 Executive Summary
## 🏢 Company Description & Mission
## 📊 Market Analysis & Target Audience
## 🏆 Competitive Landscape
## 🛍️ Products/Services Description
## 📣 Marketing & Sales Strategy
## 💰 Revenue Model & Financial Projections
## ⚙️ Operations Plan
## 🚀 Growth Strategy & Milestones
Format with clear headers, bullet points, and professional language.
Ask for business type, target market, and goals if not provided.
Include realistic financial projections and timelines.
Make it investor-ready quality with compelling narrative and data-driven insights.`,
  'sales-proposal': `You are a professional sales proposal and pitch writer. Create compelling, client-ready documents including:
## 📝 Client-Facing Proposals
- Professional proposals with company branding sections
- Service/product quotes with detailed pricing breakdowns
## 🎯 Pitch Materials
- Pitch deck outlines and presentation scripts
- Case study frameworks with measurable results
## 💰 Financial Justification
- ROI calculations tailored to the client's situation
- Cost-benefit analysis and value propositions
## 📋 Follow-Up & Contracts
- Follow-up email sequences after proposals
- Contract scope summaries
Format professionally with clear sections: Problem, Solution, Pricing, Timeline, Next Steps.
Tailor tone and content to the specific industry.
Include compelling value propositions and differentiators.
Make it ready to send — professional and persuasive.`,
  'flyer-maker': `You are a professional flyer and promotional material designer. When users describe what they need, generate a stunning, print-ready flyer image.

## 🎨 Design Principles
- Bold, eye-catching headlines that grab attention instantly
- Clean, professional layouts with clear visual hierarchy
- Industry-appropriate color schemes and imagery
- High contrast text for readability
- Strategic use of white space

## 📄 Flyer Elements to Include
- **Headline** — Big, bold, attention-grabbing
- **Subheadline** — Supporting details or tagline
- **Key Details** — Date, time, location, pricing, offers
- **Call to Action** — "Call Now", "Visit Us", "Book Today", etc.
- **Contact Info** — Phone, email, website, social media handles
- **Branding** — Business name and logo placement

## 🎯 Flyer Types You Create
- Grand opening announcements
- Event promotions (workshops, sales, concerts)
- Service/product promotions
- Seasonal offers & holiday specials
- Hiring/recruitment flyers
- Menu specials & restaurant promotions
- Real estate open houses
- Church & community event flyers
- Fitness & wellness promotions
- Educational program announcements

## 📐 Design Standards
- Use professional typography — headline font large and bold, body text clean and readable
- Include a clear visual focal point
- Ensure all text is within safe margins (not cut off at edges)
- Use vibrant, professional color palettes appropriate to the industry
- Make the design print-ready at standard flyer sizes (8.5x11, A4, or 5x7)

Always ask for business name, event details, and any specific branding preferences if not provided. Create designs that look like they came from a professional graphic designer.`
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
    { icon: '✅', text: 'Is it true that humans only use 10% of their brain?' },
    { icon: '📊', text: 'Fact-check: "The Great Wall of China is visible from space"' },
    { icon: '🔍', text: 'Verify this claim: "Drinking 8 glasses of water a day is essential"' },
    { icon: '📝', text: 'Is this accurate: "90% of startups fail within the first year"?' }
  ],
  'idea-spark': [
    { icon: '💡', text: 'Give me 10 creative side hustle ideas I can start this weekend with $0' },
    { icon: '🎯', text: 'Brainstorm unique marketing ideas for a local bakery on a tight budget' },
    { icon: '🚀', text: 'What are some innovative app ideas that solve everyday problems?' },
    { icon: '🔗', text: 'Creative content ideas for a fitness Instagram account that stand out' }
  ],
  'financial-advisor': [
    { icon: '💰', text: 'Help me set pricing for my consulting services to hit 40% profit margins' },
    { icon: '📊', text: 'Create a 12-month cash flow projection for my new e-commerce store' },
    { icon: '📈', text: 'Calculate break-even point for my restaurant with $15K monthly overhead' },
    { icon: '💸', text: 'Review my business expenses and suggest where I can cut costs' }
  ],
  'business-plan': [
    { icon: '📋', text: 'Write a complete business plan for a mobile dog grooming service' },
    { icon: '🚀', text: 'Create a startup plan for a SaaS app targeting small business owners' },
    { icon: '📊', text: 'Market analysis and business plan for a new fitness studio in Austin, TX' },
    { icon: '🏢', text: 'Generate an investor-ready business plan for an online tutoring platform' }
  ],
  'sales-proposal': [
    { icon: '📝', text: 'Write a proposal for my web design services to a local restaurant chain' },
    { icon: '💼', text: 'Create a pitch deck outline for my marketing agency targeting healthcare clients' },
    { icon: '💰', text: 'Build a pricing quote for a 6-month social media management contract' },
    { icon: '🤝', text: 'Draft a follow-up email sequence after sending a proposal to a potential client' }
  ],
  'flyer-maker': [
    { icon: '🎉', text: 'Create a grand opening flyer for a hair salon called Glamour Studio' },
    { icon: '🍕', text: 'Design a flyer for a restaurant weekend special — buy one get one free' },
    { icon: '🏋️', text: 'Make a flyer for a 30-day fitness challenge starting July 1st' },
    { icon: '📚', text: 'Create an event flyer for a community AI training workshop' }
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


const CHAT_TAGS: ChatTagLabel[] = ['', 'Content', 'Email', 'Design', 'Research', 'Marketing', 'Ideas', 'Finance', 'Sales'];

const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
  en: {
    home: 'Home', create: 'Create', gallery: 'Gallery', chats: 'Chats', community: 'Community',
    crm: 'CRM', projects: 'Projects', signOut: 'Sign Out', signIn: 'Sign In',
    createAccount: 'Create Account', generate: 'Generate', thinking: 'Thinking...',
    newChat: 'New Chat', searchChats: 'Search chats...', searchHistory: 'Search creations...',
    noResults: 'No results found', noChats: 'No chats yet', noCreations: 'No creations yet',
    yourAIToolkit: 'Your AI Toolkit', createAmazingContent: 'Create Amazing Content with AI',
    startCreating: 'Start Creating', welcomeToNovaMind: 'Welcome to NovaMind AI',
    monthlyUsage: 'Monthly Usage', used: 'Used', limit: 'Limit', created: 'Created',
    tryOneOfThese: 'Try one of these:', typeYourReply: 'Type your reply below...',
    offline: 'You are offline', backOnline: 'Back online!',
    exportPDF: 'Export PDF', exportWord: 'Export Word', copy: 'Copy', share: 'Share',
    publish: 'Publish', download: 'Download', darkMode: 'Dark Mode', lightMode: 'Light Mode',
    shortcuts: 'Shortcuts', myCreations: 'My Creations', myChats: 'My Chats',
    communityGallery: 'Community Gallery', reply: 'Reply', continue_: 'Continue',
    delete_: 'Delete', aiAgents: 'AI Agents', quickTools: 'Quick Tools',
    thisMonth: 'This Month', totalGenerations: 'Total Generations',
    textGens: 'Text Gens', imageGens: 'Image Gens', recentActivity: 'Recent Activity',
    industry: 'Industry', all: 'All', favorites: 'Favorites',
    factCheck: 'Fact Check', ideaSpark: 'Idea Spark', tapToDictate: 'Tap to dictate',
    listening: 'Listening...', moodWriter: 'Mood Writer', voiceNotSupported: 'Voice not supported'
  },
  es: {
    home: 'Inicio', create: 'Crear', gallery: 'Galería', chats: 'Chats', community: 'Comunidad',
    crm: 'CRM', projects: 'Proyectos', signOut: 'Cerrar Sesión', signIn: 'Iniciar Sesión',
    createAccount: 'Crear Cuenta', generate: 'Generar', thinking: 'Pensando...',
    newChat: 'Nuevo Chat', searchChats: 'Buscar chats...', searchHistory: 'Buscar creaciones...',
    noResults: 'Sin resultados', noChats: 'Sin chats aún', noCreations: 'Sin creaciones aún',
    yourAIToolkit: 'Tu Kit de IA', createAmazingContent: 'Crea Contenido Increíble con IA',
    startCreating: 'Empezar a Crear', welcomeToNovaMind: 'Bienvenido a NovaMind AI',
    monthlyUsage: 'Uso Mensual', used: 'Usado', limit: 'Límite', created: 'Creado',
    tryOneOfThese: 'Prueba uno de estos:', typeYourReply: 'Escribe tu respuesta...',
    offline: 'Estás sin conexión', backOnline: 'Conexión restaurada',
    exportPDF: 'Exportar PDF', exportWord: 'Exportar Word', copy: 'Copiar', share: 'Compartir',
    publish: 'Publicar', download: 'Descargar', darkMode: 'Modo Oscuro', lightMode: 'Modo Claro',
    shortcuts: 'Atajos', myCreations: 'Mis Creaciones', myChats: 'Mis Chats',
    communityGallery: 'Galería Comunidad', reply: 'Responder', continue_: 'Continuar',
    delete_: 'Eliminar', aiAgents: 'Agentes IA', quickTools: 'Herramientas',
    thisMonth: 'Este Mes', totalGenerations: 'Generaciones Totales',
    textGens: 'Texto', imageGens: 'Imágenes', recentActivity: 'Actividad Reciente',
    industry: 'Industria', all: 'Todos', favorites: 'Favoritos',
    factCheck: 'Verificar', ideaSpark: 'Ideas', tapToDictate: 'Toca para dictar',
    listening: 'Escuchando...', moodWriter: 'Tono', voiceNotSupported: 'Voz no compatible'
  },
  fr: {
    home: 'Accueil', create: 'Créer', gallery: 'Galerie', chats: 'Chats', community: 'Communauté',
    crm: 'CRM', projects: 'Projets', signOut: 'Déconnexion', signIn: 'Connexion',
    createAccount: 'Créer un Compte', generate: 'Générer', thinking: 'Réflexion...',
    newChat: 'Nouveau Chat', searchChats: 'Rechercher...', searchHistory: 'Rechercher créations...',
    noResults: 'Aucun résultat', noChats: 'Pas de chats', noCreations: 'Pas de créations',
    yourAIToolkit: 'Boîte à Outils IA', createAmazingContent: 'Créez du Contenu Incroyable',
    startCreating: 'Commencer', welcomeToNovaMind: 'Bienvenue sur NovaMind AI',
    monthlyUsage: 'Utilisation Mensuelle', used: 'Utilisé', limit: 'Limite', created: 'Créé',
    tryOneOfThese: 'Essayez ceux-ci:', typeYourReply: 'Tapez votre réponse...',
    offline: 'Vous êtes hors ligne', backOnline: 'Reconnecté!',
    exportPDF: 'Exporter PDF', exportWord: 'Exporter Word', copy: 'Copier', share: 'Partager',
    publish: 'Publier', download: 'Télécharger', darkMode: 'Mode Sombre', lightMode: 'Mode Clair',
    shortcuts: 'Raccourcis', myCreations: 'Mes Créations', myChats: 'Mes Chats',
    communityGallery: 'Galerie Communauté', reply: 'Répondre', continue_: 'Continuer',
    delete_: 'Supprimer', aiAgents: 'Agents IA', quickTools: 'Outils Rapides',
    thisMonth: 'Ce Mois', totalGenerations: 'Générations Totales',
    textGens: 'Texte', imageGens: 'Images', recentActivity: 'Activité Récente',
    industry: 'Industrie', all: 'Tous', favorites: 'Favoris',
    factCheck: 'Vérifier', ideaSpark: 'Idées', tapToDictate: 'Appuyez pour dicter',
    listening: 'Écoute...', moodWriter: "Ton d'Écriture", voiceNotSupported: 'Voix non supportée'
  }
};

const PERSONAL_TOOL_STARTERS: Record<string, string[]> = {
  'fridge-chef': ['I have chicken, rice, and broccoli', 'Quick dinner with pasta and cheese'],
  'day-planner': ['5 work tasks + gym + groceries', 'Full day of meetings + deep work'],
  'itinerary': ['Weekend trip to NYC on $500', '7 days in Tokyo for two'],
  'summarizer': ['Paste a chapter or article here', 'Key points from this text'],
  'flashcards': ['Biology: cell division notes', 'Spanish vocabulary chapter 5'],
  'essay-outline': ['Climate change persuasive essay', 'History of AI research paper'],
  'resume': ['Software engineer at Google posting', 'Marketing manager role'],
  'interview': ['Product manager at a startup', 'Data analyst behavioral questions'],
  'contract': ['Apartment lease review', 'Freelance contract terms'],
  'video-hook': ['Day in my life vlog', 'Fitness transformation story'],
  'faceless-script': ['Top 10 unsolved mysteries', 'How money actually works'],
  'aesthetic-prompt': ['Cozy autumn coffee shop', 'Futuristic neon cityscape'],
};

const detectChatTag = (agentMode: string, contentType: string): ChatTagLabel => {
  if (agentMode === 'email-assistant') return 'Email';
  if (agentMode === 'ad-maker') return 'Marketing';
  if (agentMode === 'logo-maker' || contentType === 'image') return 'Design';
  if (agentMode === 'competitor-analysis' || agentMode === 'fact-checker') return 'Research';
  if (agentMode === 'idea-spark') return 'Ideas';
  if (agentMode === 'financial-advisor') return 'Finance';
  if (agentMode === 'business-plan' || agentMode === 'sales-proposal') return 'Sales';
  if (agentMode === 'flyer-maker') return 'Design';
  return 'Content';
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
  const [lastFiles, setLastFiles] = useState<FileAttachment[]>([]);
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

  // === NEW FEATURE STATE ===
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('novamind-theme') as ThemeMode) || 'dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<ToastType>('info');
  const [toastVisible, setToastVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [language, setLanguage] = useState<LangCode>(() => (localStorage.getItem('novamind-lang') as LangCode) || 'en');
  const [chatTag, setChatTag] = useState<ChatTagLabel>('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [moodTone, setMoodTone] = useState('');

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
    setIndustry('general');
    setAgentMode('general');
    setContentType('text');
    setModel('deepseek');
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
          // 📢 Notify admin of new signup
          try {
            await setDoc(doc(db, 'adminNotifications', u.uid), {
              type: 'new_signup',
              email: u.email || '',
              displayName: u.displayName || '',
              photoURL: u.photoURL || '',
              signupAt: Timestamp.now(),
              read: false
            });
            // Also call notify function for email alert
            fetch('/.netlify/functions/notify-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: u.email, name: u.displayName || '', uid: u.uid })
            }).catch(() => {});
          } catch (e) { console.error('Admin notify error:', e); }
        }
      } else {
        setTemplates([]);
        setHistory([]);
        setChats([]);
      }
    });
    return unsub;
  }, []);

  // === NEW FEATURE EFFECTS ===
  // Theme persistence
  useEffect(() => {
    localStorage.setItem('novamind-theme', theme);
  }, [theme]);

  // Language persistence
  useEffect(() => {
    localStorage.setItem('novamind-lang', language);
  }, [language]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKbd = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); const b = document.querySelector('.generate-btn') as HTMLButtonElement; if (b && !b.disabled) b.click(); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); startNewChat(); }
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setShowShortcuts(p => !p); }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowShareMenu(null); }
    };
    window.addEventListener('keydown', handleKbd);
    return () => window.removeEventListener('keydown', handleKbd);
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


    // Financial advisor detection
    if (/\b(pricing.*strategy|profit.*margin|cash.*flow|break.?even|expense|budget.*plan|revenue.*model|financial.*health|tax.*prep|cost.*analysis|markup|forecast.*revenue|financial.*project|pricing.*model)\b/.test(p)) {
      return { agent: 'financial-advisor', notification: '💰 Switching to Financial Advisor...' };
    }

    // Business plan detection
    if (/\b(business.*plan|startup.*plan|launch.*plan|market.*analysis.*plan|executive.*summary|growth.*strategy|investor.*ready|business.*model|go.?to.?market)\b/.test(p)) {
      return { agent: 'business-plan', notification: '📋 Switching to Business Plan Generator...' };
    }

    // Sales proposal detection
    if (/\b(proposal|quote.*for|pitch.*deck|client.*presentation|sales.*pitch|rfp|scope.*of.*work|pricing.*quote|send.*quote|write.*proposal|draft.*proposal|contract.*scope)\b/.test(p)) {
      return { agent: 'sales-proposal', notification: '📝 Switching to Sales Proposal Writer...' };
    }

    // Flyer maker detection
    if (/\b(flyer|flier|poster|promotional.*print|event.*flyer|grand.*opening.*flyer|print.*flyer|make.*a.*flyer|create.*a.*flyer|design.*a.*flyer|promo.*flyer|hiring.*flyer)/.test(p)) {
      return { agent: 'flyer-maker', notification: '📄 Switching to Flyer Maker...' };
    }

    // Fact-checking detection
    if (/\b(fact.?check|is it true|verify.*claim|debunk|myth.*bust|true or false)\b/.test(p)) {
      return { agent: 'fact-checker', notification: '\u2705 Switching to Fact Checker...' };
    }

    // Idea generation detection
    if (/\b(brainstorm|give me ideas|creative ideas|come up with|think of ideas|innovative ideas|ideas for)\b/.test(p)) {
      return { agent: 'idea-spark', notification: '\U0001f4a1 Switching to Idea Spark...' };
    }

    return null; // Stay in General
  };

  // 🧠 Smart industry detection — override saved industry based on prompt context
  const detectIndustryFromPrompt = (p: string): string => {
    const lp = p.toLowerCase();
    if (/\b(restaurant|food service|menu|dining|chef|cuisine|catering|food truck|bar |pub |cafe |bakery)\b/.test(lp)) return 'restaurant';
    if (/\b(real estate|property|realtor|listing|mortgage|home buyer|rental|landlord|housing|apartment)\b/.test(lp)) return 'real-estate';
    if (/\b(fitness|gym|workout|exercise|wellness|yoga|personal train|health coach|nutrition|weight loss)\b/.test(lp)) return 'fitness';
    if (/\b(legal|law firm|attorney|lawyer|litigation|contract law|court|compliance|patent|trademark)\b/.test(lp)) return 'legal';
    if (/\b(healthcare|medical|doctor|clinic|patient|hospital|dental|therapy|pharma|nursing|health care)\b/.test(lp)) return 'healthcare';
    if (/\b(ecommerce|e-commerce|online store|shopify|amazon|dropship|product listing|online retail)\b/.test(lp)) return 'ecommerce';
    if (/\b(salon|beauty|hair|nail|spa |skincare|cosmet|barber|makeup|esthetician)\b/.test(lp)) return 'salon';
    if (/\b(automotive|car dealer|mechanic|auto repair|vehicle|car wash|tire |auto body)\b/.test(lp)) return 'automotive';
    if (/\b(education|school|university|college|student|teacher|campus|curriculum|academic|workforce develop)\b/.test(lp)) return 'education';
    if (/\b(finance|accounting|bookkeep|tax |invest|banking|financial plan|cpa |audit|payroll)\b/.test(lp)) return 'finance';
    if (/\b(construction|contractor|builder|renovation|plumb|electric|hvac|roofing|remodel|architec)\b/.test(lp)) return 'construction';
    if (/\b(photography|photographer|photo shoot|portrait|wedding photo|headshot)\b/.test(lp)) return 'photography';
    if (/\b(nonprofit|non-profit|charity|donation|volunteer|fundrais|foundation|501c|ngo )\b/.test(lp)) return 'nonprofit';
    if (/\b(tech startup|saas |startup|app develop|software company|tech company|ai company|fintech)\b/.test(lp)) return 'tech-startup';
    return 'general';
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
    let currentIndustry = industry;
    // 🧠 Smart industry: detect from prompt content, override saved default
    const detectedIndustry = detectIndustryFromPrompt(currentPrompt);
    if (detectedIndustry !== 'general') {
      currentIndustry = detectedIndustry;
    } else if (industry !== 'general') {
      // Saved industry doesn't match prompt — use general to avoid wrong framing
      currentIndustry = 'general';
    }
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
    if (/\b(generate.*image|create.*image|draw\s+(a|an|me|the)|design\s+(a|an|me|the)\s*(logo|image|graphic|poster|banner|icon|illustration)|make.*picture|make.*image|create.*illustration|render\s+(a|an|me)|visualize|create.*graphic|make.*poster|make.*banner|make.*infographic|make.*logo|make.*icon|create.*logo|draw.*picture)\b/.test(pLower) && !hasImageAttachments && pendingFiles.length === 0) {
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
        // Auto-fill user info for email signatures
        if (user?.displayName || user?.email) {
          systemPrefix += `\n\nThe sender's name is ${user?.displayName || 'not provided'} and their email is ${user?.email || 'not provided'}. Use this information to fill in the email signature instead of placeholders like [Your Name]. If information is missing, use a placeholder.`;
        }
      } else if (activeAgentMode !== 'general') {
        systemPrefix = AGENT_SYSTEM_PROMPTS[activeAgentMode];
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your analysis specifically for this industry.`;
        }
      } else if (currentIndustry !== 'general' && currentContentType === 'text') {
        systemPrefix = `You are an expert AI assistant specializing in the ${industryObj?.name} industry. Tailor your response specifically for ${industryObj?.name} professionals.`;
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

      // Mood tone injection
      if (moodTone) {
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          'Write in a ' + moodTone.toLowerCase() + ' tone. Adjust your language, word choice, and style to match this mood.';
      }
      setLastSystemPrompt(systemPrefix || '');
      // Save file attachments for retry/regenerate
      const savedFileAttachments: FileAttachment[] = [];
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
        savedFileAttachments.push(...fileAttachments);
      }
      setLastFiles(savedFileAttachments);
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
  const [showShareMenu, setShowShareMenu] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState('');
  const [communityPosts, setCommunityPosts] = useState<any[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);

  const showToast = (msg: string, type: ToastType = 'info') => {
    setToastMsg(msg); setToastType(type); setToastVisible(true);
    setShareToast(msg); // backward compat
    setTimeout(() => { setToastVisible(false); setShareToast(''); }, 2500);
  };

  const exportToPDF = () => {
    const text = result?.content || result?.text || '';
    if (!text) return;
    const pw = window.open('', '_blank');
    if (pw) {
      pw.document.write('<html><head><title>NovaMind Export</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;line-height:1.6}h1,h2,h3{color:#333}pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}</style></head><body>' + renderMarkdown(text) + '<hr><p style="color:#999;font-size:12px">Exported from NovaMind AI</p></body></html>');
      pw.document.close();
      pw.print();
    }
  };

  const exportToWord = () => {
    const text = result?.content || result?.text || '';
    if (!text) return;
    const html = '<html><head><meta charset="utf-8"><title>NovaMind Export</title></head><body>' + renderMarkdown(text) + '</body></html>';
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'novamind-export.doc'; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleVoiceRecognition = () => {
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice not supported in this browser'); return; }
    const recog = new SR();
    recog.lang = 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1;
    recog.onresult = (event: any) => { const t = event.results[0][0].transcript; setPrompt((p: string) => p ? p + ' ' + t : t); };
    recog.onend = () => setIsListening(false);
    recog.onerror = (ev: any) => { setIsListening(false); if (ev.error === 'not-allowed') alert('Microphone access denied.'); };
    recognitionRef.current = recog; recog.start(); setIsListening(true);
  };

  const shareToSocial = (platform: string, text: string, imageUrl?: string) => {
    const shareText = text.substring(0, 200);
    const appUrl = 'https://novamind-ai-app.netlify.app';
    const tagline = 'Made with NovaMind AI ✨ Try it free';
    const fullText = `${shareText}\n\n${tagline}`;

    // Native share with image blob support for base64 images
    if (imageUrl && imageUrl.startsWith('data:') && navigator.share) {
      fetch(imageUrl).then(r => r.blob()).then(blob => {
        const file = new File([blob], 'novamind-creation.png', { type: blob.type || 'image/png' });
        navigator.share({ text: fullText, url: appUrl, files: [file] }).catch(() => {});
      }).catch(() => {});
      showToast('Sharing image...', 'info');
      setShowShareMenu(null);
      return;
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
      showToast(`Shared to ${platform}! 🎉`);
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
      const res = await generateContent(lastPrompt, lastContentType, lastModel, lastSystemPrompt || undefined, lastFiles.length > 0 ? lastFiles : undefined);
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

  const switchTab = (t: Tab) => { setTab(t); if (t === 'community' && communityPosts.length === 0) loadCommunityPosts(); };
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
  const t = TRANSLATIONS[language];

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
    <div className="app-container" data-theme={theme}>
      <style>{`
        [data-theme="light"] {
          --bg-primary: #f8f9fa; --bg-secondary: #e9ecef; --text-primary: #212529;
          --text-secondary: #6c757d; --surface: #ffffff; --border-color: #dee2e6;
        }
        [data-theme="light"] .app-container { background: #f8f9fa; color: #212529; }
        [data-theme="light"] .navbar { background: rgba(255,255,255,0.95); border-bottom: 1px solid #dee2e6; }
        [data-theme="light"] .bottom-nav { background: rgba(255,255,255,0.95); border-top: 1px solid #dee2e6; }
        [data-theme="light"] .auth-input, [data-theme="light"] .prompt-input { background: #fff; border-color: #dee2e6; color: #212529; }
        [data-theme="light"] .stat-card { background: #fff; border-color: #dee2e6; }
        [data-theme="light"] .tool-card, [data-theme="light"] .agent-card, [data-theme="light"] .gallery-card { background: #fff; border-color: #dee2e6; }
        [data-theme="light"] .suggestion-chip { background: #fff; border-color: #dee2e6; color: #212529; }
        [data-theme="light"] .industry-chip { background: rgba(0,0,0,0.04); border-color: #dee2e6; color: #212529; }
        [data-theme="light"] .model-chip { background: rgba(0,0,0,0.04); color: #212529; }
        [data-theme="light"] .result-container { background: #fff; border-color: #dee2e6; }
        [data-theme="light"] .agent-info-banner { background: rgba(108,99,255,0.05); border-color: rgba(108,99,255,0.15); }
        [data-theme="light"] .auth-modal { background: #fff; color: #212529; }
        [data-theme="light"] .empty-state { color: #6c757d; }
        @keyframes pulseMic { 0%,100%{box-shadow:0 0 0 0 rgba(255,75,75,0.4)} 50%{box-shadow:0 0 0 12px rgba(255,75,75,0)} }
        @keyframes slideInUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .toast-enter { animation: slideInUp 0.3s ease; }
        .offline-banner { animation: slideInUp 0.3s ease; }
        .mic-pulse { animation: pulseMic 1.5s ease-in-out infinite !important; }
        .mood-chip { transition: all 0.2s ease; cursor: pointer; }
        .mood-chip:hover { transform: scale(1.05); }
        @media (max-width: 480px) {
          .nav-controls { gap: 4px !important; }
          .nav-controls button { font-size: 14px !important; padding: 4px 6px !important; }
        }
      `}</style>
      <nav className="navbar">
        <div className="logo-section">
          <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI" />
          <span className="logo-text">{isPersonalMode ? 'NovaMind Personal' : 'NovaMind AI'}</span>
        </div>
        <div className="nav-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['en','es','fr'] as LangCode[]).map(code => (
              <button key={code} onClick={() => setLanguage(code)} style={{ background: language === code ? 'rgba(108,99,255,0.3)' : 'transparent', border: language === code ? '1px solid rgba(108,99,255,0.5)' : '1px solid transparent', borderRadius: '6px', padding: '4px 6px', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-primary, #fff)' }}>{{ en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷' }[code]}</button>
            ))}
          </div>
          <button onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t.lightMode : t.darkMode} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px', cursor: 'pointer' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (Ctrl+K)" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer' }}>⌨️</button>
          <button className="nav-btn btn-outline" onClick={handleSignOut} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' }}>🚪 {t.signOut}</button>
        </div>
      </nav>
      {isOffline && (
        <div className="offline-banner" style={{ background: '#ef4444', color: '#fff', padding: '8px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
          ⚠️ {t.offline}
        </div>
      )}
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
            {/* 🚀 Coming Soon — compact row */}
            <div style={{ marginTop: '24px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', color: 'var(--text-secondary, #888)', marginBottom: '10px', fontWeight: 600 }}>🚀 Coming Soon</h4>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' as const, paddingBottom: '4px' }}>
                {COMING_SOON_FEATURES.map((feature) => (
                  <div key={feature.name} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: 0.5, fontSize: '12px', color: 'var(--text-secondary, #888)',
                    whiteSpace: 'nowrap' as const,
                  }}>
                    <span style={{ fontSize: '16px' }}>{feature.icon}</span>
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="powered-footer">
              <span>A Product of The PIE Group</span> · <a href="mailto:admin@allexapiegroup.com">Contact</a>
            </div>
          </>
        )}
        {tab === 'home' && !isPersonalMode && (<>
          <div className="hero-section">
            <h1 className="hero-title">{user?.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}! ✨` : 'Create Amazing Content with AI'}</h1>
            <p className="hero-subtitle">{user?.displayName ? 'What would you like to create today?' : 'Text, images, code and more — powered by premium AI at a fraction of the cost.'}</p>
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
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <div className="stat-card" style={{ textAlign: 'center' }}>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{t.thisMonth}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary, #6c63ff)', margin: '4px 0' }}>{usage.used}</div>
              <div className="stat-label">{t.totalGenerations}</div>
            </div>
            <div className="stat-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', margin: '4px 0' }}>{history.filter(h => h.contentType === 'text').length}</div>
              <div className="stat-label">{t.textGens}</div>
            </div>
            <div className="stat-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#a855f7', margin: '4px 0' }}>{history.filter(h => h.contentType === 'image' || h.model === 'gpt-image-1').length}</div>
              <div className="stat-label">{t.imageGens}</div>
            </div>
          </div>

          <h3 className="section-title">{t.aiAgents}</h3>
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

          {/* 🚀 Coming Soon Section */}
          <div style={{ marginTop: '32px' }}>
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚀 Coming Soon
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #888)', marginTop: '-8px', marginBottom: '16px' }}>
              Phase II features launching soon — stay tuned!
            </p>
            <div className="agent-grid">
              {COMING_SOON_FEATURES.map((feature) => (
                <div key={feature.name} className="agent-card" style={{
                  opacity: 0.55,
                  cursor: 'default',
                  pointerEvents: 'none' as const,
                  border: '2px dashed rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.02)',
                  position: 'relative' as const,
                }}>
                  <span style={{
                    position: 'absolute' as const,
                    top: '8px',
                    right: '8px',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                    color: '#fff',
                    letterSpacing: '0.5px',
                  }}>COMING SOON</span>
                  <div className="agent-icon">{feature.icon}</div>
                  <div className="agent-name">{feature.name}</div>
                  <div className="agent-desc">{feature.desc}</div>
                </div>
              ))}
            </div>
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
              {COMING_SOON_FEATURES.map(feature => (
                <button key={feature.name} className="agent-tab" style={{ opacity: 0.4, cursor: 'default', pointerEvents: 'none' as const }} disabled>
                  <span className="agent-tab-icon">{feature.icon}</span>
                  <span className="agent-tab-name">{feature.name}</span>
                  <span className="agent-tab-badge" style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', fontSize: '8px' }}>SOON</span>
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
            {agentMode === 'fact-checker' && (
              <div className="agent-info-banner">
                <strong>✅ Fact Checker Agent</strong>
                <p>Enter a claim, statement, or piece of information — get a thorough fact-check with sources and verdict.</p>
              </div>
            )}
            {agentMode === 'idea-spark' && (
              <div className="agent-info-banner">
                <strong>💡 Idea Spark Agent</strong>
                <p>Describe a topic or challenge — get creative ideas, quick wins, and actionable next steps.</p>
              </div>
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
            <div className="model-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary, #888)', fontWeight: 500 }}>🤖 AI Model (auto-selected):</span>
              {[{ id: 'deepseek', l: '⚡ DeepSeek' }, { id: 'gpt-image-1', l: '🎨 GPT Image' }, { id: 'gpt-4o', l: '✨ GPT-4o' }].map(m => (
                <button key={m.id} className={`model-chip ${model === m.id ? 'active' : ''}`} onClick={() => { setModel(m.id); setContentType(m.id === 'gpt-image-1' ? 'image' : 'text'); }}>{m.l}</button>
              ))}
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
                        <button onClick={() => { navigator.clipboard.writeText(msg.imageUrl || msg.content); showToast('Copied! 📋'); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}>📋 Copy</button>
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

            {/* Mood Writer Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{'✍️'} Mood:</span>
              {['', 'Professional', 'Casual', 'Witty', 'Empathetic', 'Bold', 'Minimalist'].map(tone => (
                <button key={tone} className="mood-chip" onClick={() => setMoodTone(tone)}
                  style={{
                    padding: '4px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '16px', cursor: 'pointer',
                    background: moodTone === tone ? 'var(--primary, #6c63ff)' : 'rgba(255,255,255,0.06)',
                    color: moodTone === tone ? '#fff' : 'var(--text-secondary, #aaa)',
                    border: moodTone === tone ? '1px solid var(--primary, #6c63ff)' : '1px solid rgba(255,255,255,0.1)',
                  }}>
                  {tone || 'Default'}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = '#6c63ff'; }}
              onDragLeave={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = ''; }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = ''; handleFileSelect(e.dataTransfer.files); }}>
              <textarea className="prompt-input" style={{ paddingRight: '120px', ...(chatMessages.length > 0 ? { borderColor: 'rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.05)' } : {}) }} placeholder={
                chatMessages.length > 0 ? 'Type your reply here...' :
                agentMode === 'competitor-analysis' ? 'Enter a competitor name or describe your market (e.g., "Analyze Mailchimp for a small email marketing startup")...' :
                agentMode === 'ad-maker' ? 'Describe your product/service and target platform (e.g., "Facebook ad for my yoga studio grand opening")...' :
                agentMode === 'email-assistant' ? getEmailPlaceholder() :
                agentMode === 'logo-maker' ? 'Describe the logo you want (e.g., "Modern minimalist logo for a tech startup called NexGen")...' :
                contentType === 'image' ? 'Describe the image...' : 'What would you like to create?'
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
                <button onClick={() => fileInputRef.current?.click()} title="Attach file" style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.25)', color: '#6c63ff', fontSize: '16px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📎</button>
                {prompt && (
                  <button onClick={() => setPrompt('')} title="Clear" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
                <button onClick={toggleVoiceRecognition} title={isListening ? t.listening : t.tapToDictate} className={isListening ? 'mic-pulse' : ''} style={{ background: isListening ? 'rgba(255,75,75,0.3)' : 'rgba(108,99,255,0.2)', border: isListening ? '2px solid rgba(255,75,75,0.6)' : '1px solid rgba(108,99,255,0.3)', color: isListening ? '#ff4b4b' : '#6c63ff', fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>{isListening ? '🔴' : '🎤'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="generate-btn" style={{ flex: 1 }} onClick={handleGenerate} disabled={generating || (!prompt.trim() && pendingFiles.length === 0)}>
                {generating ? '⏳ Thinking...' : chatMessages.length > 0 ? '💬 Reply' : agentMode === 'competitor-analysis' ? '🔍 Analyze Competitor' : agentMode === 'ad-maker' ? '📢 Create Ad' : agentMode === 'email-assistant' ? getEmailButtonText() : agentMode === 'logo-maker' ? '🎨 Design Logo' : '✨ Generate'}
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
              <div className="generating-animation">
                <div className="typing-dots"><span></span><span></span><span></span></div>
                <p>{agentMode === 'competitor-analysis' ? 'Analyzing competitive landscape...' : agentMode === 'ad-maker' ? 'Crafting your ad copy...' : agentMode === 'email-assistant' ? 'Writing your email...' : 'AI is crafting your content...'}</p>
              </div>
            )}
            {result && !result.error && (result.imageUrl || chatMessages.length === 0) && (
              <div className="result-container">
                <div className="result-actions" style={{ position: 'relative' }}>
                  {!result.imageUrl && <button className="action-btn" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 Copy'}</button>}
                  {!result.imageUrl && <button className="action-btn" onClick={exportToPDF} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>📄 PDF</button>}
                  {!result.imageUrl && <button className="action-btn" onClick={exportToWord} style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>📝 Word</button>}
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
            {!result && !generating && !prompt && chatMessages.length === 0 && isPersonalMode && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>{"\U0001f527"} Quick starts:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {PERSONAL_TOOLS.slice(0, 6).map(tool => (
                    <button key={tool.id} className="suggestion-chip" onClick={() => { setPrompt(tool.prompt); }}
                      style={{ fontSize: '12px', padding: '6px 12px' }}>
                      <span>{tool.icon}</span> {tool.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!result && !generating && !prompt && chatMessages.length === 0 && (
              <div className="prompt-suggestions">
                <p className="suggestions-label">{t.tryOneOfThese}</p>
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
          <h3 className="section-title">{t.myCreations}</h3>
          <input type="text" placeholder={t.searchHistory} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary, #fff)', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' as const }} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 className="section-title" style={{ margin: 0 }}>💬 {t.myChats}</h3>
              <button onClick={() => { startNewChat(); setTab('create'); }}
                style={{ background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                ➕ {t.newChat}
              </button>
            </div>
            <input type="text" placeholder={t.searchChats} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary, #fff)', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' as const }} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {CHAT_TAGS.map(tag => (
                <button key={tag || 'all'} onClick={() => setChatTag(tag)} className={`model-chip ${chatTag === tag ? 'active' : ''}`} style={{ fontSize: '12px', padding: '4px 12px' }}>
                  {tag || t.all}
                </button>
              ))}
            </div>
            {chats.length === 0 ? (
              <div className="empty-state">
                <p>No chats yet. Start a conversation to see it here!</p>
                <button className="nav-btn btn-primary" onClick={() => { startNewChat(); setTab('create'); }}>Start Chatting</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chats.filter(c => (!searchQuery || (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())) && (!chatTag || detectChatTag(c.agentMode, c.contentType) === chatTag)).map(chat => {
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
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', marginTop: '2px' }}>
                              {agentInfo?.name || 'General'} · {userMsgCount} {userMsgCount === 1 ? 'message' : 'messages'} · {formatChatDate(chat.updatedAt)}
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
      {toastVisible && (
        <div className="toast-enter" style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: toastType === 'error' ? '#ef4444' : toastType === 'success' ? '#22c55e' : toastType === 'warning' ? '#f59e0b' : 'linear-gradient(135deg, #6c63ff, #3b82f6)', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          {toastMsg}
        </div>
      )}
      <nav className="bottom-nav">
        {(isPersonalMode 
            ? (['home','create','gallery','community','chats'] as Tab[])
            : (['home','create','chats','gallery','community','crm','projects'] as Tab[])
          ).map(id => (
          <button key={id} className={`bottom-nav-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)}>
            <span className="bottom-nav-icon">{{ home: '🏠', create: '✨', gallery: '🖼️', chats: '💬', community: '🌟', crm: '📇', projects: '📋' }[id]}</span>
            {{ home: 'Home', create: 'Create', gallery: 'Gallery', chats: 'Chats', community: 'Community', crm: 'CRM', projects: 'Projects' }[id]}
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
      {showShortcuts && (
        <div className="auth-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="auth-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '4px' }}>{"\u2328\ufe0f"} {t.shortcuts}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>Speed up your workflow</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[['Ctrl + Enter', 'Send message'], ['Ctrl + N', 'New chat'], ['Ctrl + K', 'Toggle shortcuts'], ['Escape', 'Close dialogs']].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{desc}</span>
                  <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.15)' }}>{key}</kbd>
                </div>
              ))}
            </div>
            <button className="generate-btn" onClick={() => setShowShortcuts(false)} style={{ marginTop: '20px' }}>Close</button>
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
