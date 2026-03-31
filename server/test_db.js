require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question.js');
const Response = require('./models/Response.js');

async function testDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const q = await Question.findOne().sort({ _id: -1 });
  if (q) {
      console.log('--- LATEST QUESTION ---');
      console.log('Title:', q.title);
      console.log('Purpose:', q.purpose);
      console.log('Reasoning:', q.answerReasoning);
  } else {
      console.log('No questions found in database.');
  }

  const r = await Response.findOne().sort({ _id: -1 });
  if (r) {
      console.log('--- LATEST RESPONSE ---');
      console.log('Team:', r.teamId);
      console.log('LLM Score:', r.llmScore);
      console.log('LLM Reasoning:', r.llmReasoning);
  } else {
      console.log('No responses found in database.');
  }

  process.exit(0);
}
testDB().catch(console.error);
