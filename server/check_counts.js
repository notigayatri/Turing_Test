require('dotenv').config();
const mongoose = require('mongoose');
const Response = require('./models/Response');
const Team = require('./models/Team');
const Question = require('./models/Question');

async function testCounts() {
  await mongoose.connect(process.env.MONGODB_URI);
  const totalTeams = await Team.countDocuments();
  const totalQuestions = await Question.countDocuments();
  const counts = await Response.aggregate([
    { $group: { _id: '$questionId', count: { $sum: 1 } } }
  ]);
  
  console.log('--- DATABASE SNAPSHOT ---');
  console.log('Total Teams Joined:', totalTeams);
  console.log('Total Questions:', totalQuestions);
  console.log('Responses per Question:');
  for (const c of counts) {
      const q = await Question.findById(c._id);
      console.log(`- PR: [${q?.title || 'Unknown'}] Responses: ${c.count}`);
  }
  process.exit(0);
}
testCounts().catch(console.error);
