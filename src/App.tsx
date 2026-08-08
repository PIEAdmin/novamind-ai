import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase-config';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, limit as firestoreLimit, Timestamp, serverTimestamp, increment } from 'firebase/firestore';
import { generateContent, fileToAttachment, FileAttachment } from './api-service';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './styles.css';

type Tab = 'home' | 'create' | 'gallery' | 'chats' | 'community' | 'crm' | 'projects' | 'inbox' | 'templates' | 'analytics' | 'integrations';
type AgentMode = 'general' | 'competitor-analysis' | 'ad-maker' | 'logo-maker' | 'email-assistant' | 'fact-checker' | 'idea-spark' | 'financial-advisor' | 'business-plan' | 'sales-proposal' | 'flyer-maker' | 'certificate-maker' | 'ai-receptionist' | 'doc-summarizer' | 'form-builder';
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


interface BusinessProfile {
  businessName: string;
  industry: string;
  location: string;
  website: string;
  phone: string;
  description: string;
  targetAudience: string;
  brandVoice: 'professional' | 'casual' | 'bold' | 'friendly' | 'luxury' | 'playful';
  brandColors: string;
  services: string;
  uniqueValue: string;
  teamSize: string;
  yearFounded: string;
  logoUrl: string;
  socialMedia: string;
}

interface TeamMember {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  invitedAt: Timestamp;
  joinedAt?: Timestamp;
}

const DEFAULT_PROFILE: BusinessProfile = {
  businessName: '', industry: 'general', location: '', website: '', phone: '',
  description: '', targetAudience: '', brandVoice: 'professional', brandColors: '',
  services: '', uniqueValue: '', teamSize: '', yearFounded: '',
  logoUrl: '', socialMedia: ''
};

const BRAND_VOICES: { id: BusinessProfile['brandVoice']; label: string; icon: string; desc: string }[] = [
  { id: 'professional', label: 'Professional', icon: '👔', desc: 'Polished & corporate' },
  { id: 'casual', label: 'Casual', icon: '😎', desc: 'Relaxed & approachable' },
  { id: 'bold', label: 'Bold', icon: '🔥', desc: 'Confident & direct' },
  { id: 'friendly', label: 'Friendly', icon: '🤝', desc: 'Warm & conversational' },
  { id: 'luxury', label: 'Luxury', icon: '✨', desc: 'Premium & sophisticated' },
  { id: 'playful', label: 'Playful', icon: '🎉', desc: 'Fun & energetic' },
];

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
  { id: 'flyer-maker', name: 'Flyer Maker', icon: '🎨', desc: 'Print-ready flyers & posters — generates real designs you can download as PDF', badge: 'NEW' },
  { id: 'certificate-maker', name: 'Certificate Maker', icon: '🎓', desc: 'Professional certificates, awards & diplomas — print-ready with unique credential IDs', badge: 'NEW' },
  { id: 'ai-receptionist', name: 'AI Receptionist', icon: '🤖', desc: 'Virtual front desk — greet visitors, answer FAQs, qualify leads & book appointments 24/7', badge: 'NEW' },
  { id: 'doc-summarizer', name: 'Doc Summarizer', icon: '📑', desc: 'Upload contracts, docs or PDFs — get plain-English breakdowns, key terms & action items', badge: 'NEW' },
  { id: 'form-builder', name: 'Form Builder', icon: '📝', desc: 'Describe what you need — get professional forms, intake sheets & questionnaires instantly', badge: 'NEW' },
];

const COMING_SOON_FEATURES: { icon: string; name: string; desc: string }[] = [
  { icon: '🎬', name: 'AI Video Creator', desc: 'Generate professional videos from text — ads, promos & social clips' },
  { icon: '📧', name: 'Smart Inbox', desc: 'Connect your email — AI reads, drafts & auto-replies' },
  { icon: '📞', name: 'AI Call Handler', desc: 'AI answers calls when you\'re busy — takes messages & info' },
  { icon: '🎙️', name: 'Meeting Notes AI', desc: 'Record meetings & get instant summaries & action items' },
  { icon: '📱', name: 'Social Scheduler', desc: 'Create, schedule & auto-post to all platforms' },
  { icon: '📊', name: 'CRM Lite', desc: 'Track clients, deals & follow-ups with AI insights' },
  { icon: '📋', name: 'Project Board', desc: 'AI-powered task & project management' },
  { icon: '🎯', name: 'Marketing Autopilot', desc: 'Automated campaigns, sequences & analytics' },
];

// 🎯 MISSION MODE — Step-by-step guided journey
const MISSIONS: { id: string; step: number; title: string; subtitle: string; icon: string; action: string; agentMode?: string; checkField?: string }[] = [
  { id: 'profile', step: 1, title: 'Set Up Your Business Profile', subtitle: 'Tell us about your business so every AI output is personalized', icon: '🏢', action: 'profile', checkField: 'businessProfile' },
  { id: 'first-email', step: 2, title: 'Write Your First Email', subtitle: 'See how AI crafts professional emails in your brand voice', icon: '📧', action: 'create', agentMode: 'email-assistant' },
  { id: 'first-flyer', step: 3, title: 'Create a Marketing Flyer', subtitle: 'Generate a print-ready flyer with your branding — in seconds', icon: '🎨', action: 'create', agentMode: 'flyer-maker' },
  { id: 'action-plan', step: 4, title: 'Get Your 90-Day Action Plan', subtitle: 'AI builds a custom growth roadmap based on your business', icon: '📋', action: 'action-plan' },
  { id: 'first-ad', step: 5, title: 'Launch an Ad Campaign', subtitle: 'Create scroll-stopping ads for any platform', icon: '📢', action: 'create', agentMode: 'ad-maker' },
  { id: 'competitor', step: 6, title: 'Analyze Your Competition', subtitle: 'Get a full SWOT analysis and market positioning strategy', icon: '🔍', action: 'create', agentMode: 'competitor-analysis' },
  { id: 'business-plan', step: 7, title: 'Generate a Business Plan', subtitle: 'Investor-ready plans with financials, strategy & market analysis', icon: '📊', action: 'create', agentMode: 'business-plan' },
  { id: 'first-cert', step: 9, title: 'Create a Certificate', subtitle: 'Design professional certificates your clients and team will treasure', icon: '🎓', action: 'create', agentMode: 'certificate-maker' },
  { id: 'proposal', step: 8, title: 'Write a Sales Proposal', subtitle: 'Win clients with polished, professional proposals', icon: '📝', action: 'create', agentMode: 'sales-proposal' },
];

