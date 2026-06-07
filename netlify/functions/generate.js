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

// Quality check for text extracted from PDFs — detects garbled font encoding
function isTextQualityOK(text) {
  if (!text || text.trim().length < 30) return false;
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 5) return false;
  const common = ['the','and','for','with','that','this','from','have','been','are','was','not','you','all','can','has','one','our','out','will','your','about','more','work','experience','team','management','skills','years','company','provide','services','business','professional','education','training','developed','responsible','including'];
  const joined = ' ' + text.toLowerCase() + ' ';
  let hits = 0;
  for (const w of common) {
    if (joined.includes(' ' + w + ' ')) hits++;
  }
  return hits >= 4;
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

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.length < 20) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { type, prompt, model, files, systemPrompt: customSystemPrompt } = JSON.parse(event.body || '{}');

    if (!prompt || !type) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt or type' }) };
    }

    // IMAGE GENERATION — OpenAI GPT Image (gpt-image-1)
    if (type === 'image') {
      const safePrompt = prompt + '. IMPORTANT LAYOUT RULES: Keep all text, logos, and important elements well within safe margins — at least 10% padding from every edge. Never place text or key visuals at the very top, bottom, or sides of the image. Center the composition with comfortable breathing room on all sides.';
      const sizeMatch = prompt.match(/(\d{3,4})x(\d{3,4})/);
      const imageSize = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : '1024x1024';
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

    // ========================================================
    // FILE UPLOADS — Optimized single-call approach
    // Images: GPT-4o does extract+generate in ONE call
    // PDFs: pdf-parse (local) → DeepSeek (1 call) or GPT-4o fallback (1 call)
    // ========================================================

    const imageFiles = (files || []).filter((f) => f.type && f.type.startsWith('image/'));
    const docFiles = (files || []).filter((f) => f.type && !f.type.startsWith('image/'));

    // IMAGES — Single GPT-4o call: extract + generate combined
    if (imageFiles.length > 0) {
      const systemPrompt = customSystemPrompt || SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.text;
      const visionParts = [
        { type: 'text', text: `${systemPrompt}\n\nThe user has uploaded an image (which may be a document, resume, photo, or graphic). First, carefully read and understand any text or content in the image. Then, fulfill the user's request based on that content.\n\nUser's request: ${prompt}` },
        ...imageFiles.map((f) => ({
          type: 'image_url',
          image_url: { url: `data:${f.type};base64,${f.data}`, detail: 'high' },
        })),
      ];

      const result = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: visionParts }],
        max_tokens: 4096,
        temperature: 0.7,
      });

      if (result.status !== 200 || !result.body.choices) {
        // Fallback to gpt-4o-mini
        const fallback = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: visionParts }],
          max_tokens: 4096,
          temperature: 0.7,
        });
        if (fallback.status !== 200 || !fallback.body.choices) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Vision analysis failed. Please try again or paste the text directly.' }),
          };
        }
        const content = fallback.body.choices[0].message.content;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ content, result: content, text: content, type: 'text', model: 'gpt-4o-mini' }),
        };
      }

      const content = result.body.choices[0].message.content;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          content, result: content, text: content,
          type: 'text', model: 'gpt-4o', usage: result.body.usage,
        }),
      };
    }

    // PDF & DOCUMENT FILES — pdf-parse (local) then single API call
    const MAX_DOC_CHARS = 500000;
    let fullPrompt = prompt;
    if (docFiles.length > 0) {
      let totalChars = 0;
      const docTexts = [];
      let anyPdfGarbled = false;
      let garbledPdfFile = null;

      for (const f of docFiles) {
        try {
          const remaining = MAX_DOC_CHARS - totalChars;
          if (remaining <= 0) break;
          const rawBuffer = Buffer.from(f.data, 'base64');
          let text = '';
          const isPdf = (f.type && f.type.includes('pdf')) || (f.name && f.name.toLowerCase().endsWith('.pdf'));

          if (isPdf) {
            let pdfText = '';
            if (pdfParse) {
              try {
                const pdfData = await pdfParse(rawBuffer);
                pdfText = pdfData.text || '';
              } catch {
                pdfText = '';
              }
            }

            if (isTextQualityOK(pdfText)) {
              // pdf-parse worked great — use extracted text
              text = pdfText;
            } else {
              // pdf-parse failed — flag for Vision fallback
              anyPdfGarbled = true;
              garbledPdfFile = f;
              text = '';
            }
          } else {
            text = rawBuffer.toString('utf-8');
          }

          if (text && text.trim().length > 0) {
            if (text.length > remaining) {
              text = text.substring(0, remaining) + '\n\n[... Document truncated — too large to process in full ...]';
            }
            totalChars += text.length;
            docTexts.push(`\n\n--- File: ${f.name} ---\n${text}`);
          }
        } catch {
          // skip unreadable files
        }
      }

      // If we have clean extracted text, add to prompt for DeepSeek
      if (docTexts.length > 0) {
        fullPrompt += '\n\nAttached documents:' + docTexts.join('');
      }

      // If a PDF was garbled, use GPT-4o Vision as single-call fallback
      if (anyPdfGarbled && garbledPdfFile) {
        const systemPrompt = customSystemPrompt || SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.text;
        // Try file-based approach first (GPT-4o supports PDF files directly)
        try {
          const visionResult = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: `${systemPrompt}\n\nThe user has uploaded a PDF document. Read the document carefully and completely, then fulfill their request.\n\nUser's request: ${prompt}` },
                { type: 'file', file: { filename: garbledPdfFile.name || 'document.pdf', file_data: `data:application/pdf;base64,${garbledPdfFile.data}` } },
              ]
            }],
            max_tokens: 4096,
            temperature: 0.7,
          });
          if (visionResult.status === 200 && visionResult.body.choices) {
            const content = visionResult.body.choices[0].message.content;
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                content, result: content, text: content,
                type: 'text', model: 'gpt-4o', usage: visionResult.body.usage,
              }),
            };
          }
        } catch {
          // file approach failed, try image_url approach
        }

        // Fallback: send PDF as image_url
        try {
          const visionResult2 = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: `${systemPrompt}\n\nThe user has uploaded a document. Read it carefully and fulfill their request.\n\nUser's request: ${prompt}` },
                { type: 'image_url', image_url: { url: `data:application/pdf;base64,${garbledPdfFile.data}`, detail: 'high' } },
              ]
            }],
            max_tokens: 4096,
            temperature: 0.7,
          });
          if (visionResult2.status === 200 && visionResult2.body.choices) {
            const content = visionResult2.body.choices[0].message.content;
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                content, result: content, text: content,
                type: 'text', model: 'gpt-4o', usage: visionResult2.body.usage,
              }),
            };
          }
        } catch {
          // both Vision approaches failed
        }

        // Last resort: tell DeepSeek the text may be garbled
        if (!docTexts.length) {
          fullPrompt += '\n\n[NOTE: A PDF document was uploaded but could not be read properly. Please let the user know and ask them to paste the text directly or upload a screenshot instead.]';
        }
      }
    }

    // TEXT GENERATION — DeepSeek Chat (or OpenAI if model specified)
    const useOpenAI = model && (model.includes('gpt') || model.includes('openai'));
    const apiKey = useOpenAI ? OPENAI_KEY : DEEPSEEK_KEY;
    const apiHost = useOpenAI ? 'api.openai.com' : 'api.deepseek.com';
    const apiModel = useOpenAI ? 'gpt-4o-mini' : 'deepseek-chat';
    const systemPrompt = customSystemPrompt || SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.text;

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
