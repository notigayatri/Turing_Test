const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
  status: { type: String, enum: ['LOBBY', 'IN_PROGRESS', 'FINISHED'], default: 'LOBBY' },
  phase: { type: String, enum: ['QUESTION', 'RESULT'], default: 'QUESTION' },
  currentQuestionIndex: { type: Number, default: 0 },
  timerRemaining: { type: Number, default: 0 },
  isPaused: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameState', GameStateSchema);
