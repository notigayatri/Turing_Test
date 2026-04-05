const mongoose = require('mongoose');

const R1QuestionSchema = new mongoose.Schema({
  prompt: { type: String, default: 'Is the following content AI-generated or Human-created?' },
  // Multimedia content fields (any combination can be used)
  mediaText:      { type: String, default: '' },
  mediaCode:      { type: String, default: '' },
  mediaCodeLang:  { type: String, default: 'javascript' },
  mediaImageUrl:  { type: String, default: '' }, // base64 data URI or URL
  mediaImageId:   { type: String, default: '' }, // Cloudinary public_id
  mediaAudioUrl:  { type: String, default: '' }, // base64 data URI or URL
  mediaAudioId:   { type: String, default: '' }, // Cloudinary public_id
  mediaVideoUrl:  { type: String, default: '' }, // base64 data URI or URL
  mediaVideoId:   { type: String, default: '' }, // Cloudinary public_id
  // Answer & explanation
  correctAnswer:  { type: String, enum: ['Human', 'AI'], required: true },
  explanation:    { type: String, default: 'No explanation provided.' },
  // Config
  timerDuration:  { type: Number, default: 60 }, // seconds
  maxPoints:      { type: Number, default: 100 },
  order:          { type: Number, required: true }
});

module.exports = mongoose.model('R1Question', R1QuestionSchema);
