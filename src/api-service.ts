import { auth } from './firebase-config';

const API_BASE = 'https://novamind-ai-app.netlify.app/.netlify/functions';

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

export async function generateContent(prompt: string, type: string = 'text', model?: string, systemPrompt?: string, files?: FileAttachment[]) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  const body: any = { prompt, type, model };
  if (systemPrompt) body.systemPrompt = systemPrompt;
  if (files && files.length > 0) body.files = files;
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

export function fileToAttachment(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({ name: file.name, type: file.type, size: file.size, data: base64 });
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
