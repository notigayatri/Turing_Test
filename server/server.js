require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const Question = require('./models/Question');
const Team = require('./models/Team');
const Response = require('./models/Response');
const GameState = require('./models/GameState');

const app = express();

// --- CORS Setup ---
const allowedBaseUrls = [
  (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, mobile, server-to-server)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedBaseUrls.indexOf(normalizedOrigin) !== -1 || !process.env.FRONTEND_URL) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Admin Middleware ---
// Protects sensitive REST routes that should only be called by the admin UI
function adminAuth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_PASSWORD is not set.' });
  }
  const secret = req.headers['x-admin-secret'];
  if (secret === process.env.ADMIN_PASSWORD) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden: Invalid admin secret.' });
}

// --- LLM Helper ---
// Calls Gemini with retry-on-rate-limit and model fallback
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampScore(score) {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function buildFallbackScore(responseDoc, questionDoc) {
  const reasoning = (responseDoc.reasoning || '').trim();
  const understanding = (responseDoc.understanding || '').trim();
  const combined = `${reasoning} ${understanding}`.toLowerCase();

  if (!combined) {
    return {
      score: 0,
      reasoning: 'No explanation was provided, so the response could not earn reasoning points.'
    };
  }

  const technicalSignals = [
    'comment', 'comments', 'naming', 'variable', 'function', 'loop', 'iteration',
    'complexity', 'brute force', 'optimized', 'optimization', 'structure', 'pattern',
    'style', 'readable', 'readability', 'consistent', 'inconsistent', 'edge case',
    'error handling', 'boilerplate', 'verbose', 'concise', 'helper', 'abstraction',
    'algorithm', 'modular', 'refactor', 'implementation'
  ];
  const evidenceSignals = ['because', 'since', 'suggests', 'indicates', 'shows', 'reveals', 'implies'];
  const genericPhrases = [
    'looks like ai', 'looks human', 'seems like ai', 'seems human',
    'just a guess', 'not sure', 'i think so', 'maybe ai', 'maybe human'
  ];

  let score = 1;

  if (reasoning.length >= 20) score += 2;
  if (understanding.length >= 20) score += 2;
  if (technicalSignals.some((signal) => combined.includes(signal))) score += 3;
  if (evidenceSignals.some((signal) => combined.includes(signal))) score += 1;
  if (combined.includes('human') || combined.includes('ai')) score += 1;
  if (questionDoc.language && combined.includes(String(questionDoc.language).toLowerCase())) score += 1;
  if (genericPhrases.some((phrase) => combined.includes(phrase))) score -= 2;
  if (combined.length < 30) score -= 1;

  const normalizedScore = clampScore(score);
  const feedback = normalizedScore >= 7
    ? 'Fallback scoring found concrete technical evidence in the explanation and a clear summary of the code.'
    : normalizedScore >= 4
      ? 'Fallback scoring found some useful reasoning, but it needs more code-specific evidence to earn a higher score.'
      : 'Fallback scoring found only limited technical support in the explanation, so the reasoning score stayed low.';

  return {
    score: normalizedScore,
    reasoning: `${feedback} Gemini feedback was unavailable, so a deterministic rubric was used instead.`
  };
}

function normalizeJudgeResult(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const numericScore = Number(parsed.score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  return {
    score: clampScore(numericScore),
    reasoning: typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
      ? parsed.reasoning.trim()
      : 'No feedback provided by judge.'
  };
}

async function callGeminiWithRetry(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;

  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  for (const modelName of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[LLM] Trying ${modelName} (attempt ${attempt}/${MAX_RETRIES})...`);
        const model = ai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });

        const rawText = result.response.text().trim();
        // Strip any accidental markdown wrapping
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned);
        console.log(`[LLM] Success with ${modelName}`);
        return parsed;
      } catch (err) {
        const isRateLimit = err.message && (
          err.message.includes('429') ||
          err.message.toLowerCase().includes('rate') ||
          err.message.toLowerCase().includes('quota')
        );

        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          console.warn(`[LLM] Rate limited on ${modelName}. Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        if (isRateLimit) {
          console.warn(`[LLM] Rate limit exhausted on ${modelName}. Trying next model...`);
          break; // try next model
        }

        // JSON parse error or other non-rate-limit error
        console.error(`[LLM] Error on ${modelName}:`, err.message);
        break; // try next model
      }
    }
  }

  console.error('[LLM] All models and retries exhausted. Returning null.');
  return null;
}

