import { Router } from 'express';

export const aiRouter = Router();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function callDeepSeek(messages, { maxTokens = 500, temperature = 0.3 } = {}) {
  const response = await fetch(DEEPSEEK_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Strip image references and code blocks for cleaner AI input
function stripForAI(content) {
  return content
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')  // Replace images with placeholder
    .replace(/```[\s\S]*?```/g, '')           // Remove code blocks
    .replace(/`[^`]+`/g, '')                  // Remove inline code
    .replace(/\[\[([^\]]+)\]\]/g, '$1')       // Convert wiki-links to plain text
    .trim();
}

// POST /api/ai/suggest-tags
// Given note content, suggest relevant tags
aiRouter.post('/suggest-tags', async (req, res) => {
  try {
    const { content, title } = req.body;
    if (!content || content.trim().length < 10) {
      return res.json({ tags: [] });
    }

    const cleanContent = stripForAI(content);
    if (cleanContent.length < 10) {
      return res.json({ tags: [] });
    }

    const prompt = `You are a tag suggestion system for a personal knowledge management app. Given a note's title and content, suggest 3-5 concise, relevant tags.

Rules:
- Tags should be lowercase, single words or hyphenated (e.g., "machine-learning")
- Focus on the main topics, concepts, and themes
- Avoid overly generic tags like "note" or "thought"
- Return ONLY a JSON array of strings, nothing else

Title: ${title || 'Untitled'}
Content: ${cleanContent.substring(0, 3000)}

Return ONLY a JSON array like: ["tag1", "tag2", "tag3"]`;

    const result = await callDeepSeek([
      { role: 'system', content: 'You are a precise tagging assistant. Return only valid JSON arrays.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 200, temperature: 0.2 });

    // Parse the result - try to extract JSON array
    let tags = [];
    try {
      const match = result.match(/\[.*\]/s);
      if (match) {
        tags = JSON.parse(match[0]);
      }
    } catch {
      // Fallback: extract words that look like tags
      tags = result.split(/[,\n]/).map(s => s.replace(/[^a-zA-Z0-9-]/g, '').trim().toLowerCase()).filter(Boolean).slice(0, 5);
    }

    res.json({ tags: tags.slice(0, 5) });
  } catch (err) {
    console.error('Tag suggestion error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/summarize
// Given note content, generate a brief summary
aiRouter.post('/summarize', async (req, res) => {
  try {
    const { content, title } = req.body;
    if (!content || content.trim().length < 20) {
      return res.json({ summary: 'Content too short to summarize.' });
    }

    const cleanContent = stripForAI(content);
    if (cleanContent.length < 20) {
      return res.json({ summary: 'Content is mostly images or code.' });
    }

    const prompt = `Summarize the following note in 2-3 concise sentences. Focus on the key ideas and main points. Write in the same language as the original content.

Title: ${title || 'Untitled'}

Content:
${cleanContent.substring(0, 4000)}

Summary:`;

    const summary = await callDeepSeek([
      { role: 'system', content: 'You are a helpful assistant that writes concise, accurate summaries.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 300, temperature: 0.3 });

    res.json({ summary });
  } catch (err) {
    console.error('Summarization error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/enhance
// Given note content, suggest improvements and related links
aiRouter.post('/enhance', async (req, res) => {
  try {
    const { content, title, existingNotes } = req.body;
    if (!content || content.trim().length < 20) {
      return res.json({ suggestions: [], wikiLinks: [] });
    }

    const cleanContent = stripForAI(content);

    const noteTitles = existingNotes || [];
    const titlesList = noteTitles.length > 0
      ? `\nExisting notes that could be linked: ${noteTitles.join(', ')}`
      : '';

    const prompt = `Given this note, suggest:
1. 1-2 ways to improve or expand the content (one sentence each)
2. 2-4 existing note titles that would make good [[wiki-links]] from this content

Title: ${title || 'Untitled'}
Content: ${cleanContent.substring(0, 3000)}${titlesList}

Return ONLY a JSON object like:
{
  "suggestions": ["improvement suggestion 1", "improvement suggestion 2"],
  "wikiLinks": ["Note Title 1", "Note Title 2"]
}`;

    const result = await callDeepSeek([
      { role: 'system', content: 'You are a knowledge management assistant. Return only valid JSON.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 400, temperature: 0.4 });

    let data = { suggestions: [], wikiLinks: [] };
    try {
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      }
    } catch {
      // Return empty on parse failure
    }

    res.json(data);
  } catch (err) {
    console.error('Enhance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
