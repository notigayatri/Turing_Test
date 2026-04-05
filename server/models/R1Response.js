const mongoose = require('mongoose');

const R1ResponseSchema = new mongoose.Schema({
  teamId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  questionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'R1Question', required: true },
  answer:       { type: String, enum: ['Human', 'AI', 'None'], default: 'None' },
  responseTime: { type: Number, default: 0 },   // seconds taken to answer
  timerTotal:   { type: Number, default: 60 },  // total timer for this question
  score:        { type: Number, default: 0 },
  isCorrect:    { type: Boolean, default: false },
  timestamp:    { type: Date, default: Date.now }
});

// Prevent duplicate submissions per team per question
R1ResponseSchema.index({ teamId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('R1Response', R1ResponseSchema);