// --- Global Game Timer ---
let gameTimer = null;

// --- Retrieve correct current question (FIXED: sort BEFORE skip) ---
async function getCurrentQuestion(questionIndex) {
  const questions = await Question.find().sort({ order: 1 }).skip(questionIndex).limit(1);
  return questions[0] || null;
}

const syncGameState = async () => {
  let state = await GameState.findOne();
  if (!state) {
    state = new GameState();
    await state.save();
  }
  return state;
};

const broadcastState = async () => {
  try {
    const state = await syncGameState();
    const currentQuestion = await getCurrentQuestion(state.currentQuestionIndex);
    const totalQuestions = await Question.countDocuments();

    const payload = {
      status: state.status,
      phase: state.phase,
      currentQuestionIndex: state.currentQuestionIndex,
      timerRemaining: state.timerRemaining,
      isPaused: state.isPaused,
      currentQuestion: currentQuestion ? {
        _id: currentQuestion._id,
        title: currentQuestion.title,
        description: currentQuestion.description,
        codeSnippet: currentQuestion.codeSnippet,
        language: currentQuestion.language
      } : null,
      totalQuestions
    };

    // Only reveal answer in the RESULT phase
    if (state.phase === 'RESULT' && currentQuestion) {
      payload.currentQuestion.correctOption = currentQuestion.correctOption;
      payload.currentQuestion.answerReasoning = currentQuestion.answerReasoning;
      payload.currentQuestion.purpose = currentQuestion.purpose;
    }

    io.emit('state-update', payload);
  } catch (err) {
    console.error('[broadcastState] Error:', err.message);
  }
};

const startTimer = () => {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = setInterval(async () => {
    try {
      const state = await syncGameState();
      if (state.status === 'IN_PROGRESS' && !state.isPaused && state.phase === 'QUESTION') {
        if (state.timerRemaining > 0) {
          state.timerRemaining -= 1;
          await state.save();
          io.emit('timer-tick', { timerRemaining: state.timerRemaining });
        } else {
          // Timer expired → move to RESULT phase
          clearInterval(gameTimer);
          gameTimer = null;
          state.phase = 'RESULT';
          await state.save();
          await autoSubmitMissing(state.currentQuestionIndex);
          await broadcastState();
        }
      }
    } catch (err) {
      console.error('[Timer] Error:', err.message);
    }
  }, 1000);
};

const autoSubmitMissing = async (questionIndex) => {
  try {
    const activeQuestion = await getCurrentQuestion(questionIndex);
    if (!activeQuestion) return;

    const allTeams = await Team.find();
    for (const team of allTeams) {
      const existing = await Response.findOne({ teamId: team._id, questionId: activeQuestion._id });
      if (!existing) {
        await Response.create({
          teamId: team._id,
          questionId: activeQuestion._id,
          selection: 'None',
          confidence: 1,
          reasoning: 'No answer provided.',
          understanding: 'No answer provided.',
          llmScore: 0,
          llmReasoning: 'No answer submitted by team.',
          timestamp: new Date()
        });
      }
    }
  } catch (err) {
    console.error('[autoSubmitMissing] Error:', err.message);
  }
};

