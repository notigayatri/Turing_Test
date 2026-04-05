const mongoose = require('mongoose');

const R1GameStateSchema = new mongoose.Schema({
  status:               { type: String, enum: ['LOBBY', 'IN_PROGRESS', 'FINISHED'], default: 'LOBBY' },
  phase:                { type: String, enum: ['QUESTION', 'RESULT'], default: 'QUESTION' },
  currentQuestionIndex: { type: Number, default: 0 },
  timerRemaining:       { type: Number, default: 0 },
  timerTotal:           { type: Number, default: 60 },
  isPaused:             { type: Boolean, default: false },
  showLeaderboard:      { type: Boolean, default: true },
  lastUpdated:          { type: Date, default: Date.now }
});

module.exports = mongoose.model('R1GameState', R1GameStateSchema);
