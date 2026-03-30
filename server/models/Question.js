const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  codeSnippet: { type: String, required: true },
  language: { type: String, default: 'javascript' },
  correctOption: { type: String, enum: ['Human', 'AI'], required: true },
  answerReasoning: { type: String, default: 'No reasoning provided.' },
  purpose: { type: String, default: 'General code review assessment.' },
  timerDuration: { type: Number, default: 360 }, // in seconds (6 mins)
  order: { type: Number, required: true }
});

module.exports = mongoose.model('Question', QuestionSchema);
