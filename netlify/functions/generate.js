// Netlify Serverless Function: generate
// Handles AI content generation via DeepSeek and OpenAI APIs
// This runs server-side on Netlify — API keys are NOT exposed to the client

const https = require('https');
let pdfParse;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }

function callAPI(hostname, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: { error: raw } });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(55000, () => { req.destroy(); reject(new Error('API timeout')); });
    req.write(data);
    req.end();
  });
}

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const SYSTEM_PROMPTS = {
  text: 'You are NovaMind AI, a helpful writing assistant. Provide clear, well-structured responses.',
  code: 'You are NovaMind AI, an expert software developer. Provide clean, well-commented code with explanations.',
  email: 'You are NovaMind AI, a professional email writer. Write polished, professional emails.',
  social: 'You are NovaMind AI, a social media content expert. Create engaging posts optimized for social platforms.',
  blog: 'You are NovaMind AI, a skilled blog writer. Create engaging, SEO-friendly blog content with clear structure.',
  research: 'You are NovaMind AI, a thorough research assistant. Provide detailed, well-sourced analysis.',
  image: '',
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Basic auth check — verify Bearer token exists
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.length < 20) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { type, prompt, model, files } = JSON.parse(event.body || '{}');

    if (!prompt || !type) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt or type' }) };
    }

    // IMAGE GENERATION — OpenAI GPT Image (gpt-image-1)
    // NOTE: dall-e-3 was deprecated and shut down May 12, 2026
    // gpt-image-1 returns base64 only (no URL), doesn't support response_format
    if (type === 'image') {
      // Add safe margin instructions to prevent text/content from being cut off at edges
      const safePrompt = prompt + '. IMPORTANT LAYOUT RULES: Keep all text, logos, and important elements well within safe margins — at least 10% padding from every edge. Never place text or key visuals at the very top, bottom, or sides of the image. Center the composition with comfortable breathing room on all sides.';
      // Parse size from prompt if specified (e.g., "1200x628" for banners)
      const sizeMatch = prompt.match(/(\d{3,4})x(\d{3,4})/);
      const imageSize = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : '1024x1024';
      // Validate size — gpt-image-1 supports: 1024x1024, 1536x1024, 1024x1536, auto
      const validSizes = ['1024x1024', '1536x1024', '1024x1536'];
      const finalSize = validSizes.includes(imageSize) ? imageSize : 'auto';
      
      const result = await callAPI('api.openai.com', '/v1/images/generations', OPENAI_KEY, {
        model: 'gpt-image-1',
        prompt: safePrompt,
        n: 1,
        size: finalSize,
        quality: 'low',
        output_format: 'webp',
        output_compression: 50,
      });

      if (result.status !== 200 || !result.body.data) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: result.body.error?.message || 'Image generation failed' }),
        };
      }

      // gpt-image-1 returns b64_json instead of url
      const b64 = result.body.data[0].b64_json;
      const dataUrl = `data:image/webp;base64,${b64}`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          content: dataUrl,
          result: dataUrl,
          url: dataUrl,
          imageUrl: dataUrl,
          type: 'image',
        }),
      };
    }

    // FILE WITH IMAGES — OpenAI Vision (GPT-4o Mini)
    const imageFiles = (files || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      const contentParts = [
        { type: 'text', text: prompt },
        ...imageFiles.map((f) => ({
          type: 'image_url',
          image_url: { url: `data:${f.type};base64,${f.data}` },
        })),
      ];

      const result = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: contentParts }],
        max_tokens: 4096,
      });

      if (result.status !== 200 || !result.body.choices) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: result.body.error?.message || 'Vision analysis failed' }),
        };
      }

      const textContent = result.body.choices[0].message.content;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ content: textContent, result: textContent, text: textContent, type: 'text' }),
      };
    }

    // TEXT/DOC FILES — extract text, add to prompt for DeepSeek
    // Cap document text to avoid exceeding model context limits
    const MAX_DOC_CHARS = 500000; // ~125K tokens — safe for DeepSeek's 1M token limit
    let fullPrompt = prompt;
    const docFiles = (files || []).filter((f) => f.type && !f.type.startsWith('image/'));
    if (docFiles.length > 0) {
      let totalChars = 0;
      const docTexts = [];
      for (const f of docFiles) {
        try {
          const remaining = MAX_DOC_CHARS - totalChars;
          if (remaining <= 0) break;
          const rawBuffer = Buffer.from(f.data, 'base64');
          let text = '';
          // Use pdf-parse for PDF files to get actual readable text
          const isPdf = (f.type && f.type.includes('pdf')) || (f.name && f.name.toLowerCase().endsWith('.pdf'));
          if (isPdf && pdfParse) {
            try {
              const pdfData = await pdfParse(rawBuffer);
              text = pdfData.text || '';
            } catch {
              // Fallback: raw decode if pdf-parse fails
              text = rawBuffer.toString('utf-8');
            }
          } else {
            text = rawBuffer.toString('utf-8');
          }
          if (text.length > remaining) {
            text = text.substring(0, remaining) + '\n\n[... Document truncated — too large to process in full. Summarizing available content above ...]';
          }
          totalChars += text.length;
          docTexts.push(`\n\n--- File: ${f.name} ---\n${text}`);
        } catch {
          // skip unreadable files
        }
      }
      if (docTexts.length > 0) {
        fullPrompt += '\n\nAttached documents:' + docTexts.join('');
      }
    }

    // TEXT GENERATION — DeepSeek Chat (or OpenAI if model specified)
    const useOpenAI = model && (model.includes('gpt') || model.includes('openai'));
    const apiKey = useOpenAI ? OPENAI_KEY : DEEPSEEK_KEY;
    const apiHost = useOpenAI ? 'api.openai.com' : 'api.deepseek.com';
    const apiModel = useOpenAI ? 'gpt-4o-mini' : 'deepseek-chat';
    const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.text;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: fullPrompt },
    ];

    const result = await callAPI(apiHost, '/v1/chat/completions', apiKey, {
      model: apiModel,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
    });

    if (result.status !== 200 || !result.body.choices) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: result.body.error?.message || 'Generation failed' }),
      };
    }

    const generatedContent = result.body.choices[0].message.content;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: generatedContent,
        result: generatedContent,
        text: generatedContent,
        type: 'text',
        model: apiModel,
        usage: result.body.usage,
      }),
    };
  } catch (err) {
    console.error('Generate error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