const advanceQuestion = async () => {
  const state = await syncGameState();
  const totalQuestions = await Question.countDocuments();

  if (state.phase === 'QUESTION') {
    // Admin clicked "Show Results" while timer was running
    if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
    state.phase = 'RESULT';
    state.timerRemaining = 0;
    await state.save();
    await autoSubmitMissing(state.currentQuestionIndex);
    await broadcastState();
  } else if (state.phase === 'RESULT') {
    if (state.currentQuestionIndex < totalQuestions - 1) {
      state.currentQuestionIndex += 1;
      state.phase = 'QUESTION';
      const nextQuestion = await getCurrentQuestion(state.currentQuestionIndex);
      state.timerRemaining = nextQuestion ? nextQuestion.timerDuration : 360;
      await state.save();
      await broadcastState();
      startTimer();
    } else {
      // All questions done → finish the game
      state.status = 'FINISHED';
      await state.save();
      await broadcastState();
    }
  }
};

// --- Socket.io Connection Handlers ---
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('join-team', async ({ teamName, roomNumber }) => {
    try {
      let team = await Team.findOne({ name: teamName });
      if (!team) {
        team = new Team({ name: teamName, room: roomNumber, socketId: socket.id });
        await team.save();
      } else {
        team.socketId = socket.id;
        await team.save();
      }
      socket.join('teams');
      socket.emit('joined', { teamId: team._id });
      await broadcastState();
    } catch (err) {
      console.error('[join-team] Error:', err.message);
      socket.emit('error', 'Team name already taken or invalid.');
    }
  });

  socket.on('admin-join', (password) => {
    if (password === process.env.ADMIN_PASSWORD) {
      socket.join('admin');
      socket.emit('admin-authorized');
      broadcastState();
    } else {
      socket.emit('admin-error', 'Incorrect admin password.');
    }
  });

  socket.on('admin-start', async () => {
    try {
      const state = await syncGameState();
      if (state.status === 'LOBBY') {
        state.status = 'IN_PROGRESS';
        state.phase = 'QUESTION';
        const firstQuestion = await getCurrentQuestion(0);
        state.timerRemaining = firstQuestion ? firstQuestion.timerDuration : 360;
        await state.save();
        await broadcastState();
        startTimer();
      }
    } catch (err) {
      console.error('[admin-start] Error:', err.message);
    }
  });

  socket.on('admin-reset', async () => {
    try {
      if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
      const state = await syncGameState();
      state.status = 'LOBBY';
      state.phase = 'QUESTION';
      state.currentQuestionIndex = 0;
      state.timerRemaining = 0;
      state.isPaused = false;
      await state.save();
      await Response.deleteMany({});
      await broadcastState();
    } catch (err) {
      console.error('[admin-reset] Error:', err.message);
    }
  });

  socket.on('admin-delete-teams', async () => {
    try {
      await Team.deleteMany({});
      await Response.deleteMany({});
      socket.emit('admin-message', 'All teams and their responses have been deleted.');
    } catch (err) {
      console.error('[admin-delete-teams] Error:', err.message);
    }
  });

  socket.on('admin-pause', async () => {
    try {
      const state = await syncGameState();
      state.isPaused = !state.isPaused;
      await state.save();
      await broadcastState();
    } catch (err) {
      console.error('[admin-pause] Error:', err.message);
    }
  });

  socket.on('admin-next', async () => {
    try {
      await advanceQuestion();
    } catch (err) {
      console.error('[admin-next] Error:', err.message);
    }
  });

  socket.on('submit-response', async (data) => {
    try {
      const state = await syncGameState();
      if (state.status !== 'IN_PROGRESS' || state.timerRemaining <= 0 || state.phase !== 'QUESTION') {
        return socket.emit('error', 'Submissions are locked.');
      }

      // Guard: only save if selection is a valid enum value
      const validSelections = ['Human', 'AI', 'None'];
      if (!data.selection || !validSelections.includes(data.selection)) {
        // Silently ignore auto-saves with no selection yet selected
        return;
      }

      await Response.findOneAndUpdate(
        { teamId: data.teamId, questionId: data.questionId },
        {
          teamId: data.teamId,
          questionId: data.questionId,
          selection: data.selection,
          confidence: data.confidence || 1,
          reasoning: data.reasoning || '',
          understanding: data.understanding || '',
          llmScore: null,
          llmReasoning: null,
          timestamp: new Date()
        },
        { upsert: true, new: true, runValidators: true }
      );

      socket.emit('response-saved');

      const teamCount = await Team.countDocuments();
      const submissionCount = await Response.countDocuments({ questionId: data.questionId });
      io.to('admin').emit('submission-progress', { submissionCount, teamCount });
    } catch (err) {
      console.error('[submit-response] Error:', err.message);
      socket.emit('error', 'Failed to save response.');
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// ─── REST API Routes ─────────────────────────────────────────────────────────

// Questions (admin-only write operations)
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find().sort({ order: 1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch questions.' });
  }
});

app.post('/api/questions', adminAuth, async (req, res) => {
  try {
    const data = req.body;

    // Auto-generate Reasoning & Purpose via LLM if they are blank/default
    const needsReasoning = !data.answerReasoning || data.answerReasoning === 'No reasoning provided.';
    const needsPurpose = !data.purpose || data.purpose === 'General code review assessment.';

    if (needsReasoning || needsPurpose) {
      const prompt = `Analyze this code review question for a game called "PR Detective". 
The question is whether this code was written by a Human or an AI.

Title: ${data.title}
Language: ${data.language}
Code:
${data.codeSnippet}
Correct Answer: ${data.correctOption}

Generate:
1. A clear "purpose" of what this code does (1-2 sentences).
2. A technical "reasoning" justifying WHY the answer is "${data.correctOption}" (cite specific code patterns, style choices, or structure).

Output STRICTLY valid JSON only, no markdown, no extra text:
{"purpose": "...", "reasoning": "..."}`;

      const parsed = await callGeminiWithRetry(prompt);
      if (parsed) {
        if (needsPurpose && parsed.purpose) data.purpose = parsed.purpose;
        if (needsReasoning && parsed.reasoning) data.answerReasoning = parsed.reasoning;
        console.log(`[AI] Generated insights for question: "${data.title}"`);
      }
    }

    const question = new Question(data);
    await question.save();
    res.json(question);
  } catch (err) {
    console.error('[POST /api/questions] Error:', err.message);
    res.status(500).json({ error: 'Failed to save question: ' + err.message });
  }
});

app.delete('/api/questions/:id', adminAuth, async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question.' });
  }
});

