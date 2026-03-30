const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  room: { type: String },
  socketId: { type: String },
  joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', TeamSchema);
