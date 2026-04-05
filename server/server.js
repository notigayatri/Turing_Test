require('dotenv').config({ override: true });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

// Round 2 models
const Question = require('./models/Question');
const Team = require('./models/Team');
const Response = require('./models/Response');
const GameState = require('./models/GameState');

// Round 1 models
const R1Question = require('./models/R1Question');
const R1Response = require('./models/R1Response');
const R1GameState = require('./models/R1GameState');

const app = express();

// Handle CORS origins (production + local)
const allowedBaseUrls = [
  (process.env.FRONTEND_URL || '').replace(/\/$/, ""),
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // Check if the origin (without trailing slash) matches any of our allowed base URLs
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedBaseUrls.indexOf(normalizedOrigin) !== -1 || !process.env.FRONTEND_URL) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    ...corsOptions,
    methods: ['GET', 'POST']
  }
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Global State — Round 2
let gameTimer = null;

// Global State — Round 1
let r1Timer = null;

const syncGameState = async () => {
  let state = await GameState.findOne();
  if (!state) {
    state = new GameState();
    await state.save();
  }
  return state;
};

const broadcastState = async () => {
  const state = await syncGameState();
  const currentQuestion = await Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
  const totalQuestions = await Question.countDocuments();

  const payload = {
    status: state.status,
    phase: state.phase, // New Phase field
    currentQuestionIndex: state.currentQuestionIndex,
    timerRemaining: state.timerRemaining,
    isPaused: state.isPaused,
    showFinalLeaderboard: state.showFinalLeaderboard,
    currentQuestion: currentQuestion ? {
      _id: currentQuestion._id,
      title: currentQuestion.title,
      description: currentQuestion.description,
      codeSnippet: currentQuestion.codeSnippet,
      language: currentQuestion.language
    } : null,
    totalQuestions
  };

  // Only send answer details if we are in the RESULT phase
  if (state.phase === 'RESULT' && currentQuestion) {
    payload.currentQuestion.correctOption = currentQuestion.correctOption;
    payload.currentQuestion.answerReasoning = currentQuestion.answerReasoning;
    payload.currentQuestion.purpose = currentQuestion.purpose;
  }

  io.emit('state-update', payload);
};

const startTimer = () => {
  if (gameTimer) clearTimeout(gameTimer);
  
  const tick = async () => {
    const state = await syncGameState();
    if (state.status === 'IN_PROGRESS' && !state.isPaused && state.phase === 'QUESTION') {
      if (state.timerRemaining > 0) {
        state.timerRemaining -= 1;
        await state.save();
        io.emit('timer-tick', { timerRemaining: state.timerRemaining });
        gameTimer = setTimeout(tick, 1000);
      } else {
        // Timer reached 0 -> Show Results Phase
        state.phase = 'RESULT';
        state.timerRemaining = 0;
        await state.save();
        const currentQ = await Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
        if (currentQ) await autoSubmitMissing(currentQ._id);
        broadcastState();
      }
    }
  };
  gameTimer = setTimeout(tick, 1000);
};

const autoSubmitMissing = async (questionId) => {
  try {
    const allTeams = await Team.find();
    if (!allTeams.length) return;

    // Use a single bulkWrite to efficiently create missing responses for 75+ teams at once
    // llmScore: -1 is a sentinel meaning "auto-submitted, skip LLM scoring"
    const ops = allTeams.map(team => ({
      updateOne: {
        filter: { teamId: team._id, questionId: questionId },
        update: {
          $setOnInsert: {
            teamId: team._id,
            questionId: questionId,
            selection: 'None',
            confidence: 1,
            reasoning: 'No answer provided.',
            understanding: 'No answer provided.',
            llmScore: -1,
            llmReasoning: 'No answer provided by team.',
            timestamp: new Date()
          }
        },
        upsert: true
      }
    }));

    await Response.bulkWrite(ops);
    console.log(`Auto-submit finalized for ${allTeams.length} teams.`);
  } catch (err) {
    console.error('Auto-submit failed:', err.message);
  }
};

