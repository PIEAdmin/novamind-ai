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
  // Check for common English words — garbled PDFs will have almost none
  const common = ['the','and','for','with','that','this','from','have','been','are','was','not','you','all','can','has','one','our','out','will','your','about','more','work','experience','team','management','skills','years','company','provide','services','business','professional','education','training','developed','responsible','including'];
  const joined = ' ' + text.toLowerCase() + ' ';
  let hits = 0;
  for (const w of common) {
    if (joined.includes(' ' + w + ' ')) hits++;
  }
  // If at least 4 common words found, text is probably readable
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

  // Basic auth check — verify Bearer token exists
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
    // FILE UPLOADS — Two-step approach for all document types
    // Step 1: Extract text (Vision for images, pdf-parse for PDFs)
    // Step 2: Generate content with DeepSeek using extracted text
    // ========================================================

    const imageFiles = (files || []).filter((f) => f.type && f.type.startsWith('image/'));
    const docFiles = (files || []).filter((f) => f.type && !f.type.startsWith('image/'));

    // IMAGES WITH DOCUMENTS — GPT-4o Vision (high detail) + DeepSeek generation
    if (imageFiles.length > 0) {
      // Step 1: Extract text/content from images using GPT-4o with high detail
      const extractionParts = [
        { type: 'text', text: 'Carefully examine this image. If it contains a document (resume, letter, contract, report, form, etc.), extract ALL text content exactly as written — every word, every section, every bullet point, every detail. Preserve the structure, sections, and formatting. If it is a non-document image (photo, graphic, artwork), describe it in thorough detail including colors, composition, subjects, and context. Return only the extracted/described content, no meta-commentary.' },
        ...imageFiles.map((f) => ({
          type: 'image_url',
          image_url: { url: `data:${f.type};base64,${f.data}`, detail: 'high' },
        })),
      ];

      const extractionResult = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: extractionParts }],
        max_tokens: 4096,
      });

      if (extractionResult.status !== 200 || !extractionResult.body.choices) {
        // Fallback: try gpt-4o-mini if gpt-4o fails
        const fallbackResult = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: extractionParts }],
          max_tokens: 4096,
        });
        if (fallbackResult.status !== 200 || !fallbackResult.body.choices) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Vision analysis failed. Please try again or paste the text directly.' }),
          };
        }
        var extractedText = fallbackResult.body.choices[0].message.content;
      } else {
        var extractedText = extractionResult.body.choices[0].message.content;
      }

      // Step 2: Generate content using DeepSeek with extracted text + user's prompt
      const systemPrompt = customSystemPrompt || SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.text;
      const combinedPrompt = `${prompt}\n\nHere is the content extracted from the uploaded document/image:\n\n${extractedText}`;

      const genResult = await callAPI('api.deepseek.com', '/v1/chat/completions', DEEPSEEK_KEY, {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: combinedPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      });

      if (genResult.status !== 200 || !genResult.body.choices) {
        // Fallback: return the Vision-extracted text if DeepSeek fails
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ content: extractedText, result: extractedText, text: extractedText, type: 'text' }),
        };
      }

      const generatedContent = genResult.body.choices[0].message.content;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          content: generatedContent,
          result: generatedContent,
          text: generatedContent,
          type: 'text',
          model: 'deepseek-chat',
          usage: genResult.body.usage,
        }),
      };
    }

    // PDF & DOCUMENT FILES — pdf-parse with quality check + Vision API fallback
    const MAX_DOC_CHARS = 500000;
    let fullPrompt = prompt;
    if (docFiles.length > 0) {
      let totalChars = 0;
      const docTexts = [];
      for (const f of docFiles) {
        try {
          const remaining = MAX_DOC_CHARS - totalChars;
          if (remaining <= 0) break;
          const rawBuffer = Buffer.from(f.data, 'base64');
          let text = '';
          const isPdf = (f.type && f.type.includes('pdf')) || (f.name && f.name.toLowerCase().endsWith('.pdf'));

          if (isPdf) {
            // Try pdf-parse first
            let pdfText = '';
            if (pdfParse) {
              try {
                const pdfData = await pdfParse(rawBuffer);
                pdfText = pdfData.text || '';
              } catch {
                pdfText = '';
              }
            }

            // Quality check — if pdf-parse produced garbled/empty text, use Vision API
            if (!isTextQualityOK(pdfText)) {
              console.log(`PDF quality check failed for ${f.name} — trying Vision API fallback`);
              try {
                // Try sending PDF as data URL to Vision API (GPT-4o supports this)
                const visionResult = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
                  model: 'gpt-4o',
                  messages: [{
                    role: 'user',
                    content: [
                      { type: 'text', text: 'This file is a PDF document. Extract ALL text content from it exactly as written — every word, every section, every bullet point, every detail. Preserve the structure and formatting. Return only the extracted text.' },
                      { type: 'file', file: { filename: f.name || 'document.pdf', file_data: `data:application/pdf;base64,${f.data}` } },
                    ]
                  }],
                  max_tokens: 4096,
                });
                if (visionResult.status === 200 && visionResult.body.choices) {
                  pdfText = visionResult.body.choices[0].message.content;
                }
              } catch {
                // Vision fallback failed
              }

              // If still bad quality, try image_url approach
              if (!isTextQualityOK(pdfText)) {
                try {
                  const visionResult2 = await callAPI('api.openai.com', '/v1/chat/completions', OPENAI_KEY, {
                    model: 'gpt-4o',
                    messages: [{
                      role: 'user',
                      content: [
                        { type: 'text', text: 'Extract ALL text from this document exactly as written. Return every word, section, and detail.' },
                        { type: 'image_url', image_url: { url: `data:application/pdf;base64,${f.data}`, detail: 'high' } },
                      ]
                    }],
                    max_tokens: 4096,
                  });
                  if (visionResult2.status === 200 && visionResult2.body.choices) {
                    pdfText = visionResult2.body.choices[0].message.content;
                  }
                } catch {
                  // All Vision fallbacks failed
                }
              }

              // Last resort: if we have garbled text, add context for the AI to interpret
              if (pdfText.length > 0 && !isTextQualityOK(pdfText)) {
                pdfText = '[NOTE: The text below was extracted from a PDF with font encoding issues. Some characters may be garbled or substituted. Please interpret the content as best you can, inferring the correct words from context.]\n\n' + pdfText;
              }
            }

            text = pdfText;
          } else {
            // Non-PDF documents — direct text decode
            text = rawBuffer.toString('utf-8');
          }

          if (!text || text.trim().length === 0) {
            text = '[Document could not be read. The file may be scanned/image-based. Please try uploading a photo/screenshot of the document instead, or paste the text directly.]';
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
