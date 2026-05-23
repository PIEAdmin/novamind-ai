import { auth } from './firebase-config';

const API_BASE = 'https://novamind-ai-app.netlify.app/.netlify/functions';

export async function generateContent(prompt: string, type: string = 'text', model?: string, systemPrompt?: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  const body: any = { prompt, type, model };
  if (systemPrompt) body.systemPrompt = systemPrompt;
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(error.error || 'Generation failed');
  }
  return response.json();
}