const advanceQuestion = async () => {
  const state = await syncGameState();
  const totalQuestions = await Question.countDocuments();

  if (state.phase === 'QUESTION') {
    // Admin manually clicked "Next" while timer was running -> Trigger Show Answer
    state.phase = 'RESULT';
    state.timerRemaining = 0;
    await state.save();
    const currentQ = await Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
    if (currentQ) await autoSubmitMissing(currentQ._id);
    broadcastState();
  } else if (state.phase === 'RESULT') {
    // Current question results finished -> Pull Next PR
    if (state.currentQuestionIndex < totalQuestions - 1) {
      state.currentQuestionIndex += 1;
      state.phase = 'QUESTION';
      const nextQuestion = await Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
      state.timerRemaining = nextQuestion ? nextQuestion.timerDuration : 360;
      await state.save();
      broadcastState();
      io.emit('timer-tick', { timerRemaining: state.timerRemaining });
      startTimer();
    } else {
      state.status = 'FINISHED';
      await state.save();
      broadcastState();
    }
  }
};

// Socket.io Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
      broadcastState();
      broadcastR1State();
    } catch (err) {
      socket.emit('error', 'Team name already taken or invalid.');
    }
  });

  socket.on('admin-join', (password) => {
    if (password === process.env.ADMIN_PASSWORD) {
      socket.join('admin');
      socket.emit('admin-authorized');
      broadcastState();
      broadcastR1State();
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
        const firstQuestion = await Question.findOne().sort({ order: 1 });
        state.timerRemaining = firstQuestion ? firstQuestion.timerDuration : 360;
        await state.save();
        broadcastState();
        // Immediate emit
        io.emit('timer-tick', { timerRemaining: state.timerRemaining });
        startTimer();
      }
    } catch (err) {
      console.error('Error in admin-start:', err);
    }
  });

  socket.on('admin-reset', async () => {
    try {
      const state = await syncGameState();
      state.status = 'LOBBY';
      state.phase = 'QUESTION';
      state.currentQuestionIndex = 0;
      state.timerRemaining = 0;
      state.isPaused = false;
      await state.save();

      // Clear all data to start fresh
      await Team.deleteMany({});
      await Response.deleteMany({});
      await R1Response.deleteMany({});

      const r1State = await syncR1State();
      r1State.status = 'LOBBY';
      r1State.currentQuestionIndex = 0;
      await r1State.save();
      broadcastR1State();

      // Clear the server gameTimer if it was running
      if (gameTimer) clearTimeout(gameTimer);

      // Announce the reset to all clients
      broadcastState();
      io.emit('redirect-home');
    } catch (err) {
      console.error('Error in admin-reset:', err);
    }
  });

  socket.on('admin-delete-teams', async () => {
    try {
      await Team.deleteMany({});
      await Response.deleteMany({});
      await R1Response.deleteMany({});
      const r1State = await syncR1State();
      r1State.status = 'LOBBY';
      r1State.currentQuestionIndex = 0;
      await r1State.save();
      const r2State = await syncGameState();
      r2State.status = 'LOBBY';
      r2State.currentQuestionIndex = 0;
      await r2State.save();
      broadcastState();
      broadcastR1State();
      io.emit('redirect-home');
      socket.emit('admin-message', 'All teams and their responses have been deleted.');
    } catch (err) {
      console.error('Error in admin-delete-teams:', err);
    }
  });

  socket.on('admin-pause', async () => {
    try {
      const state = await syncGameState();
      state.isPaused = !state.isPaused;
      await state.save();
      broadcastState();
    } catch (err) {
      console.error('Error in admin-pause:', err);
    }
  });

  socket.on('admin-next', async () => {
    try {
      await advanceQuestion();
    } catch (err) {
      console.error('Error in admin-next:', err);
    }
  });

  socket.on('submit-response', async (data) => {
    try {
      const state = await syncGameState();
      // Allow a 2-second grace period for submissions after timer hits 0
      const isGracePeriod = state.phase === 'RESULT' && state.timerRemaining <= 0;

      if (state.status !== 'IN_PROGRESS' || (!isGracePeriod && state.phase !== 'QUESTION')) {
        return socket.emit('error', 'Submissions are locked.');
      }
      
      const team = await Team.findById(data.teamId);
      if (!team) return socket.emit('error', 'Team not found.');

      const response = await Response.findOneAndUpdate(
        { teamId: data.teamId, questionId: data.questionId },
        { ...data, timestamp: new Date() },
        { upsert: true, returnDocument: 'after' }
      );

      socket.emit('response-saved');
      // Notify admins of progress
      const teamCount = await Team.countDocuments();
      const submissionCount = await Response.countDocuments({ questionId: data.questionId });
      io.to('admin').emit('submission-progress', { submissionCount, teamCount });
    } catch (err) {
      console.error('Error saving response:', err);
      socket.emit('error', 'Failed to save response.');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // ─────────────────────────────────────────────────────────────────
  // ROUND 1 SOCKET EVENTS
  // ─────────────────────────────────────────────────────────────────

  socket.on('r1-admin-start', async () => {
    try {
      const state = await syncR1State();
      if (state.status === 'LOBBY') {
        state.status = 'IN_PROGRESS';
        state.phase = 'QUESTION';
        const firstQ = await R1Question.findOne().sort({ order: 1 });
        state.timerRemaining = firstQ ? firstQ.timerDuration : 60;
        state.timerTotal = firstQ ? firstQ.timerDuration : 60;
        await state.save();
        broadcastR1State();
        // Emit first tick immediately instead of waiting 1s
        io.emit('r1-timer-tick', { timerRemaining: state.timerRemaining, timerTotal: state.timerTotal });
        startR1Timer();
      }
    } catch (err) { console.error('r1-admin-start error:', err); }
  });

  socket.on('r1-admin-pause', async () => {
    try {
      const state = await syncR1State();
      state.isPaused = !state.isPaused;
      await state.save();
      broadcastR1State();
    } catch (err) { console.error('r1-admin-pause error:', err); }
  });

  socket.on('r1-admin-next', async () => {
    try {
      await advanceR1Question();
    } catch (err) { console.error('r1-admin-next error:', err); }
  });

  socket.on('r1-admin-reset', async () => {
    try {
      const state = await syncR1State();
      state.status = 'LOBBY';
      state.phase = 'QUESTION';
      state.currentQuestionIndex = 0;
      state.timerRemaining = 0;
      state.isPaused = false;
      await state.save();
      await R1Response.deleteMany({});
      if (r1Timer) clearTimeout(r1Timer);
      broadcastR1State();
    } catch (err) { console.error('r1-admin-reset error:', err); }
  });

  socket.on('r1-admin-toggle-leaderboard', async () => {
    try {
      const state = await syncR1State();
      state.showLeaderboard = !state.showLeaderboard;
      await state.save();
      broadcastR1State();
    } catch (err) { console.error('r1-toggle-leaderboard error:', err); }
  });

  socket.on('r1-submit', async (data) => {
    try {
      const state = await syncR1State();
      const isGracePeriod = state.phase === 'RESULT' && state.timerRemaining <= 0;
      if (state.status !== 'IN_PROGRESS' || (!isGracePeriod && state.phase !== 'QUESTION')) {
        return socket.emit('error', 'R1: Submissions are locked.');
      }

      const question = await R1Question.findById(data.questionId);
      if (!question) return;

      const isCorrect = data.answer === question.correctAnswer;
      const timerTotal = state.timerTotal || question.timerDuration;
      const responseTime = Math.max(0, timerTotal - state.timerRemaining);

      // Points awarded as per admin setting (no speed bonus as requested)
      let score = isCorrect ? question.maxPoints : 0;


      await R1Response.findOneAndUpdate(
        { teamId: data.teamId, questionId: data.questionId },
        { answer: data.answer, responseTime, timerTotal, score, isCorrect, timestamp: new Date() },
        { upsert: true, returnDocument: 'after' }
      );

      socket.emit('r1-response-saved');

      // Broadcast live leaderboard update after every submission if enabled
      const lbState = await syncR1State();
      if (lbState.showLeaderboard) {
        const lb = await computeR1Leaderboard();
        io.emit('r1-leaderboard-update', lb.slice(0, 10));
      }

      const teamCount = await Team.countDocuments();
      const subCount = await R1Response.countDocuments({ questionId: data.questionId });
      io.to('admin').emit('r1-submission-progress', { subCount, teamCount });
    } catch (err) {
      console.error('r1-submit error:', err);
      socket.emit('error', 'Failed to save R1 response.');
    }
  });

  socket.on('r1-get-state', () => {
    broadcastR1State();
  });

  socket.on('admin-get-state', () => {
    broadcastState();
    broadcastR1State();
  });

  socket.on('admin-toggle-final-leaderboard', async () => {
    try {
      const state = await syncGameState();
      state.showFinalLeaderboard = !state.showFinalLeaderboard;
      await state.save();
      broadcastState();
    } catch (err) { console.error('toggle-final-lb error:', err); }
  });
});

// ─────────────────────────────────────────────────────────────────
// ROUND 1 — SERVER HELPERS
// ─────────────────────────────────────────────────────────────────

const syncR1State = async () => {
  let state = await R1GameState.findOne();
  if (!state) { state = new R1GameState(); await state.save(); }
  return state;
};

const computeR1Leaderboard = async () => {
  const responses = await R1Response.find().populate('teamId').populate('questionId');
  const scores = {};
  responses.forEach(r => {
    if (!r.teamId) return;
    const tid = r.teamId._id.toString();
    if (!scores[tid]) scores[tid] = { teamName: r.teamId.name, room: r.teamId.room, totalScore: 0, correct: 0, answered: 0 };
    scores[tid].totalScore += r.score || 0;
    if (r.isCorrect) scores[tid].correct += 1;
    if (r.answer !== 'None') scores[tid].answered += 1;
  });
  return Object.values(scores).sort((a, b) => b.totalScore - a.totalScore);
};

const broadcastR1State = async () => {
  const state = await syncR1State();
  const currentQ = await R1Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
  const totalQ = await R1Question.countDocuments();

  const payload = {
    status: state.status,
    phase: state.phase,
    currentQuestionIndex: state.currentQuestionIndex,
    timerRemaining: state.timerRemaining,
    timerTotal: state.timerTotal,
    isPaused: state.isPaused,
    showLeaderboard: state.showLeaderboard,
    totalQuestions: totalQ,
    currentQuestion: currentQ ? {
      _id: currentQ._id,
      prompt: currentQ.prompt,
      mediaText: currentQ.mediaText,
      mediaCode: currentQ.mediaCode,
      mediaCodeLang: currentQ.mediaCodeLang,
      mediaImageUrl: currentQ.mediaImageUrl,
      mediaAudioUrl: currentQ.mediaAudioUrl,
      mediaVideoUrl: currentQ.mediaVideoUrl,
      timerDuration: currentQ.timerDuration,
      maxPoints: currentQ.maxPoints
    } : null
  };

  // Only reveal answer in RESULT phase
  if (state.phase === 'RESULT' && currentQ) {
    payload.currentQuestion.correctAnswer = currentQ.correctAnswer;
    payload.currentQuestion.explanation = currentQ.explanation;
  }

  io.emit('r1-state-update', payload);

  // Also push leaderboard if enabled and in RESULT phase
  if (state.phase === 'RESULT' && state.showLeaderboard) {
    const lb = await computeR1Leaderboard();
    io.emit('r1-leaderboard-update', lb.slice(0, 10));
  }
};

const autoSubmitR1Missing = async (questionId) => {
  try {
    const allTeams = await Team.find();
    if (!allTeams.length) return;
    const ops = allTeams.map(team => ({
      updateOne: {
        filter: { teamId: team._id, questionId },
        update: { $setOnInsert: { teamId: team._id, questionId, answer: 'None', responseTime: 0, score: 0, isCorrect: false, timestamp: new Date() } },
        upsert: true
      }
    }));
    await R1Response.bulkWrite(ops);
  } catch (err) { console.error('R1 auto-submit failed:', err.message); }
};

const startR1Timer = () => {
  if (r1Timer) clearTimeout(r1Timer);
  
  const tick = async () => {
    const state = await syncR1State();
    if (state.status === 'IN_PROGRESS' && !state.isPaused && state.phase === 'QUESTION') {
      if (state.timerRemaining > 0) {
        state.timerRemaining -= 1;
        await state.save();
        io.emit('r1-timer-tick', { timerRemaining: state.timerRemaining, timerTotal: state.timerTotal });
        r1Timer = setTimeout(tick, 1000);
      } else {
        // Time's Up
        state.phase = 'RESULT';
        state.timerRemaining = 0;
        await state.save();
        const currentQ = await R1Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
        if (currentQ) await autoSubmitR1Missing(currentQ._id);
        broadcastR1State();
      }
    }
  };
  r1Timer = setTimeout(tick, 1000);
};

const advanceR1Question = async () => {
  const state = await syncR1State();
  const totalQ = await R1Question.countDocuments();

  if (state.phase === 'QUESTION') {
    // Force show results
    state.phase = 'RESULT';
    state.timerRemaining = 0;
    await state.save();
    const currentQ = await R1Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
    if (currentQ) await autoSubmitR1Missing(currentQ._id);
    broadcastR1State();
  } else if (state.phase === 'RESULT') {
    if (state.currentQuestionIndex < totalQ - 1) {
      state.currentQuestionIndex += 1;
      state.phase = 'QUESTION';
      const nextQ = await R1Question.findOne().skip(state.currentQuestionIndex).sort({ order: 1 });
      state.timerRemaining = nextQ ? nextQ.timerDuration : 60;
      state.timerTotal = nextQ ? nextQ.timerDuration : 60;
      await state.save();
      broadcastR1State();
      io.emit('r1-timer-tick', { timerRemaining: state.timerRemaining, timerTotal: state.timerTotal });
      startR1Timer();
    } else {
      state.status = 'FINISHED';
      await state.save();
      broadcastR1State();
    }
  }
};

// ─────────────────────────────────────────────────────────────────
// ROUND 2 — Admin Routes for Question Management
app.get('/api/questions', async (req, res) => {
  const questions = await Question.find().sort({ order: 1 });
  res.json(questions);
});

app.post('/api/questions', async (req, res) => {
  const data = req.body;

  // Auto-increment order to ensure new questions appear at the end
  if (!data.order || data.order === 1) {
    const lastQ = await Question.findOne().sort({ order: -1 });
    data.order = lastQ ? lastQ.order + 1 : 1;
  }

  // Auto-generate Reasoning & Purpose via LLM if they are empty
  if (!data.answerReasoning || data.answerReasoning === 'No reasoning provided.' || !data.purpose || data.purpose === 'General code review assessment.') {
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `Analyze this code review question for a game. The question is whether this code was written by a Human or AI.
        
Title: ${data.title}
Language: ${data.language}
Code:
${data.codeSnippet}
Correct Answer: ${data.correctOption}

Generate 1) A clear "Purpose" of what this code does (MAX 2 LINES). 2) A technical "Reasoning" justifying why the answer is ${data.correctOption} (be specific about coding patterns, MAX 2 LINES).
Output STRICTLY valid JSON only: {"purpose": "...", "reasoning": "..."}`;

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });

        const rawOutput = result.response.text();
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON block found in AI response');

        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.purpose) data.purpose = parsed.purpose;
        if (parsed.reasoning) data.answerReasoning = parsed.reasoning;
        console.log('AI generated insights for question:', data.title);
      } catch (err) {
        console.error('AI insight generation failed:', err.message);
        data.purpose = "API ERROR: " + err.message;
        data.answerReasoning = "API_ERROR: " + err.message;
      }
    }
  }

  const question = new Question(data);
  await question.save();
  res.json(question);
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Export Results
app.get('/api/results', async (req, res) => {
  const results = await Response.find().populate('teamId').populate('questionId');
  res.json(results);
});