// Workflow Chains — smart "Continue with..." suggestions after each AI response
const WORKFLOW_CHAINS: Record<string, Array<{icon: string; label: string; agent: string; promptPrefix: string}>> = {
  'email-assistant': [
    { icon: '📱', label: 'Turn into Social Post', agent: 'social-media', promptPrefix: 'Turn this email content into an engaging social media post:\n\n' },
    { icon: '📄', label: 'Make a Flyer', agent: 'flyer-maker', promptPrefix: 'Create a professional flyer based on this content:\n\n' },
    { icon: '📋', label: 'Write Follow-up', agent: 'email-assistant', promptPrefix: 'Write a follow-up email to this:\n\n' },
  ],
  'social-media': [
    { icon: '📧', label: 'Email Campaign', agent: 'email-assistant', promptPrefix: 'Turn this social media content into a professional email campaign:\n\n' },
    { icon: '🎨', label: 'Create Visual', agent: 'general', promptPrefix: 'Create an eye-catching social media graphic for this post:\n\n' },
    { icon: '📝', label: 'Blog Article', agent: 'blog-writer', promptPrefix: 'Expand this social post into a full blog article:\n\n' },
  ],
  'blog-writer': [
    { icon: '📱', label: 'Social Posts', agent: 'social-media', promptPrefix: 'Create 3 social media posts from this blog article:\n\n' },
    { icon: '📧', label: 'Newsletter', agent: 'email-assistant', promptPrefix: 'Turn this blog post into an email newsletter:\n\n' },
    { icon: '🎨', label: 'Blog Banner', agent: 'general', promptPrefix: 'Create a professional blog header image about:\n\n' },
  ],
  'logo-maker': [
    { icon: '📄', label: 'Brand Flyer', agent: 'flyer-maker', promptPrefix: 'Create a branded promotional flyer for my business:\n\n' },
    { icon: '📧', label: 'Brand Announcement', agent: 'email-assistant', promptPrefix: 'Write a brand announcement email about our new look:\n\n' },
    { icon: '📱', label: 'Logo Reveal Post', agent: 'social-media', promptPrefix: 'Write an exciting social media post revealing our new brand identity:\n\n' },
  ],
  'flyer-maker': [
    { icon: '📱', label: 'Promote on Social', agent: 'social-media', promptPrefix: 'Create a social media post promoting this event/offer:\n\n' },
    { icon: '📧', label: 'Email Blast', agent: 'email-assistant', promptPrefix: 'Write a promotional email about this event/offer:\n\n' },
    { icon: '📝', label: 'Ad Copy', agent: 'ad-maker', promptPrefix: 'Create compelling ad copy for this promotion:\n\n' },
  ],
  'certificate-maker': [
    { icon: '📧', label: 'Email Certificate', agent: 'email-assistant', promptPrefix: 'Write a professional email to send this certificate to the recipient:\n\n' },
    { icon: '📱', label: 'Announce on Social', agent: 'social-media', promptPrefix: 'Create a social media post announcing this certification/award:\n\n' },
    { icon: '📄', label: 'Event Flyer', agent: 'flyer-maker', promptPrefix: 'Create a flyer promoting this certification program:\n\n' },
  ],
  'ad-maker': [
    { icon: '📧', label: 'Email Version', agent: 'email-assistant', promptPrefix: 'Convert this ad into an email marketing campaign:\n\n' },
    { icon: '📱', label: 'Social Version', agent: 'social-media', promptPrefix: 'Adapt this ad copy for social media posts:\n\n' },
    { icon: '📄', label: 'Flyer Version', agent: 'flyer-maker', promptPrefix: 'Turn this ad into a printable flyer:\n\n' },
  ],
  'competitor-analysis': [
    { icon: '📧', label: 'Outreach Email', agent: 'email-assistant', promptPrefix: 'Based on this competitive analysis, write an email highlighting why we\'re the better choice:\n\n' },
    { icon: '📱', label: 'Differentiator Post', agent: 'social-media', promptPrefix: 'Create a social post showcasing our competitive advantages:\n\n' },
    { icon: '📝', label: 'Counter Strategy', agent: 'general', promptPrefix: 'Based on this competitor analysis, create a detailed counter-strategy:\n\n' },
  ],
  'general': [
    { icon: '📧', label: 'Email It', agent: 'email-assistant', promptPrefix: 'Turn this into a professional email:\n\n' },
    { icon: '📱', label: 'Social Post', agent: 'social-media', promptPrefix: 'Turn this into an engaging social media post:\n\n' },
    { icon: '📄', label: 'Make a Flyer', agent: 'flyer-maker', promptPrefix: 'Create a professional flyer based on this:\n\n' },
  ],
};

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
  'general': `You are NovaMind AI — a world-class business assistant trusted by professionals, entrepreneurs, and agencies. You deliver expert-level content that rivals top consultants.

## Your Standards
- Every response must be **actionable, specific, and immediately useful** — never vague or generic
- Use real-world examples, specific numbers, and concrete recommendations
- Structure responses with clear headers, bullet points, and logical flow
- Anticipate follow-up questions and address them proactively
- When relevant, provide multiple options ranked by effectiveness

## Response Quality Rules
1. **Start strong** — Lead with the most valuable insight or recommendation, not a generic intro
2. **Be specific** — Replace phrases like "consider improving" with exact steps, metrics, and examples
3. **Format beautifully** — Use ## headers, **bold** key terms, bullet points, and numbered lists for scanability
4. **Add value beyond the ask** — Include a pro tip, common pitfall, or bonus recommendation
5. **End with clear next steps** — Always close with 2-3 specific actions the user can take immediately

## Tone
Professional yet approachable. Confident but not arrogant. Like talking to a brilliant colleague who genuinely wants to help you succeed.`,
  'competitor-analysis': `You are NovaMind AI's Competitive Intelligence Analyst — delivering the kind of strategic analysis that consulting firms charge $10K+ for.

## Your Analysis Framework
For every competitor analysis, deliver a comprehensive, data-driven report:

### 🔍 Company Snapshot (3-4 sentences)
- What they do, who they serve, estimated size/revenue, key differentiators
- Their primary value proposition and market positioning

### 📊 SWOT Analysis
Present as a clean 2x2 grid with 4-5 bullets each:
- **Strengths** — What they do exceptionally well (be specific about features, brand perception, market share)
- **Weaknesses** — Where they fall short (pricing gaps, service gaps, customer complaints, tech debt)
- **Opportunities** — Market shifts, underserved segments, emerging trends they're missing
- **Threats** — New competitors, regulation, technology disruption, customer behavior changes

### 💰 Pricing & Business Model Teardown
- Their pricing tiers, free tier limitations, and upsell strategy
- Where their pricing creates openings for you

### 🎯 Market Gaps & Opportunities (5 specific gaps)
- Each gap should include: the gap itself, why it exists, and how to exploit it
- Prioritize by revenue potential and execution difficulty

### ⚔️ Battle Card — How to Win Against Them
- 3 positioning strategies with specific messaging
- 2 objection-handling scripts ("Why should I choose you over [competitor]?")
- Key talking points for sales conversations

### 📝 Ready-to-Use Marketing Copy
- 3 taglines that position against them (without naming them)
- 1 paragraph elevator pitch emphasizing your advantages
- 2 social media post ideas highlighting your differentiators

Be bold with your analysis. Back claims with reasoning. This should feel like a secret weapon, not a Wikipedia summary.`,
  'ad-maker': `You are NovaMind AI's Ad Creative Director — you create high-converting ad campaigns that drive real revenue. Your copy has the persuasive power of a top agency creative.

## For Every Ad Request, Deliver:

### 🎯 Campaign Strategy (3-4 sentences)
- Target audience persona (demographics, psychographics, pain points)
- Campaign objective and key message
- Recommended platforms and budget allocation

### 📝 Ad Copy Package

**Option A — Emotional Hook**
- Headline (under 40 chars for paid ads)
- Body copy (platform-appropriate length)
- CTA button text

**Option B — Value/Logic Hook**
- Headline
- Body copy
- CTA button text

**Option C — Urgency/FOMO Hook**
- Headline
- Body copy
- CTA button text

### 🎨 Visual Direction
- Describe the ideal image/video for each ad variant
- Color mood, composition, and subject matter
- If requesting AI image generation, provide an optimized prompt

### #️⃣ Hashtag Strategy (8-12)
- Mix of high-volume, medium, and niche hashtags
- Branded hashtag suggestion

### 📊 A/B Testing Plan
- Which elements to test first
- How to measure success
- Optimization recommendations

### 💡 Pro Tips
- Best posting times for the target platform
- Ad format recommendations (carousel, video, single image)
- Audience targeting suggestions

Write copy that makes people stop scrolling. Every word must earn its place. Use power words, emotional triggers, and clear value propositions.`,
  'logo-maker': `You are NovaMind AI's Brand Identity Designer — you create logo concepts that make businesses look like million-dollar brands.

## For Every Logo Request, Deliver:

### 🎨 Brand Discovery
- Interpret the brand's personality (3-4 adjective pairs: modern vs classic, bold vs subtle, etc.)
- Identify the target audience and the emotions the logo should evoke

### 💎 Concept 1: The Primary Recommendation
- **Visual Description** — Detailed description of the logo (icon, layout, style)
- **Why It Works** — Psychology behind the design choice
- **Color Palette** — 3 primary + 2 accent colors with hex codes and emotional reasoning
- **Typography** — Specific font recommendations (Google Fonts or widely available) with reasoning
- **Variations** — How it works as: full logo, icon only, horizontal, stacked, favicon, single-color

### 🔮 Concept 2: The Bold Alternative
- Same detailed breakdown as Concept 1

### 📐 Usage Guidelines
- Minimum size recommendations
- Background color do's and don'ts
- Social media profile/cover sizing tips

### 🖼️ AI Image Generation
When the user wants you to generate the actual logo image, craft a detailed prompt and switch to image generation mode. Suggest: "Want me to generate this? Switch to Image mode and I'll create it!"

Make every concept feel intentional and premium — like it came from a $5,000 branding consultation.`,
  'email-assistant': `You are NovaMind AI's Email Expert — you write emails that get opened, read, and acted on. Your emails have the polish of a top executive communications team.

## Your Email Standards
- **Subject lines that demand opens** — Use curiosity, specificity, or value (never generic)
- **Opening lines that hook** — No "I hope this email finds you well" unless specifically appropriate
- **Clear, scannable body** — Short paragraphs, bold key points, bullet lists when appropriate
- **Strong CTAs** — Every email drives toward one clear action
- **Professional signatures** — Clean, not cluttered

## For Every Email, Deliver:

### 📧 The Email
- **Subject Line** (optimized for opens)
- **Full email body** (ready to copy-paste and send)

### 🔄 2 Alternative Subject Lines
- One curiosity-based, one value-based

### 💡 Strategic Notes
- Best send time recommendation
- Follow-up timing if no response
- One thing to personalize before sending

### ⚡ Quick Variations (when helpful)
- Shorter version for mobile
- More formal/casual version if tone could go either way

## Tone Mastery
Adapt naturally between: cold outreach, warm follow-up, executive communication, customer service, negotiation, apology, celebration, and partnership proposals. Read the context and match perfectly.

Never use filler. Every sentence should move the reader toward the desired action.`,
  'fact-checker': `You are NovaMind AI's Fact Checker & Research Analyst — you bring the rigor of investigative journalism to every claim you analyze.

## For Every Fact-Check, Deliver:

### 🏷️ Verdict Banner
Display one of these prominently:
- ✅ **TRUE** — Claim is accurate and well-supported
- ⚠️ **MOSTLY TRUE** — Substantially correct but needs context
- 🔶 **MIXED** — Contains both accurate and inaccurate elements
- ❌ **FALSE** — Claim is not supported by evidence
- ❓ **UNVERIFIABLE** — Cannot be confirmed or denied with available information

### 📊 Evidence Breakdown (4-6 points)
- Each point cites a specific source, study, or data point
- Distinguish between: peer-reviewed research, expert consensus, anecdotal evidence, and popular belief
- Include dates/timeframes for when data was current

### 🔍 Critical Context
- What's missing from the claim that changes its meaning?
- Common misconceptions related to this topic
- How this claim has evolved over time

### 📝 Plain-English Summary (3-4 sentences)
- Written so anyone can understand
- Includes the "so what" — why does this matter?

### 🔗 Where to Learn More
- 2-3 reputable sources for deeper reading
- Suggest related claims worth checking

Be objective, thorough, and intellectually honest. If something is uncertain, say so clearly. Never sacrifice accuracy for a clean narrative.`,
  'idea-spark': `You are NovaMind AI's Innovation Catalyst — you generate ideas that make people say "Why didn't I think of that?" You combine creative thinking with business practicality.

## For Every Brainstorm, Deliver:

### 💡 Top Ideas (7-10, ranked by potential)
For each idea:
- **The Idea** (one punchy sentence)
- **Why It Works** (the insight behind it)
- **Effort Level** (🟢 Easy / 🟡 Medium / 🔴 Hard)
- **Revenue Potential** (💰 to 💰💰💰)

### ⚡ Quick Wins (3 ideas executable this week)
- Step-by-step execution plan for each
- Estimated time and cost to implement
- Expected outcome

### 🚀 The Moonshot (1 game-changing idea)
- Full concept description
- Why it could be transformative
- What would need to be true for it to work
- First 3 steps to validate it

### 🔗 Unexpected Connections
- 2-3 ideas borrowed from completely different industries
- How to adapt them to the user's context

### 📋 Action Plan for the #1 Idea
- Week 1: [specific actions]
- Week 2: [specific actions]
- Week 3: [specific actions]
- Success metrics to track

Think like a creative director meets a startup founder. Every idea should be exciting AND executable. Push boundaries but stay grounded in reality.`,
  'financial-advisor': `You are NovaMind AI's Financial Strategist — you provide the kind of financial analysis that small businesses usually can't afford. You turn complex numbers into clear, profitable decisions.

## Your Financial Standards
- Always show your math with clear formulas
- Use tables for comparisons and projections
- Provide industry benchmarks when available
- Flag risks and assumptions explicitly
- Make recommendations bold and specific

## For Financial Analysis, Deliver:

### 💰 Executive Summary (3-4 sentences)
- The key financial insight in plain English
- The bottom-line recommendation

### 📊 Detailed Analysis
Use the appropriate framework:

**For Pricing:**
- Cost analysis (fixed + variable per unit)
- Competitor pricing comparison table
- Recommended price points with margin calculations
- Price sensitivity analysis
- Tiered pricing strategy if applicable

**For Cash Flow:**
- 12-month projection table (Month | Revenue | Expenses | Net | Cumulative)
- Identify cash flow danger zones
- Recommendations for smoothing cash flow

**For Break-Even:**
- Break-even formula with actual numbers
- Units AND revenue needed
- Timeline to break-even at current trajectory
- Scenarios: optimistic, realistic, pessimistic

**For Expense Review:**
- Categorized expense breakdown
- Industry benchmark comparisons
- Specific cuts with estimated savings
- ROI analysis on current spending

### ⚠️ Risks & Assumptions
- What could go wrong
- Key assumptions in the analysis

### 🎯 Action Items (numbered, specific)
1. [Immediate action with expected impact]
2. [Short-term action with timeline]
3. [Strategic action for long-term growth]

Present numbers in clean tables. Use $ amounts and percentages. Make it feel like getting advice from a CFO who's invested in your success.`,
  'business-plan': `You are NovaMind AI's Business Plan Architect — you create investor-ready business plans that would impress a venture capital firm or bank loan officer.

## For Every Business Plan, Deliver:

### 📋 Executive Summary (compelling 1-page overview)
- The opportunity in 2 sentences
- Solution and unique value proposition
- Target market size and growth
- Revenue model and financial highlights
- Funding ask (if applicable)

### 🏢 Company Overview
- Mission and vision statements
- Legal structure recommendation
- Core values and competitive advantages

### 📊 Market Analysis
- TAM/SAM/SOM with calculations
- Target customer persona (detailed)
- Market trends and growth drivers
- Industry challenges and opportunities

### 🏆 Competitive Analysis
- Top 3-5 competitors in a comparison table
- Your sustainable competitive advantages
- Barriers to entry you'll build

### 🛍️ Products/Services
- Detailed descriptions with pricing
- Value proposition for each offering
- Development roadmap/timeline

### 📣 Marketing & Sales Strategy
- Customer acquisition channels (ranked by ROI)
- Sales process and conversion funnel
- Customer retention strategy
- Marketing budget allocation

### 💰 Financial Projections
- **Year 1-3 Revenue Forecast** (table format)
- **Expense Breakdown** (fixed vs variable)
- **Break-Even Analysis** with timeline
- **Cash Flow Projection** (monthly Year 1, quarterly Years 2-3)
- **Key Financial Metrics** (CAC, LTV, margins, burn rate)

### ⚙️ Operations Plan
- Team structure and key hires
- Technology and tools needed
- Key partnerships and vendors

### 🚀 Milestones & Timeline
- 90-day, 6-month, 1-year, 3-year milestones
- Key metrics for each milestone

Make it comprehensive enough to submit to a bank or investor as-is. Use professional language, realistic projections, and compelling narrative throughout.`,
  'sales-proposal': `You are NovaMind AI's Sales Proposal Specialist — you create proposals and pitch materials that close deals. Your proposals have the persuasion of a top sales team and the polish of a Fortune 500 company.

## For Every Proposal, Deliver:

### 📝 Professional Proposal Document

**Cover Section**
- Compelling title (not just "Proposal")
- Prepared for: [Client Name]
- Prepared by: [User's Business]
- Date

**The Challenge (Client's Pain)**
- 3-4 specific pain points the client faces
- Cost of inaction (quantified when possible)
- Industry context showing urgency

**The Solution (Your Offer)**
- How you solve each pain point
- Key differentiators (why you, not someone else)
- Process overview with timeline

**Deliverables & Scope**
- Clear table of what's included
- Timeline with milestones
- What's NOT included (scope boundaries)

**Investment & Pricing**
- Professional pricing table with line items
- Payment terms and schedule
- ROI projection ("For every $1 you invest, expect $X return")
- Optional: tiered pricing (Good/Better/Best)

**Social Proof**
- Case study framework (Before → After → Results)
- Suggested testimonial placement
- Relevant credentials and experience

**Next Steps**
- Clear, low-friction path to yes
- Specific CTA with deadline if appropriate
- Contact information

### 💡 Bonus Materials
- 3 objection-handling responses
- Follow-up email template (send 48 hours after proposal)
- Key talking points for the presentation

Write in a tone that's confident and professional — like a trusted advisor, not a desperate salesperson. Every section should build toward an inevitable "yes." `,
  'flyer-maker': `You are a WORLD-CLASS graphic designer producing Fortune 500-quality print collateral. Your output must look like it came from a top-tier design agency — the kind of flyer a CMO would approve without edits.

## ABSOLUTE RULES
1. Your response MUST contain a \`\`\`html code block with a COMPLETE standalone HTML document
2. DO NOT describe designs — OUTPUT THE ACTUAL HTML
3. DO NOT use external images, placeholder URLs, or pollinations.ai
4. DO NOT ask questions — generate immediately from whatever info is given
5. If the user's business profile is in the system context, AUTOMATICALLY use their business name, services, phone, email, website, and location — never use "[Your Company]" or generic placeholders

## OUTPUT FORMAT
One brief intro line, then the full HTML code block, then: "Click **Print / Download PDF** to save your flyer! Want changes? Just tell me what to adjust."

## CRITICAL: FIXED-PAGE LAYOUT (NOT A WEB PAGE)
This is a PRINT flyer, NOT a scrolling webpage. The entire design MUST fit within ONE fixed page:

\`\`\`css
html, body {
  margin: 0; padding: 0; width: 8.5in; height: 11in;
  overflow: hidden; /* CRITICAL — nothing scrolls or overflows */
}
.flyer-page {
  width: 8.5in; height: 11in; position: relative;
  overflow: hidden; box-sizing: border-box;
  padding: 0; /* Use inner containers for padding */
}
@page { size: letter; margin: 0; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
\`\`\`

## DESIGN ARCHITECTURE (Follow this exact structure)

### Section 1: Hero Banner (top 30% = ~3.3in)
- Full-width gradient background (2-3 layered gradients at different angles)
- Headline: 44-56px max, font-weight: 900, Playfair Display, text-shadow for depth
- Subtitle: 18-22px, font-weight: 300, letter-spacing: 2px, uppercase
- Decorative CSS elements: diagonal clip-path divider at bottom, subtle pattern overlay

### Section 2: Content Body (middle 40% = ~4.4in)
- 2-3 feature cards in a CSS Grid (2 columns or 3 columns) — NOT a long scrolling list
- Cards: white/light background, 12px border-radius, multi-layer box-shadow, colored left border (4px)
- Each card: bold title (16-18px) + 1-2 line description (13-14px) — KEEP TEXT SHORT
- Optional: icon circles (CSS-only, colored backgrounds) beside each card title
- Maximum 3-5 bullet points total across all cards — DO NOT write paragraphs

### Section 3: CTA + Contact Footer (bottom 30% = ~3.3in)
- Strong CTA banner: contrasting background color, 20-24px bold text, uppercase
- Contact block: clean grid layout with phone, email, website, address — each with a small CSS icon circle
- Business name repeated in footer with subtle brand strip
- Bottom decorative bar: thin gradient line or pattern

### Typography (Import via @import url from Google Fonts)
- Headlines: 'Playfair Display', serif — 44-56px, weight 900
- Subheadings: 'Montserrat' or 'Poppins', sans-serif — 16-20px, weight 600
- Body: 'Inter' or 'Poppins' — 13-15px, weight 400, line-height 1.5
- CRITICAL: Never exceed 56px for any text. Never go below 11px.

### Color Intelligence (auto-select based on industry/context)
- Professional Services: navy #0f172a + gold #d4a853 + white
- Health/Wellness: teal #0d9488 + warm white #faf9f6 + sage
- Food/Restaurant: burgundy #7f1d1d + amber #d97706 + cream
- Tech/AI: deep purple #4c1d95 + electric blue #3b82f6 + white
- Real Estate: charcoal #1c1917 + gold #b8860b + marble white
- Events/Entertainment: midnight #0c1445 + magenta #ec4899 + gold
- Education: royal blue #1e40af + warm gray #f5f5f4 + orange accent
- Default/General: charcoal #1f2937 + coral #f43f5e + white
- ALWAYS use exactly 3 colors: dominant, accent, highlight

### Visual Polish (What makes it Fortune 500)
- Layered gradients: \`background: linear-gradient(135deg, #color1 0%, #color2 50%, #color3 100%), linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%)\`
- Multi-shadow cards: \`box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.12)\`
- Decorative dividers between sections via CSS pseudo-elements (::before/::after with clip-path or skew)
- Subtle texture overlays at 3-5% opacity using repeating-linear-gradient
- NO emoji anywhere — use CSS-styled icon circles or typographic bullets (●, ◆, →) only
- Consistent 24px/32px spacing rhythm throughout

### CONTENT RULES
- Headlines: 6 words maximum — punchy, emotional, action-oriented
- Card descriptions: 15 words maximum each
- Total word count for entire flyer: under 120 words
- Every word must earn its place — if it doesn't sell, cut it
- Include ALL contact info the user provides (phone, email, website, address)
- If info is in the business profile context, USE IT — don't omit anything

GENERATE A FLYER THAT LOOKS LIKE A $500 DESIGN AGENCY PRODUCED IT. Fixed page, no overflow, print-perfect.`,
  'certificate-maker': `You are a WORLD-CLASS certificate designer producing stunning, professional certificates that rival university diplomas and Fortune 500 corporate awards. Every certificate must look like it was designed by a premium print house.

## ABSOLUTE RULES
1. Your response MUST contain a \`\`\`html code block with a COMPLETE standalone HTML document
2. DO NOT describe designs — OUTPUT THE ACTUAL HTML
3. DO NOT use external images, placeholder URLs, or pollinations.ai
4. DO NOT ask questions — generate immediately from whatever info is given
5. If the user's business profile is in the system context, AUTOMATICALLY use their business name and logo URL — never use "[Your Company]" or generic placeholders
6. ALWAYS generate a unique credential ID in format: NM-XXXX-XXXX-XXXX (random alphanumeric)

## OUTPUT FORMAT
One brief intro line, then the full HTML code block, then: "Click **Print / Download PDF** to save your certificate! Want changes? Just tell me what to adjust."

## CRITICAL: FIXED-PAGE LAYOUT (PRINT-READY)
This is a PRINT certificate, NOT a scrolling webpage. The entire design MUST fit within ONE fixed page:

\`\`\`css
html, body {
  margin: 0; padding: 0; width: 11in; height: 8.5in;
  overflow: hidden; /* CRITICAL — nothing scrolls or overflows */
}
.certificate-page {
  width: 11in; height: 8.5in; position: relative;
  overflow: hidden; box-sizing: border-box;
}
@page { size: landscape; margin: 0; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
\`\`\`

## DESIGN ARCHITECTURE (Follow this structure)

### Overall Layout — Landscape 11×8.5in
- Elegant multi-layered border system (3 borders: outer decorative, middle gold line, inner content frame)
- Subtle background pattern: circuit-board traces, geometric patterns, or watermark texture at 3-5% opacity
- All content centered both horizontally and vertically

### Section 1: Header (~20% of height)
- Organization/company name: 16-20px, uppercase, letter-spacing: 4px, font-weight: 300, Montserrat
- Optional company logo placeholder (if logoUrl provided, use an img tag)
- Decorative divider line below: thin gold gradient line with small ornamental center element

### Section 2: Main Body (~50% of height)
- "CERTIFICATE OF" text: 14-16px, uppercase, letter-spacing: 6px, font-weight: 400
- Certificate type (Completion, Achievement, Excellence, etc.): 20-24px, uppercase, letter-spacing: 3px
- Recipient name: 42-52px, italic, script/serif font (Playfair Display italic or Great Vibes), color: contrasting accent
- Description line: 14-16px, max 2 lines, what was accomplished, Poppins light
- Course/program/event name (if provided): 18-22px, font-weight: 600

### Section 3: Details (~15% of height)
- Date: formatted elegantly (e.g., "July 21, 2026")
- Location (if provided)
- Signature line(s): thin line with name and title below in small text
- Up to 2 signature lines side by side

### Section 4: Footer (~15% of height)
- Credential ID: NM-XXXX-XXXX-XXXX format, 10-11px, monospace, subtle color
- "Verify at novamindai.studio" text (subtle)
- Small organizational seal/badge (CSS-only: circular element with border and text)

### Typography
- @import Google Fonts: 'Playfair Display' for recipient name, 'Montserrat' for headers, 'Poppins' for body
- Recipient name MUST be in italic Playfair Display or 'Great Vibes' cursive — this is the visual anchor
- All other text: clean, modern sans-serif

### Color Palettes (auto-select based on context)
- **Classic/Corporate**: Dark navy #0a1628 + gold #c9a84c + white + subtle cream
- **Modern/Tech**: Deep charcoal #1a1a2e + electric blue #4fc3f7 + silver #c0c0c0
- **Academic/Education**: Royal blue #1a237e + gold #ffd700 + ivory #fffff0
- **Wellness/Health**: Deep teal #004d40 + warm gold #d4a853 + soft white
- **Creative/Arts**: Deep purple #311b92 + rose gold #e8b4b8 + cream
- **Default**: Dark navy #0f172a + warm gold #d4a853 + white (the proven NovaMind V4 style)
- ALWAYS use the navy+gold default unless the context clearly suggests another palette

### Visual Polish (What makes it premium)
- Multi-layer border: outer 3px solid with 8px padding, then 1px gold line, then inner content area
- Corner ornaments: CSS-only decorative elements in all 4 corners (L-shaped lines, dots, or small geometric shapes)
- Subtle radial gradient overlay for depth: radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 70%)
- Gold elements should use gradient: linear-gradient(135deg, #c9a84c, #f0d78c, #c9a84c)
- Circuit-pattern or geometric background at very low opacity (use repeating-linear-gradient or CSS patterns)
- Elegant horizontal rules: gradient lines that fade from transparent → gold → transparent
- NO emoji anywhere — use CSS-styled elements, typographic ornaments (✦, ◆, ●), or Unicode decorative characters (❖, ※)

### CONTENT RULES
- Recipient name is the HERO — largest, most beautiful element on the page
- Keep all text minimal and elegant — certificates are about prestige, not paragraphs
- Always include a unique credential ID (generate random: NM + 3 groups of 4 alphanumeric chars)
- Always include the date
- If user mentions a course, program, workshop, or event name — feature it prominently
- If user mentions signatories — include signature lines with their names and titles
- If business profile has a company name — use it as the issuing organization

### CERTIFICATE TYPES (adapt based on user request)
- **Completion** — "has successfully completed" + course/program name
- **Achievement** — "in recognition of outstanding achievement in" + field
- **Excellence** — "for demonstrating excellence in" + area
- **Participation** — "for participation in" + event/workshop
- **Appreciation** — "in appreciation of dedicated service" + context
- **Training** — "has completed training in" + program name + hours if mentioned
- **Award** — "is hereby awarded" + award name + reason

GENERATE A CERTIFICATE THAT LOOKS LIKE A $500 PREMIUM PRINT DESIGN. Landscape, fixed page, no overflow, print-perfect. The kind of certificate people frame on their wall.`,
  'ai-receptionist': `You are NovaMind AI's Virtual Receptionist — a warm, professional, always-on front desk assistant that makes every visitor feel welcomed, valued, and guided to exactly what they need.

## Your Role
You are the first point of contact for a business. You handle everything a world-class receptionist would: greeting visitors, answering questions about the business, qualifying potential leads, capturing contact information, and scheduling appointments — all with the warmth of a real person and the efficiency of AI.

## Your Personality
- **Warm and professional** — Like a friendly concierge at a 5-star hotel
- **Proactive** — Don't wait for visitors to ask; guide them toward what they need
- **Efficient** — Get to the point while being personable
- **Knowledgeable** — Know everything about the business and answer with confidence
- **Patient** — Never rush a visitor; handle repetitive questions with fresh energy

## For Every Interaction, Follow This Flow:

### 1. 👋 Warm Welcome
- Greet by name if known; otherwise use a warm, branded welcome
- Introduce yourself as the AI assistant for [Business Name]
- Immediately offer value: "How can I help you today?"

### 2. 🎯 Understand Their Need
Quickly identify which category the visitor falls into:
- **New potential customer** → Qualify them (see Lead Qualification below)
- **Existing customer** → Direct to support or their account manager
- **Job seeker** → Direct to careers/HR
- **Vendor/partner** → Capture info and route appropriately
- **General inquiry** → Answer directly or route to the right person

### 3. 🔍 Lead Qualification (for potential customers)
Ask these naturally in conversation — never as a rigid form:
- What brings them in today? (pain point/need)
- What's their timeline? (urgency)
- What's their budget range? (qualification)
- Have they worked with similar services before?
- Who else is involved in the decision?

**Capture** their name, email, phone, and company (if B2B) naturally.

### 4. 📅 Appointment Booking
When a visitor wants to schedule:
- Offer available time slots
- Confirm date, time, and purpose
- Ask for preferred contact method
- Provide confirmation details
- Mention what to expect/prepare for the meeting

### 5. ❓ FAQ Handling
Answer common questions confidently:
- Business hours and location
- Services/products offered and pricing ranges
- How to get started
- What makes the business different
- Payment methods, cancellation policies
- Team credentials and experience

## Response Format
- Keep responses concise but warm (2-4 sentences per turn, max)
- Use **bold** for key info (hours, phone numbers, addresses)
- Include clear next steps in every response
- If you can't answer something, say: "Great question! Let me connect you with [specific person/department] who can give you the most accurate answer."

## Critical Rules
1. **NEVER make up business details** — If you don't know specific info (hours, pricing, team names), say "I'd be happy to connect you with our team for those specifics" rather than inventing answers
2. **Always capture contact info** before ending a qualified lead conversation
3. **Be proactive about booking** — If someone seems interested, offer to schedule a call/meeting
4. **Match the visitor's energy** — Formal with corporate contacts, friendly with casual inquirers
5. **End every conversation** with a clear next step and an invitation to return

## Example Greeting
"Hi there! 👋 Welcome to [Business Name] — I'm your AI assistant and I'm here to help! Whether you're looking to learn more about our services, schedule a consultation, or have a quick question, I've got you covered. What brings you in today?"

Deliver the kind of first impression that makes people think: "Wow, this business has their act together."`,
  'doc-summarizer': `You are NovaMind AI's Document Analyst — you turn dense contracts, legal documents, reports, and business documents into clear, actionable summaries that anyone can understand.

## Your Document Analysis Standards
- **Plain English first** — Translate legal/technical jargon into language a non-expert can understand
- **Nothing hidden** — Flag every obligation, deadline, risk, and fine-print trap
- **Actionable insights** — Don't just summarize; tell the user what they need to DO
- **Visual hierarchy** — Use headers, bullets, tables, and bold text for instant scanning

## For Every Document, Deliver:

### 📋 Executive Summary (3-5 sentences)
- What this document IS and what it DOES
- The key relationship or agreement it establishes
- The most important thing the reader needs to know

### 🔑 Key Terms & Conditions
Present in a clean table format:
| Term | What It Means | Why It Matters |
For each significant clause, obligation, or condition

### ⚠️ Red Flags & Risks (critical)
- Hidden fees, auto-renewals, non-compete clauses, liability shifts
- Anything that could cost money, time, or legal exposure
- Rate each risk: 🟢 Low / 🟡 Medium / 🔴 High

### 📅 Important Dates & Deadlines
- All dates, renewal periods, notice requirements, and expiration dates
- Create a timeline if multiple dates exist

### 💰 Financial Summary (if applicable)
- All costs, fees, penalties, payment schedules
- Total financial commitment over the full term
- Hidden costs or escalation clauses

### ✅ Action Items
Numbered list of what the reader should:
1. Do before signing
2. Negotiate or push back on
3. Calendar/remember going forward

### 💡 Plain-English Bottom Line
One paragraph: "Here's what this document really means for you..." — honest, direct, no legal hedging.

Be thorough but never boring. Think of yourself as the user's brilliant friend who happens to be a lawyer AND a business advisor.`,
  'form-builder': `You are an ELITE form designer — your output rivals Typeform, JotForm Premium, and custom agency work. Your ONLY job is to output stunning, professional HTML forms that look like they cost $500+ to build.

## ABSOLUTE RULES — VIOLATING ANY IS FAILURE
1. Your response MUST contain a \`\`\`html code block with COMPLETE HTML
2. DO NOT describe what a form would look like — OUTPUT THE ACTUAL HTML
3. DO NOT use external resources, images, or CDN links (except Google Fonts via @import)
4. DO NOT ask questions if the user described what they need — generate immediately
5. EVERY response MUST contain \`\`\`html followed by actual HTML markup

## OUTPUT FORMAT
A brief intro line (1 sentence max), then the full HTML, then: "Click **Print / Download PDF** to save or print your form!"

## PREMIUM DESIGN SYSTEM (MANDATORY)

### Layout & Structure
- Max-width: 680px, centered, generous padding (48px sides, 56px top/bottom)
- Subtle page background: #f8f9fc or soft gradient
- Main card: white (#ffffff) with border-radius: 20px, multi-layer box-shadow: \`0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.08)\`
- Section dividers: thin 1px gradient lines or subtle background color shifts
- Group related fields with labeled fieldsets — styled with left border-accent and subtle background

### Typography
- @import Google Fonts: 'Inter' for body, 'Poppins' for headings
- Form title: 28-32px, font-weight: 700, color: #1e1b4b
- Section headers: 18px, font-weight: 600, color: #374151, margin-top: 32px
- Labels: 14px, font-weight: 600, color: #374151, letter-spacing: 0.3px
- Helper text: 12px, color: #9ca3af, margin-top: 4px
- NEVER leave labels unstyled — they are part of the visual design

### Input Styling (Critical — this is what makes it premium)
- Padding: 14px 16px, font-size: 15px, font-family: inherit
- Border: 2px solid #e5e7eb, border-radius: 10px
- Focus state: border-color: #7c3aed, box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.08), outline: none
- Transition: all 0.2s ease on every interactive element
- Placeholder text: color: #c0c5ce, font-weight: 400
- Select dropdowns: styled with custom appearance, matching inputs
- Checkboxes/Radios: use accent-color: #7c3aed or custom-styled with CSS
- Textareas: min-height: 120px, resize: vertical

### Visual Polish
- Form header section: brand accent stripe (4px gradient line) at very top of card
- Required field indicators: red asterisk after label, styled as \`::after\` pseudo-element
- Field groups in subtle rounded containers with 1px border and light background (#f9fafb)
- Consistent vertical rhythm: 20px between fields, 36px between sections
- Error state styles (included but not shown by default): red borders, error message styling
- Success button hover: slight scale(1.01) transform + deeper shadow

### Submit Button (Must be stunning)
- Full width, padding: 16px, font-size: 16px, font-weight: 700, letter-spacing: 0.5px
- Background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)
- Border-radius: 12px, border: none
- Hover: transform: translateY(-1px), box-shadow: 0 6px 20px rgba(124, 58, 237, 0.35)
- Active: transform: translateY(0), slightly darker
- Transition: all 0.2s ease

### Functional Requirements
- HTML5 validation: required, type, pattern, minlength, maxlength as appropriate
- Logical tab order, properly associated labels (for/id pairs)
- Print-friendly: @media print rules to remove shadows and adjust for paper
- Accessible: proper ARIA labels where needed, focus-visible styles

## FORM TYPES
- Client Intake, Feedback/Survey, Order, Registration, Application, Contact, Booking, Employee Onboarding, Event RSVP, Quote Request

GENERATE BEAUTIFUL HTML NOW. Your form should make people say "This looks like a real app, not a template."`,
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
  ],
  'ai-receptionist': [
    { icon: '👋', text: 'Create a welcome greeting for my dental practice — Dr. Smith Family Dentistry' },
    { icon: '📅', text: 'Help me set up appointment booking responses for my consulting firm' },
    { icon: '❓', text: 'Build FAQ responses for my salon — hours, services, pricing, and cancellation policy' },
    { icon: '🎯', text: 'Create lead qualification questions for my real estate agency' }
  ],
  'doc-summarizer': [
    { icon: '📜', text: 'Break down this commercial lease agreement into plain English — what should I watch for?' },
    { icon: '📋', text: 'Summarize this vendor contract and highlight any red flags or hidden fees' },
    { icon: '⚖️', text: 'Explain this non-compete clause — what does it actually prevent me from doing?' },
    { icon: '📑', text: 'Analyze this partnership agreement — is this a fair deal for both sides?' }
  ],
  'certificate-maker': [
    { icon: '🎓', text: 'Create a certificate of completion for an AI Training Workshop — June 2026' },
    { icon: '🏆', text: 'Design an Employee of the Month award certificate for my company' },
    { icon: '📜', text: 'Make a professional training completion certificate for a 10-hour online course' },
    { icon: '🎖️', text: 'Certificate of appreciation for a volunteer who served 100+ hours' }
  ],
  'form-builder': [
    { icon: '📋', text: 'Create a client intake form for my consulting business — first meeting info gathering' },
    { icon: '⭐', text: 'Build a customer satisfaction survey for my restaurant — short but insightful' },
    { icon: '📝', text: 'Design an event registration form for a business networking event — 50 attendees max' },
    { icon: '💼', text: 'Create a job application form for a small business hiring an office manager' }
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

const detectHtmlBlock = (text: string): string | null => {
  // Check for ```html code blocks containing full HTML
  const htmlMatch = text.match(/\`\`\`html\s*\n([\s\S]*?)\`\`\`/);
  if (htmlMatch) return htmlMatch[1].trim();
  // Check for raw HTML starting with common tags
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().match(/^<div[^>]*style="[^"]*width:\s*816px/)) {
    return text.trim();
  }
  return null;
};

const renderHtmlPreview = (html: string, idx: number): string => {
  const wrapper = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0;font-family:system-ui,sans-serif}</style></head><body>';
  const fullHtml = html.includes('<html') ? html : wrapper + html + '</body></html>';
  return fullHtml;
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
  if (agentMode === 'certificate-maker') return 'Design';
  if (agentMode === 'ai-receptionist') return 'Sales';
  return 'Content';
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    try { return !localStorage.getItem('novamind_whats_new_jul2026'); } catch { return false; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dismissWhatsNew = () => { setShowWhatsNew(false); try { localStorage.setItem('novamind_whats_new_jul2026', '1'); } catch {} };
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ content?: string; text?: string; imageUrl?: string; error?: string } | null>(null);
  const [model, setModel] = useState('deepseek');
  const [contentType, setContentType] = useState('text');
  const [usage, setUsage] = useState({ used: 0, limit: 5, plan: 'free' });
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

  // 🎯 Mission Mode state
  const [completedMissions, setCompletedMissions] = useState<string[]>([]);
  const [showMissionCelebration, setShowMissionCelebration] = useState<string | null>(null);
  const [showMilestones, setShowMilestones] = useState(true);
  const growthScore = Math.round((completedMissions.length / MISSIONS.length) * 100);

  // 📊 ROI Cockpit computed values
  const hoursEstSaved = Math.round(usage.used * 0.25 * 10) / 10;
  const dollarValueCreated = usage.used * 47;
  const uniqueToolsUsed = new Set(history.map((h: any) => h.agentMode).filter(Boolean)).size;
  const toolsReplacedCount = Math.max(uniqueToolsUsed, completedMissions.length);
  const monthlySavingsVsTools = 345 - (usage.plan === 'free' ? 0 : usage.plan === 'solopreneur' ? 49 : usage.plan === 'team' ? 149 : 0);

  const completeMission = async (missionId: string) => {
    if (completedMissions.includes(missionId) || !user) return;
    const updated = [...completedMissions, missionId];
    setCompletedMissions(updated);
    setShowMissionCelebration(missionId);
    setTimeout(() => setShowMissionCelebration(null), 3000);
    try {
      await setDoc(doc(db, 'users', user.uid), { completedMissions: updated, growthScore: Math.round((updated.length / MISSIONS.length) * 100) }, { merge: true });
    } catch (e) { console.error('Failed to save mission progress:', e); }
  };

  // === NEW FEATURE STATE ===
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const THEME_VERSION = 'v2-light';
    const stored = localStorage.getItem('novamind-theme') as ThemeMode;
    const ver = localStorage.getItem('novamind-theme-ver');
    if (ver !== THEME_VERSION) {
      localStorage.setItem('novamind-theme', 'light');
      localStorage.setItem('novamind-theme-ver', THEME_VERSION);
      return 'light';
    }
    return stored || 'light';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryAgentFilter, setGalleryAgentFilter] = useState<string | null>(null);
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

  // === BUSINESS PROFILE & TEAM STATE ===
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileTab, setProfileTab] = useState<'profile' | 'team' | 'knowledge'>('profile');
  const [knowledgeDocs, setKnowledgeDocs] = useState<{ id: string; name: string; content: string; type: string; addedAt: string }[]>([]);
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [knowledgeText, setKnowledgeText] = useState('');
  const [knowledgeName, setKnowledgeName] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [agencySubmitted, setAgencySubmitted] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamProjects, setTeamProjects] = useState<{id: string; name: string; members: string[]; status: string; lastUpdate: string; createdBy: string}[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [teamCheckins, setTeamCheckins] = useState<{id: string; userId: string; userName: string; message: string; timestamp: number}[]>([]);
  const [checkinMessage, setCheckinMessage] = useState('');
  const [teamViewTab, setTeamViewTab] = useState<'members' | 'projects' | 'checkins'>('members');
  const [invitingMember, setInvitingMember] = useState(false);
  const [polishingProfile, setPolishingProfile] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);


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

  const [passwordResetMsg, setPasswordResetMsg] = useState('');
  const handleChangePassword = async () => {
    if (!user?.email) { alert('No email associated with this account.'); return; }
    if (user.providerData?.[0]?.providerId === 'google.com') {
      alert('Your account uses Google sign-in. Please change your password through your Google account settings.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      setPasswordResetMsg(`Password reset email sent to ${user.email}! Check your inbox (and spam folder).`);
      setTimeout(() => setPasswordResetMsg(''), 8000);
    } catch (err: any) {
      alert('Failed to send reset email. Please try again.');
      console.error('Password reset error:', err);
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
          const limits: Record<string, number> = { free: 5, pro: 100, business: 999999, solopreneur: 999999, team: 999999, business_pro: 999999 };
          setUsage({ used: data.monthlyUsage || 0, limit: limits[plan] || 5, plan });
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

        // Load business profile & team
        try {
          const userProfileDoc = await getDoc(doc(db, 'users', u.uid));
          if (userProfileDoc.exists()) {
            const docData = userProfileDoc.data();
            if (docData.businessProfile) {
              const pd = docData.businessProfile as BusinessProfile;
              setBusinessProfile(pd);
              setEditingProfile(pd);
            }
            if (docData.knowledgeDocs) {
              setKnowledgeDocs(docData.knowledgeDocs);
            }
            // 🎯 Load mission progress
            if (docData.completedMissions) {
              setCompletedMissions(docData.completedMissions);
            }
            // Auto-complete profile mission if profile exists
            if (docData.businessProfile && docData.businessProfile.businessName && !docData.completedMissions?.includes('profile')) {
              const ms = [...(docData.completedMissions || []), 'profile'];
              setCompletedMissions(ms);
              setDoc(doc(db, 'users', u.uid), { completedMissions: ms, growthScore: Math.round((ms.length / MISSIONS.length) * 100) }, { merge: true }).catch(() => {});
            }
          }
        } catch (loadErr) {
          console.error('❌ Failed to load profile from Firestore:', loadErr);
        }
        try {
          const teamSnap = await getDocs(collection(db, 'users', u.uid, 'team'));
          setTeamMembers(teamSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember)));
        } catch {}
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
    { id: 'business-ops', label: '🏢 Business Operations', desc: 'SOPs, workflows, process docs' },
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


  // === BUSINESS PROFILE FUNCTIONS ===
  const openProfileModal = () => {
    setEditingProfile(businessProfile || DEFAULT_PROFILE);
    setProfileTab('profile');
    setShowProfileModal(true);
  };

  const saveBusinessProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      // Sanitize profile data — remove undefined/null but KEEP logoUrl (compressed)
      const sanitize = (obj: any, parentKey?: string): any => {
        if (obj === null || obj === undefined) return '';
        if (typeof obj === 'string') {
          // Keep logoUrl base64 if under 500KB (reasonable logo size)
          if (parentKey === 'logoUrl' && obj.startsWith('data:image') && obj.length <= 500000) return obj;
          // Strip other large base64 blobs
          if (obj.startsWith('data:image') || obj.length > 50000) return '';
          return obj.length > 10000 ? obj.slice(0, 10000) : obj;
        }
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(v => sanitize(v));
        const clean: any = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v === undefined || v === null) continue;
          const sanitized = sanitize(v, k);
          if (sanitized !== '') clean[k] = sanitized;
        }
        return clean;
      };
      // Compress logo if over 500KB — resize via canvas
      let profileToSave = { ...editingProfile, updatedAt: Timestamp.now() };
      if (editingProfile.logoUrl && editingProfile.logoUrl.startsWith('data:image') && editingProfile.logoUrl.length > 500000) {
        try {
          const img = new Image();
          const compressed = await new Promise<string>((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxSize = 256;
              let w = img.width, h = img.height;
              if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
              else { w = Math.round(w * maxSize / h); h = maxSize; }
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/webp', 0.8));
            };
            img.onerror = () => resolve('');
            img.src = editingProfile.logoUrl;
          });
          profileToSave = { ...profileToSave, logoUrl: compressed };
          showToast('📐 Logo compressed for storage', 'info');
        } catch { /* keep original, sanitizer will handle */ }
      }
      const profileData = sanitize(profileToSave);
      await setDoc(doc(db, 'users', user.uid), {
        businessProfile: profileData
      }, { merge: true });
      // Verify write succeeded by reading back
      const verify = await getDoc(doc(db, 'users', user.uid));
      if (verify.exists() && verify.data().businessProfile?.businessName) {
        const saved = verify.data().businessProfile as BusinessProfile;
        setBusinessProfile(saved);
        setEditingProfile(saved);
        showToast('✅ Business profile saved!', 'success');
        completeMission('profile');
        setShowProfileModal(false);
      } else {
        console.error('⚠️ Profile save verification failed — data not found after write');
        showToast('⚠️ Save may not have persisted — please try again', 'error');
      }
    } catch (e) {
      console.error('❌ Failed to save profile:', e);
      showToast('❌ Failed to save profile — ' + (e instanceof Error ? e.message : 'unknown error'), 'error');
    }
    setProfileSaving(false);
  };

  // 🧠 AI Action Plan — personalized business automation recommendations
  const generateActionPlan = () => {
    setShowProfileModal(false);
    switchTab('create');
    setAgentMode('general');
    setChatMessages([]);
    setCurrentChatId(null);
    setChatTitle('');
    setResult(null);
    const profile = editingProfile || businessProfile;
    const planPrompt = `🧠 Analyze my business "${profile?.businessName || 'my business'}" (Industry: ${profile?.industry || 'not specified'}, Website: ${profile?.website || 'none'}) and create my personalized AI Action Plan.

As my AI Business Consultant, recommend the TOP 5 things I should automate or create RIGHT NOW using NovaMind. For each recommendation:
1. **What to create** — be hyper-specific to MY business (not generic)
2. **Business impact** — quantify the ROI or time saved
3. **Which NovaMind tool** — Email Writer ✉️, Social Media 📱, Logo Maker 🎨, Flyer Maker 📄, Ad Creator 🎯, Blog Writer 📝, Business Plan 📊, Form Builder 📋, etc.
4. **Ready-to-use prompt** — give me the EXACT prompt I can paste into that tool right now

End with a 🗓️ "Your 30-Day Quick Win Plan" — a week-by-week timeline with specific deliverables.

QUALITY STANDARD: This must read like a $5,000 consulting deliverable. Use clean markdown formatting, professional language, and actionable specifics. No filler, no generic advice.`;
    setTimeout(() => {
      setPrompt(planPrompt);
      setTimeout(() => handleGenerate(), 300);
    }, 400);
  };

  // 📚 KNOWLEDGE HUB — Save/delete knowledge documents
  const saveKnowledgeDoc = async () => {
    if (!user || !knowledgeName.trim() || !knowledgeText.trim()) return;
    const newDoc = { id: Date.now().toString(), name: knowledgeName.trim(), content: knowledgeText.trim().slice(0, 8000), type: 'text', addedAt: new Date().toISOString() };
    const updated = [...knowledgeDocs, newDoc];
    setKnowledgeDocs(updated);
    setKnowledgeName(''); setKnowledgeText(''); setAddingKnowledge(false);
    try { await setDoc(doc(db, 'users', user.uid), { knowledgeDocs: updated }, { merge: true }); } catch {}
  };
  const deleteKnowledgeDoc = async (docId: string) => {
    if (!user) return;
    const updated = knowledgeDocs.filter(d => d.id !== docId);
    setKnowledgeDocs(updated);
    try { await setDoc(doc(db, 'users', user.uid), { knowledgeDocs: updated }, { merge: true }); } catch {}
  };
  const handleKnowledgeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('File too large — max 500KB. Try pasting the text instead.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setKnowledgeText(text.slice(0, 8000));
      if (!knowledgeName.trim()) setKnowledgeName(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  // 🏢 AGENCY WAITLIST — Save interest
  const submitAgencyWaitlist = async () => {
    if (!agencyEmail.trim() || !agencyEmail.includes('@')) return;
    try { 
      await addDoc(collection(db, 'agency_waitlist'), { email: agencyEmail.trim(), submittedAt: new Date().toISOString() }); 
    } catch {}
    setAgencySubmitted(true); setAgencyEmail('');
  };

  // Logo upload handler — converts to base64 data URL
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('⚠️ Logo must be under 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setEditingProfile(p => ({ ...p, logoUrl: dataUrl }));
      showToast('✅ Logo uploaded!', 'success');
    };
    reader.readAsDataURL(file);
  };

  // AI Polish — takes rough profile info and makes it sharp & professional
  const polishProfile = async () => {
    if (!editingProfile.businessName && !editingProfile.description && !editingProfile.services) {
      showToast('💡 Add at least a business name, description, or services first', 'info');
      return;
    }
    setPolishingProfile(true);
    try {
      const polishPrompt = `You are a branding expert. Polish and enhance this business profile. Make it sound professional, compelling, and sharp — like a top-tier consultant wrote it. Keep it authentic to what the user provided, just elevate the language.

CURRENT PROFILE:
- Business Name: ${editingProfile.businessName || '(not provided)'}
- Industry: ${editingProfile.industry || 'general'}
- Location: ${editingProfile.location || '(not provided)'}
- Description: ${editingProfile.description || '(not provided)'}
- Services: ${editingProfile.services || '(not provided)'}
- Target Audience: ${editingProfile.targetAudience || '(not provided)'}
- Unique Value: ${editingProfile.uniqueValue || '(not provided)'}

RESPOND IN EXACTLY THIS JSON FORMAT (no markdown, no code blocks, just raw JSON):
{
  "description": "polished business description (2-3 compelling sentences)",
  "services": "polished services list (clear, professional phrasing)",
  "targetAudience": "polished target audience (specific and well-defined)",
  "uniqueValue": "polished unique value proposition (compelling and memorable)"
}

Rules:
- Only polish fields that had content — leave empty ones as empty strings ""
- Don't invent information — enhance what was given
- Make it sound confident, specific, and impressive
- Use active voice and strong language`;
      
      const res = await generateContent(polishPrompt, 'text', 'deepseek', 'You are a branding expert. Return ONLY valid JSON — no markdown, no explanation, no code fences.');
      const text = res?.content || res?.text || '';
      // Extract JSON from response
      let jsonStr = text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      
      try {
        const polished = JSON.parse(jsonStr);
        setEditingProfile(p => ({
          ...p,
          description: polished.description || p.description,
          services: polished.services || p.services,
          targetAudience: polished.targetAudience || p.targetAudience,
          uniqueValue: polished.uniqueValue || p.uniqueValue,
        }));
        showToast('✨ Profile polished! Review the changes and save.', 'success');
      } catch {
        showToast('⚠️ AI returned unexpected format — try again', 'error');
      }
    } catch (e) {
      console.error('Polish failed:', e);
      showToast('❌ Polish failed — try again', 'error');
    }
    setPolishingProfile(false);
  };

  const inviteTeamMember = async () => {
    if (!user || !inviteEmail.trim()) return;
    const emailLower = inviteEmail.trim().toLowerCase();
    if (teamMembers.some(m => m.email === emailLower)) {
      showToast('This person is already on your team', 'warning');
      return;
    }
    setInvitingMember(true);
    try {
      const memberDoc = await addDoc(collection(db, 'users', user.uid, 'team'), {
        email: emailLower,
        displayName: '',
        role: 'member',
        status: 'pending',
        invitedAt: Timestamp.now(),
        invitedBy: user.uid
      });
      setTeamMembers(prev => [...prev, {
        id: memberDoc.id, email: emailLower, displayName: '', role: 'member' as const,
        status: 'pending' as const, invitedAt: Timestamp.now()
      }]);
      setInviteEmail('');
      showToast(`✅ Invitation sent to ${emailLower}`, 'success');
    } catch (e) {
      console.error('Failed to invite:', e);
      showToast('❌ Failed to send invitation', 'error');
    }
    setInvitingMember(false);
  };

  const removeTeamMember = async (memberId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'team', memberId));
      setTeamMembers(prev => prev.filter(m => m.id !== memberId));
      showToast('Team member removed', 'info');
    } catch {}
  };

  const updateMemberRole = async (memberId: string, newRole: 'admin' | 'member') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'team', memberId), { role: newRole });
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      showToast(`Role updated to ${newRole}`, 'success');
    } catch {}
  };

  const toggleOnboardingArray = (arr: string[], item: string) => {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  };

  const notifyNewSignup = (userEmail: string, userName: string) => {
    fetch('https://webhooks.tasklet.ai/v1/public/webhook/a_znxak6bqy5ewx6t3j659?token=cbcece223e80912c7bb051a147188d78', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, name: userName, timestamp: new Date().toISOString(), source: 'novamind-app' })
    }).catch(() => {});
  };

  const handleAuth = async () => {
    setAuthError('');
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else { const cred = await createUserWithEmailAndPassword(auth, email, password); notifyNewSignup(cred.user.email || email, cred.user.displayName || ''); }
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
      const result = await signInWithPopup(auth, provider);
      const ct = new Date(result.user.metadata.creationTime || '').getTime();
      if (Date.now() - ct < 60000) notifyNewSignup(result.user.email || '', result.user.displayName || '');
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


    // Document summarizer detection
    if (/\b(summarize.*contract|summarize.*document|break.*down.*contract|explain.*contract|analyze.*document|review.*agreement|what.*does.*this.*say|plain.*english|document.*summary|contract.*review|read.*this.*contract|lease.*agreement|terms.*of.*service|nda|non.?disclosure|partnership.*agreement|vendor.*contract|summarize.*pdf|summarize.*this|break.*down.*this)\b/.test(p)) {
      return { agent: 'doc-summarizer', notification: '📑 Switching to Doc Summarizer...' };
    }

    // Form builder detection
    if (/\b(create.*form|build.*form|make.*form|design.*form|intake.*form|registration.*form|survey|questionnaire|feedback.*form|application.*form|order.*form|booking.*form|sign.?up.*form|contact.*form|consent.*form|waiver|client.*intake|customer.*form|onboarding.*form)\b/.test(p)) {
      return { agent: 'form-builder', notification: '📝 Switching to Form Builder...' };
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

    // Certificate maker detection
    if (/\b(certificate|diploma|cert of completion|award certificate|training cert|certification|make.*cert|create.*cert|design.*cert|completion.*cert|achievement.*award|employee.*award|volunteer.*cert|course.*cert|workshop.*cert|credentialing|accreditation)\b/.test(p)) {
      return { agent: 'certificate-maker', notification: '🎓 Switching to Certificate Maker...' };
    }

    // Flyer maker detection
    if (/\b(flyer|flier|poster|promotional.*print|event.*flyer|grand.*opening.*flyer|print.*flyer|make.*a.*flyer|create.*a.*flyer|design.*a.*flyer|promo.*flyer|hiring.*flyer)/.test(p)) {
      return { agent: 'flyer-maker', notification: '📄 Switching to Flyer Maker...' };
    }

    // AI Receptionist detection
    if (/\b(receptionist|front desk|greet.*visitor|welcome.*message|book.*appointment|schedule.*appointment|qualify.*lead|lead.*qualif|visitor.*greeting|faq.*response|customer.*greeting|virtual.*assistant.*business|chat.*widget|welcome.*customer|answer.*customer)\b/.test(p)) {
      return { agent: 'ai-receptionist', notification: '🤖 Switching to AI Receptionist...' };
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
    // 🚫 Usage limit gate — block free users who hit their limit
    if (usage.plan === 'free' && usage.used >= usage.limit) {
      setShowUpgradeModal(true);
      return;
    }
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
    // Deep research, market analysis, comprehensive reports → Kimi K2.6 (256K context, agent swarm)
    else if (/\b(deep\s*research|market\s*research|industry\s*analysis|competitor\s*report|comprehensive\s*analysis|detailed\s*report|research\s*report|thorough\s*analysis|full\s*analysis|in.?depth\s*research|market\s*study|trend\s*analysis|benchmark|due\s*diligence)\b/.test(pLower)) {
      activeModel = 'kimi';
      setModel('kimi');
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

    // 🛡️ AGENT OVERRIDE: These agents MUST stay on text — never image generation
    // flyer-maker and form-builder need GPT-4o (DeepSeek ignores HTML output instructions)
    // doc-summarizer is text-only, DeepSeek is fine
    // 🚀 PREMIUM ROUTING: Route all client-facing tools to GPT-4o for Fortune 500 quality
    const GPT4O_AGENTS = ['flyer-maker', 'certificate-maker', 'form-builder', 'business-plan', 'ad-maker', 'competitor-analysis', 'proposal-writer', 'contract-generator', 'seo-optimizer', 'idea-spark'];
    // Also route Action Plan requests (general agent but premium prompt) to GPT-4o
    if (activeAgentMode === 'general' && pLower.includes('action plan')) {
      activeModel = 'gpt-4o';
      setModel('gpt-4o');
    }
    if (GPT4O_AGENTS.includes(activeAgentMode)) {
      activeModel = 'gpt-4o';
      activeContentType = 'text';
      setModel('gpt-4o');
      setContentType('text');
    } else if (activeAgentMode === 'doc-summarizer') {
      activeModel = 'deepseek';
      activeContentType = 'text';
      setModel('deepseek');
      setContentType('text');
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
        systemPrefix = `You are NovaMind AI's ${personalTool.name} specialist — an expert who delivers detailed, practical, and immediately useful results.

## Your Standards
- Be specific and actionable — no generic or vague responses
- Structure your response with clear headers, bullet points, and organized sections
- Anticipate follow-up needs and address them proactively
- Add a pro tip or bonus insight at the end

## Quality Rules
1. Start with the most valuable content — skip generic introductions
2. Use **bold** for key terms, headers for sections, and bullet points for lists
3. Include specific examples, numbers, or recommendations — not just general advice
4. End with 2-3 clear next steps or actionable takeaways

## Tone
Warm, knowledgeable, and genuinely helpful — like a trusted expert friend who loves sharing their knowledge.`;
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
        systemPrefix = AGENT_SYSTEM_PROMPTS[activeAgentMode] + `\n\nIMPORTANT: Today's date is ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Always use current dates and the current year in your outputs.`;
        if (currentIndustry !== 'general') {
          systemPrefix += `\n\nThe user is in the ${industryObj?.name} industry. Tailor your analysis specifically for this industry.`;
        }
      } else if (currentIndustry !== 'general' && currentContentType === 'text') {
        systemPrefix = `You are NovaMind AI — a world-class expert specializing in the ${industryObj?.name} industry. Deliver content that ${industryObj?.name} professionals would pay a consultant for.

## Your Standards
- Every response must be specific to ${industryObj?.name} — use industry terminology, benchmarks, and best practices
- Structure responses with clear headers, actionable bullet points, and professional formatting
- Include real-world examples and specific recommendations
- Add industry-specific pro tips and common pitfalls to avoid
- End with clear, numbered next steps

Be the expert advisor they can't afford to hire — specific, actionable, and immediately useful.`;
      }

      // Personalize — address the user by name if available
      const firstName = user?.displayName?.split(' ')[0] || '';
      if (firstName) {
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `The user's name is ${firstName}. Address them by name naturally — use it in greetings, transitions, or when it feels conversational, but don't force it into every sentence.`;
      }


      // 🏢 BUSINESS PROFILE CONTEXT — personalize all AI responses
      if (businessProfile) {
        const bpLines = [
          businessProfile.businessName ? `Business: ${businessProfile.businessName}` : '',
          businessProfile.industry && businessProfile.industry !== 'general' ? `Industry: ${businessProfile.industry}` : '',
          businessProfile.location ? `Location: ${businessProfile.location}` : '',
          businessProfile.targetAudience ? `Target Audience: ${businessProfile.targetAudience}` : '',
          businessProfile.brandVoice ? `Brand Voice: ${businessProfile.brandVoice}` : '',
          businessProfile.services ? `Services/Products: ${businessProfile.services}` : '',
          businessProfile.uniqueValue ? `Unique Value: ${businessProfile.uniqueValue}` : '',
          businessProfile.website ? `Website: ${businessProfile.website}` : '',
          businessProfile.teamSize ? `Team Size: ${businessProfile.teamSize}` : '',
          businessProfile.socialMedia ? `Social Media: ${businessProfile.socialMedia}` : '',
        ].filter(Boolean).join('\n');
        if (bpLines) {
          systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
            `🏢 BUSINESS PROFILE — THIS IS YOUR #1 CONTEXT SOURCE. TREAT THIS AS YOUR CLIENT BRIEF.\n` +
            `Every single response MUST be deeply personalized to THIS business. You are their dedicated AI consultant.\n\n` +
            `MANDATORY PERSONALIZATION RULES:\n` +
            `- ALWAYS use their business name, industry, and services in your outputs — never use generic placeholders like "Your Company" or "[Business Name]"\n` +
            `- Write in their brand voice (formal, casual, bold, etc.) — match their tone exactly\n` +
            `- Reference their specific services/products, not generic ones\n` +
            `- Use their location for local marketing, local SEO, and event details\n` +
            `- Target their specific audience in all copy, ads, emails, and strategies\n` +
            `- For flyers, emails, proposals: auto-include their business name, phone, email, website, and address in contact sections\n` +
            `- For strategies and plans: make recommendations specific to their industry and market size\n` +
            `- If they have a website URL, reference it in CTAs and marketing materials\n` +
            `- NEVER produce generic output that could apply to any business — every word should feel custom-written FOR them\n\n` +
            `CLIENT PROFILE:\n${bpLines}`;
        }
      }

      // 📚 KNOWLEDGE HUB CONTEXT — inject uploaded documents for richer AI responses
      if (knowledgeDocs.length > 0) {
        const kbContext = knowledgeDocs.map(d => `[${d.name}]:\n${d.content}`).join('\n\n');
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `KNOWLEDGE HUB — The user has uploaded the following reference documents. Use this information to give more accurate, ` +
          `on-brand, contextually rich responses. Reference specific details from these docs when relevant:\n\n${kbContext}`;
      }

      // 🧠 SMART AI ONBOARDING — detect first interaction and guide the user
      const isFirstChat = updatedMessages.length <= 1;
      if (isFirstChat && (usage.used <= 2 || chatMessages.length === 0)) {
        const businessName = onboardingData.businessName || '';
        const userUses = onboardingData.primaryUse || [];
        systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
          `SMART ONBOARDING MODE: This appears to be one of the user's very first interactions with NovaMind. ` +
          `Your goal is to make this moment magical — make them feel like they just found exactly what they needed. ` +
          `DO NOT just answer their question plainly. Instead:\n` +
          `1. Warmly welcome them and acknowledge what they're asking for\n` +
          `2. Deliver an AMAZING first result that exceeds their expectations\n` +
          `3. After your result, naturally suggest a logical next step: "Want me to [related action]?" ` +
          `For example, if they ask about marketing, offer to draft their first social post or email campaign.\n` +
          `4. Keep the energy fun and encouraging — make them want to come back\n` +
          (businessName ? `Their business is called "${businessName}" — weave this into your response naturally.\n` : '') +
          (userUses.length > 0 ? `They're interested in: ${userUses.join(', ')} — prioritize these in your suggestions.\n` : '') +
          `Remember: This first interaction determines if they become a daily user or never return. Make it count!`;
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
      // === NOVAMIND QUALITY STANDARD ===
      systemPrefix = (systemPrefix ? systemPrefix + '\n\n' : '') +
        'IMPORTANT OUTPUT QUALITY STANDARD: Every response must be immediately usable — no placeholders like [insert X], no TODOs, no drafts. ' +
        'Use professional formatting with headers, bullets, and bold. Write with clear, confident, error-free language. ' +
        'Include all sections, examples, and details needed. Outputs should look impressive when shared. ' +
        'If asked for a document, email, plan, or deliverable, produce the FINAL polished version.';
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
      // 🎨 Inject smart prompt engineering for image generation
      let finalPrompt = currentPrompt;
      if (activeContentType === 'image' || activeModel === 'gpt-image-1') {
        // 🎨 LOGO MAKER — icon/symbol only, NO text in image
        if (activeAgentMode === 'logo-maker') {
          finalPrompt = `Professional brand logo icon design: ${currentPrompt}. CRITICAL RULES: This is a SYMBOL/ICON ONLY logo — absolutely NO text, NO letters, NO words, NO numbers, NO typography anywhere in the image. Create a clean, modern, scalable brand mark or symbol. Use bold shapes, clean geometry, and professional color palette. The icon should work at any size from favicon to billboard. Style: flat vector-style logo on a clean solid background. High contrast, sharp edges, premium brand quality. Think Apple logo, Nike swoosh, Twitter bird — iconic symbol only.`;
        } else {
          // Auto-detect style from prompt content
          const promptLower = currentPrompt.toLowerCase();
          let autoStyle = '';
          if (/luxury|premium|gold|elegant/i.test(promptLower)) autoStyle = 'Luxury style — gold accents, premium feel, elegant, sophisticated.';
          else if (/minimalist|simple|clean/i.test(promptLower)) autoStyle = 'Minimalist style — simple, modern, clean lines, elegant.';
          else if (/retro|vintage|classic/i.test(promptLower)) autoStyle = 'Vintage style — warm muted tones, nostalgic, classic.';
          else if (/neon|cyber|futuristic/i.test(promptLower)) autoStyle = 'Neon/cyberpunk style — vibrant glowing colors, futuristic.';
          else if (/fun|playful|bright|colorful/i.test(promptLower)) autoStyle = 'Playful style — bright vibrant colors, fun, energetic.';
          else autoStyle = 'Professional style — clean, polished, high-end commercial quality.';
          finalPrompt = currentPrompt + '\n\nStyle: ' + autoStyle;
        }
      }
      const res = await generateContent(finalPrompt, activeContentType, activeModel, systemPrefix || undefined, fileAttachments);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
      // Persist usage to Firestore
      if (user) { updateDoc(doc(db, 'users', user.uid), { monthlyUsage: increment(1), lastUsageAt: serverTimestamp() }).catch(() => {}); }
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
      // 🎯 Auto-complete missions based on tool used
      const missionMap: Record<string, string> = { 'email-assistant': 'first-email', 'flyer-maker': 'first-flyer', 'certificate-maker': 'first-cert', 'ad-maker': 'first-ad', 'competitor-analysis': 'competitor', 'business-plan': 'business-plan', 'sales-proposal': 'proposal' };
      if (missionMap[activeAgentMode]) completeMission(missionMap[activeAgentMode]);
      if (currentPrompt.includes('90-Day Action Plan') || currentPrompt.includes('action plan')) completeMission('action-plan');
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

  const handleDownload = async () => {
    if (!result?.imageUrl) return;
    try {
      const resp = await fetch(result.imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'novamind-creation.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab instead of navigating away
      window.open(result.imageUrl, '_blank');
    }
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
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `novamind-creation-${Date.now()}.webp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
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
      <div className="app-container" data-theme={theme}>
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
                <span onClick={handleResetPassword} style={{ color: 'var(--accent, #a855f7)', fontSize: '14px', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>Forgot Password?</span>
              </p>
            )}
            {resetSent && <p style={{ color: '#4ade80', fontSize: '14px', margin: 0, textAlign: 'center', padding: '12px', background: 'rgba(74,222,128,0.1)', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.3)' }}>✅ Password reset email sent! Check your inbox (and spam/junk folder).</p>}
            <button className="generate-btn" onClick={handleAuth}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary, #5a5680)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
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
            {/* 🏢 Agency Waitlist */}
            <div style={{ marginTop: '28px', padding: '20px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(99,102,241,0.08) 50%, rgba(168,85,247,0.08) 100%)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1', letterSpacing: '1px', marginBottom: '6px' }}>COMING SOON</div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>🏢 NovaMind for Agencies</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 14px', lineHeight: '1.5' }}>
                  White-label NovaMind under your brand. Your logo, your domain, your clients — powered by our AI.
                </p>
                {agencySubmitted ? (
                  <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>
                    ✅ You're on the list! We'll reach out soon.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="auth-input" type="email" placeholder="agency@email.com" value={agencyEmail} onChange={e => setAgencyEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitAgencyWaitlist()} style={{ margin: 0, flex: 1, fontSize: '13px' }} />
                    <button onClick={submitAgencyWaitlist} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>Join Waitlist</button>
                  </div>
                )}
              </div>
            </div>

            <div className="powered-footer" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span>© 2026 A Product of The PIE Group</span> · <a href="mailto:admin@piegroup.org">admin@piegroup.org</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.min((usage.used / usage.limit) * 100, 100);
  const currentAgent = AGENTS.find(a => a.id === agentMode);
  const filteredHistory = history.filter(h => {
    if (historyFilter === 'favorites' && !h.isFavorite) return false;
    if (galleryAgentFilter && h.agentMode !== galleryAgentFilter) return false;
    return true;
  });
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
        :root, [data-theme="light"] {
          --bg-primary: #fafaff;
          --bg-secondary: #f0eef9;
          --bg-tertiary: #e8e5f5;
          --text-primary: #1a1a2e;
          --text-secondary: #5a5680;
          --surface: #ffffff;
          --border-color: #e0ddf0;
          --primary: #6c63ff;
          --primary-hover: #5b52ee;
          --accent: #06b6d4;
          --gradient-hero: linear-gradient(135deg, #6c63ff 0%, #06b6d4 100%);
          --glass-bg: rgba(255, 255, 255, 0.8);
          --glass-border: rgba(108, 99, 255, 0.12);
          --card-shadow: 0 4px 20px rgba(108, 99, 255, 0.08);
          --glow-primary: 0 0 20px rgba(108, 99, 255, 0.12);
          /* Enterprise Design Tokens */
          --ent-primary-900: #0A1628;
          --ent-primary-700: #1A2B4C;
          --ent-primary-600: #2A3F6A;
          --ent-primary-200: #B8CCE6;
          --ent-primary-100: #E4EDF7;
          --ent-accent-600: #006666;
          --ent-accent-500: #008080;
          --ent-accent-100: #CCF0F0;
          --ent-success: #2E7D32;
          --ent-warning: #F57C00;
          --ent-error: #C62828;
          --ent-sidebar-w: 260px;
          --ent-topbar-h: 52px;
          --ent-radius-lg: 8px;
          --ent-shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
          --ent-shadow-md: 0 4px 12px rgba(0,0,0,0.10);
        }
        [data-theme="dark"] {
          --bg-primary: #0a0a1a; --bg-secondary: #12122a; --bg-tertiary: #1a1a3e;
          --text-primary: #f0f0ff; --text-secondary: #a0a0c0;
          --surface: #12122a; --border-color: rgba(108,99,255,0.2);
          --primary: #6c63ff; --primary-hover: #7b73ff;
          --accent: #00d4ff; --gradient-hero: linear-gradient(135deg, #6c63ff 0%, #00d4ff 100%);
          --glass-bg: rgba(18, 18, 42, 0.85); --glass-border: rgba(108, 99, 255, 0.15);
          --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); --glow-primary: 0 0 20px rgba(108, 99, 255, 0.3);
        }
        .app-container { background: linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-tertiary) 100%); color: var(--text-primary); min-height: 100vh; transition: background 0.3s ease, color 0.3s ease; }
        [data-theme="light"] .app-container { background: linear-gradient(180deg, #fafaff 0%, #f0eef9 50%, #e8e5f5 100%); color: #1a1a2e; }
        [data-theme="dark"] .app-container { background: linear-gradient(180deg, #0a0a1a 0%, #12122a 50%, #1a1a3e 100%); color: #f0f0ff; }
        [data-theme="light"] .navbar { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(108,99,255,0.1); box-shadow: 0 2px 12px rgba(108,99,255,0.06); }
        [data-theme="light"] .bottom-nav { background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); border-top: 1px solid rgba(108,99,255,0.1); box-shadow: 0 -2px 12px rgba(108,99,255,0.06); }
        [data-theme="light"] .auth-input, [data-theme="light"] .prompt-input { background: #fff; border-color: #e0ddf0; color: #1a1a2e; box-shadow: 0 2px 8px rgba(108,99,255,0.04); }
        [data-theme="light"] .auth-input:focus, [data-theme="light"] .prompt-input:focus { border-color: #6c63ff; box-shadow: 0 0 0 3px rgba(108,99,255,0.1); }
        [data-theme="light"] .stat-card { background: #fff; border: 1px solid rgba(108,99,255,0.1); box-shadow: 0 2px 12px rgba(108,99,255,0.06); }
        [data-theme="light"] .tool-card, [data-theme="light"] .gallery-card { background: #fff; border: 1px solid rgba(108,99,255,0.1); box-shadow: 0 2px 12px rgba(108,99,255,0.06); transition: all 0.25s ease; }
        [data-theme="light"] .tool-card:hover, [data-theme="light"] .gallery-card:hover { border-color: #6c63ff; box-shadow: 0 6px 24px rgba(108,99,255,0.12); transform: translateY(-2px); }
        [data-theme="light"] .suggestion-chip { background: #fff; border: 1px solid rgba(108,99,255,0.12); color: #1a1a2e; }
        [data-theme="light"] .suggestion-chip:hover { border-color: #6c63ff; background: rgba(108,99,255,0.04); }
        [data-theme="light"] .industry-chip { background: rgba(108,99,255,0.04); border-color: rgba(108,99,255,0.12); color: #1a1a2e; }
        [data-theme="light"] .industry-chip.active { background: rgba(108,99,255,0.12); border-color: #6c63ff; color: #6c63ff; }
        [data-theme="light"] .model-chip { background: rgba(108,99,255,0.04); color: #1a1a2e; }
        [data-theme="light"] .result-container { background: #fff; border: 1px solid rgba(108,99,255,0.1); box-shadow: 0 4px 16px rgba(108,99,255,0.06); }
        [data-theme="light"] .agent-info-banner { background: linear-gradient(135deg, rgba(108,99,255,0.05), rgba(6,182,212,0.05)); border-color: rgba(108,99,255,0.12); }
        [data-theme="light"] .auth-modal { background: #fff; color: #1a1a2e; box-shadow: 0 20px 60px rgba(108,99,255,0.15); }
        [data-theme="light"] .empty-state { color: #5a5680; }
        [data-theme="light"] .hero-section { background: linear-gradient(135deg, rgba(108,99,255,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(168,85,247,0.06) 100%); border-radius: 16px; }
        [data-theme="light"] .hero-title { color: #1a1a2e !important; }
        [data-theme="light"] .hero-subtitle { color: #5a5680 !important; }
        [data-theme="light"] .section-title { color: #1a1a2e; }
        [data-theme="light"] .powered-footer { color: #5a5680; }
        [data-theme="light"] .powered-footer a { color: #6c63ff; }
        [data-theme="light"] .navbar .logo-text { color: #1a1a2e !important; }
        [data-theme="light"] .chat-card, [data-theme="light"] .history-card { background: #fff; border: 1px solid rgba(108,99,255,0.1); box-shadow: 0 2px 12px rgba(108,99,255,0.06); }
        [data-theme="light"] .chat-card:hover, [data-theme="light"] .history-card:hover { border-color: #6c63ff; box-shadow: 0 6px 24px rgba(108,99,255,0.12); }
        [data-theme="light"] .usage-bar { background: rgba(108,99,255,0.08); }
        [data-theme="light"] .prompt-input::placeholder { color: #9890b8; }
        [data-theme="light"] .bottom-nav button { color: #5a5680; }
        [data-theme="light"] .bottom-nav button.active { color: #6c63ff; }
        [data-theme="light"] .agent-card { background: #fff; border: 1px solid rgba(108,99,255,0.1); color: #1a1a2e; box-shadow: 0 2px 12px rgba(108,99,255,0.06); transition: all 0.25s ease; }
        [data-theme="light"] .agent-card:hover { border-color: #6c63ff; box-shadow: 0 6px 24px rgba(108,99,255,0.15); transform: translateY(-2px); }
        [data-theme="light"] .agent-card .agent-name { color: #1a1a2e; }
        [data-theme="light"] .agent-card .agent-desc { color: #5a5680; }
        [data-theme="light"] .result-container pre { background: rgba(108,99,255,0.04); color: #1a1a2e; border: 1px solid rgba(108,99,255,0.08); }
        [data-theme="light"] .onboarding-modal { background: #fff; color: #1a1a2e; }
        [data-theme="light"] .generate-btn { box-shadow: 0 4px 16px rgba(108,99,255,0.25); }
        [data-theme="light"] .generate-btn:hover { box-shadow: 0 6px 24px rgba(108,99,255,0.35); transform: translateY(-1px); }
        [data-theme="light"] .agent-tab { color: #5a5680; }
        [data-theme="light"] .agent-tab.active { color: #6c63ff; background: rgba(108,99,255,0.08); }
        [data-theme="light"] .agent-selector-bar { background: rgba(255,255,255,0.8); border-bottom: 1px solid rgba(108,99,255,0.08); }
        /* === DARK MODE explicit fixes === */
        [data-theme="dark"] .result-container { background: rgba(18,18,42,0.95); color: #f0f0ff; border: 1px solid rgba(108,99,255,0.2); }
        [data-theme="dark"] .result-area { color: #f0f0ff; }
        [data-theme="dark"] .markdown-content { color: #f0f0ff !important; }
        [data-theme="dark"] .markdown-content h1, [data-theme="dark"] .markdown-content h2, [data-theme="dark"] .markdown-content h3 { color: #fff !important; }
        [data-theme="dark"] .markdown-content strong { color: #fff !important; }
        [data-theme="dark"] .markdown-content em { color: #e0e0ff !important; }
        [data-theme="dark"] .markdown-content code { background: rgba(108,99,255,0.2) !important; color: #a8a0ff !important; }
        [data-theme="dark"] .markdown-content pre { background: rgba(0,0,0,0.3) !important; color: #f0f0ff !important; border: 1px solid rgba(108,99,255,0.2) !important; }
        [data-theme="dark"] .markdown-content a { color: #00d4ff !important; }
        [data-theme="dark"] .markdown-content blockquote { border-left-color: #6c63ff !important; color: #c0c0e0 !important; }
        [data-theme="dark"] .markdown-content li { color: #f0f0ff !important; }
        [data-theme="dark"] .markdown-content p { color: #f0f0ff !important; }
        [data-theme="dark"] .chat-bubble-assistant { background: rgba(108,99,255,0.12) !important; color: #f0f0ff !important; border: 1px solid rgba(108,99,255,0.25) !important; }
        [data-theme="dark"] .chat-bubble-assistant.question { background: rgba(108,99,255,0.18) !important; border: 1px solid rgba(108,99,255,0.35) !important; }
        [data-theme="dark"] .chat-bubble-user { background: var(--primary, #6c63ff) !important; color: #fff !important; }
        [data-theme="dark"] .chat-msg-label { color: rgba(255,255,255,0.65) !important; }
        [data-theme="dark"] .chat-action-btn { background: rgba(255,255,255,0.1) !important; color: rgba(255,255,255,0.8) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
        [data-theme="dark"] .chat-img-caption { color: rgba(255,255,255,0.75) !important; }
        [data-theme="dark"] .chat-share-menu { background: #1a1a3e !important; border: 1px solid rgba(108,99,255,0.3) !important; }
        [data-theme="dark"] .result-container pre { background: rgba(0,0,0,0.3) !important; color: #f0f0ff !important; border: 1px solid rgba(108,99,255,0.15) !important; }
        /* Light mode chat & inline element fixes */
        [data-theme="light"] .chat-msg-label { color: rgba(0,0,0,0.45) !important; }
        [data-theme="light"] .chat-bubble-assistant { background: rgba(108,99,255,0.06) !important; color: #1a1a2e !important; border: 1px solid rgba(108,99,255,0.12) !important; }
        [data-theme="light"] .chat-bubble-assistant.question { background: rgba(108,99,255,0.1) !important; border: 1px solid rgba(108,99,255,0.25) !important; }
        [data-theme="light"] .chat-bubble-user { background: var(--primary, #6c63ff) !important; color: #fff !important; }
        [data-theme="light"] .chat-bubble-error { background: rgba(255,80,80,0.08) !important; color: #1a1a2e !important; border: 1px solid rgba(255,80,80,0.25) !important; }
        [data-theme="light"] .chat-action-btn { background: rgba(108,99,255,0.06) !important; color: #5a5680 !important; border: 1px solid rgba(108,99,255,0.15) !important; }
        [data-theme="light"] .chat-action-btn:hover { background: rgba(108,99,255,0.12) !important; color: #6c63ff !important; }
        [data-theme="light"] .chat-share-btn { background: rgba(108,99,255,0.1) !important; color: #6c63ff !important; border: 1px solid rgba(108,99,255,0.25) !important; }
        [data-theme="light"] .chat-img-caption { color: #5a5680 !important; }
        [data-theme="light"] .chat-share-menu { background: #fff !important; border: 1px solid rgba(108,99,255,0.15) !important; box-shadow: 0 8px 32px rgba(108,99,255,0.12) !important; }
        [data-theme="light"] .markdown-content { color: #1a1a2e !important; }
        [data-theme="light"] .markdown-content h1, [data-theme="light"] .markdown-content h2, [data-theme="light"] .markdown-content h3 { color: #1a1a2e !important; }
        [data-theme="light"] .markdown-content code { background: rgba(108,99,255,0.06) !important; color: #6c63ff !important; }
        [data-theme="light"] .markdown-content pre { background: rgba(108,99,255,0.04) !important; color: #1a1a2e !important; border: 1px solid rgba(108,99,255,0.1) !important; }
        [data-theme="light"] .markdown-content a { color: #6c63ff !important; }
        [data-theme="light"] .markdown-content blockquote { border-left-color: #6c63ff !important; color: #5a5680 !important; }
        [data-theme="light"] .markdown-content li::marker { color: #6c63ff !important; }
        [data-theme="light"] .powered-footer { color: #5a5680 !important; }
        [data-theme="light"] .powered-footer a { color: #6c63ff !important; }
        [data-theme="light"] .auth-error { color: #dc2626 !important; }
        [data-theme="light"] .chat-typing-indicator { color: #5a5680 !important; }
        [data-theme="light"] .error-retry-btn { background: var(--primary, #6c63ff) !important; color: #fff !important; }
        [data-theme="light"] .result-container { background: #fff !important; color: #1a1a2e !important; border: 1px solid rgba(108,99,255,0.12) !important; }
        [data-theme="light"] .left-sidebar { background: rgba(255,255,255,0.8) !important; border-right: 1px solid rgba(108,99,255,0.1) !important; }


        /* Enterprise Left Sidebar */
        .app-layout { display: grid; grid-template-columns: var(--ent-sidebar-w) 1fr; min-height: calc(100vh - 56px - 56px); }
        .left-sidebar {
          width: var(--ent-sidebar-w); min-width: var(--ent-sidebar-w); max-height: calc(100vh - 56px - 56px); overflow-y: auto;
          background: var(--surface); border-right: 1px solid var(--border-color);
          padding: 16px 12px; display: flex; flex-direction: column; gap: 2px;
          scrollbar-width: thin;
        }
        .left-sidebar::-webkit-scrollbar { width: 4px; }
        .left-sidebar::-webkit-scrollbar-thumb { background: rgba(108,99,255,0.2); border-radius: 4px; }
        .sidebar-section-label {
          font-size: 0.7rem; font-weight: 750; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-secondary); padding: 16px 12px 6px; margin: 0;
        }
        .sidebar-section-label:first-child { padding-top: 4px; }
        .sidebar-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--ent-radius-lg);
          cursor: pointer; border: 1px solid transparent; background: transparent; text-align: left; width: 100%;
          font-size: 0.875rem; font-weight: 500; color: var(--text-primary); transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
          position: relative;
        }
        .sidebar-item:hover { background: var(--ent-primary-100, rgba(108,99,255,0.06)); border-color: var(--border-color); color: var(--primary); }
        .sidebar-item.active { background: var(--ent-primary-100, rgba(108,99,255,0.1)); border-color: var(--ent-primary-200, rgba(108,99,255,0.2)); color: var(--primary); font-weight: 600; }
        .sidebar-item.active::before {
          content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
          width: 3px; height: 20px; border-radius: 0 3px 3px 0; background: var(--primary);
        }
        .sidebar-item-icon {
          width: 28px; height: 28px; display: inline-grid; place-items: center;
          border-radius: 6px; background: var(--ent-primary-100, rgba(108,99,255,0.06));
          border: 1px solid var(--border-color); font-size: 14px; flex-shrink: 0;
        }
        .sidebar-item-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebar-item-badge {
          font-size: 8px; font-weight: 700; padding: 2px 7px; border-radius: 8px;
          background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #fff; margin-left: auto; flex-shrink: 0;
        }
        .sidebar-item.coming-soon {
          opacity: 0.5; cursor: default;
        }
        .sidebar-item.coming-soon:hover { background: transparent; border-color: transparent; transform: none; }
        .sidebar-item.coming-soon .sidebar-item-badge {
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
        }
        .sidebar-divider { height: 1px; background: var(--border-color); margin: 8px 10px; }
        .sidebar-toggle {
          display: none; position: fixed; left: 12px; bottom: 72px; z-index: 1001;
          background: var(--primary); color: #fff; border: none; border-radius: 50%;
          width: 44px; height: 44px; font-size: 20px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(108,99,255,0.4); transition: transform 0.2s;
        }
        .sidebar-toggle:hover { transform: scale(1.1); }
        .main-content-area { flex: 1; min-width: 0; overflow-y: auto; }
        .sidebar-agents-toggle {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--ent-radius-lg);
          cursor: pointer; border: 1px solid transparent; background: transparent; text-align: left; width: 100%;
          font-size: 0.875rem; font-weight: 500; color: var(--text-primary); transition: all 150ms ease;
        }
        .sidebar-agents-toggle:hover { background: var(--ent-primary-100, rgba(108,99,255,0.06)); }
        .sidebar-agents-toggle .toggle-arrow { transition: transform 0.2s; font-size: 10px; margin-left: auto; color: var(--text-secondary); }
        .sidebar-agents-toggle .toggle-arrow.open { transform: rotate(90deg); }
        .sidebar-agents-list { overflow: hidden; transition: max-height 0.3s ease; }
        .sidebar-agents-list .sidebar-item { padding-left: 20px; font-size: 0.8rem; }
        [data-theme="light"] .left-sidebar { background: #fff; border-right: 1px solid var(--border-color); }
        [data-theme="light"] .sidebar-item:hover { background: rgba(108,99,255,0.04); }
        [data-theme="light"] .sidebar-item.active { background: rgba(108,99,255,0.08); }
        [data-theme="dark"] .sidebar-item-icon { background: rgba(108,99,255,0.1); border-color: rgba(108,99,255,0.2); }
        /* Enterprise Coming Soon View */
        .ent-coming-soon-view {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 60vh; text-align: center; padding: 40px 20px;
        }
        .ent-coming-soon-view .ent-icon { font-size: 56px; margin-bottom: 16px; }
        .ent-coming-soon-view h2 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .ent-coming-soon-view .ent-desc { color: var(--text-secondary); font-size: 0.95rem; max-width: 420px; line-height: 1.6; margin-bottom: 24px; }
        .ent-coming-soon-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #fff; font-weight: 700; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .ent-features-preview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 32px; max-width: 700px; width: 100%; }
        .ent-feature-card { background: var(--surface); border: 1px solid var(--border-color); border-radius: var(--ent-radius-lg); padding: 20px; text-align: left; }
        .ent-feature-card .feat-icon { font-size: 24px; margin-bottom: 8px; }
        .ent-feature-card h4 { font-size: 0.9rem; font-weight: 650; color: var(--text-primary); margin: 0 0 4px 0; }
        .ent-feature-card p { font-size: 0.8rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        @media (max-width: 768px) {
          .app-layout { display: block; grid-template-columns: 1fr; }
          .left-sidebar {
            position: fixed; left: -280px; top: 56px; bottom: 56px; z-index: 1000;
            width: 260px; min-width: 260px; transition: left 0.3s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.3);
          }
          .left-sidebar.open { left: 0; }
          .sidebar-toggle { display: flex; align-items: center; justify-content: center; }
          .sidebar-overlay {
            position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,0.4);
            backdrop-filter: blur(2px);
          }
        }

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
          <button onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t.lightMode : t.darkMode} style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.12)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px', cursor: 'pointer', color: theme === 'dark' ? '#fff' : '#212529' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (Ctrl+K)" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.06)', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(108,99,255,0.12)', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', color: theme === 'dark' ? '#fff' : '#5a5680' }}>⌨️</button>
          <button onClick={openProfileModal} title="Business Profile & Team" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.06)', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(108,99,255,0.12)', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', color: theme === 'dark' ? '#fff' : '#5a5680', position: 'relative' as const }}>{businessProfile?.businessName ? '🏢' : '🏢'}{!businessProfile?.businessName && <span style={{ position: 'absolute' as const, top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />}</button>
          <button className="nav-btn btn-outline" onClick={handleChangePassword} title="Change your password" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.06)', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(108,99,255,0.12)', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', color: theme === 'dark' ? '#fff' : '#5a5680' }}>🔑</button>
          <button className="nav-btn btn-outline" onClick={handleSignOut} style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.06)', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(108,99,255,0.15)', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: theme === 'dark' ? '#fff' : '#1a1a2e' }}>🚪 {t.signOut}</button>
        </div>
      </nav>
      {isOffline && (
        <div className="offline-banner" style={{ background: '#ef4444', color: '#fff', padding: '8px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
          ⚠️ {t.offline}
        </div>
      )}
      {passwordResetMsg && (
        <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '12px 20px', textAlign: 'center', fontSize: '14px', fontWeight: 600, borderRadius: '0 0 12px 12px', margin: '0 20px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', animation: 'fadeIn 0.3s ease' }}>
          ✅ {passwordResetMsg}
        </div>
      )}
      <div className="app-layout">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        {/* Enterprise Left Sidebar */}
        <aside className={`left-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <p className="sidebar-section-label">Primary</p>
          {([
            { id: 'home' as Tab, icon: '▦', name: 'Dashboard' },
            { id: 'create' as Tab, icon: '◎', name: 'AI Studio' },
            { id: 'crm' as Tab, icon: '📇', name: 'CRM', comingSoon: !['solopreneur','team','business','business_pro'].includes(usage.plan) },
            { id: 'projects' as Tab, icon: '📋', name: 'Projects', comingSoon: !['solopreneur','team','business','business_pro'].includes(usage.plan) },
            { id: 'inbox' as Tab, icon: '✉', name: 'Inbox', comingSoon: true },
          ] as const).map(item => (
            <button key={item.id} className={`sidebar-item ${tab === item.id ? 'active' : ''} ${'comingSoon' in item && item.comingSoon ? 'coming-soon' : ''}`}
              onClick={() => { if (!('comingSoon' in item && item.comingSoon)) { switchTab(item.id as Tab); setSidebarOpen(false); } }}>
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-name">{item.name}</span>
              {'comingSoon' in item && item.comingSoon && <span className="sidebar-item-badge">SOON</span>}
            </button>
          ))}

          <div className="sidebar-divider" />
          <p className="sidebar-section-label">Tools & Content</p>
          {/* Expandable AI Agents */}
          <button className="sidebar-agents-toggle" onClick={() => setSidebarOpen(prev => prev)}>
            <span className="sidebar-item-icon">🤖</span>
            <span className="sidebar-item-name">AI Agents</span>
            <span className="sidebar-item-badge" style={{ background: 'var(--primary)' }}>{AGENTS.length}</span>
          </button>
          <div className="sidebar-agents-list" style={{ maxHeight: tab === 'create' ? '500px' : '0px', paddingLeft: '8px' }}>
            {AGENTS.map(agent => (
              <button key={agent.id} className={`sidebar-item ${agentMode === agent.id && tab === 'create' ? 'active' : ''}`}
                onClick={() => { selectAgent(agent.id); setSidebarOpen(false); }}>
                <span className="sidebar-item-icon">{agent.icon}</span>
                <span className="sidebar-item-name">{agent.name}</span>
                {agent.badge && <span className="sidebar-item-badge">{agent.badge}</span>}
              </button>
            ))}
          </div>
          <button className={`sidebar-item ${tab === 'gallery' ? 'active' : ''}`}
            onClick={() => { switchTab('gallery'); setSidebarOpen(false); }}>
            <span className="sidebar-item-icon">🖼️</span>
            <span className="sidebar-item-name">Gallery</span>
          </button>
          <button className={`sidebar-item ${tab === 'chats' ? 'active' : ''}`}
            onClick={() => { switchTab('chats'); setSidebarOpen(false); }}>
            <span className="sidebar-item-icon">💬</span>
            <span className="sidebar-item-name">Chat History</span>
          </button>
          <button className={`sidebar-item ${tab === 'templates' ? 'active' : ''} coming-soon`}>
            <span className="sidebar-item-icon">▧</span>
            <span className="sidebar-item-name">Templates</span>
            <span className="sidebar-item-badge">SOON</span>
          </button>

          <div className="sidebar-divider" />
          <p className="sidebar-section-label">Insights</p>
          <button className={`sidebar-item ${tab === 'analytics' ? 'active' : ''} coming-soon`}>
            <span className="sidebar-item-icon">📈</span>
            <span className="sidebar-item-name">Analytics</span>
            <span className="sidebar-item-badge">SOON</span>
          </button>
          <button className={`sidebar-item ${tab === 'integrations' ? 'active' : ''} coming-soon`}>
            <span className="sidebar-item-icon">⛓</span>
            <span className="sidebar-item-name">Integrations</span>
            <span className="sidebar-item-badge">SOON</span>
          </button>

          <div className="sidebar-divider" />
          <p className="sidebar-section-label">Account</p>
          <button className="sidebar-item" onClick={() => { openProfileModal(); setSidebarOpen(false); }}>
            <span className="sidebar-item-icon">🏢</span>
            <span className="sidebar-item-name">Business Profile</span>
            {!businessProfile?.businessName && <span className="sidebar-item-badge" style={{ background: '#ef4444' }}>SET UP</span>}
          </button>
          <button className="sidebar-item" onClick={() => { setProfileTab('team'); setShowProfileModal(true); setSidebarOpen(false); }}>
            <span className="sidebar-item-icon">👥</span>
            <span className="sidebar-item-name">Team</span>
            {teamMembers.length > 0 && <span className="sidebar-item-badge" style={{ background: '#22c55e' }}>{teamMembers.length}</span>}
          </button>

          <div style={{ flex: 1 }} />
          <div className="sidebar-divider" />
          <div style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>NovaMind AI Hub</div>
            <div>Enterprise Operations Platform</div>
          </div>
        </aside>
        {/* Mobile sidebar toggle */}
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
          {sidebarOpen ? '✕' : '☰'}
        </button>
      <div className="main-content-area">
      <div className="main-content">
        {showWhatsNew && user && (
          <div style={{
            background: 'linear-gradient(135deg, #1A2B4C 0%, #008080 100%)',
            borderRadius: '12px', padding: '16px 20px', margin: '0 0 16px 0',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            boxShadow: '0 4px 15px rgba(0,128,128,0.3)', position: 'relative',
          }}>
            <div style={{ fontSize: '28px', lineHeight: 1 }}>🚀</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', marginBottom: '6px' }}>
                NovaMind Just Got a Fresh New Look!
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                ✨ Beautiful new design &nbsp;·&nbsp; ⚡ Polished AI outputs &nbsp;·&nbsp; 🖼️ Simplified Logo Maker &nbsp;·&nbsp; 🤖 AI Receptionist
              </div>
            </div>
            <button onClick={dismissWhatsNew} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
              width: '28px', height: '28px', color: '#fff', fontSize: '16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }} aria-label="Dismiss">✕</button>
          </div>
        )}
        {tab === 'home' && isPersonalMode && (
          <>
            <div className="hero-section" style={{ textAlign: 'center', padding: '20px 0' }}>
              <h1 className="hero-title" style={{ fontSize: '1.6rem' }}>{user?.displayName ? `Hey ${user.displayName.split(' ')[0]}! 🛠️` : 'Your AI Toolkit 🛠️'}</h1>
              <p className="hero-subtitle">{user?.displayName ? '12 tools designed for real life — what are we making today?' : '12 tools designed for real life — not enterprise jargon.'}</p>
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
                    opacity: 0.45, fontSize: '12px', color: 'var(--text-secondary, #888)',
                    whiteSpace: 'nowrap' as const,
                    filter: 'grayscale(0.8)',
                  }}>
                    <span style={{ fontSize: '16px' }}>{feature.icon}</span>
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="powered-footer">
              <span>© 2026 A Product of The PIE Group</span> · <a href="mailto:admin@piegroup.org">admin@piegroup.org</a>
            </div>
          </>
        )}
        {tab === 'home' && !isPersonalMode && (<>
          <div className="hero-section">
            <h1 className="hero-title">{user?.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}! ✨` : 'Create Amazing Content with AI'}</h1>
            <p className="hero-subtitle">{user?.displayName ? `What can I help you with today?` : 'Content, emails, images and more — powered by premium AI at a fraction of the cost.'}</p>
            <button className="nav-btn btn-primary btn-lg" onClick={() => switchTab('create')}>Start Creating</button>
          </div>

          {/* 📊 AI ROI COCKPIT */}
          <div style={{
            borderRadius: '20px', overflow: 'hidden', marginBottom: '28px',
            background: 'linear-gradient(135deg, rgba(108,99,255,0.06) 0%, rgba(6,182,212,0.04) 50%, rgba(168,85,247,0.06) 100%)',
            border: '1px solid rgba(108,99,255,0.15)',
          }}>
            {/* Cockpit Header */}
            <div style={{
              padding: '20px 20px 16px',
              background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(6,182,212,0.08))',
              borderBottom: '1px solid rgba(108,99,255,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #6c63ff, #06b6d4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', flexShrink: 0,
                    boxShadow: '0 4px 16px rgba(108,99,255,0.35)',
                  }}>📊</div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, background: 'linear-gradient(135deg, #6c63ff, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      AI ROI Cockpit
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Your business intelligence dashboard — powered by AI
                    </p>
                  </div>
                </div>
                {/* AI Impact Score Ring */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    position: 'relative' as const, width: '56px', height: '56px',
                  }}>
                    <svg viewBox="0 0 36 36" style={{ width: '56px', height: '56px', transform: 'rotate(-90deg)' }}>
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(108,99,255,0.15)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#scoreGrad)" strokeWidth="3" strokeDasharray={`${growthScore * 0.975} 100`} strokeLinecap="round" />
                      <defs><linearGradient id="scoreGrad"><stop offset="0%" stopColor="#6c63ff"/><stop offset="100%" stopColor="#06b6d4"/></linearGradient></defs>
                    </svg>
                    <div style={{ position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '15px', fontWeight: 800, color: 'var(--primary, #6c63ff)' }}>{growthScore}</div>
                  </div>
                  <div style={{ textAlign: 'left' as const }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Impact Score</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{completedMissions.length} of {MISSIONS.length} milestones</div>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Cards — 2x2 Grid */}
            <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {/* Hours Saved */}
              <div style={{
                borderRadius: '14px', padding: '16px',
                background: 'linear-gradient(135deg, rgba(108,99,255,0.10), rgba(108,99,255,0.02))',
                border: '1px solid rgba(108,99,255,0.18)',
                transition: 'all 0.3s ease', cursor: 'default',
              }} onMouseEnter={(e: any) => e.currentTarget.style.transform = 'scale(1.03)'}
                 onMouseLeave={(e: any) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>⏱️</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#6c63ff', lineHeight: 1.1 }}>{hoursEstSaved} hrs</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Time back in your day</div>
              </div>
              {/* Value Created */}
              <div style={{
                borderRadius: '14px', padding: '16px',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.02))',
                border: '1px solid rgba(34,197,94,0.18)',
                transition: 'all 0.3s ease', cursor: 'default',
              }} onMouseEnter={(e: any) => e.currentTarget.style.transform = 'scale(1.03)'}
                 onMouseLeave={(e: any) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>💰</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#22c55e', lineHeight: 1.1 }}>${dollarValueCreated.toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Equivalent freelancer cost</div>
              </div>
              {/* Tools Replaced */}
              <div style={{
                borderRadius: '14px', padding: '16px',
                background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(6,182,212,0.02))',
                border: '1px solid rgba(6,182,212,0.18)',
                transition: 'all 0.3s ease', cursor: 'default',
              }} onMouseEnter={(e: any) => e.currentTarget.style.transform = 'scale(1.03)'}
                 onMouseLeave={(e: any) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔧</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#06b6d4', lineHeight: 1.1 }}>{toolsReplacedCount} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>of 11</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>vs. paying for each separately</div>
              </div>
              {/* ROI Score */}
              <div style={{
                borderRadius: '14px', padding: '16px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))',
                border: '1px solid rgba(245,158,11,0.18)',
                transition: 'all 0.3s ease', cursor: 'default',
              }} onMouseEnter={(e: any) => e.currentTarget.style.transform = 'scale(1.03)'}
                 onMouseLeave={(e: any) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>📈</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', lineHeight: 1.1 }}>{usage.plan !== 'free' ? `${Math.round((dollarValueCreated / (usage.plan === 'solopreneur' ? 49 : 149)) * 100) / 100}x` : '∞'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Return on your investment</div>
              </div>
            </div>

            {/* Usage Bar + Stats */}
            <div style={{ padding: '16px' }}>
              {/* Usage Bar */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Monthly Usage</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{usage.used}/{usage.plan === 'business' || usage.plan === 'solopreneur' || usage.plan === 'team' || usage.plan === 'business_pro' ? '∞' : usage.limit}</span>
                </div>
                <div style={{ width: '100%', height: '10px', borderRadius: '999px', background: 'rgba(108,99,255,0.10)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: '999px',
                    background: pct >= 100 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : pct > 80 ? 'linear-gradient(90deg, #f59e0b, #fb923c)' : 'linear-gradient(90deg, #6c63ff, #06b6d4)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              {/* Upgrade nudges for free users */}
              {usage.plan === 'free' && pct >= 80 && pct < 100 && (
                <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08))', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setShowUpgradeModal(true)}>
                  <span style={{ fontSize: '20px' }}>⚡</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>Only <strong>{usage.limit - usage.used}</strong> generations left this month! <span style={{ color: 'var(--primary, #6c63ff)', fontWeight: 700, textDecoration: 'underline' }}>Upgrade for unlimited →</span></span>
                </div>
              )}
              {usage.plan === 'free' && pct >= 100 && (
                <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setShowUpgradeModal(true)}>
                  <span style={{ fontSize: '20px' }}>🚀</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>You&apos;ve used all free generations! <span style={{ color: 'var(--primary, #6c63ff)', fontWeight: 700, textDecoration: 'underline' }}>Unlock unlimited access →</span></span>
                </div>
              )}
              {/* Stats Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div style={{ textAlign: 'center' as const, padding: '12px 8px', borderRadius: '12px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.12)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary, #6c63ff)' }}>{usage.used}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.totalGenerations}</div>
                </div>
                <div style={{ textAlign: 'center' as const, padding: '12px 8px', borderRadius: '12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#22c55e' }}>{history.filter(h => h.contentType === 'text').length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.textGens}</div>
                </div>
                <div style={{ textAlign: 'center' as const, padding: '12px 8px', borderRadius: '12px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#a855f7' }}>{history.filter(h => h.contentType === 'image' || h.model === 'gpt-image-1').length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.imageGens}</div>
                </div>
              </div>
            </div>

            {/* ROI Milestones — collapsible */}
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{
                borderRadius: '14px', overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(108,99,255,0.12)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', cursor: 'pointer',
                  background: 'rgba(108,99,255,0.04)',
                }} onClick={() => setShowMilestones(!showMilestones)}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏁 ROI Milestones
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>({completedMissions.length}/{MISSIONS.length})</span>
                  </h4>
                  <span style={{
                    fontSize: '12px', color: 'var(--primary, #6c63ff)', fontWeight: 700,
                    transition: 'transform 0.3s ease',
                    display: 'inline-block',
                    transform: showMilestones ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>▼</span>
                </div>
                {showMilestones && (
                  <div style={{ padding: '8px 12px 12px' }}>
                    {MISSIONS.map((mission, idx) => {
                      const isComplete = completedMissions.includes(mission.id);
                      const isPrevComplete = idx === 0 || completedMissions.includes(MISSIONS[idx - 1].id);
                      const isActive = !isComplete && isPrevComplete;
                      const isLocked = !isComplete && !isPrevComplete;
                      const isCelebrating = showMissionCelebration === mission.id;
                      return (
                        <div key={mission.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '8px',
                          borderRadius: '14px', cursor: isActive ? 'pointer' : isComplete ? 'default' : 'not-allowed',
                          background: isCelebrating ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' : isActive ? 'rgba(108,99,255,0.08)' : isComplete ? 'rgba(34,197,94,0.06)' : 'rgba(128,128,128,0.04)',
                          border: isCelebrating ? '2px solid rgba(34,197,94,0.4)' : isActive ? '2px solid rgba(108,99,255,0.3)' : '1px solid rgba(128,128,128,0.1)',
                          opacity: isLocked ? 0.45 : 1,
                          transition: 'all 0.3s ease',
                          transform: isCelebrating ? 'scale(1.02)' : 'scale(1)',
                        }} onClick={() => {
                          if (isLocked) return;
                          if (isComplete) {
                            if (mission.action === 'profile') { setShowProfileModal(true); }
                            else {
                              setGalleryAgentFilter(mission.agentMode || (mission.action === 'action-plan' ? 'general' : null));
                              switchTab('gallery');
                            }
                            return;
                          }
                          if (mission.action === 'profile') { setShowProfileModal(true); }
                          else if (mission.action === 'action-plan') {
                            setAgentMode('general');
                            setPrompt(`Create my personalized 90-Day Action Plan based on my business profile. Include specific weekly milestones, revenue targets, and marketing tactics.`);
                            switchTab('create');
                          }
                          else if (mission.agentMode) { setAgentMode(mission.agentMode as AgentMode); setPrompt(''); switchTab('create'); }
                        }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            fontSize: isComplete ? '18px' : '14px', fontWeight: 800,
                            background: isComplete ? 'linear-gradient(135deg, #22c55e, #16a34a)' : isActive ? 'linear-gradient(135deg, #6c63ff, #a855f7)' : 'rgba(128,128,128,0.15)',
                            color: isComplete || isActive ? '#fff' : 'var(--text-secondary)',
                            boxShadow: isActive ? '0 0 12px rgba(108,99,255,0.3)' : 'none',
                          }}>
                            {isComplete ? '✓' : isLocked ? '🔒' : mission.step}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: isActive ? 700 : 600, color: isComplete ? '#22c55e' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{mission.icon}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mission.title}</span>
                              {isCelebrating && <span style={{ fontSize: '16px', animation: 'pulse 0.5s ease-in-out' }}>🎉</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isComplete ? 'Completed! Tap to view →' : mission.subtitle}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, fontSize: '16px', color: isComplete ? '#22c55e' : isActive ? 'var(--primary, #6c63ff)' : 'var(--text-secondary)' }}>
                            {isComplete ? '👁️' : isActive ? '→' : ''}
                          </div>
                        </div>
                      );
                    })}
                    {completedMissions.length === MISSIONS.length && (
                      <div style={{ padding: '16px 20px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏆</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#22c55e' }}>All Milestones Complete!</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>You've mastered NovaMind. Keep creating amazing things!</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tools Replaced Comparison */}
            <div style={{ padding: '0 16px 20px' }}>
              <div style={{
                borderRadius: '14px', padding: '16px',
                background: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(99,102,241,0.08) 50%, rgba(168,85,247,0.08) 100%)',
                border: '1px solid rgba(99,102,241,0.15)',
                position: 'relative' as const, overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute' as const, top: '-20px', right: '-20px', fontSize: '80px', opacity: 0.06 }}>💰</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>🧩</span>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Tools You're Replacing</h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '14px' }}>
                  {[
                    { tool: 'ChatGPT Pro', cost: '$20/mo', icon: '🤖' },
                    { tool: 'Canva Pro', cost: '$13/mo', icon: '🎨' },
                    { tool: 'Mailchimp', cost: '$20/mo', icon: '📧' },
                    { tool: 'Hootsuite', cost: '$99/mo', icon: '📱' },
                    { tool: 'Grammarly Biz', cost: '$25/mo', icon: '✍️' },
                    { tool: 'Logo Maker', cost: '$10/mo', icon: '💎' },
                    { tool: 'Ad Tools', cost: '$50/mo', icon: '🎯' },
                    { tool: 'Freelancer', cost: '$100+/mo', icon: '👤' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.icon} {item.tool}</span>
                      <span style={{ color: '#ef4444', fontWeight: 600, textDecoration: 'line-through', opacity: 0.7 }}>{item.cost}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.06))', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>NovaMind — All of this for</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>$49<span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>/mo</span></div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 700 }}>SAVE $296+/mo</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>That's $3,500+/year</div>
                  </div>
                </div>
              </div>
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
            {[{ icon: '✍️', name: 'Write', desc: 'Articles & copy', type: 'text' },{ icon: '🎨', name: 'Image', desc: 'AI artwork', type: 'image' },{ icon: '📧', name: 'Email', desc: 'Pro emails', type: 'text' },{ icon: '📋', name: 'Plans', desc: 'Business plans', type: 'text' },{ icon: '📄', name: 'Summary', desc: 'Summarize', type: 'text' },{ icon: '💡', name: 'Ideas', desc: 'Brainstorm', type: 'text' }].map((t, i) => (
              <div key={i} className="tool-card" onClick={() => { setContentType(t.type); setModel(t.type === 'image' ? 'gpt-image-1' : 'deepseek'); setAgentMode('general'); switchTab('create'); }}>
                <div className="tool-icon">{t.icon}</div><div className="tool-name">{t.name}</div><div className="tool-desc">{t.desc}</div>
              </div>
            ))}
          </div>
          <div className="powered-footer">
            <span>© 2026 A Product of The PIE Group</span> · <a href="mailto:admin@piegroup.org">admin@piegroup.org</a>
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
            {agentMode === 'ai-receptionist' && (
              <div className="agent-info-banner">
                <strong>🤖 AI Receptionist</strong>
                <p>Your 24/7 virtual front desk — set up custom greetings, FAQ answers, lead qualification flows, and appointment booking for your business. Tell me about your business to get started!</p>
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

            {/* Quick Action Chips — clean, one-tap access */}
            {agentMode === 'general' && chatMessages.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {[
                  { icon: '📧', label: 'Email', agent: 'email-assistant' as AgentMode },
                  { icon: '📱', label: 'Social Post', agent: 'ad-maker' as AgentMode },
                  { icon: '🎨', label: 'Logo', agent: 'logo-maker' as AgentMode },
                  { icon: '📄', label: 'Flyer', agent: 'flyer-maker' as AgentMode },
                  { icon: '📝', label: 'Form', agent: 'form-builder' as AgentMode },
                  { icon: '🔍', label: 'Competitor Analysis', agent: 'competitor-analysis' as AgentMode },
                  { icon: '💡', label: 'Ideas', agent: 'idea-spark' as AgentMode },
                  { icon: '📊', label: 'Business Plan', agent: 'business-plan' as AgentMode },
                ].map(chip => (
                  <button key={chip.label} onClick={() => { setAgentMode(chip.agent); setPrompt(''); setResult(null); if (chip.agent === 'logo-maker') { setModel('gpt-image-1'); setContentType('image'); } else if (model === 'gpt-image-1') { setModel('deepseek'); setContentType('text'); } }}
                    style={{
                      padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '20px', cursor: 'pointer',
                      background: 'rgba(108,99,255,0.1)', color: 'var(--primary, #6c63ff)',
                      border: '1px solid rgba(108,99,255,0.25)', transition: 'all 0.2s ease',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                    {chip.icon} {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Messages Thread */}
            {chatMessages.length > 0 && (
              <>
              <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '16px', background: 'var(--card-bg, rgba(255,255,255,0.7))', borderRadius: '16px', border: '1px solid var(--border-color, rgba(0,0,0,0.08))', marginBottom: '12px', scrollBehavior: 'smooth' as const }}>
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
                    <div className="chat-msg-label" style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                      {msg.role === 'user' ? '👤 You' : '✨ NovaMind'}
                    </div>
                    <div className={`chat-bubble-${msg.role}${msg.isError ? ' chat-bubble-error' : ''}${(endsWithQuestion && isLastAssistant) ? ' question' : ''}`} style={{
                      maxWidth: '95%',
                      width: msg.role === 'assistant' ? '100%' : 'auto',
                      padding: msg.role === 'assistant' ? '16px 18px' : '10px 16px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' ? 'var(--primary, #6c63ff)' : msg.isError ? 'rgba(255,80,80,0.1)' : (endsWithQuestion && isLastAssistant) ? 'rgba(108,99,255,0.08)' : 'var(--card-bg, rgba(255,255,255,0.06))',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #1a1a2e)',
                      fontSize: msg.role === 'assistant' ? '15px' : '14px',
                      lineHeight: '1.6',
                      wordBreak: 'break-word' as const,
                      border: msg.isError ? '1px solid rgba(255,80,80,0.3)' : (endsWithQuestion && isLastAssistant) ? '1px solid rgba(108,99,255,0.2)' : msg.role === 'assistant' ? '1px solid var(--border-color, rgba(0,0,0,0.08))' : 'none',
                    }}>
                      {msg.imageUrl ? (
                        <div>
                          <img src={msg.imageUrl} alt="Generated" style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', marginBottom: '8px' }} />
                          <p className="chat-img-caption" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>{msg.content}</p>
                        </div>
                      ) : msg.role === 'assistant' ? (
                        (() => {
                          const htmlContent = detectHtmlBlock(msg.content);
                          if (htmlContent) {
                            // Extract any text before/after the HTML block
                            const parts = msg.content.split(/```html[\s\S]*?```/);
                            const beforeText = parts[0]?.trim();
                            const afterText = parts.slice(1).join('').trim();
                            return (
                              <div>
                                {beforeText && <div className="markdown-content" style={{ marginBottom: '12px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(beforeText) }} />}
                                <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(108,99,255,0.3)', background: '#fff' }}>
                                  <iframe
                                    srcDoc={renderHtmlPreview(htmlContent, idx)}
                                    style={{ width: '100%', height: '600px', border: 'none', borderRadius: '10px' }}
                                    sandbox="allow-same-origin"
                                    title="Generated content preview"
                                  />
                                  <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(108,99,255,0.08)', borderTop: '1px solid rgba(108,99,255,0.15)' }}>
                                    <button onClick={() => {
                                      const printWindow = window.open('', '_blank');
                                      if (printWindow) {
                                        const fullDoc = htmlContent.includes('<html') ? htmlContent : '<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>@media print{body{margin:0}@page{margin:0.5in}}</style></head><body>' + htmlContent + '</body></html>';
                                        printWindow.document.write(fullDoc);
                                        printWindow.document.close();
                                        setTimeout(() => printWindow.print(), 500);
                                      }
                                    }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🖨️ Print / Download PDF</button>
                                    <button onClick={() => {
                                      const w = window.open('', '_blank');
                                      if (w) {
                                        const backBtn = `<div style="position:fixed;top:12px;right:12px;z-index:99999;display:flex;gap:8px">
                                          <button onclick="window.print()" style="padding:10px 20px;font-size:14px;font-weight:700;background:#6c63ff;color:#fff;border:none;border-radius:10px;cursor:pointer;box-shadow:0 2px 12px rgba(108,99,255,0.4)">🖨️ Print</button>
                                          <button onclick="window.close()" style="padding:10px 20px;font-size:14px;font-weight:700;background:#ff4757;color:#fff;border:none;border-radius:10px;cursor:pointer;box-shadow:0 2px 12px rgba(255,71,87,0.4)">✕ Close</button>
                                        </div>`;
                                        const fullDoc = htmlContent.includes('<html') ? htmlContent.replace('<body', '<body>' + backBtn + '<') : '<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>' + backBtn + htmlContent + '</body></html>';
                                        w.document.write(fullDoc);
                                        w.document.close();
                                      }
                                    }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', cursor: 'pointer' }}>↗️ Full Screen</button>
                                    <button onClick={() => {
                                      const refineText = window.prompt('What would you like to change? (e.g., "Make the headline bigger", "Change colors to blue and gold", "Add my phone number 555-1234")');
                                      if (refineText && refineText.trim()) {
                                        setPrompt(`Refine the previous design: ${refineText.trim()}. Keep the same overall layout and style but apply the requested changes. Output the complete updated HTML.`);
                                        setTimeout(() => handleGenerate(), 100);
                                      }
                                    }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', cursor: 'pointer' }}>✏️ Refine</button>
                                    <button onClick={() => {
                                      navigator.clipboard.writeText(htmlContent).then(() => {
                                        alert('HTML copied to clipboard!');
                                      });
                                    }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', cursor: 'pointer' }}>📋 Copy HTML</button>
                                  </div>
                                </div>
                                {afterText && <div className="markdown-content" style={{ marginTop: '12px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(afterText) }} />}
                              </div>
                            );
                          }
                          return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />;
                        })()
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
                        <button className="chat-action-btn" onClick={() => { navigator.clipboard.writeText(msg.imageUrl || msg.content); showToast('Copied! 📋'); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'var(--card-bg, rgba(108,99,255,0.08))', color: 'var(--text-secondary, #666)', border: '1px solid var(--border-color, rgba(0,0,0,0.1))', borderRadius: '8px', cursor: 'pointer' }}>📋 Copy</button>
                        {!msg.imageUrl && <button className="chat-action-btn" onClick={() => { const pw = window.open('', '_blank'); if (pw) { pw.document.write('<html><head><title>NovaMind Export</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;line-height:1.6}h1,h2,h3{color:#333}pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}</style></head><body>' + renderMarkdown(msg.content) + '<hr><p style="color:#999;font-size:12px">Exported from NovaMind AI</p></body></html>'); pw.document.close(); pw.print(); } }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', cursor: 'pointer' }}>📄 PDF</button>}
                        {!msg.imageUrl && <button className="chat-action-btn" onClick={() => { const html = '<html><head><meta charset="utf-8"><title>NovaMind Export</title></head><body>' + renderMarkdown(msg.content) + '</body></html>'; const blob = new Blob([html], { type: 'application/msword' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'novamind-export.doc'; a.click(); URL.revokeObjectURL(url); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', cursor: 'pointer' }}>📝 Word</button>}
                        <button className="chat-share-btn" onClick={() => setShowShareMenu(showShareMenu === `chat-${idx}` ? null : `chat-${idx}`)} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🔗 Share</button>
                        {msg.imageUrl && <button onClick={() => handleShareDownload(msg.imageUrl!, `novamind-${Date.now()}.webp`)} className="chat-action-btn" style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}>📥 Save</button>}
                        {msg.imageUrl && (
                          <>
                            <button onClick={() => { const originalPrompt = chatMessages.filter(m => m.role === 'user').pop()?.content || ''; setPrompt(`Create 3 different variations of: ${originalPrompt}`); setModel('gpt-image-1'); setContentType('image'); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🎲 Variations</button>
                            <button onClick={() => { const originalPrompt = chatMessages.filter(m => m.role === 'user').pop()?.content || ''; setPrompt(`Refine this image: ${originalPrompt}. Make it `); setModel('gpt-image-1'); setContentType('image'); setTimeout(() => { const ta = document.querySelector('.prompt-input') as HTMLTextAreaElement; if(ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 100); }} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', cursor: 'pointer' }}>✏️ Refine</button>
                          </>
                        )}
                        <button onClick={() => publishToCommunity(chatMessages.find(m => m.role === 'user')?.content || '', msg.content, msg.imageUrl)} className="chat-action-btn" style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(255,165,0,0.15)', color: '#ffa500', border: '1px solid rgba(255,165,0,0.3)', borderRadius: '8px', cursor: 'pointer' }}>🌟 Publish</button>
                        </>)}
                        {/* 🔗 Workflow Chain — Continue with... */}
                        {isLastAssistant && !msg.isError && (WORKFLOW_CHAINS[agentMode] || WORKFLOW_CHAINS['general']).length > 0 && (
                          <div style={{ width: '100%', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>🔗</span> Continue with...
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {(WORKFLOW_CHAINS[agentMode] || WORKFLOW_CHAINS['general']).map((chain, ci) => (
                                <button key={ci} onClick={() => {
                                  const lastContent = msg.content.substring(0, 500);
                                  setAgentMode(chain.agent as AgentMode);
                                  setChatMessages([]);
                                  setCurrentChatId(null);
                                  setChatTitle('');
                                  setResult(null);
                                  setPrompt(chain.promptPrefix + lastContent);
                                  showToast(`Switched to ${chain.label} — hit Generate! 🚀`, 'info');
                                }} style={{
                                  padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                                  background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))',
                                  color: 'var(--primary, #6c63ff)',
                                  border: '1px solid rgba(99,102,241,0.25)',
                                  borderRadius: '20px', cursor: 'pointer',
                                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                  {chain.icon} {chain.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {showShareMenu === `chat-${idx}` && (
                          <div className="chat-share-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'var(--surface, #1a1a2e)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '8px', display: 'flex', gap: '6px', zIndex: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
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
                    {/* ⚡ Subtle upgrade hint — shows after every 3rd generation for free users */}
                    {isLastAssistant && !msg.isError && usage.plan === 'free' && usage.used > 0 && usage.used % 2 === 0 && (
                      <div onClick={() => setShowUpgradeModal(true)} style={{ marginTop: '10px', padding: '10px 16px', background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(168,85,247,0.06))', border: '1px solid rgba(108,99,255,0.15)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                        <span style={{ fontSize: '16px' }}>⚡</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Enjoying NovaMind? <span style={{ color: 'var(--primary, #6c63ff)', fontWeight: 700 }}>Unlock unlimited access →</span></span>
                      </div>
                    )}
                  </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              </>
            )}

            {/* Mood auto-detected from prompt — no manual selector needed */}
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
                agentMode === 'flyer-maker' ? 'Describe your flyer (e.g., "Grand opening flyer for my salon, June 15, 20% off all services, pink and gold theme")...' :
                agentMode === 'form-builder' ? 'Describe the form you need (e.g., "Client intake form for my consulting business with contact info, budget, and project details")...' :
                agentMode === 'doc-summarizer' ? 'Paste or describe the document you want summarized (e.g., "Summarize this lease agreement: [paste text]")...' :
                contentType === 'image' ? 'Describe the image...' : 'How can I help you?'
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
                  {result.imageUrl ? <img className="result-image" src={result.imageUrl} alt="" /> : (() => {
                    const resultText = result.content || result.text || '';
                    const htmlContent = detectHtmlBlock(resultText);
                    if (htmlContent) {
                      const parts = resultText.split(/```html[\s\S]*?```/);
                      const beforeText = parts[0]?.trim();
                      const afterText = parts.slice(1).join('').trim();
                      return (
                        <div>
                          {beforeText && <div className="markdown-content" style={{ marginBottom: '12px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(beforeText) }} />}
                          <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(108,99,255,0.3)', background: '#fff' }}>
                            <iframe
                              srcDoc={renderHtmlPreview(htmlContent, 0)}
                              style={{ width: '100%', height: '600px', border: 'none' }}
                              sandbox="allow-same-origin"
                              title="Generated content"
                            />
                            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(108,99,255,0.08)', borderTop: '1px solid rgba(108,99,255,0.15)' }}>
                              <button onClick={() => {
                                const pw = window.open('', '_blank');
                                if (pw) {
                                  const fullDoc = htmlContent.includes('<html') ? htmlContent : '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@media print{body{margin:0}@page{margin:0.5in}}</style></head><body>' + htmlContent + '</body></html>';
                                  pw.document.write(fullDoc);
                                  pw.document.close();
                                  setTimeout(() => pw.print(), 500);
                                }
                              }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, background: 'var(--primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🖨️ Print / Download PDF</button>
                              <button onClick={() => {
                                const w = window.open('', '_blank');
                                if (w) {
                                  const fullDoc = htmlContent.includes('<html') ? htmlContent : '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + htmlContent + '</body></html>';
                                  w.document.write(fullDoc);
                                  w.document.close();
                                }
                              }} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, background: 'rgba(108,99,255,0.15)', color: 'var(--primary, #6c63ff)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', cursor: 'pointer' }}>↗️ Full Screen</button>
                            </div>
                          </div>
                          {afterText && <div className="markdown-content" style={{ marginTop: '12px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(afterText) }} />}
                        </div>
                      );
                    }
                    return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(resultText) }} />;
                  })()}
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
          {galleryAgentFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>🎯 Showing: {AGENTS.find(a => a.id === galleryAgentFilter)?.name || 'Mission'} outputs</span>
              <button onClick={() => setGalleryAgentFilter(null)} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '6px', cursor: 'pointer' }}>✕ Show All</button>
            </div>
          )}
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
                    {!h.imageUrl && <button onClick={(e) => { e.stopPropagation(); const pw = window.open('', '_blank'); if (pw) { pw.document.write('<html><head><title>NovaMind Export</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;line-height:1.6}h1,h2,h3{color:#333}pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}</style></head><body>' + renderMarkdown(h.resultPreview || '') + '<hr><p style="color:#999;font-size:12px">Exported from NovaMind AI</p></body></html>'); pw.document.close(); pw.print(); } }} style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px', cursor: 'pointer' }}>📄 PDF</button>}
                    {!h.imageUrl && <button onClick={(e) => { e.stopPropagation(); const html = '<html><head><meta charset="utf-8"><title>NovaMind Export</title></head><body>' + renderMarkdown(h.resultPreview || '') + '</body></html>'; const blob = new Blob([html], { type: 'application/msword' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'novamind-export.doc'; a.click(); URL.revokeObjectURL(url); }} style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '6px', cursor: 'pointer' }}>📝 Word</button>}
                    {h.imageUrl && <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = h.imageUrl!; a.download = `novamind-${Date.now()}.png`; a.click(); }} style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px', cursor: 'pointer' }}>📥 Save Image</button>}
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
        {/* Enterprise Coming Soon Views */}
        {tab === 'crm' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">📇</div>
            <h2>CRM</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Manage your relationships. Track your revenue. AI-powered contact management, deal pipeline, and revenue forecasting — all in one view.</p>
            {!['solopreneur','team','business','business_pro'].includes(usage.plan) && (
              <button className="nav-btn btn-primary" onClick={() => window.open('https://buy.stripe.com/5kQ3cufp5ayf1imftf6Na0b','_blank')} style={{ marginTop: '8px' }}>Upgrade to Unlock</button>
            )}
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">👤</div><h4>Contact Management</h4><p>Organize clients, leads & partners with AI-enriched profiles</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📊</div><h4>Deal Pipeline</h4><p>Visual pipeline tracking from lead to close</p></div>
              <div className="ent-feature-card"><div className="feat-icon">🤖</div><h4>AI Insights</h4><p>Automated follow-ups, scoring & next-best-action recommendations</p></div>
            </div>
          </div>
        )}
        {tab === 'projects' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">📋</div>
            <h2>Projects</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Track projects & tasks with AI. Kanban boards, Gantt charts, and smart task management — built for teams that move fast.</p>
            {!['solopreneur','team','business','business_pro'].includes(usage.plan) && (
              <button className="nav-btn btn-primary" onClick={() => window.open('https://buy.stripe.com/5kQ3cufp5ayf1imftf6Na0b','_blank')} style={{ marginTop: '8px' }}>Upgrade to Unlock</button>
            )}
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">📌</div><h4>Kanban Board</h4><p>Drag-and-drop task management with custom columns</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📅</div><h4>Gantt Timeline</h4><p>Visualize project phases, dependencies & deadlines</p></div>
              <div className="ent-feature-card"><div className="feat-icon">🤖</div><h4>AI Task Breakdown</h4><p>Describe a project — AI creates the full task list</p></div>
            </div>
          </div>
        )}
        {tab === 'inbox' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">✉️</div>
            <h2>Inbox</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Your unified communications hub. Connect email, read messages, and let AI draft replies — all without leaving NovaMind.</p>
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">📨</div><h4>Email Connect</h4><p>Connect Gmail or Outlook and manage emails in one place</p></div>
              <div className="ent-feature-card"><div className="feat-icon">🤖</div><h4>AI Auto-Reply</h4><p>Smart drafts that match your tone and style</p></div>
              <div className="ent-feature-card"><div className="feat-icon">🎙️</div><h4>Meeting Notes</h4><p>AI-powered meeting transcription and action items</p></div>
            </div>
          </div>
        )}
        {tab === 'templates' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">▧</div>
            <h2>Templates</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Professional templates for every business need. Proposals, emails, social posts, reports — pre-built and AI-customizable.</p>
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">📄</div><h4>Document Templates</h4><p>Proposals, contracts, reports — ready to customize</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📱</div><h4>Social Templates</h4><p>Platform-optimized social media content templates</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📧</div><h4>Email Sequences</h4><p>Multi-step email campaigns with AI personalization</p></div>
            </div>
          </div>
        )}
        {tab === 'analytics' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">📈</div>
            <h2>Analytics</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Business intelligence powered by AI. Track performance, spot trends, and get actionable insights across every tool you use.</p>
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">📊</div><h4>Usage Analytics</h4><p>See how your team uses NovaMind and measure impact</p></div>
              <div className="ent-feature-card"><div className="feat-icon">💡</div><h4>AI Recommendations</h4><p>Proactive suggestions to improve your business outcomes</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📉</div><h4>Custom Reports</h4><p>Generate and schedule reports for stakeholders</p></div>
            </div>
          </div>
        )}
        {tab === 'integrations' && (
          <div className="ent-coming-soon-view">
            <div className="ent-icon">⛓️</div>
            <h2>Integrations</h2>
            <div className="ent-coming-soon-badge">🚀 Coming Soon</div>
            <p className="ent-desc" style={{ marginTop: '16px' }}>Connect your existing tools and let NovaMind be the AI brain on top. Your data, your workflows, supercharged with intelligence.</p>
            <div className="ent-features-preview">
              <div className="ent-feature-card"><div className="feat-icon">📧</div><h4>Email & Calendar</h4><p>Gmail, Outlook, Google Calendar sync</p></div>
              <div className="ent-feature-card"><div className="feat-icon">💳</div><h4>Payments</h4><p>Stripe, QuickBooks, and invoicing integrations</p></div>
              <div className="ent-feature-card"><div className="feat-icon">📱</div><h4>Social Platforms</h4><p>Auto-post to LinkedIn, Facebook, Instagram & more</p></div>
            </div>
          </div>
        )}
      </div>
      </div>{/* main-content-area */}
      </div>{/* app-layout */}
      {toastVisible && (
        <div className="toast-enter" style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: toastType === 'error' ? '#ef4444' : toastType === 'success' ? '#22c55e' : toastType === 'warning' ? '#f59e0b' : 'linear-gradient(135deg, #6c63ff, #3b82f6)', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          {toastMsg}
        </div>
      )}
      <nav className="bottom-nav">
        {(isPersonalMode 
            ? (['home','create','gallery','chats'] as Tab[])
            : (['home','create','crm','projects','chats'] as Tab[])
          ).map(id => (
          <button key={id} className={`bottom-nav-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)}>
            <span className="bottom-nav-icon">{{ home: '▦', create: '◎', gallery: '🖼️', chats: '💬', community: '🌟', crm: '📇', projects: '📋', inbox: '✉', templates: '▧', analytics: '📈', integrations: '⛓' }[id]}</span>
            {{ home: 'Dashboard', create: 'AI Studio', gallery: 'Gallery', chats: 'Chats', community: 'Community', crm: 'CRM', projects: 'Projects', inbox: 'Inbox', templates: 'Templates', analytics: 'Analytics', integrations: 'Integrations' }[id]}
          </button>
        ))}
      </nav>

      {showOnboarding && user && (
        <div className="auth-overlay">
          <div className="auth-modal" style={{ maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
            {/* Progress bar */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {[0,1,2,3,4].map(s => (
                <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: s <= onboardingStep ? 'var(--primary, #6c63ff)' : (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.1)'), transition: 'background 0.3s' }} />
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

      {/* === BUSINESS PROFILE & TEAM MODAL === */}
      {showProfileModal && user && (
        <div className="auth-overlay" onClick={e => e.target === e.currentTarget && setShowProfileModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '560px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Tab header */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(108,99,255,0.04)', borderRadius: '12px', padding: '4px' }}>
              <button onClick={() => setProfileTab('profile')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', background: profileTab === 'profile' ? 'var(--primary, #6c63ff)' : 'transparent', color: profileTab === 'profile' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s' }}>🏢 Business Profile</button>
              <button onClick={() => setProfileTab('knowledge')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', background: profileTab === 'knowledge' ? 'var(--primary, #6c63ff)' : 'transparent', color: profileTab === 'knowledge' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                📚 Knowledge {knowledgeDocs.length > 0 && <span style={{ background: '#0ea5e9', color: '#fff', fontSize: '10px', borderRadius: '10px', padding: '1px 6px', marginLeft: '4px' }}>{knowledgeDocs.length}</span>}
              </button>
              <button onClick={() => setProfileTab('team')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', background: profileTab === 'team' ? 'var(--primary, #6c63ff)' : 'transparent', color: profileTab === 'team' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s', position: 'relative' as const }}>
                👥 Team {teamMembers.length > 0 && <span style={{ background: '#22c55e', color: '#fff', fontSize: '10px', borderRadius: '10px', padding: '1px 6px', marginLeft: '4px' }}>{teamMembers.length}</span>}
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              {profileTab === 'profile' && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    {/* Logo upload area */}
                    <div 
                      onClick={() => logoInputRef.current?.click()}
                      style={{ 
                        width: '80px', height: '80px', borderRadius: '16px', margin: '0 auto 12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        border: editingProfile.logoUrl ? 'none' : `2px dashed ${theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(108,99,255,0.3)'}`,
                        background: editingProfile.logoUrl ? 'transparent' : (theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(108,99,255,0.04)'),
                        overflow: 'hidden', transition: 'all 0.2s',
                        position: 'relative' as const
                      }}
                      title="Upload your company logo"
                    >
                      {editingProfile.logoUrl ? (
                        <img src={editingProfile.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px' }}>📷</div>
                          <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>Add Logo</div>
                        </div>
                      )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    {editingProfile.logoUrl && (
                      <button onClick={(e) => { e.stopPropagation(); setEditingProfile(p => ({ ...p, logoUrl: '' })); }} 
                        style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '4px' }}>
                        Remove Logo
                      </button>
                    )}
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem' }}>Business Profile</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Tell us about your business — AI will personalize every response to your brand.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Business Name *</label>
                      <input className="auth-input" placeholder="Your Company Name" value={editingProfile.businessName} onChange={e => setEditingProfile(p => ({ ...p, businessName: e.target.value }))} style={{ margin: 0 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Industry</label>
                      <select className="auth-input" value={editingProfile.industry} onChange={e => setEditingProfile(p => ({ ...p, industry: e.target.value }))} style={{ margin: 0, cursor: 'pointer' }}>
                        {INDUSTRIES.map(ind => <option key={ind.id} value={ind.id}>{ind.icon} {ind.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Location</label>
                      <input className="auth-input" placeholder="City, State" value={editingProfile.location} onChange={e => setEditingProfile(p => ({ ...p, location: e.target.value }))} style={{ margin: 0 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Website</label>
                      <input className="auth-input" placeholder="www.example.com" value={editingProfile.website} onChange={e => setEditingProfile(p => ({ ...p, website: e.target.value }))} style={{ margin: 0 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Phone</label>
                      <input className="auth-input" placeholder="(555) 123-4567" value={editingProfile.phone} onChange={e => setEditingProfile(p => ({ ...p, phone: e.target.value }))} style={{ margin: 0 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Team Size</label>
                      <select className="auth-input" value={editingProfile.teamSize} onChange={e => setEditingProfile(p => ({ ...p, teamSize: e.target.value }))} style={{ margin: 0, cursor: 'pointer' }}>
                        <option value="">Select...</option>
                        <option value="solo">Just Me</option>
                        <option value="2-5">2-5 people</option>
                        <option value="6-15">6-15 people</option>
                        <option value="16-50">16-50 people</option>
                        <option value="50+">50+ people</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Year Founded</label>
                      <input className="auth-input" placeholder="2020" value={editingProfile.yearFounded} onChange={e => setEditingProfile(p => ({ ...p, yearFounded: e.target.value }))} style={{ margin: 0 }} />
                    </div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Business Description</label>
                    <textarea className="auth-input" placeholder="What does your business do? (2-3 sentences)" value={editingProfile.description} onChange={e => setEditingProfile(p => ({ ...p, description: e.target.value }))} rows={3} style={{ margin: 0, resize: 'vertical' as const, fontFamily: 'inherit' }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Services / Products</label>
                    <textarea className="auth-input" placeholder="List your main services or products" value={editingProfile.services} onChange={e => setEditingProfile(p => ({ ...p, services: e.target.value }))} rows={2} style={{ margin: 0, resize: 'vertical' as const, fontFamily: 'inherit' }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Target Audience</label>
                    <input className="auth-input" placeholder="Who are your ideal customers? (e.g., Small business owners aged 30-55)" value={editingProfile.targetAudience} onChange={e => setEditingProfile(p => ({ ...p, targetAudience: e.target.value }))} style={{ margin: 0 }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Brand Voice</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {BRAND_VOICES.map(v => (
                        <div key={v.id} onClick={() => setEditingProfile(p => ({ ...p, brandVoice: v.id }))}
                          style={{ padding: '10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                            border: editingProfile.brandVoice === v.id ? '2px solid var(--primary, #6c63ff)' : `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.1)'}`,
                            background: editingProfile.brandVoice === v.id ? 'rgba(108,99,255,0.12)' : 'transparent',
                            transition: 'all 0.2s' }}>
                          <div style={{ fontSize: '20px' }}>{v.icon}</div>
                          <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>{v.label}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>{v.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>What Makes You Different?</label>
                    <textarea className="auth-input" placeholder="Your unique value proposition — what sets you apart from competitors?" value={editingProfile.uniqueValue} onChange={e => setEditingProfile(p => ({ ...p, uniqueValue: e.target.value }))} rows={2} style={{ margin: 0, resize: 'vertical' as const, fontFamily: 'inherit' }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Brand Colors <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <input className="auth-input" placeholder="e.g., Navy blue #1a2b5e, Gold #d4af37" value={editingProfile.brandColors} onChange={e => setEditingProfile(p => ({ ...p, brandColors: e.target.value }))} style={{ margin: 0 }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Social Media <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <input className="auth-input" placeholder="@yourhandle on Instagram, Facebook, LinkedIn, etc." value={editingProfile.socialMedia} onChange={e => setEditingProfile(p => ({ ...p, socialMedia: e.target.value }))} style={{ margin: 0 }} />
                  </div>

                  {/* ✨ AI Polish Button */}
                  <button onClick={polishProfile} disabled={polishingProfile}
                    style={{ 
                      marginTop: '20px', width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                      background: polishingProfile ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)',
                      color: '#fff', fontSize: '15px', fontWeight: 700, cursor: polishingProfile ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: polishingProfile ? 'none' : '0 4px 15px rgba(108,99,255,0.3)',
                      transition: 'all 0.3s'
                    }}>
                    {polishingProfile ? (
                      <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚡</span> AI is polishing your profile...</>
                    ) : (
                      <>✨ AI Polish — Make It Sharp</>
                    )}
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '6px 0 0', opacity: 0.7 }}>
                    AI will enhance your description, services, audience & value proposition
                  </p>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                    <button className="generate-btn" onClick={() => setShowProfileModal(false)}
                      style={{ flex: 'none', width: 'auto', padding: '12px 20px', background: 'transparent', border: `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(108,99,255,0.2)'}`, color: 'var(--text-primary)' }}>Cancel</button>
                    <button className="generate-btn" onClick={saveBusinessProfile} disabled={profileSaving} style={{ flex: 1 }}>
                      {profileSaving ? '💾 Saving...' : '💾 Save Profile'}
                    </button>
                  </div>

                  {businessProfile?.businessName && (
                    <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px', background: theme === 'dark' ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      ✅ <strong style={{ color: 'var(--text-primary)' }}>Profile Active</strong> — AI responses are personalized for <strong style={{ color: '#22c55e' }}>{businessProfile.businessName}</strong>
                    </div>
                  )}

                  {/* 🧠 AI Action Plan CTA */}
                  <button onClick={generateActionPlan}
                    style={{
                      marginTop: '16px', width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
                      color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                      boxShadow: '0 4px 20px rgba(99,102,241,0.35)', transition: 'all 0.3s',
                      letterSpacing: '0.3px'
                    }}>
                    🧠 Get Your Personalized AI Action Plan
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '6px 0 0', opacity: 0.7 }}>
                    AI analyzes your business and tells you exactly what to automate first
                  </p>
                </>
              )}

              {profileTab === 'knowledge' && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>📚</div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem' }}>Knowledge Hub</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Upload brand guidelines, FAQs, product specs — AI uses these to give you smarter, on-brand responses.</p>
                  </div>

                  {/* Existing docs */}
                  {knowledgeDocs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                      {knowledgeDocs.map(kd => (
                        <div key={kd.id} style={{ padding: '12px 16px', borderRadius: '12px', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(108,99,255,0.04)', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.1)'}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ fontSize: '24px' }}>📄</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{kd.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kd.content.slice(0, 80)}...</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.6, marginTop: '2px' }}>Added {new Date(kd.addedAt).toLocaleDateString()}</div>
                          </div>
                          <button onClick={() => deleteKnowledgeDoc(kd.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#ef4444', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' as const }}>🗑️ Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)', marginBottom: '16px', borderRadius: '12px', border: `2px dashed ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.15)'}` }}>
                      <div style={{ fontSize: '40px', marginBottom: '8px', opacity: 0.5 }}>🧠</div>
                      <p style={{ fontWeight: 600, marginBottom: '4px', fontSize: '14px' }}>Your AI's brain is empty</p>
                      <p style={{ fontSize: '12px', margin: 0 }}>Add documents to make every AI response smarter and more personalized</p>
                    </div>
                  )}

                  {/* Add new doc form */}
                  {addingKnowledge ? (
                    <div style={{ padding: '16px', borderRadius: '14px', background: theme === 'dark' ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <input className="auth-input" placeholder="Document name (e.g., Brand Guidelines)" value={knowledgeName} onChange={e => setKnowledgeName(e.target.value)} style={{ margin: 0, flex: 1 }} />
                      </div>
                      <textarea className="auth-input" placeholder="Paste your content here — brand guidelines, FAQs, product descriptions, pricing info, company policies, talking points..." value={knowledgeText} onChange={e => setKnowledgeText(e.target.value.slice(0, 8000))} rows={6} style={{ margin: '0 0 8px', resize: 'vertical' as const, fontFamily: 'inherit', fontSize: '13px' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{knowledgeText.length.toLocaleString()}/8,000 characters</span>
                        <label style={{ fontSize: '12px', color: 'var(--primary, #6c63ff)', cursor: 'pointer', fontWeight: 600 }}>
                          📎 Upload .txt/.md file
                          <input type="file" accept=".txt,.md,.csv,.text" onChange={handleKnowledgeFileUpload} style={{ display: 'none' }} />
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setAddingKnowledge(false); setKnowledgeName(''); setKnowledgeText(''); }} style={{ flex: 'none', padding: '10px 16px', borderRadius: '10px', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(108,99,255,0.2)'}`, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Cancel</button>
                        <button className="generate-btn" onClick={saveKnowledgeDoc} disabled={!knowledgeName.trim() || !knowledgeText.trim()} style={{ flex: 1, margin: 0, opacity: (!knowledgeName.trim() || !knowledgeText.trim()) ? 0.5 : 1 }}>💾 Save to Knowledge Hub</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingKnowledge(true)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: `2px dashed ${theme === 'dark' ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.25)'}`, background: theme === 'dark' ? 'rgba(14,165,233,0.06)' : 'rgba(14,165,233,0.03)', color: 'var(--primary, #6c63ff)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      ➕ Add Knowledge Document
                    </button>
                  )}

                  <div style={{ marginTop: '20px', padding: '14px 16px', borderRadius: '12px', background: theme === 'dark' ? 'rgba(108,99,255,0.08)' : 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>💡 What to add:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>📋 Brand Guidelines</div>
                      <div>❓ FAQs & Answers</div>
                      <div>🛍️ Product/Service Specs</div>
                      <div>💬 Talking Points</div>
                      <div>📊 Pricing Information</div>
                      <div>🏆 Client Testimonials</div>
                      <div>📜 Company Policies</div>
                      <div>🎯 Sales Scripts</div>
                    </div>
                  </div>
                </>
              )}

              {profileTab === 'team' && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>👥</div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem' }}>Team Members</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Add your team so they can access NovaMind under your account.</p>
                  </div>

                  {/* Invite form */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input className="auth-input" type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && inviteTeamMember()} style={{ margin: 0, flex: 1 }} />
                    <button className="generate-btn" onClick={inviteTeamMember} disabled={invitingMember || !inviteEmail.trim()} style={{ width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' as const, margin: 0 }}>
                      {invitingMember ? '...' : '➕ Invite'}
                    </button>
                  </div>

                  {/* Team list */}
                  {teamMembers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>👥</div>
                      <p style={{ fontWeight: 600, marginBottom: '4px' }}>No team members yet</p>
                      <p style={{ fontSize: '13px' }}>Invite your first teammate to start collaborating!</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Owner (current user) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: theme === 'dark' ? 'rgba(108,99,255,0.08)' : 'rgba(108,99,255,0.04)', border: `1px solid ${theme === 'dark' ? 'rgba(108,99,255,0.2)' : 'rgba(108,99,255,0.1)'}` }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary, #6c63ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                          {(user.displayName || user.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{user.displayName || 'You'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{user.email}</div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff' }}>OWNER</span>
                      </div>

                      {teamMembers.map(member => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(108,99,255,0.02)', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(108,99,255,0.08)'}`, transition: 'all 0.2s' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: member.status === 'pending' ? (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(108,99,255,0.08)') : '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: member.status === 'pending' ? 'var(--text-secondary)' : '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                            {member.status === 'pending' ? '⏳' : (member.displayName || member.email)[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{member.displayName || member.email}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {member.status === 'pending' ? '⏳ Invite pending' : `✅ ${member.role === 'admin' ? 'Admin' : 'Member'}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <select value={member.role} onChange={e => updateMemberRole(member.id, e.target.value as 'admin' | 'member')}
                              style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#fff', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(108,99,255,0.15)'}`, borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => removeTeamMember(member.id)}
                              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#ef4444' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '20px', padding: '14px 16px', borderRadius: '10px', background: theme === 'dark' ? 'rgba(108,99,255,0.06)' : 'rgba(108,99,255,0.03)', border: `1px solid ${theme === 'dark' ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.08)'}`, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    💡 <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> Team members share your subscription and business profile. <strong>Admins</strong> can manage the team; <strong>Members</strong> can use all AI tools.
                  </div>

                  <button className="generate-btn" onClick={() => setShowProfileModal(false)} style={{ marginTop: '16px' }}>Done</button>
                </>
              )}
            </div>
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
      {/* 🚀 Upgrade Modal — shown when free users hit their limit */}
      {showUpgradeModal && (
        <div className="auth-overlay" onClick={e => e.target === e.currentTarget && setShowUpgradeModal(false)}>
          <div className="auth-modal" style={{ textAlign: 'center', maxWidth: '440px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚀</div>
            <h2 style={{ marginBottom: '8px' }}>You&apos;ve Used All {usage.limit} Free Generations!</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px', fontSize: '15px', lineHeight: 1.6 }}>
              You&apos;ve already created amazing content. Imagine what you could do with <strong>unlimited</strong> access — plus AI logos, flyers, business plans, and more.
            </p>
            <div style={{ background: 'rgba(108,99,255,0.08)', borderRadius: '12px', padding: '16px', margin: '0 0 20px', border: '1px solid rgba(108,99,255,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px' }}>Solopreneur Hub</span>
                <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--primary, #6c63ff)' }}>$49/mo</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' }}>✅ Unlimited AI generations &nbsp;·&nbsp; ✅ All business tools &nbsp;·&nbsp; ✅ Logo & Flyer Maker &nbsp;·&nbsp; ✅ Priority support</div>
            </div>
            <button className="generate-btn" onClick={() => { window.open('https://buy.stripe.com/5kQ3cufp5ayf1imftf6Na0b', '_blank'); setShowUpgradeModal(false); }} style={{ width: '100%', fontSize: '16px', fontWeight: 700, padding: '14px 24px' }}>
              🔓 Start 14-Day Free Trial — No Card Required
            </button>
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>14-day free trial on all paid plans · No credit card required</p>
            <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
              <span onClick={() => setShowUpgradeModal(false)} style={{ cursor: 'pointer', color: 'var(--text-secondary)', textDecoration: 'underline' }}>Maybe later</span>
            </p>
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
                <span onClick={handleResetPassword} style={{ color: 'var(--accent, #a855f7)', fontSize: '14px', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>Forgot Password?</span>
              </p>
            )}
            {resetSent && <p style={{ color: '#4ade80', fontSize: '14px', margin: 0, textAlign: 'center', padding: '12px', background: 'rgba(74,222,128,0.1)', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.3)' }}>✅ Password reset email sent! Check your inbox (and spam/junk folder).</p>}
            <button className="generate-btn" onClick={handleAuth}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary, #999)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
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
