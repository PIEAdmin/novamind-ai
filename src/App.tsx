import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase-config';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { generateContent } from './api-service';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './styles.css';

type Tab = 'home' | 'create' | 'gallery' | 'crm' | 'projects';
type AgentMode = 'general' | 'competitor-analysis' | 'ad-maker' | 'logo-maker' | 'email-assistant';

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

const AGENT_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  'general': '',
  'competitor-analysis': `You are a world-class business strategist and competitive intelligence analyst. When given a competitor name, business, or market, provide a comprehensive analysis using this EXACT structure:

## 🔍 Competitor Overview
Brief summary of the competitor's business, target market, and positioning.

## 📊 SWOT Analysis

### ✅ Strengths
- List 4-6 key strengths with explanations

### ⚠️ Weaknesses  
- List 4-6 vulnerabilities or gaps

### 🚀 Opportunities
- List 4-6 market opportunities you can exploit

### 🛑 Threats
- List 3-4 competitive threats to watch

## 💡 Market Gaps & Opportunities
Identify 3-5 specific gaps the competitor is NOT addressing that the user could capitalize on.

## 🎯 Differentiation Strategy
Provide 3-5 concrete ways to position AGAINST this competitor, including:
- Messaging angles
- Pricing strategy suggestions
- Feature/service advantages to highlight

## 📝 Ready-to-Use Copy
Provide 2-3 short marketing messages/taglines that position the user's business as the better alternative.

Be specific, data-driven where possible, and actionable. Use real market knowledge.`,
  'ad-maker': `You are an expert advertising copywriter and creative director. Create compelling ad copy optimized for the specified platform. Structure your response with:

## 🎯 Ad Campaign Brief
Brief summary of the campaign goal and target audience.

## 📝 Headlines (3 Variations)
1. **Option A** - [headline]
2. **Option B** - [headline]
3. **Option C** - [headline]

## 📱 Body Copy
[Full ad body text]

## 🚀 Call-to-Action Options
- CTA 1: [action]
- CTA 2: [action]
- CTA 3: [action]

## #️⃣ Hashtag Suggestions
[Relevant hashtags for social media]

## 🔬 A/B Testing Recommendations
[What to test and why]

Make the copy punchy, benefit-driven, and conversion-focused.`,
  'logo-maker': `You are a creative director specializing in brand identity and logo design. Provide detailed logo concepts with:

## 🎨 Logo Concept
Describe the visual concept and meaning behind the design.

## 🌈 Color Palette
- Primary: [color with hex]
- Secondary: [color with hex]
- Accent: [color with hex]
- Reasoning for color choices

## 🔤 Typography
- Recommended fonts and why
- Font pairing suggestions

## 📰 Visual Elements
- Icon/symbol description
- Layout recommendations
- Variations (horizontal, stacked, icon-only)

## 💼 Usage Guidelines
- Where and how to use the logo
- Do's and don'ts

If the user wants an actual generated image, suggest switching to GPT Image model.`,
  'email-assistant': `You are a professional email writer and communication specialist. Write polished, effective emails with:

## 📧 Email

**Subject:** [Compelling subject line]

---

[Professional greeting]

[Well-structured body with clear paragraphs]

[Appropriate call-to-action]

[Professional sign-off]

---

## 💡 Tips
- Best time to send
- Follow-up timing
- Alternative subject lines (2-3 options)

Adapt tone based on context (formal, friendly, persuasive, follow-up, cold outreach, etc).`
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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [model, setModel] = useState('deepseek');
  const [contentType, setContentType] = useState('text');
  const [usage, setUsage] = useState({ used: 0, limit: 15, plan: 'free' });
  const [creations, setCreations] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastContentType, setLastContentType] = useState('text');
  const [lastModel, setLastModel] = useState('deepseek');
  const [industry, setIndustry] = useState('general');
  const [agentMode, setAgentMode] = useState<AgentMode>('general');

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
          setCreations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch {}
      }
    });
    return unsub;
  }, []);

  const handleAuth = async () => {
    setAuthError('');
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
      setShowAuth(false);
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {} }
    } catch (e: any) { setAuthError(e.message?.replace('Firebase: ', '') || 'Auth failed'); }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    if (!user) { setShowAuth(true); return; }
    setLastPrompt(prompt);
    setLastContentType(contentType);
    setLastModel(model);
    setGenerating(true); setResult(null);
    try {
      const industryObj = INDUSTRIES.find(i => i.id === industry);
      let systemPrefix = '';
      
      if (agentMode !== 'general') {
        systemPrefix = AGENT_SYSTEM_PROMPTS[agentMode] + '\n\n';
        if (industry !== 'general') {
          systemPrefix += `The user is in the ${industryObj?.name} industry. Tailor your analysis specifically for this industry. `;
        }
      } else if (industry !== 'general' && contentType === 'text') {
        systemPrefix = `You are an expert AI assistant specializing in the ${industryObj?.name} industry. Tailor your response specifically for ${industryObj?.name} professionals. `;
      }
      
      const res = await generateContent(systemPrefix + prompt, contentType, model);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
      if (Capacitor.isNativePlatform()) { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {} }
    } catch (e: any) { setResult({ error: e.message }); }
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
      const res = await generateContent(lastPrompt, lastContentType, lastModel);
      setResult(res); setUsage(prev => ({ ...prev, used: prev.used + 1 }));
    } catch (e: any) { setResult({ error: e.message }); }
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
    setTab('create');
  };

  const switchTab = (t: Tab) => setTab(t);
  if (loading) return null;
  const pct = Math.min((usage.used / usage.limit) * 100, 100);
  const currentAgent = AGENTS.find(a => a.id === agentMode);

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo-section">
          <img className="logo-icon-img" src="/icon-192.png" alt="NovaMind AI" />
          <span className="logo-text">NovaMind AI</span>
        </div>
        {user ? <button className="nav-btn btn-outline" onClick={() => signOut(auth)}>Sign Out</button> : <button className="nav-btn btn-primary" onClick={() => setShowAuth(true)}>Sign In</button>}
      </nav>
      <div className="main-content">
        {tab === 'home' && (<>
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
            <div className="agent-selector-bar">
              {AGENTS.map(agent => (
                <button key={agent.id} className={`agent-tab ${agentMode === agent.id ? 'active' : ''}`} onClick={() => { setAgentMode(agent.id); setPrompt(''); setResult(null); if (agent.id === 'logo-maker') { setModel('gpt-image-1'); setContentType('image'); } else if (model === 'gpt-image-1' && agent.id !== 'logo-maker') { setModel('deepseek'); setContentType('text'); } }}>
                  <span className="agent-tab-icon">{agent.icon}</span>
                  <span className="agent-tab-name">{agent.name}</span>
                  {agent.badge && <span className="agent-tab-badge">{agent.badge}</span>}
                </button>
              ))}
            </div>

            <h3 className="section-title">{currentAgent?.icon} {currentAgent?.name || 'Create Something Amazing'}</h3>
            
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
              <div className="agent-info-banner">
                <strong>📧 Email Assistant</strong>
                <p>Tell us the context — get a polished, ready-to-send email with subject line, body, and follow-up tips.</p>
              </div>
            )}
            {agentMode === 'logo-maker' && (
              <div className="agent-info-banner">
                <strong>🎨 Logo Maker Agent</strong>
                <p>Describe your brand — get logo concepts with color palettes, typography, and usage guidelines. Switch to GPT Image for AI-generated visuals.</p>
              </div>
            )}

            <div className="industry-selector">
              <label className="selector-label">Industry</label>
              <div className="industry-chips">
                {INDUSTRIES.map(ind => (
                  <button key={ind.id} className={`industry-chip ${industry === ind.id ? 'active' : ''}`} onClick={() => setIndustry(ind.id)}>
                    <span>{ind.icon}</span> {ind.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="model-selector">
              {[{ id: 'deepseek', l: 'DeepSeek' }, { id: 'gpt-image-1', l: 'GPT Image' }, { id: 'gpt-4o', l: 'GPT-4o' }].map(m => (
                <button key={m.id} className={`model-chip ${model === m.id ? 'active' : ''}`} onClick={() => { setModel(m.id); setContentType(m.id === 'gpt-image-1' ? 'image' : 'text'); }}>{m.l}</button>
              ))}
            </div>
            <textarea className="prompt-input" placeholder={
              agentMode === 'competitor-analysis' ? 'Enter a competitor name or describe your market (e.g., "Analyze Mailchimp for a small email marketing startup")...' :
              agentMode === 'ad-maker' ? 'Describe your product/service and target platform (e.g., "Facebook ad for my yoga studio grand opening")...' :
              agentMode === 'email-assistant' ? 'Describe the email you need (e.g., "Follow-up email after a client meeting about their website redesign")...' :
              agentMode === 'logo-maker' ? 'Describe the logo you want (e.g., "Modern minimalist logo for a tech startup called NexGen")...' :
              contentType === 'image' ? 'Describe the image...' : 'What to create?'
            } value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button className="generate-btn" onClick={handleGenerate} disabled={generating || !prompt.trim()}>
              {generating ? 'Analyzing...' : agentMode === 'competitor-analysis' ? '🔍 Analyze Competitor' : agentMode === 'ad-maker' ? '📢 Create Ad' : agentMode === 'email-assistant' ? '📧 Write Email' : agentMode === 'logo-maker' ? '🎨 Design Logo' : 'Generate'}
            </button>
            {generating && (
              <div className="generating-animation">
                <div className="typing-dots"><span></span><span></span><span></span></div>
                <p>{agentMode === 'competitor-analysis' ? 'Analyzing competitive landscape...' : agentMode === 'ad-maker' ? 'Crafting your ad copy...' : agentMode === 'email-assistant' ? 'Writing your email...' : 'AI is crafting your content...'}</p>
              </div>
            )}
            {result && !result.error && (
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
            {result?.error && <div className="result-area"><div className="error-text">{result.error}</div></div>}
            {!result && !generating && !prompt && (
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
          {creations.length === 0 ? <div className="empty-state"><p>No creations yet</p></div> : <div className="gallery-grid">{creations.map((c, i) => (<div key={i} className="gallery-card">{c.imageUrl && <img src={c.imageUrl} alt="" />}<div className="gallery-card-body"><div className="gallery-card-title">{c.prompt?.substring(0, 60)}</div><div className="gallery-card-meta">{c.model}</div></div></div>))}</div>}
        </>)}
        {tab === 'crm' && <div className="empty-state"><h3>CRM</h3><p>Manage contacts, deals & activities</p><p className="upgrade-hint">Available on Business Suite</p></div>}
        {tab === 'projects' && <div className="empty-state"><h3>Projects</h3><p>Track projects & tasks with AI</p><p className="upgrade-hint">Available on Business Suite</p></div>}
      </div>
      <nav className="bottom-nav">
        {(['home','create','gallery','crm','projects'] as Tab[]).map(id => (
          <button key={id} className={`bottom-nav-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)}>
            <span className="bottom-nav-icon">{{ home: '🏠', create: '✨', gallery: '🖼️', crm: '📇', projects: '📋' }[id]}</span>
            {{ home: 'Home', create: 'Create', gallery: 'Gallery', crm: 'CRM', projects: 'Projects' }[id]}
          </button>
        ))}
      </nav>
      {showAuth && (
        <div className="auth-overlay" onClick={e => e.target === e.currentTarget && setShowAuth(false)}>
          <div className="auth-modal">
            <h2>{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '8px 0 20px', fontSize: 14 }}>{authMode === 'login' ? 'Sign in to NovaMind AI' : 'Start creating with NovaMind AI'}</p>
            {authError && <div className="auth-error">{authError}</div>}
            <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="auth-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            <button className="generate-btn" onClick={handleAuth}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <p className="auth-toggle">{authMode === 'login' ? "No account? " : "Have account? "}<span onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Sign Up' : 'Sign In'}</span></p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