// Export Results as CSV
app.get('/api/export-csv', async (req, res) => {
  try {
    const responses = await Response.find().populate('teamId').populate('questionId');
    let csv = 'Team Name,Room,Question Title,Selection,Confidence,Reasoning,Understanding,Timestamp\n';

    responses.forEach(r => {
      csv += `"${r.teamId?.name || 'Unknown'}","${r.teamId?.room || ''}","${r.questionId?.title || ''}","${r.selection}","${r.confidence}","${r.reasoning.replace(/"/g, '""')}","${r.understanding.replace(/"/g, '""')}","${r.timestamp.toISOString()}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=results.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Prompt Gemini for a single response — with retry logic for 429 errors
async function evaluateResponse(responseDoc, questionDoc, retryCount = 0) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Skipping LLM scoring: GEMINI_API_KEY not set.');
    return;
  }

  // Skip auto-submitted empty responses
  if (responseDoc.selection === 'None' || !responseDoc.reasoning || responseDoc.reasoning === 'No answer provided.') {
    responseDoc.llmScore = 0;
    responseDoc.llmReasoning = 'No answer provided by team.';
    await responseDoc.save();
    return;
  }

  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a strict, completely unbiased, and deterministic technical judge grading a student participant's answer in a Turing Test coding game.

Context: 
Question: "${questionDoc.title}"
Code (${questionDoc.language}):
${questionDoc.codeSnippet.substring(0, 1000)}

Student's Answer:
Selection: ${responseDoc.selection || "None"}
Confidence Level: ${responseDoc.confidence} (out of 5)
Reasoning: "${responseDoc.reasoning}"
Understanding of Code: "${responseDoc.understanding}"

GRADING RUBRIC (Assign a score from 0 to 10 strictly based on this criteria, accounting for confidence):
- Score 0: They did not provide an answer or the reasoning is entirely incorrect and contradicts the code.
- Score 2-4: The reasoning is generic with no specific reference to the code provided. High confidence (4-5) on a generic answer should lean closer to 2; low confidence (1-2) can lean toward 4.
- Score 5-7: They correctly identify basic traits (e.g., naming, loops) but lack deeper technical depth.
- Score 8-10: They offer precise, technically sound reasoning. A high confidence (4-5) combined with precise reasoning earns a 9-10. Low confidence on good reasoning earns an 8.

You MUST be objective. Output STRICTLY valid JSON ONLY. (MAX 2 LINES for "reasoning"). Example: {"score": 8, "reasoning": "Properly identified that the brute-force methodology is typical of inexperienced students, albeit with low confidence."}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 }
    });

    const rawOutput = result.response.text();
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON block found in AI score response');

    console.log('LLM Scorer Output:', jsonMatch[0]);
    const parsed = JSON.parse(jsonMatch[0]);

    responseDoc.llmScore = typeof parsed.score === 'number' ? parsed.score : (Number(parsed.score) || 0);
    responseDoc.llmReasoning = parsed.reasoning || "No reasoning provided by LLM.";
    await responseDoc.save();
    console.log(`✅ Scored team: ${responseDoc.teamId?.name || responseDoc.teamId} → ${responseDoc.llmScore}/10`);
  } catch (err) {
    // Retry on 429 with exponential backoff (up to 3 retries)
    if (err.message.includes('429') && retryCount < 3) {
      const waitTime = Math.pow(2, retryCount + 1) * 5000; // 10s, 20s, 40s
      console.warn(`⏳ Rate limited. Retrying in ${waitTime / 1000}s (attempt ${retryCount + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return evaluateResponse(responseDoc, questionDoc, retryCount + 1);
    }
    console.error(`❌ LLM Eval Error [${responseDoc._id}]:`, err.message);
    // Don't set llmScore to 0 on transient errors — leave as null so it can be retried
    if (err.message.includes('429') || err.message.includes('503')) {
      console.warn('  → Leaving score as null for future retry.');
    } else {
      responseDoc.llmScore = 0;
      responseDoc.llmReasoning = "API ERROR: " + err.message;
      await responseDoc.save();
    }
  }
}

// Manually trigger scoring with batching for 75+ teams
// Gemini 2.5 Flash free tier: 10 RPM, 250 RPD
app.post('/api/score-responses', async (req, res) => {
  try {
    // Only find responses that genuinely need scoring:
    // - llmScore is null (never scored)
    // - Exclude auto-submitted blank responses (llmScore: -1) and already-scored ones
    const responses = await Response.find({
      llmScore: null,
      selection: { $ne: 'None' }  // Skip teams that didn't answer
    }).populate('questionId').populate('teamId');

    if (!responses.length) return res.json({ success: true, scored: 0, message: 'All responses are already scored.' });

    console.log(`\n🎯 Starting scoring for ${responses.length} responses (skipping auto-submitted blanks)...`);
    res.json({ success: true, scoring: responses.length, message: `Scoring ${responses.length} responses in background...` });

    // Process in background so admin doesn't have to wait
    let scored = 0;
    let errors = 0;

    // Process in batches of 2 with 8s wait to stay under 10 RPM
    for (let i = 0; i < responses.length; i += 2) {
      const batch = responses.slice(i, i + 2);
      const results = await Promise.allSettled(
        batch.map(r => r.questionId ? evaluateResponse(r, r.questionId) : Promise.resolve())
      );
      results.forEach(r => { if (r.status === 'fulfilled') scored++; else errors++; });

      if (i + 2 < responses.length) {
        console.log(`  Batch ${Math.floor(i/2)+1} done (${scored} scored, ${errors} errors). Waiting 8s...`);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }
    console.log(`\n✅ Scoring complete: ${scored} scored, ${errors} errors out of ${responses.length} total.`);
  } catch (err) {
    console.error('Manual scoring failure:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Scoring failed' });
  }
});

// Calculate Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Note: AI-Scoring is now handled separately by /api/score-responses to prevent timeouts

    // 1. Fetch all responses to compute scores
    const allResponses = await Response.find().populate('teamId').populate('questionId');
    const teamScores = {}; // { teamId: { teamName, totalScore, details: [] } }

    allResponses.forEach(r => {
      if (!r.teamId || !r.questionId) return;
      const tid = r.teamId._id.toString();
      if (!teamScores[tid]) {
        teamScores[tid] = { teamName: r.teamId.name, totalScore: 0, breakdowns: [] };
      }

      const isCorrect = r.selection === r.questionId.correctOption;
      const basePoints = isCorrect ? 10 : 0; // 10 points for correct guess
      const llmPts = (r.llmScore && r.llmScore > 0) ? r.llmScore : 0; // Up to 10 points for reasoning (-1 = auto-submitted)
      const totalPts = basePoints + llmPts;

      teamScores[tid].totalScore += totalPts;
      teamScores[tid].breakdowns.push({
        qTitle: r.questionId.title,
        isCorrect,
        basePoints,
        llmScore: llmPts
      });
    });

    // 3. Sort leaderboard
    const leaderboard = Object.values(teamScores).sort((a, b) => b.totalScore - a.totalScore);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate leaderboard' });
  }
});

// Export LLM Details CSV
app.get('/api/export-llm-csv', async (req, res) => {
  try {
    const responses = await Response.find().populate('teamId').populate('questionId');
    let csv = 'Team Name,Question Title,Correct Answer,Team Selection,LLM Score,LLM Reasoning\n';

    responses.forEach(r => {
      csv += `"${r.teamId?.name || 'Unknown'}","${r.questionId?.title || ''}","${r.questionId?.correctOption || ''}","${r.selection}","${r.llmScore ?? 'Unscored'}","${(r.llmReasoning || '').replace(/"/g, '""')}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=llm-reasoning.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ROUND 1 — REST Routes
// ─────────────────────────────────────────────────────────────────

// List R1 questions
app.get('/api/r1/questions', async (req, res) => {
  const questions = await R1Question.find().sort({ order: 1 });
  res.json(questions);
});

async function uploadToCloudinary(base64Str, resourceType = 'auto') {
  if (!base64Str || !base64Str.startsWith('data:')) return { url: base64Str, id: '' };
  try {
    const result = await cloudinary.uploader.upload(base64Str, { resource_type: resourceType, folder: 'turing_test' });
    return { url: result.secure_url, id: result.public_id };
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return { url: base64Str, id: '' };
  }
}

// Create R1 question (supports base64 media inline in body)
app.post('/api/r1/questions', async (req, res) => {
  try {
    const data = req.body;

    if (data.mediaImageUrl) {
      const { url, id } = await uploadToCloudinary(data.mediaImageUrl, 'image');
      data.mediaImageUrl = url;
      data.mediaImageId = id;
    }
    if (data.mediaAudioUrl) {
      const { url, id } = await uploadToCloudinary(data.mediaAudioUrl, 'video'); // audio is categorized under video in cloudinary
      data.mediaAudioUrl = url;
      data.mediaAudioId = id;
    }
    if (data.mediaVideoUrl) {
      const { url, id } = await uploadToCloudinary(data.mediaVideoUrl, 'video');
      data.mediaVideoUrl = url;
      data.mediaVideoId = id;
    }

    if (!data.order || data.order === 1) {
      const lastQ = await R1Question.findOne().sort({ order: -1 });
      data.order = lastQ ? lastQ.order + 1 : 1;
    }
    const question = new R1Question(data);
    await question.save();
    res.json(question);
  } catch (err) {
    console.error('Error saving R1Question:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete R1 question
app.delete('/api/r1/questions/:id', async (req, res) => {
  try {
    const q = await R1Question.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });

    if (q.mediaImageId) await cloudinary.uploader.destroy(q.mediaImageId, { resource_type: 'image' }).catch(console.error);
    if (q.mediaAudioId) await cloudinary.uploader.destroy(q.mediaAudioId, { resource_type: 'video' }).catch(console.error);
    if (q.mediaVideoId) await cloudinary.uploader.destroy(q.mediaVideoId, { resource_type: 'video' }).catch(console.error);

    await R1Question.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete R1 Q Error:', err);
    res.status(500).json({ error: 'Failed to delete R1 question' });
  }
});

// R1 Responses
app.get('/api/r1/responses', async (req, res) => {
  const responses = await R1Response.find().populate('teamId').populate('questionId');
  res.json(responses);
});

// R1 Leaderboard
app.get('/api/r1/leaderboard', async (req, res) => {
  try {
    const lb = await computeR1Leaderboard();
    res.json(lb);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate R1 leaderboard' });
  }
});

// Combined Leaderboard (R1 + R2)
app.get('/api/combined-leaderboard', async (req, res) => {
  try {
    // --- Round 2 scores ---
    const r2Responses = await Response.find().populate('teamId').populate('questionId');
    const r2Scores = {};
    r2Responses.forEach(r => {
      if (!r.teamId || !r.questionId) return;
      const tid = r.teamId._id.toString();
      if (!r2Scores[tid]) r2Scores[tid] = { teamName: r.teamId.name, room: r.teamId.room || '', r2Score: 0 };
      const base = r.selection === r.questionId.correctOption ? 10 : 0;
      const llm = (r.llmScore && r.llmScore > 0) ? r.llmScore : 0;
      r2Scores[tid].r2Score += base + llm;
    });

    // --- Round 1 scores ---
    const r1Responses = await R1Response.find().populate('teamId');
    const r1Scores = {};
    r1Responses.forEach(r => {
      if (!r.teamId) return;
      const tid = r.teamId._id.toString();
      if (!r1Scores[tid]) r1Scores[tid] = { teamName: r.teamId.name, room: r.teamId.room || '', r1Score: 0 };
      r1Scores[tid].r1Score += r.score || 0;
    });

    // --- Merge ---
    const allTeamIds = new Set([...Object.keys(r2Scores), ...Object.keys(r1Scores)]);
    const combined = [];
    allTeamIds.forEach(tid => {
      const r1 = r1Scores[tid] || { r1Score: 0 };
      const r2 = r2Scores[tid] || { r2Score: 0 };
      const name = (r1Scores[tid] || r2Scores[tid]).teamName;
      const room = (r1Scores[tid] || r2Scores[tid]).room;
      combined.push({ teamName: name, room, r1Score: r1.r1Score, r2Score: r2.r2Score, total: r1.r1Score + r2.r2Score });
    });
    combined.sort((a, b) => b.total - a.total);
    res.json(combined);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate combined leaderboard' });
  }
});

// R1 CSV Export
app.get('/api/r1/export-csv', async (req, res) => {
  try {
    const responses = await R1Response.find().populate('teamId').populate('questionId');
    let csv = 'Team Name,Room,Question Order,Answer,Correct,Response Time (s),Score\n';
    responses.forEach(r => {
      csv += `"${r.teamId?.name || ''}","${r.teamId?.room || ''}","${r.questionId?.order || ''}","${r.answer}","${r.isCorrect}","${r.responseTime}","${r.score}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=r1-results.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export R1 CSV' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server fully operational on port ${PORT}`);
});
