/**
 * test_simulation.js — API-Only End-to-End Simulation with Halts
 */
const io = require('socket.io-client');
const readline = require('readline');

function waitKeyPress(promptMsg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`\n🛑 ${promptMsg} (Press Enter to continue)...`, () => {
      rl.close();
      resolve();
    });
  });
}

const SERVER = 'http://localhost:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SEP = '─'.repeat(68);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiPost(path, body = {}) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`POST ${path} → HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}

async function apiGet(path) {
  const r = await fetch(`${SERVER}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
  return r.json();
}

function connectAdmin() {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER);
    socket.on('connect', () => {
      socket.emit('admin-join', ADMIN_PASSWORD);
    });
    socket.on('admin-authorized', () => resolve(socket));
    socket.on('admin-error', (msg) => reject(new Error('Admin auth failed: ' + msg)));
    socket.on('connect_error', (e) => reject(e));
    setTimeout(() => reject(new Error('Admin connection timed out')), 10000);
  });
}

function connectTeam(name, room) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER);
    socket.on('connect', () => {
      socket.emit('join-team', { teamName: name, roomNumber: room });
    });
    socket.on('joined', ({ teamId }) => resolve({ socket, teamId }));
    socket.on('error', (msg) => reject(new Error(`Team "${name}" join error: ${msg}`)));
    socket.on('connect_error', (e) => reject(e));
    setTimeout(() => reject(new Error(`Team "${name}" connection timed out`)), 10000);
  });
}

async function run() {
  console.log(`\n${SEP}`);
  console.log('  TURING TEST — Simulation with Phase Pauses');
  console.log(SEP);

  try {
    await apiGet('/api/questions');
    console.log('✅ Server is reachable at', SERVER);
  } catch (e) {
    console.error('❌ Server not reachable. Is npm run dev running?', e.message);
    process.exit(1);
  }

  console.log('\n📌 STEP 1: Connecting admin and resetting state...');
  let adminSocket;
  try {
    adminSocket = await connectAdmin();
    console.log('   ✅ Admin connected');
  } catch (e) {
    console.error('   ❌ Admin connection failed:', e.message);
    process.exit(1);
  }
  adminSocket.emit('admin-reset');
  await sleep(2000);
  console.log('   ✅ Platform reset complete');

  console.log('\n📌 STEP 2: Seeding R1 questions...');
  const r1q1 = await apiPost('/api/r1/questions', {
    prompt: 'Is this poem AI-generated or Human-created?',
    mediaText: 'Roses are generated, violets computed...',
    correctAnswer: 'AI',
    explanation: 'Formulaic structure',
    timerDuration: 30, maxPoints: 100, order: 1
  });
  const r1q2 = await apiPost('/api/r1/questions', {
    prompt: 'Is this code AI-generated or Human-created?',
    mediaCode: 'const add = (a, b) => a + b;',
    mediaCodeLang: 'javascript',
    correctAnswer: 'Human',
    explanation: 'Minimalist clean snippet',
    timerDuration: 30, maxPoints: 100, order: 2
  });

  console.log('\n📌 STEP 3: Seeding R2 questions...');
  const r2q1 = await apiPost('/api/questions', {
    title: 'Fibonacci Sequence',
    description: 'Determine authorship.',
    codeSnippet: 'function fib(n) { return n<=1 ? n : fib(n-1)+fib(n-2); }',
    language: 'javascript',
    correctOption: 'Human',
    answerReasoning: 'Natural recursive style.',
    purpose: 'Tests code detection',
    timerDuration: 30, order: 1
  });
  const r2q2 = await apiPost('/api/questions', {
    title: 'Bubble Sort',
    description: 'Analyze algorithm.',
    codeSnippet: 'function bubbleSort(arr) { /* ops */ }',
    language: 'javascript',
    correctOption: 'AI',
    answerReasoning: 'Structured comment.',
    purpose: 'Tests AI detection',
    timerDuration: 30, order: 2
  });

  console.log('\n📌 STEP 4: Joining 15 teams...');
  const teamDefs = [
    { name: 'Alpha Squad', room: 'A1', tier: 'strong' },
    { name: 'Beta Blitz', room: 'A2', tier: 'strong' },
    { name: 'Gamma Force', room: 'A3', tier: 'strong' },
    { name: 'Delta Crew', room: 'B1', tier: 'strong' },
    { name: 'Epsilon Elite', room: 'B2', tier: 'strong' },
    { name: 'Zeta Warriors', room: 'B3', tier: 'medium' },
    { name: 'Eta Heroes', room: 'C1', tier: 'medium' },
    { name: 'Theta Stars', room: 'C2', tier: 'medium' },
    { name: 'Iota Legends', room: 'C3', tier: 'medium' },
    { name: 'Kappa Coders', room: 'D1', tier: 'medium' },
    { name: 'Lambda Novice', room: 'D2', tier: 'weak' },
    { name: 'Mu Beginners', room: 'D3', tier: 'weak' },
    { name: 'Nu Learners', room: 'E1', tier: 'weak' },
    { name: 'Xi Rookies', room: 'E2', tier: 'weak' },
    { name: 'Omicron Noobs', room: 'E3', tier: 'weak' }
  ];

  const teams = [];
  for (const def of teamDefs) {
    const { socket, teamId } = await connectTeam(def.name, def.room);
    teams.push({ ...def, socket, teamId });
  }
  console.log(`   ✅ ${teams.length} teams joined`);

  console.log('\n📌 STEP 5: Running Round 1...');
  adminSocket.emit('r1-admin-start');
  await sleep(1500);

  const r1Qs = [{ id: r1q1._id, correct: r1q1.correctAnswer }, { id: r1q2._id, correct: r1q2.correctAnswer }];
  for (let qi = 0; qi < r1Qs.length; qi++) {
    const q = r1Qs[qi];
    for (const team of teams) {
      const correct = team.tier !== 'weak';
      const answer = correct ? q.correct : (q.correct === 'AI' ? 'Human' : 'AI');
      team.socket.emit('r1-submit', { teamId: team.teamId, questionId: q.id, answer });
    }
    await sleep(800);
    adminSocket.emit('r1-admin-next'); // RESULT
    await sleep(800);
    adminSocket.emit('r1-admin-next'); // NEXT
    await sleep(800);
  }
  await waitKeyPress('ROUND 1 COMPLETE. Ready for R1 Screenshot?');

  console.log('\n📌 STEP 6: Running Round 2...');
  adminSocket.emit('admin-start');
  await sleep(1500);

  const r2Qs = [{ id: r2q1._id, correct: r2q1.correctOption }, { id: r2q2._id, correct: r2q2.correctOption }];
  for (let qi = 0; qi < r2Qs.length; qi++) {
    const q = r2Qs[qi];
    for (const team of teams) {
      const isStrong = team.tier === 'strong';
      const isMedium = team.tier === 'medium';
      const selection = (isStrong || isMedium) ? q.correct : (q.correct === 'AI' ? 'Human' : 'AI');
      team.socket.emit('submit-response', {
        teamId: team.teamId,
        questionId: q.id,
        selection,
        confidence: isStrong ? 4 : 2,
        reasoning: 'Generic detailed response',
        understanding: 'Basic code execution'
      });
    }
    await sleep(800);
    adminSocket.emit('admin-next'); // RESULT
    await sleep(800);
    adminSocket.emit('admin-next'); // NEXT
    await sleep(800);
  }

  // Force Finish
  await apiPost('/api/admin/finish-rounds', {});
  await waitKeyPress('ROUND 2 COMPLETE. Ready for R2 Screenshot?');

  console.log('\n📌 STEP 7: Triggering AI Scoring...');
  await apiPost('/api/score-responses', {});
  console.log('   Waiting 15s for Gemini processing...');
  await sleep(15000);
  
  await waitKeyPress('AI SCORING COMPLETE. Ready for Final Screenshot?');

  for (const t of teams) t.socket.disconnect();
  adminSocket.disconnect();
  console.log('\nDone.');
}
run().catch(e => { console.error(e); process.exit(1); });
