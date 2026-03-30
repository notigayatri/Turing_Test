require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
const GameState = require('./models/GameState');

const sampleQuestions = [
  {
    title: "Refactor user authentication flow",
    description: "Simplified the login logic by consolidating redundant checks and improved error handling for unexpected API responses.",
    codeSnippet: `async function login(username, password) {
  if (!username || !password) throw new Error('Missing credentials');
  
  const user = await db.users.findOne({ username });
  if (!user) throw new Error('User not found');
  
  const isValid = await bcrypt.compare(password, user.hash);
  if (!isValid) throw new Error('Invalid password');
  
  return generateToken(user);
}`,
    language: "javascript",
    correctOption: "Human",
    answerReasoning: "Uses common developer boilerplate with specific error handling for edge cases, which is very typical of real-world human coding habits.",
    purpose: "This PR refactors the login flow to be more readable and standardizes error responses.",
    timerDuration: 60, // 1 min for testing
    order: 1
  },
  {
    title: "Optimize image processing performance",
    description: "Implemented a more efficient buffer handling strategy to reduce memory overhead during large image uploads.",
    codeSnippet: `const processImage = (buffer) => {
  const result = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const avg = (r + g + b) / 3;
    result[i] = result[i + 1] = result[i + 2] = avg;
    result[i + 3] = buffer[i + 3];
  }
  return result;
};`,
    language: "javascript",
    correctOption: "AI",
    answerReasoning: "Uses a generic, textbook-perfect algorithm that lacks the specialized optimizations (like SIMD or bit-shifting) a senior human would use.",
    purpose: "This PR introduces a high-performance buffer-based grayscale image filter.",
    timerDuration: 60,
    order: 2
  }
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/turing-test');
    console.log('Connected to MongoDB');

    await Question.deleteMany({});
    await Question.insertMany(sampleQuestions);
    console.log('Sample questions added');

    await GameState.deleteMany({});
    const state = new GameState({
      status: 'LOBBY',
      currentQuestionIndex: 0,
      timerRemaining: 0,
      isPaused: false
    });
    await state.save();
    console.log('Initial game state created');

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seed();