// Results & Exports
app.get('/api/results', adminAuth, async (req, res) => {
  try {
    const results = await Response.find().populate('teamId').populate('questionId');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch results.' });
  }
});

app.get('/api/export-csv', adminAuth, async (req, res) => {
  try {
    const responses = await Response.find().populate('teamId').populate('questionId');
    let csv = 'Team Name,Room,Question Title,Selection,Confidence,Reasoning,Understanding,Timestamp\n';
    responses.forEach(r => {
      const safe = (s) => (s || '').replace(/"/g, '""');
      csv += `"${safe(r.teamId?.name)}","${safe(r.teamId?.room)}","${safe(r.questionId?.title)}","${r.selection}","${r.confidence}","${safe(r.reasoning)}","${safe(r.understanding)}","${r.timestamp?.toISOString()}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=results.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
});

// LLM Scoring Engine
async function evaluateResponse(responseDoc, questionDoc) {
  const prompt = `You are a strict technical judge evaluating a student participant's reasoning in a coding game called "PR Detective".

Question Title: ${questionDoc.title}
Programming Language: ${questionDoc.language}
Code Snippet (first 1200 chars):
${questionDoc.codeSnippet.substring(0, 1200)}

Correct Answer: ${questionDoc.correctOption}
Participant's Answer: ${responseDoc.selection}
Participant's Confidence (1-5): ${responseDoc.confidence}
Participant's Reasoning: "${responseDoc.reasoning}"
Participant's Code Understanding: "${responseDoc.understanding}"

SCORING RULES:
- Score range is 0-10 (integers only).
- Judge their REASONING quality, not just whether they got the answer right.
- Human Code traits: brute-force logic, fewer comments, inconsistent naming, longer than necessary.
- AI Code traits: structured patterns, detailed comments, concise optimized code, consistent style.
- Score 8-10: Participant clearly identified specific technical traits (naming, structure, comments, algorithmic style).
- Score 5-7: Participant made a reasonable observation but missed specific technical cues.
- Score 2-4: Reasoning is generic or vague (e.g., "it looks like AI because it's clean").
- Score 0-1: Reasoning is empty, irrelevant, or just restates the code.
- IMPORTANT: Do NOT give a 0 score as a penalty for a wrong answer. Score the reasoning quality independently.

Output ONLY valid JSON, no markdown blocks:
{"score": <integer 0-10>, "reasoning": "<1-2 sentence explanation of your score>"}`;

  const parsed = await callGeminiWithRetry(prompt);
  const judged = normalizeJudgeResult(parsed);
  const finalResult = judged || buildFallbackScore(responseDoc, questionDoc);

  responseDoc.llmScore = finalResult.score;
  responseDoc.llmReasoning = finalResult.reasoning;
  await responseDoc.save();
  console.log(`[LLM] Scored response ${responseDoc._id}: ${finalResult.score}/10${judged ? '' : ' (fallback)'}`);
  return { usedFallback: !judged, score: finalResult.score };
}

// Trigger AI scoring for all unscored responses
app.post('/api/score-responses', adminAuth, async (req, res) => {
  try {
    const shouldForce = req.body?.force === true;
    const filter = shouldForce
      ? { selection: { $ne: 'None' } }
      : { selection: { $ne: 'None' }, $or: [{ llmScore: null }, { llmReasoning: null }] };

    const responses = await Response.find(filter).populate('questionId');
    let scored = 0;
    let fallbackCount = 0;
    for (const r of responses) {
      if (r.questionId) {
        const result = await evaluateResponse(r, r.questionId);
        if (result?.usedFallback) {
          fallbackCount += 1;
        }
        scored++;
        // Small delay between calls to avoid immediate rate-limits
        if (scored < responses.length) await sleep(1000);
      }
    }
    res.json({ success: true, scored, fallbackCount });
  } catch (err) {
    console.error('[POST /api/score-responses] Error:', err.message);
    res.status(500).json({ error: 'Scoring failed: ' + err.message });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const allResponses = await Response.find().populate('teamId').populate('questionId');
    const teamScores = {};

    allResponses.forEach(r => {
      if (!r.teamId || !r.questionId) return;
      const tid = r.teamId._id.toString();
      if (!teamScores[tid]) {
        teamScores[tid] = { teamName: r.teamId.name, totalScore: 0, breakdowns: [] };
      }

      const isCorrect = r.selection === r.questionId.correctOption;
      const basePoints = isCorrect ? 10 : 0;
      const llmPts = typeof r.llmScore === 'number' ? r.llmScore : 0;
      const totalPts = basePoints + llmPts;

      teamScores[tid].totalScore += totalPts;
      teamScores[tid].breakdowns.push({
        qTitle: r.questionId.title,
        isCorrect,
        basePoints,
        llmScore: llmPts
      });
    });

    const leaderboard = Object.values(teamScores).sort((a, b) => b.totalScore - a.totalScore);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate leaderboard.' });
  }
});

// Export LLM feedback as CSV
app.get('/api/export-llm-csv', adminAuth, async (req, res) => {
  try {
    const responses = await Response.find().populate('teamId').populate('questionId');
    let csv = 'Team Name,Question Title,Correct Answer,Team Selection,Is Correct,LLM Score,LLM Reasoning\n';
    responses.forEach(r => {
      const safe = (s) => (s || '').replace(/"/g, '""');
      const isCorrect = r.selection === r.questionId?.correctOption ? 'Yes' : 'No';
      csv += `"${safe(r.teamId?.name)}","${safe(r.questionId?.title)}","${r.questionId?.correctOption || ''}","${r.selection}","${isCorrect}","${r.llmScore ?? 'Unscored'}","${safe(r.llmReasoning)}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=llm-feedback.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export LLM CSV.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
