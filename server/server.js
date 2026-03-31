require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const Question = require('./models/Question');
const Team = require('./models/Team');
const Response = require('./models/Response');
const GameState = require('./models/GameState');

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
app.use(express.json());

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

// Global State
let gameTimer = null;

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
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = setInterval(async () => {
    const state = await syncGameState();
    if (state.status === 'IN_PROGRESS' && !state.isPaused && state.phase === 'QUESTION') {
      if (state.timerRemaining > 0) {
        state.timerRemaining -= 1;
        await state.save();
        io.emit('timer-tick', { timerRemaining: state.timerRemaining });
      } else {
        // Timer reached 0 -> Show Results Phase
        clearInterval(gameTimer);
        state.phase = 'RESULT';
        await state.save();
        await autoSubmitMissing(state.currentQuestionIndex);
        broadcastState();
      }
    }
  }, 1000);
};

const autoSubmitMissing = async (questionIndex) => {
  const activeQuestion = await Question.findOne().skip(questionIndex).sort({ order: 1 });
  if (!activeQuestion) return;

  const allTeams = await Team.find();
  for (const team of allTeams) {
    const existing = await Response.findOne({ teamId: team._id, questionId: activeQuestion._id });
    if (!existing) {
      const emptyResponse = new Response({
        teamId: team._id,
        questionId: activeQuestion._id,
        selection: 'None',
        confidence: 1,
        reasoning: 'No answer provided.',
        understanding: 'No answer provided.',
        llmScore: 0,
        llmReasoning: 'No answer provided by team.',
        timestamp: new Date()
      });
      await emptyResponse.save();
    }
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
    await autoSubmitMissing(state.currentQuestionIndex);
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
    } catch (err) {
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
        const firstQuestion = await Question.findOne().sort({ order: 1 });
        state.timerRemaining = firstQuestion ? firstQuestion.timerDuration : 360;
        await state.save();
        broadcastState();
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

      // Clear Responses to start fresh on leaderboard
      await Response.deleteMany({});

      // Clear the server gameTimer if it was running
      if (gameTimer) clearInterval(gameTimer);

      // Announce the reset to all clients
      broadcastState();
    } catch (err) {
      console.error('Error in admin-reset:', err);
    }
  });

  socket.on('admin-delete-teams', async () => {
    try {
      await Team.deleteMany({});
      await Response.deleteMany({});
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
      if (state.status !== 'IN_PROGRESS' || state.timerRemaining <= 0 || state.phase !== 'QUESTION') {
        return socket.emit('error', 'Submissions are locked.');
      }

      const response = await Response.findOneAndUpdate(
        { teamId: data.teamId, questionId: data.questionId },
        { ...data, timestamp: new Date() },
        { upsert: true, new: true }
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
});

// Admin Routes for Question Management
app.get('/api/questions', async (req, res) => {
  const questions = await Question.find().sort({ order: 1 });
  res.json(questions);
});

app.post('/api/questions', async (req, res) => {
  const data = req.body;

  // Auto-generate Reasoning & Purpose via LLM if they are empty
  if (!data.answerReasoning || data.answerReasoning === 'No reasoning provided.' || !data.purpose || data.purpose === 'General code review assessment.') {
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Analyze this code review question for a game. The question is whether this code was written by a Human or AI.
        
Title: ${data.title}
Language: ${data.language}
Code:
${data.codeSnippet}
Correct Answer: ${data.correctOption}

Generate 1) A clear "Purpose" of what this code does. 2) A technical "Reasoning" justifying why the answer is ${data.correctOption} (be specific about coding patterns).
Output STRICTLY valid JSON only: {"purpose": "...", "reasoning": "..."}`;

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });

        const rawText = (result.text || '').replace(/```json/gi, '').replace(/```/gi, '').trim();
        const parsed = JSON.parse(rawText);
        
        if (parsed.purpose) data.purpose = parsed.purpose;
        if (parsed.reasoning) data.answerReasoning = parsed.reasoning;
        console.log('AI generated insights for question:', data.title);
      } catch (err) {
        console.error('AI insight generation failed:', err.message);
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

// Prompt Gemini for a single response
async function evaluateResponse(responseDoc, questionDoc) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Skipping LLM scoring: GEMINI_API_KEY not set.');
    return;
  }

  const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are a strict technical judge evaluating a student participant's reasoning in a coding game. 
  
Question: ${questionDoc.title}
Code (${questionDoc.language}):
${questionDoc.codeSnippet.substring(0, 1000)}

Participant Selection: ${responseDoc.selection} (Did they choose Human or AI?)
Participant Confidence (1-5): ${responseDoc.confidence}
Participant Reasoning: "${responseDoc.reasoning}"
Participant Understanding of Code: "${responseDoc.understanding}"

Rate their reasoning from 0 to 10.
- Judge their reasoning from a STUDENT coding perspective. 
- Human/Student Code: Usually involves brute force, lacks comments, and writes more lines than necessary for simple tasks.
- AI Code: Follows organized patterns, uses comments, is concise, and often utilizes optimized techniques.
- Score highly (8-10) if the participant identifies these specific traits.
- Score poorly (0-4) if their reasoning is vague, incorrect, or if they just repeat the purpose of the code without technical insight.
Output STRICTLY valid JSON ONLY without any markdown blocks. Example: {"score": 8, "reasoning": "Identified that brute force loop is typical of student human code."}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const rawText = (result.text || '').replace(/```json/gi, '').replace(/```/gi, '').trim();
    console.log('LLM Scorer Response:', rawText);
    const parsed = JSON.parse(rawText);

    responseDoc.llmScore = typeof parsed.score === 'number' ? parsed.score : 0;
    responseDoc.llmReasoning = parsed.reasoning || "No reasoning provided by LLM.";
    await responseDoc.save();
  } catch (err) {
    console.error('LLM Eval Error:', err.message);
  }
}

// Manually trigger scoring
app.post('/api/score-responses', async (req, res) => {
  const responses = await Response.find({ llmScore: null }).populate('questionId');
  for (const r of responses) {
    if (r.questionId) await evaluateResponse(r, r.questionId);
  }
  res.json({ success: true, scored: responses.length });
});

// Calculate Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    // 1. Ensure all responses are scored
    const unscored = await Response.find({ llmScore: null }).populate('questionId');
    for (const r of unscored) {
      if (r.questionId) await evaluateResponse(r, r.questionId);
    }

    // 2. Fetch all responses to compute scores
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
      const llmPts = r.llmScore || 0; // Up to 10 points for reasoning
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server fully operational on port ${PORT}`);
});
