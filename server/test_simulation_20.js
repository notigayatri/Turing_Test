/**
 * test_simulation_20.js
 * 20 teams → Round 1 + Round 2 (2 questions each)
 * Verifies only Top 10 get Gemini AI scoring.
 * Pauses after R1, after R2, and after AI scoring so screenshots can be taken.
 */
const io = require('socket.io-client');
const readline = require('readline');

function waitKey(msg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n🛑 ${msg} → press Enter to continue...`, () => { rl.close(); resolve(); });
  });
}

const SERVER        = 'http://localhost:5000';
const ADMIN_PWD     = process.env.ADMIN_PASSWORD || 'admin123';
const SEP           = '─'.repeat(70);
const sleep         = ms => new Promise(r => setTimeout(r, ms));

async function post(path, body = {}) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PWD },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function get(path) {
  const r = await fetch(`${SERVER}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

function adminConnect() {
  return new Promise((resolve, reject) => {
    const s = io(SERVER);
    s.on('connect', () => s.emit('admin-join', ADMIN_PWD));
    s.on('admin-authorized', () => resolve(s));
    s.on('admin-error', e => reject(new Error(e)));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('Admin timeout')), 12000);
  });
}

function teamConnect(name, room) {
  return new Promise((resolve, reject) => {
    const s = io(SERVER);
    s.on('connect', () => s.emit('join-team', { teamName: name, roomNumber: room }));
    s.on('joined', ({ teamId }) => resolve({ socket: s, teamId }));
    s.on('error', m => reject(new Error(`${name}: ${m}`)));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error(`Timeout: ${name}`)), 12000);
  });
}

// ── Team definitions ──────────────────────────────────────────────────────────
// TOP 10: stronger teams that should be AI-evaluated
// BOTTOM 10: weaker teams that should be skipped
const TEAM_DEFS = [
  // strong (5) — correct on everything, high-quality reasoning
  { name: 'Alpha Squad',   room: 'A1', tier: 'strong' },
  { name: 'Beta Blitz',    room: 'A2', tier: 'strong' },
  { name: 'Gamma Force',   room: 'A3', tier: 'strong' },
  { name: 'Delta Crew',    room: 'B1', tier: 'strong' },
  { name: 'Epsilon Elite', room: 'B2', tier: 'strong' },
  // medium (5) — correct on most, solid reasoning
  { name: 'Zeta Warriors', room: 'B3', tier: 'medium' },
  { name: 'Eta Heroes',    room: 'C1', tier: 'medium' },
  { name: 'Theta Stars',   room: 'C2', tier: 'medium' },
  { name: 'Iota Legends',  room: 'C3', tier: 'medium' },
  { name: 'Kappa Coders',  room: 'D1', tier: 'medium' },
  // weak (10) — wrong answers, generic reasoning
  { name: 'Lambda Novice', room: 'D2', tier: 'weak' },
  { name: 'Mu Beginners',  room: 'D3', tier: 'weak' },
  { name: 'Nu Learners',   room: 'E1', tier: 'weak' },
  { name: 'Xi Rookies',    room: 'E2', tier: 'weak' },
  { name: 'Omicron Noobs', room: 'E3', tier: 'weak' },
  { name: 'Pi Wanderers',  room: 'F1', tier: 'weak' },
  { name: 'Rho Drifters',  room: 'F2', tier: 'weak' },
  { name: 'Sigma Scouts',  room: 'F3', tier: 'weak' },
  { name: 'Tau Tinkerers', room: 'G1', tier: 'weak' },
  { name: 'Upsilon Crew',  room: 'G2', tier: 'weak' },
];

const REASONING = {
  strong: [
    'The recursive structure without memoisation is a hallmark of human-written code — developers favour readability over micro-optimisation.',
    'The structured early-exit comment plus the swapped-flag pattern is a recognisable fingerprint of LLM-generated sorting code.',
  ],
  medium: [
    'It looks like human code because the logic is simple and direct with no extra tooling.',
    'The way comments explain the algorithm step-by-step feels like AI output rather than a human writing for themselves.',
  ],
  weak: [
    'I think it is human.',
    'Probably AI because it looks complex.',
  ],
};

