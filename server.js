const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';

function buildLocalFallbackReply(message, mood) {
  const text = String(message || '').trim();
  const isLikelySentence = /[a-zA-Z]/.test(text);
  const gentleLead =
    mood === 'frustrated'
      ? "You're doing your best, and that matters."
      : mood === 'confident'
        ? 'Great energy, keep stretching your English.'
        : 'Nice effort, keep practicing steadily.';

  let correctionLine = '';
  if (isLikelySentence && text.length > 0) {
    const fixed = text.charAt(0).toUpperCase() + text.slice(1).replace(/\s+/g, ' ').trim();
    correctionLine = ` 💡 Correction: ${fixed} - Start with a capital letter and keep spacing clear.`;
  }

  return `${gentleLead}${correctionLine} Can you write one more sentence about your day?`;
}

function looksLikeQuotaError(status, errorData) {
  const message = String(errorData?.error?.message || '').toLowerCase();
  return status === 429 || message.includes('quota') || message.includes('rate limit');
}

async function callGemini(prompt, maxOutputTokens = 220) {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.json();
    const err = new Error(errorData?.error?.message || 'Gemini request failed');
    err.status = geminiResponse.status;
    err.errorData = errorData;
    throw err;
  }

  const data = await geminiResponse.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'echomind',
    timestamp: new Date().toISOString(),
    hasApiKey: Boolean(GEMINI_API_KEY)
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, topic, mood, difficulty } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required.'
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Server is missing GEMINI_API_KEY in .env'
      });
    }

    const diffNum = Math.max(0, Math.min(100, Number(difficulty) || 30));
    const diffLabel = diffNum > 75 ? 'Hard' : diffNum > 40 ? 'Medium' : 'Easy';

    let toneInstruction = 'Be supportive, friendly, and correct mistakes gently.';
    if (mood === 'frustrated') {
      toneInstruction = 'The student seems frustrated. Be very gentle, simplify language, and lower pressure.';
    } else if (mood === 'confident') {
      toneInstruction = 'The student seems confident. Raise challenge with richer vocabulary or phrasing.';
    }

    const fullPrompt = `You are EchoMind AI English Tutor.
Topic: ${topic || 'Daily Conversation'}
Difficulty: ${diffLabel} (${diffNum}/100)
Mood: ${mood || 'neutral'}

Rules:
1) Gently correct mistakes with exactly this pattern when needed:
"💡 Correction: [fixed sentence] - [explanation]"
2) Keep response under 60 words.
3) End every response with a follow-up question.
4) Never shame or criticize the student.
5) ${toneInstruction}
6) Keep vocabulary and examples aligned to topic.

Student message:
${message}`;

    let aiResponse = '';
    try {
      aiResponse = await callGemini(fullPrompt, 160);
    } catch (geminiError) {
      if (looksLikeQuotaError(geminiError.status, geminiError.errorData)) {
        return res.json({
          success: true,
          fallback: true,
          response: buildLocalFallbackReply(message, mood),
          message:
            'Gemini quota is currently exceeded for this project/key. Switched to local tutor fallback. Enable billing or wait for quota reset to use Gemini again.'
        });
      }

      return res.status(geminiError.status || 500).json({
        success: false,
        message: geminiError.message || 'Gemini request failed'
      });
    }
    if (!aiResponse) {
      return res.status(502).json({
        success: false,
        message: 'Gemini returned an empty response'
      });
    }

    res.json({
      success: true,
      response: aiResponse,
      metadata: {
        topic: topic || 'Daily Conversation',
        difficulty: diffLabel,
        mood: mood || 'neutral'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/assignment/generate', async (req, res) => {
  try {
    const { difficulty, assignmentType, topic, chatHistory } = req.body || {};
    const historySnippet = Array.isArray(chatHistory) ? chatHistory.slice(-5).join('\n') : '';

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: 'Server is missing GEMINI_API_KEY in .env' });
    }

    const prompt = `You are an English tutor creating one assignment.
Return valid JSON only with keys: title, prompt, imageUrl.
Difficulty: ${difficulty || 'Medium'}
Type: ${assignmentType || 'past_tense'}
Topic: ${topic || 'Daily Conversation'}
Student recent chat:
${historySnippet || 'No history'}

Rules:
- For describe_image, include a public imageUrl.
- For others imageUrl should be empty string.
- Keep prompt clear and concise.`;

    try {
      const text = await callGemini(prompt, 260);
      const parsed = JSON.parse(text);
      return res.json({ success: true, assignment: parsed });
    } catch (geminiError) {
      if (looksLikeQuotaError(geminiError.status, geminiError.errorData)) {
        const fallbackByType = {
          past_tense: {
            title: 'Past Tense Practice',
            prompt: 'Write 5 sentences about what you did yesterday using past tense verbs.',
            imageUrl: ''
          },
          describe_image: {
            title: 'Image Description',
            prompt: 'Describe the image in 6-8 sentences using clear adjectives and prepositions.',
            imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=60'
          },
          sentence_correction: {
            title: 'Sentence Correction Drill',
            prompt: 'Correct these 10 incorrect sentences and write the fixed versions clearly.',
            imageUrl: ''
          },
          short_paragraph: {
            title: 'Short Paragraph Writing',
            prompt: 'Write a 50-100 word paragraph about your favorite place to visit and why.',
            imageUrl: ''
          }
        };
        return res.json({
          success: true,
          fallback: true,
          assignment: fallbackByType[assignmentType] || fallbackByType.past_tense
        });
      }

      return res.status(geminiError.status || 500).json({ success: false, message: geminiError.message });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/assignment/grade', async (req, res) => {
  try {
    const { assignmentPrompt, answer, difficulty } = req.body || {};
    if (!answer || !String(answer).trim()) {
      return res.status(400).json({ success: false, message: 'Answer is required for grading.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: 'Server is missing GEMINI_API_KEY in .env' });
    }

    const prompt = `You are an English teacher grading student work.
Return valid JSON only with keys: score, feedback.
Score must be 0-100 integer.
Difficulty: ${difficulty || 'Medium'}
Assignment:
${assignmentPrompt || 'N/A'}
Student Answer:
${answer}`;

    try {
      const text = await callGemini(prompt, 220);
      const parsed = JSON.parse(text);
      return res.json({ success: true, result: parsed });
    } catch (geminiError) {
      if (looksLikeQuotaError(geminiError.status, geminiError.errorData)) {
        const wordCount = String(answer).trim().split(/\s+/).filter(Boolean).length;
        const score = Math.max(45, Math.min(95, 40 + wordCount));
        return res.json({
          success: true,
          fallback: true,
          result: {
            score,
            feedback:
              'Good effort. Focus on tense consistency, punctuation, and clearer sentence structure. Keep practicing and expand your vocabulary.'
          }
        });
      }

      return res.status(geminiError.status || 500).json({ success: false, message: geminiError.message });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`EchoMind server running at http://localhost:${PORT}`);
});