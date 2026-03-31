require('dotenv').config({ path: './server/.env' });
const { GoogleGenAI } = require('@google/genai');

async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: 'reply exactly "ok"'
    });
    console.log("SUCCESS_TEXT_PROP:", response.text);
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
run();
