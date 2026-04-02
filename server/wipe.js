require('dotenv').config();
const mongoose = require('mongoose');

async function wipeDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const collections = ['questions', 'responses', 'gamestates', 'teams'];
  
  for (const c of collections) {
    try {
      await mongoose.connection.collection(c).deleteMany({});
      console.log(`- Cleared all ${c}`);
    } catch (e) {
      console.log(`- Skipping ${c} (not found)`);
    }
  }

  process.exit(0);
}

wipeDatabase().catch(console.error);