async function run() {
  console.log(`\n${SEP}`);
  console.log('  TURING TEST — 20-Team Simulation | Top-10 AI Scoring Check');
  console.log(SEP + '\n');

  try { await get('/api/questions'); console.log('✅ Server reachable'); }
  catch (e) { console.error('❌ Server unreachable:', e.message); process.exit(1); }

  // ── 1. Admin + Reset ──────────────────────────────────────────────────────
  console.log('\n📌 [1] Admin connect + reset...');
  const admin = await adminConnect();
  console.log('   ✅ Admin connected');
  admin.emit('admin-reset');
  await sleep(2500);
  console.log('   ✅ Platform reset');

  // ── 2. Seed R1 questions ──────────────────────────────────────────────────
  console.log('\n📌 [2] Seeding 2 × Round 1 questions...');
  const r1q1 = await post('/api/r1/questions', {
    prompt: 'Is this poem AI-generated or Human-created?',
    mediaText: 'Roses are generated, violets computed, the stanzas are sorted, and the model saluted.',
    correctAnswer: 'AI', explanation: 'Formulaic rhyming structure.',
    timerDuration: 30, maxPoints: 100, order: 1
  });
  const r1q2 = await post('/api/r1/questions', {
    prompt: 'Is this code AI-generated or Human-created?',
    mediaCode: 'const add = (a, b) => a + b;', mediaCodeLang: 'javascript',
    correctAnswer: 'Human', explanation: 'Minimalist one-liner typical of experienced devs.',
    timerDuration: 30, maxPoints: 100, order: 2
  });
  console.log(`   ✅ R1 Q1 id=${r1q1._id}  R1 Q2 id=${r1q2._id}`);

  // ── 3. Seed R2 questions ──────────────────────────────────────────────────
  console.log('\n📌 [3] Seeding 2 × Round 2 questions...');
  const r2q1 = await post('/api/questions', {
    title: 'Fibonacci — Human or AI?',
    description: 'Determine authorship of this recursive implementation.',
    codeSnippet: 'function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }',
    language: 'javascript', correctOption: 'Human',
    answerReasoning: 'Clean recursive style without boilerplate.',
    purpose: 'Tests code authorship detection.', timerDuration: 30, order: 1
  });
  const r2q2 = await post('/api/questions', {
    title: 'Bubble Sort — Human or AI?',
    description: 'Analyse this sorting implementation.',
    codeSnippet: '// Optimised bubble sort with early-exit flag\nfunction bubbleSort(arr) {\n  for (let i=0;i<arr.length-1;i++) {\n    let swapped=false;\n    for (let j=0;j<arr.length-i-1;j++) {\n      if (arr[j]>arr[j+1]) { [arr[j],arr[j+1]]=[arr[j+1],arr[j]]; swapped=true; }\n    }\n    if (!swapped) break;\n  }\n}',
    language: 'javascript', correctOption: 'AI',
    answerReasoning: 'Structured comment + early-exit flag = AI pattern.',
    purpose: 'Tests AI hallmark recognition.', timerDuration: 30, order: 2
  });
  console.log(`   ✅ R2 Q1 id=${r2q1._id}  R2 Q2 id=${r2q2._id}`);

  // ── 4. Join 20 teams ──────────────────────────────────────────────────────
  console.log('\n📌 [4] Joining 20 teams...');
  const teams = [];
  for (const def of TEAM_DEFS) {
    try {
      const { socket, teamId } = await teamConnect(def.name, def.room);
      teams.push({ ...def, socket, teamId });
      process.stdout.write(' ✓');
    } catch (e) {
      console.error(`\n   ❌ ${def.name}: ${e.message}`);
    }
  }
  console.log(`\n   ✅ ${teams.length}/20 teams joined`);

  // ── 5. Round 1 ────────────────────────────────────────────────────────────
  console.log('\n📌 [5] Round 1 running...');
  admin.emit('r1-admin-start');
  await sleep(1500);

  const r1Qs = [
    { id: r1q1._id, correct: r1q1.correctAnswer },
    { id: r1q2._id, correct: r1q2.correctAnswer },
  ];

  for (let qi = 0; qi < r1Qs.length; qi++) {
    const q = r1Qs[qi];
    for (const t of teams) {
      const correct = t.tier !== 'weak';
      const answer = correct ? q.correct : (q.correct === 'AI' ? 'Human' : 'AI');
      t.socket.emit('r1-submit', { teamId: t.teamId, questionId: q.id, answer });
    }
    await sleep(900);
    admin.emit('r1-admin-next'); // QUESTION → RESULT
    await sleep(1200);
    admin.emit('r1-admin-next'); // RESULT → next / FINISHED
    await sleep(1200);
    console.log(`   ✅ R1 Q${qi + 1} done`);
  }
  await sleep(1000);
  console.log('   ✅ Round 1 complete');

  // ── PAUSE 1 ───────────────────────────────────────────────────────────────
  await waitKey('Take ROUND 1 leaderboard screenshot now');

  // ── 6. Round 2 ────────────────────────────────────────────────────────────
  console.log('\n📌 [6] Round 2 running...');
  admin.emit('admin-start');
  await sleep(1500);

  const r2Qs = [
    { id: r2q1._id, correct: r2q1.correctOption },
    { id: r2q2._id, correct: r2q2.correctOption },
  ];

  for (let qi = 0; qi < r2Qs.length; qi++) {
    const q = r2Qs[qi];
    for (const t of teams) {
      const isStrong = t.tier === 'strong';
      const isMedium = t.tier === 'medium';
      const selection = (isStrong || isMedium) ? q.correct : (q.correct === 'AI' ? 'Human' : 'AI');
      t.socket.emit('submit-response', {
        teamId: t.teamId,
        questionId: q.id,
        selection,
        confidence: isStrong ? 4 : isMedium ? 3 : 1,
        reasoning: REASONING[t.tier][qi],
        understanding: isStrong
          ? 'Strong structural understanding with clear reasoning.' 
          : isMedium ? 'Some understanding shown.' : 'Minimal understanding.',
      });
    }
    await sleep(900);
    admin.emit('admin-next'); // QUESTION → RESULT
    await sleep(1200);
    admin.emit('admin-next'); // RESULT → next / FINISHED
    await sleep(1200);
    console.log(`   ✅ R2 Q${qi + 1} done`);
  }
  await sleep(1000);
  console.log('   ✅ Round 2 complete');

  // Force both rounds to FINISHED
  console.log('\n📌 [7] Forcing both rounds to FINISHED...');
  const fr = await post('/api/admin/finish-rounds', {});
  console.log('   ✅', fr.success ? 'Both rounds marked FINISHED' : 'ERROR: ' + JSON.stringify(fr));

  // ── PAUSE 2 ───────────────────────────────────────────────────────────────
  await waitKey('Take ROUND 2 leaderboard screenshot now (before AI)');

  // ── 8. Trigger AI Scoring ─────────────────────────────────────────────────
  console.log('\n📌 [8] Triggering AI Scoring...');
  const scoreResp = await post('/api/score-responses', {});
  console.log('   API response:', JSON.stringify(scoreResp, null, 2));
  console.log('\n⏳ Waiting 20 s for Gemini queue to process...');
  await sleep(20000);

  // ── PAUSE 3 ───────────────────────────────────────────────────────────────
  await waitKey('Take FINAL leaderboard screenshot now (after AI)');

  // ── 9. Verify ─────────────────────────────────────────────────────────────
  console.log('\n📌 [9] Verifying results...');
  const combined  = await get('/api/combined-leaderboard');
  const r2Details = await get('/api/results');

  const aiStatus = {};
  for (const r of r2Details) {
    const name = r.teamId?.name;
    if (!name) continue;
    if (!aiStatus[name]) aiStatus[name] = false;
    const deepEval =
      r.llmReasoning &&
      !r.llmReasoning.includes('lacked sufficient technical depth') &&
      r.llmScore !== null && r.llmScore > 0;
    if (deepEval) aiStatus[name] = true;
  }

  console.log(`\n${SEP}`);
  console.log('  FINAL RESULTS TABLE (all 20 teams)');
  console.log(SEP);
  console.log(`  ${'#'.padEnd(4)}${'Team'.padEnd(22)}${'R1'.padEnd(8)}${'R2'.padEnd(8)}${'Total'.padEnd(8)}${'AI-Scored'.padEnd(12)}Tier`);
  console.log(`  ${'-'.repeat(66)}`);

  let aiCount = 0;
  combined.forEach((entry, i) => {
    const def = TEAM_DEFS.find(d => d.name === entry.teamName);
    const scored = aiStatus[entry.teamName] ?? false;
    if (scored) aiCount++;
    const marker = scored ? '🟢 YES' : '🔴 NO ';
    console.log(
      `  ${`#${i+1}`.padEnd(4)}${entry.teamName.padEnd(22)}` +
      `${String(entry.r1Score ?? 0).padEnd(8)}${String(entry.r2Score ?? 0).padEnd(8)}` +
      `${String(entry.total ?? 0).padEnd(8)}${marker.padEnd(12)}${def?.tier ?? '?'}`
    );
  });

  console.log(SEP);
  const pass = aiCount <= 10 && (combined.length - aiCount) >= 10;
  console.log(`\n🏆 AI-scored: ${aiCount}/${combined.length}  →  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) console.error('   Expected ≤10 AI-scored and ≥10 skipped.');

  for (const t of teams) t.socket.disconnect();
  admin.disconnect();
  console.log('\nSimulation complete.\n');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
