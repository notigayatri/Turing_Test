require('dotenv').config();
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const Question = require(path.join(__dirname, 'models', 'Question'));

async function backfill() {
  if (!process.env.GEMINI_API_KEY || !process.env.MONGODB_URI) {
    console.error('Missing GEMINI_API_KEY or MONGODB_URI in server/.env');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const questions = await Question.find({
      $or: [
        { answerReasoning: 'No reasoning provided.' },
        { purpose: 'General code review assessment.' },
        { answerReasoning: { $exists: false } },
        { purpose: { $exists: false } }
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
      
      const prompt = `Analyze this code review question for a game. Is it Human or AI?
      
Title: ${q.title}
Language: ${q.language}
Code:
${q.codeSnippet}
Correct Answer: ${q.correctOption}

Generate 1) A clear "Purpose" of what this code does. 2) A technical "Reasoning" justifying why the answer is ${q.correctOption} (be specific about coding patterns).
Output STRICTLY valid JSON only: {"purpose": "...", "reasoning": "..."}`;

      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });

        const rawText = (result.text || '').replace(/```json/gi, '').replace(/```/gi, '').trim();
        const parsed = JSON.parse(rawText);

        if (parsed.purpose) q.purpose = parsed.purpose;
        if (parsed.reasoning) q.answerReasoning = parsed.reasoning;
        
        await q.save();
        console.log(`Successfully updated: ${q.title}`);
      } catch (err) {
        console.error(`Failed to update ${q.title}:`, err.message);
      }
    }

    console.log('Backfill complete!');
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
}

backfill();
