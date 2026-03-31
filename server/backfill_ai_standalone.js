require('dotenv').config();
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');

// Inline Model Definition to avoid module loading issues
const QuestionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  codeSnippet: { type: String, required: true },
  language: { type: String, default: 'javascript' },
  correctOption: { type: String, enum: ['Human', 'AI'], required: true },
  answerReasoning: { type: String, default: 'No reasoning provided.' },
  purpose: { type: String, default: 'General code review assessment.' },
  timerDuration: { type: Number, default: 360 },
  order: { type: Number, required: true }
});

const Question = mongoose.models.Question || mongoose.model('Question', QuestionSchema);

async function backfill() {
  if (!process.env.GEMINI_API_KEY || !process.env.MONGODB_URI) {
    console.error('Missing GEMINI_API_KEY or MONGODB_URI');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const questions = await Question.find({
      $or: [
        { answerReasoning: 'No reasoning provided.' },
        { purpose: 'General code review assessment.' }
      ]
    });

    console.log(`Found ${questions.length} questions to backfill.`);

    if (questions.length === 0) {
      console.log('No questions need backfilling.');
      process.exit(0);
    }

    const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    for (const q of questions) {
      console.log(`Generating insights for: ${q.title}...`);
      
      const prompt = `Analyze this code review question for a game. Correct Answer: ${q.correctOption}
      
Title: ${q.title}
Code:
${q.codeSnippet}

Generate 1) Purpose of the code. 2) Reasoning why the answer is ${q.correctOption}.
Output JSON ONLY: {"purpose": "...", "reasoning": "..."}`;

      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });

        const rawText = result.response.text().replace(/```json/gi, '').replace(/```/gi, '').trim();
        const parsed = JSON.parse(rawText);

        q.purpose = parsed.purpose || q.purpose;
        q.answerReasoning = parsed.reasoning || q.answerReasoning;
        
        await q.save();
        console.log(`Updated: ${q.title}`);
      } catch (err) {
        console.error(`Failed ${q.title}:`, err.message);
      }
    }

    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

backfill();
