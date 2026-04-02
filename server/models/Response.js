const mongoose = require('mongoose');

const ResponseSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  selection: { type: String, enum: ['Human', 'AI', 'None', ''], default: '' },
  confidence: { type: Number, min: 1, max: 5, required: true },
  reasoning: { type: String, default: '' },
  understanding: { type: String, default: '' },
  llmScore: { type: Number, default: null },
  llmReasoning: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
});

// Index to prevent duplicate submissions from the same team for the same question
ResponseSchema.index({ teamId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('Response', ResponseSchema);
