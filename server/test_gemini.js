require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
  console.log('Testing Gemini connection...');
  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY in .env');
    process.exit(1);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // Check if the current syntax matches @google/genai (new SDK)
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Say "Connection Successful"' }] }]
    });

    console.log('Gemini Response:', result.content.parts[0].text);
    console.log('✅ Connection Successful!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection Failed:', err.message);
    console.log('Trying fallback syntax (@google/generative-ai style)...');
    
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent('Say "Connection Successful"');
        console.log('Gemini Response:', result.response.text());
        console.log('✅ Connection Successful! (Using @google/generative-ai syntax)');
        process.exit(0);
    } catch (err2) {
        console.error('❌ Fallback Failed:', err2.message);
        process.exit(1);
    }
  }
}

test();
