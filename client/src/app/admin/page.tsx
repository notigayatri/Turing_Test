'use client';
import { useState, useEffect } from 'react';
import { useSocket } from '@/context/SocketContext';
import styles from './admin.module.css';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://turingtest-production.up.railway.app';

// ─────────────── R2 TYPES ───────────────
interface R2Question {
  _id?: string;
  title: string;
  description: string;
  codeSnippet: string;
  language: string;
  correctOption: 'Human' | 'AI';
  timerDuration: number;
  order: number;
}
const emptyR2Q: R2Question = { title: '', description: '', codeSnippet: '', language: 'javascript', correctOption: 'Human', timerDuration: 360, order: 1 };

// ─────────────── R1 TYPES ───────────────
interface R1Question {
  _id?: string;
  prompt: string;
  mediaText: string;
  mediaCode: string;
  mediaCodeLang: string;
  mediaImageUrl: string;
  mediaAudioUrl: string;
  mediaVideoUrl: string;
  correctAnswer: 'Human' | 'AI';
  explanation: string;
  timerDuration: number;
  maxPoints: number;
  order: number;
}
const emptyR1Q: R1Question = {
  prompt: 'Is the following content AI-generated or Human-created?',
  mediaText: '', mediaCode: '', mediaCodeLang: 'javascript',
  mediaImageUrl: '', mediaAudioUrl: '', mediaVideoUrl: '',
  correctAnswer: 'Human', explanation: '', timerDuration: 60, maxPoints: 100, order: 1
};

type Tab = 'control' | 'questions' | 'responses' | 'leaderboard' | 'combined';
type RoundSelect = 'r1' | 'r2';

export default function Admin() {
  const socket = useSocket();
  const [password, setPassword]         = useState('');
  const [loginError, setLoginError]     = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>('control');
  const [selectedRound, setSelectedRound] = useState<RoundSelect>('r1');

  // Round 2 state
  const [r2GameState, setR2GameState]   = useState<any>(null);
  const [r2Questions, setR2Questions]   = useState<R2Question[]>([]);
  const [newR2Q, setNewR2Q]             = useState<R2Question>(emptyR2Q);
  const [savingR2Q, setSavingR2Q]       = useState(false);
  const [r2Results, setR2Results]       = useState<any[]>([]);
  const [r2Leaderboard, setR2Leaderboard] = useState<any[]>([]);
  const [loadingR2Lb, setLoadingR2Lb]   = useState(false);
  const [r2Submissions, setR2Submissions] = useState({ submissionCount: 0, teamCount: 0 });
  const [showResetModal, setShowResetModal] = useState(false);

  // Round 1 state
  const [r1GameState, setR1GameState]   = useState<any>(null);
  const [r1Questions, setR1Questions]   = useState<R1Question[]>([]);
  const [newR1Q, setNewR1Q]             = useState<R1Question>(emptyR1Q);
  const [savingR1Q, setSavingR1Q]       = useState(false);
  const [r1Responses, setR1Responses]   = useState<any[]>([]);
  const [r1Leaderboard, setR1Leaderboard] = useState<any[]>([]);
  const [loadingR1Lb, setLoadingR1Lb]   = useState(false);
  const [r1Submissions, setR1Submissions] = useState({ subCount: 0, teamCount: 0 });
  const [showR1ResetModal, setShowR1ResetModal] = useState(false);

  // Combined state
  const [combined, setCombined]         = useState<any[]>([]);
  const [loadingCombined, setLoadingCombined] = useState(false);

  // ── Hydration: restore session ──
  useEffect(() => {
    const savedPwd = sessionStorage.getItem('adminPwd');
    const savedTab = sessionStorage.getItem('adminTab') as Tab;
    const savedRound = sessionStorage.getItem('adminRound') as RoundSelect;
    if (savedPwd) setIsAuthorized(true);
    if (savedTab) setActiveTab(savedTab);
    if (savedRound) setSelectedRound(savedRound);
  }, []);

  useEffect(() => { 
    sessionStorage.setItem('adminTab', activeTab); 
    sessionStorage.setItem('adminRound', selectedRound);
  }, [activeTab, selectedRound]);

  useEffect(() => {
    if (!socket) return;
    socket.on('admin-authorized', () => { setIsAuthorized(true); setLoginError(''); });
    socket.on('admin-error', (msg) => { setLoginError(msg); sessionStorage.removeItem('adminPwd'); setIsAuthorized(false); });
    socket.on('state-update',        (s) => setR2GameState(s));
    socket.on('r1-state-update',     (s) => setR1GameState(s));
    socket.on('submission-progress', (d) => setR2Submissions(d));
    socket.on('r1-submission-progress', (d) => setR1Submissions(d));

    const savedPwd = sessionStorage.getItem('adminPwd');
    if (savedPwd) {
      socket.emit('admin-join', savedPwd);
      socket.emit('admin-get-state');
    }

    return () => {
      socket.off('admin-authorized'); socket.off('admin-error');
      socket.off('state-update'); socket.off('r1-state-update');
      socket.off('submission-progress'); socket.off('r1-submission-progress');
    };
  }, [socket]);

  const handleLogin = () => {
    setLoginError('');
    if (socket && password) { sessionStorage.setItem('adminPwd', password); socket.emit('admin-join', password); }
  };
  const handleLogout = () => { sessionStorage.removeItem('adminPwd'); setIsAuthorized(false); setPassword(''); };

  // ── R2 actions ──
  const startR2     = () => socket?.emit('admin-start');
  const pauseR2     = () => socket?.emit('admin-pause');
  const nextR2      = () => socket?.emit('admin-next');
  const resetR2     = () => { socket?.emit('admin-reset'); setShowResetModal(false); setR2Results([]); setR2Leaderboard([]); };
  const deleteTeams = () => { if (confirm('Delete ALL teams + responses?')) { socket?.emit('admin-delete-teams'); setCombined([]); setR1Leaderboard([]); setR2Leaderboard([]); } };

  // ── R1 actions ──
  const startR1  = () => socket?.emit('r1-admin-start');
  const pauseR1  = () => socket?.emit('r1-admin-pause');
  const nextR1   = () => socket?.emit('r1-admin-next');
  const resetR1  = () => { socket?.emit('r1-admin-reset'); setShowR1ResetModal(false); setR1Responses([]); setR1Leaderboard([]); };
  const toggleLb = () => socket?.emit('r1-admin-toggle-leaderboard');

  // ── REST helpers ──
  const fetchR2Questions = async () => { const r = await fetch(`${SERVER_URL}/api/questions`);         setR2Questions(await r.json()); };
  const fetchR2Results   = async () => { const r = await fetch(`${SERVER_URL}/api/results`);           setR2Results(await r.json()); };
  const fetchR1Questions = async () => { const r = await fetch(`${SERVER_URL}/api/r1/questions`);      setR1Questions(await r.json()); };
  const fetchR1Responses = async () => { const r = await fetch(`${SERVER_URL}/api/r1/responses`);      setR1Responses(await r.json()); };
  const fetchR1Lb        = async () => { setLoadingR1Lb(true); const r = await fetch(`${SERVER_URL}/api/r1/leaderboard`); setR1Leaderboard(await r.json()); setLoadingR1Lb(false); };
  const fetchCombined    = async () => { setLoadingCombined(true); const r = await fetch(`${SERVER_URL}/api/combined-leaderboard`); setCombined(await r.json()); setLoadingCombined(false); };

  useEffect(() => {
    if (!isAuthorized) return;
    fetchR2Questions(); fetchR2Results(); fetchR1Questions();
  }, [isAuthorized]);

  const saveR2Q = async () => {
    setSavingR2Q(true);
    await fetch(`${SERVER_URL}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newR2Q) });
    setNewR2Q(emptyR2Q); await fetchR2Questions(); setSavingR2Q(false);
  };
  const deleteR2Q = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`${SERVER_URL}/api/questions/${id}`, { method: 'DELETE' }); await fetchR2Questions();
  };

  const saveR1Q = async () => {
    setSavingR1Q(true);
    await fetch(`${SERVER_URL}/api/r1/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newR1Q) });
    setNewR1Q(emptyR1Q); await fetchR1Questions(); setSavingR1Q(false);
  };
  const deleteR1Q = async (id: string) => {
    if (!confirm('Delete this R1 question?')) return;
    await fetch(`${SERVER_URL}/api/r1/questions/${id}`, { method: 'DELETE' }); await fetchR1Questions();
  };

  // ── Media file reader (base64) ──
  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const handleMediaUpload = async (field: keyof R1Question, file: File) => {
    const b64 = await readFileAsBase64(file);
    setNewR1Q(prev => ({ ...prev, [field]: b64 }));
  };

  // ── Login screen ──
  if (!isAuthorized) {
    return (
      <div className={styles.loginContainer}>
        <div className="premium-card" style={{ minWidth: 340 }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Organizer Access</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enter the admin password to continue</p>
          <input type="password" placeholder="Admin Password" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', marginBottom: '1rem', borderColor: loginError ? 'var(--danger)' : 'rgba(255,255,255,0.2)' }}
          />
          {loginError && <p style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '1rem', marginTop: '-0.5rem' }}>{loginError}</p>}
          <button className={styles.startBtn} style={{ width: '100%', padding: '0.9rem' }} onClick={handleLogin}>Login</button>
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  const genericTabs = [
    { key: 'control', label: 'Control' },
    { key: 'questions', label: 'Questions' },
    { key: 'responses', label: 'Responses' },
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'combined', label: 'Final Rankings' },
  ];

  return (
    <main className={styles.adminLayout}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1>Organizer Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={`${styles.statusBadge} ${r1GameState?.status === 'IN_PROGRESS' ? styles.active : ''}`}>
               R1: {r1GameState?.status || '…'}
            </div>
            <div className={`${styles.statusBadge} ${r2GameState?.status === 'IN_PROGRESS' ? styles.active : ''}`}>
               R2: {r2GameState?.status || '…'}
            </div>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>Logout</button>
      </header>

      {/* ── Round Selection & Tab bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', padding: '1rem 2rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.2rem', borderRadius: '12px' }}>
          <button 
            onClick={() => setSelectedRound('r1')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: selectedRound === 'r1' ? '#0070f3' : 'transparent', color: selectedRound === 'r1' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}
          >
             Round 1
          </button>
          <button 
            onClick={() => setSelectedRound('r2')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', background: selectedRound === 'r2' ? '#0070f3' : 'transparent', color: selectedRound === 'r2' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}
          >
             Round 2
          </button>
        </div>


        <div className={styles.tabs} style={{ padding: 0, borderBottom: 'none', background: 'none' }}>
          {genericTabs.map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.activeTab : ''}`}
              onClick={() => {
                setActiveTab(t.key as Tab);
                if (t.key === 'responses' && selectedRound === 'r2') fetchR2Results();
                if (t.key === 'responses' && selectedRound === 'r1') fetchR1Responses();
                if (t.key === 'leaderboard' && selectedRound === 'r1') fetchR1Lb();
                if (t.key === 'combined') fetchCombined();
              }}
              style={{
                borderColor: activeTab === t.key ? (t.key === 'combined' ? '#a855f7' : '#0070f3') : 'rgba(255,255,255,0.1)',
                background: activeTab === t.key ? (t.key === 'combined' ? 'rgba(168,85,247,0.15)' : 'rgba(0,112,243,0.15)') : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ ROUND 1 CONTROL ═══════════════ */}
      {activeTab === 'control' && selectedRound === 'r1' && (
        <div className={styles.grid}>
          <section className="premium-card" style={{ border: '1px solid rgba(0,112,243,0.2)' }}>
            <h3 style={{ color: '#0070f3' }}> Round 1 Controls</h3>
            <div className={styles.controls}>
              {(r1GameState?.status === 'LOBBY' || !r1GameState) && <button className={styles.startBtn} style={{ background: 'linear-gradient(135deg,#0070f3,#a855f7)' }} onClick={startR1}>Start Round 1</button>}
              {r1GameState?.status === 'IN_PROGRESS' && (
                <>
                  <button className={styles.pauseBtn} onClick={pauseR1}>{r1GameState.isPaused ? 'Resume' : 'Pause'}</button>
                  <button className={styles.nextBtn}  onClick={nextR1}>
                    {r1GameState.phase === 'QUESTION' ? 'Show Answer' : r1GameState.currentQuestionIndex >= r1Questions.length - 1 ? 'End Round 1' : 'Next Question'}
                  </button>
                </>
              )}
              {(r1GameState?.status === 'IN_PROGRESS' || r1GameState?.status === 'FINISHED') && (
                <button className={styles.dangerBtn} onClick={() => setShowR1ResetModal(true)}>Reset Round 1 Score</button>
              )}
              <button
                onClick={toggleLb}
                style={{ padding: '0.9rem', borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.1)', color: '#c084fc', fontWeight: 600, cursor: 'pointer' }}
              >
                {r1GameState?.showLeaderboard ? ' Hide Leaderboard' : ' Show Leaderboard'}
              </button>
              <button className={styles.exportBtn} onClick={() => window.open(`${SERVER_URL}/api/r1/export-csv`)}> Export R1 CSV</button>
            </div>
          </section>

          <section className="premium-card" style={{ border: '1px solid rgba(0,112,243,0.2)' }}>
            <h3 style={{ color: '#0070f3' }}> Round 1 Live Stats</h3>
            <div className={styles.stats}>
              <div className={styles.statItem}><span className={styles.label}>Question</span><span className={styles.value}>{(r1GameState?.currentQuestionIndex ?? 0) + 1} / {r1GameState?.totalQuestions ?? '—'}</span></div>
              <div className={styles.statItem}>
                <span className={styles.label}>Timer</span>
                <span className={`${styles.value} ${(r1GameState?.timerRemaining ?? 0) <= 10 ? styles.danger : ''}`}>
                  {Math.floor((r1GameState?.timerRemaining ?? 0) / 60)}:{((r1GameState?.timerRemaining ?? 0) % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </section>

          <section className={`${styles.fullWidth} premium-card`} style={{ border: '1px solid rgba(0,112,243,0.15)' }}>
            <h3 style={{ color: '#0070f3' }}>Current R1 Question Preview</h3>
            {r1GameState?.currentQuestion ? (
              <div className={styles.preview}>
                <p style={{ color: '#c084fc', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  {[r1GameState.currentQuestion.mediaText && 'Text', r1GameState.currentQuestion.mediaCode && 'Code',
                    r1GameState.currentQuestion.mediaImageUrl && 'Image', r1GameState.currentQuestion.mediaAudioUrl && 'Audio',
                    r1GameState.currentQuestion.mediaVideoUrl && 'Video'].filter(Boolean).join(' · ')}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>{r1GameState.currentQuestion.prompt}</p>
                {r1GameState.phase === 'RESULT' && <p style={{ marginTop: '0.5rem', color: '#4ade80', fontWeight: 700 }}> Answer: {r1GameState.currentQuestion.correctAnswer} — {r1GameState.currentQuestion.explanation?.slice(0, 100)}</p>}
              </div>
            ) : <p style={{ color: 'rgba(255,255,255,0.4)' }}>No active question.</p>}
          </section>
        </div>
      )}

      {/* ═══════════════ ROUND 1 QUESTIONS ═══════════════ */}
      {activeTab === 'questions' && selectedRound === 'r1' && (
        <div className={styles.qManager}>
          <section className="premium-card" style={{ border: '1px solid rgba(0,112,243,0.2)' }}>
            <h3 style={{ color: '#0070f3' }}> Add Round 1 Question</h3>
            <div className={styles.qForm}>
              {/* Prompt */}
              <div className={styles.field}>
                <label>Question Prompt</label>
                <input value={newR1Q.prompt} onChange={e => setNewR1Q({...newR1Q, prompt: e.target.value})} />
              </div>

              {/* Media: Text */}
              <div className={styles.field}>
                <label> Text Content (optional)</label>
                <textarea rows={3} value={newR1Q.mediaText} onChange={e => setNewR1Q({...newR1Q, mediaText: e.target.value})} placeholder="Paste text, article, paragraph..." />
              </div>

              {/* Media: Code */}
              <div className={styles.row}>
                <div className={styles.field} style={{ flex: 3 }}>
                  <label> Code Snippet (optional)</label>
                  <textarea rows={5} value={newR1Q.mediaCode} onChange={e => setNewR1Q({...newR1Q, mediaCode: e.target.value})} placeholder="Paste code..." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                </div>
                <div className={styles.field} style={{ flex: 1 }}>
                  <label>Language</label>
                  <select value={newR1Q.mediaCodeLang} onChange={e => setNewR1Q({...newR1Q, mediaCodeLang: e.target.value})}>
                    {['javascript','python','typescript','java','cpp','go','rust'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Media: Image */}
              <div className={styles.field}>
                <label>️ Image Upload (optional)</label>
                <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleMediaUpload('mediaImageUrl', e.target.files[0])}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} />
                {newR1Q.mediaImageUrl && <img src={newR1Q.mediaImageUrl} alt="preview" style={{ maxHeight: 120, borderRadius: 8, marginTop: '0.5rem', objectFit: 'contain' }} />}
              </div>

              {/* Media: Audio */}
              <div className={styles.field}>
                <label> Audio Upload (optional)</label>
                <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && handleMediaUpload('mediaAudioUrl', e.target.files[0])}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} />
                {newR1Q.mediaAudioUrl && <audio controls src={newR1Q.mediaAudioUrl} style={{ width: '100%', marginTop: '0.5rem' }} />}
              </div>

              {/* Media: Video */}
              <div className={styles.field}>
                <label> Video Upload (optional)</label>
                <input type="file" accept="video/*" onChange={e => e.target.files?.[0] && handleMediaUpload('mediaVideoUrl', e.target.files[0])}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} />
                {newR1Q.mediaVideoUrl && <video controls src={newR1Q.mediaVideoUrl} style={{ maxHeight: 160, borderRadius: 8, marginTop: '0.5rem', width: '100%' }} />}
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label> Correct Answer</label>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {(['Human','AI'] as const).map(opt => (
                      <button key={opt} onClick={() => setNewR1Q({...newR1Q, correctAnswer: opt})}
                        style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                          borderColor: newR1Q.correctAnswer === opt ? (opt === 'Human' ? '#4ade80' : '#f97316') : 'var(--border)',
                          background: newR1Q.correctAnswer === opt ? (opt === 'Human' ? 'rgba(74,222,128,0.15)' : 'rgba(249,115,22,0.15)') : 'transparent',
                          color: 'white' }}
                      >{opt === 'Human' ? ' Human' : ' AI'}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>⏱ Timer (seconds)</label>
                  <input type="number" min={15} max={180} value={newR1Q.timerDuration} onChange={e => setNewR1Q({...newR1Q, timerDuration: Number(e.target.value)})} />
                </div>
                <div className={styles.field}>
                  <label> Max Points</label>
                  <input type="number" min={10} max={500} value={newR1Q.maxPoints} onChange={e => setNewR1Q({...newR1Q, maxPoints: Number(e.target.value)})} />
                </div>
              </div>

              <div className={styles.field}>
                <label> Explanation (shown after answer)</label>
                <textarea rows={2} value={newR1Q.explanation} onChange={e => setNewR1Q({...newR1Q, explanation: e.target.value})} placeholder="Why is this Human or AI generated?" />
              </div>

              <button className={styles.startBtn} style={{ background: 'linear-gradient(135deg,#0070f3,#a855f7)' }}
                onClick={saveR1Q} disabled={savingR1Q}>
                {savingR1Q ? 'Saving...' : ' Save Round 1 Question'}
              </button>
            </div>
          </section>

          <section className="premium-card" style={{ marginTop: '2rem', border: '1px solid rgba(0,112,243,0.15)' }}>
            <h3 style={{ color: '#0070f3' }}> All R1 Questions ({r1Questions.length})</h3>
            <div className={styles.qList}>
              {r1Questions.map((q, i) => (
                <div key={q._id || i} className={styles.qItem} style={{ borderColor: 'rgba(0,112,243,0.15)' }}>
                  <div className={styles.qMeta}>
                    <span className={styles.qOrder}>#{q.order}</span>
                    <span style={{ fontSize: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {q.mediaText && <span className={styles.qLang}>txt</span>}
                      {q.mediaCode && <span className={styles.qLang}>{q.mediaCodeLang}</span>}
                      {q.mediaImageUrl && <span className={styles.qLang}>img</span>}
                      {q.mediaAudioUrl && <span className={styles.qLang}>audio</span>}
                      {q.mediaVideoUrl && <span className={styles.qLang}>video</span>}
                    </span>
                    <span className={q.correctAnswer === 'AI' ? styles.badgeAI : styles.badgeHuman}>{q.correctAnswer}</span>
                  </div>
                  <div className={styles.qTitle}>{q.prompt}</div>
                  <div className={styles.qTimer}>⏱ {q.timerDuration}s · {q.maxPoints}pts</div>
                  <button className={styles.deleteBtn} onClick={() => q._id && deleteR1Q(q._id)}>Delete</button>
                </div>
              ))}
              {r1Questions.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No R1 questions yet. Add one above.</p>}
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════ ROUND 1 RESPONSES ═══════════════ */}
      {activeTab === 'responses' && selectedRound === 'r1' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>R1 Responses ({r1Responses.length})</h3>
            <button className={styles.exportBtn} onClick={() => window.open(`${SERVER_URL}/api/r1/export-csv`)}>⬇ Export CSV</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Team</th><th>Room</th><th>Q#</th><th>Answer</th><th>Correct</th><th>Time (s)</th><th>Score</th></tr></thead>
              <tbody>
                {r1Responses.map((r, i) => (
                  <tr key={i}>
                    <td>{r.teamId?.name || '—'}</td>
                    <td>{r.teamId?.room || '—'}</td>
                    <td>{r.questionId?.order || '—'}</td>
                    <td><span className={r.answer === 'AI' ? styles.badgeAI : r.answer === 'Human' ? styles.badgeHuman : styles.badgeUnsure}>{r.answer}</span></td>
                    <td style={{ color: r.isCorrect ? '#4ade80' : '#f97316' }}>{r.isCorrect ? '' : ''}</td>
                    <td>{r.responseTime}s</td>
                    <td style={{ color: '#f97316', fontWeight: 700 }}>{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r1Responses.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No responses yet.</p>}
          </div>
        </div>
      )}

      {/* ═══════════════ ROUND 1 LEADERBOARD ═══════════════ */}
      {activeTab === 'leaderboard' && selectedRound === 'r1' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3> Round 1 Leaderboard</h3>
            <button className={styles.startBtn} onClick={fetchR1Lb} disabled={loadingR1Lb}
              style={{ background: 'linear-gradient(135deg,#f97316,#a855f7)', width: 'auto', padding: '0.7rem 1.5rem' }}>
              {loadingR1Lb ? 'Loading...' : ' Refresh'}
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Rank</th><th>Team</th><th>Room</th><th>Total Score</th><th>Correct</th><th>Answered</th></tr></thead>
              <tbody>
                {r1Leaderboard.map((t, i) => (
                  <tr key={t.teamName}>
                    <td style={{ fontSize: '1.1rem', fontWeight: 800 }}>{i === 0 ? '' : i === 1 ? '' : i === 2 ? '' : `#${i + 1}`}</td>
                    <td style={{ fontWeight: 600 }}>{t.teamName}</td>
                    <td style={{ color: 'rgba(255,255,255,0.5)' }}>{t.room || '—'}</td>
                    <td style={{ color: '#f97316', fontWeight: 800, fontSize: '1.1rem' }}>{t.totalScore} pts</td>
                    <td style={{ color: '#4ade80' }}>{t.correct}</td>
                    <td style={{ color: 'rgba(255,255,255,0.5)' }}>{t.answered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r1Leaderboard.length === 0 && !loadingR1Lb && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>Click Refresh to calculate.</p>}
          </div>
        </div>
      )}

      {/* ═══════════════ ROUND 2 CONTROL ═══════════════ */}
      {activeTab === 'control' && selectedRound === 'r2' && (
        <div className={styles.grid}>
          <section className="premium-card">
            <h3>Quiz Controls</h3>
            <div className={styles.controls}>
              {(r2GameState?.status === 'LOBBY' || !r2GameState) && <button className={styles.startBtn} onClick={startR2}>Start Round 2</button>}
              {r2GameState?.status === 'IN_PROGRESS' && (
                <>
                  <button className={styles.pauseBtn} onClick={pauseR2}>{r2GameState.isPaused ? 'Resume' : 'Pause'}</button>
                  <button className={styles.nextBtn}  onClick={nextR2}>
                    {r2GameState.phase === 'QUESTION' ? 'Show Results' : r2GameState.currentQuestionIndex === r2Questions.length - 1 ? 'End Event' : 'Next PR'}
                  </button>
                </>
              )}
              {(r2GameState?.status === 'IN_PROGRESS' || r2GameState?.status === 'FINISHED') && (
                <button className={styles.dangerBtn} onClick={() => setShowResetModal(true)}>Reset Round 2 Score</button>
              )}
              <button className={styles.exportBtn} onClick={() => window.open(`${SERVER_URL}/api/export-csv`)}>Export Responses CSV</button>
            </div>
          </section>

          <section className="premium-card">
            <h3>Live Stats</h3>
            <div className={styles.stats}>
              <div className={styles.statItem}><span className={styles.label}>Question</span><span className={styles.value}>{(r2GameState?.currentQuestionIndex ?? 0) + 1} / {r2GameState?.totalQuestions ?? '—'}</span></div>
              <div className={styles.statItem}>
                <span className={styles.label}>Timer</span>
                <span className={`${styles.value} ${r2GameState?.timerRemaining < 60 ? styles.danger : ''}`}>
                  {Math.floor((r2GameState?.timerRemaining ?? 0) / 60)}:{((r2GameState?.timerRemaining ?? 0) % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </section>

          <section className={`${styles.fullWidth} premium-card`}>
            <h3>Current PR Preview</h3>
            {r2GameState?.currentQuestion ? (
              <div className={styles.preview}>
                <h4>{r2GameState.currentQuestion.title}</h4>
                <p style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>{r2GameState.currentQuestion.description}</p>
              </div>
            ) : <p style={{ color: 'rgba(255,255,255,0.4)' }}>No question active.</p>}
          </section>
        </div>
      )}

      {/* ═══════════════ ROUND 2 QUESTIONS ═══════════════ */}
      {activeTab === 'questions' && selectedRound === 'r2' && (
        <div className={styles.qManager}>
          <section className="premium-card">
            <h3> Add New PR Question</h3>
            <div className={styles.qForm}>
              <div className={styles.row}>
                <div className={styles.field}><label>PR Title</label><input value={newR2Q.title} onChange={e => setNewR2Q({...newR2Q, title: e.target.value})} placeholder="e.g. Refactor auth flow" /></div>
                <div className={styles.field}><label>Language</label>
                  <select value={newR2Q.language} onChange={e => setNewR2Q({...newR2Q, language: e.target.value})}>
                    {['javascript','python','java','cpp','typescript','go','rust'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}><label>PR Description</label><textarea rows={2} value={newR2Q.description} onChange={e => setNewR2Q({...newR2Q, description: e.target.value})} placeholder="What does this PR do?" /></div>
              <div className={styles.field}><label>Code Snippet</label><textarea rows={8} value={newR2Q.codeSnippet} onChange={e => setNewR2Q({...newR2Q, codeSnippet: e.target.value})} placeholder="Paste code here..." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} /></div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Correct Answer</label>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {(['Human','AI'] as const).map(opt => (
                      <button key={opt} onClick={() => setNewR2Q({...newR2Q, correctOption: opt})}
                        style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                          borderColor: newR2Q.correctOption === opt ? 'var(--primary)' : 'var(--border)',
                          background: newR2Q.correctOption === opt ? 'var(--primary)' : 'transparent', color: 'white' }}
                      >{opt}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}><label>Timer (seconds)</label><input type="number" min={30} max={600} value={newR2Q.timerDuration} onChange={e => setNewR2Q({...newR2Q, timerDuration: Number(e.target.value)})} /></div>
                <div className={styles.field}><label>Order</label><input type="number" min={1} value={newR2Q.order} onChange={e => setNewR2Q({...newR2Q, order: Number(e.target.value)})} /></div>
              </div>
              <button className={styles.startBtn} onClick={saveR2Q} disabled={savingR2Q || !newR2Q.title}>
                {savingR2Q ? 'Saving...' : ' Save Question'}
              </button>
            </div>
          </section>

          <section className="premium-card" style={{ marginTop: '2rem' }}>
            <h3> All R2 Questions ({r2Questions.length})</h3>
            <div className={styles.qList}>
              {r2Questions.map((q, i) => (
                <div key={q._id || i} className={styles.qItem}>
                  <div className={styles.qMeta}>
                    <span className={styles.qOrder}>#{q.order}</span>
                    <span className={styles.qLang}>{q.language}</span>
                    <span className={q.correctOption === 'AI' ? styles.badgeAI : styles.badgeHuman}>{q.correctOption}</span>
                  </div>
                  <div className={styles.qTitle}>{q.title}</div>
                  <div className={styles.qTimer}>⏱ {q.timerDuration}s</div>
                  <button className={styles.deleteBtn} onClick={() => q._id && deleteR2Q(q._id, q.title)}>Delete</button>
                </div>
              ))}
              {r2Questions.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No questions yet.</p>}
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════ ROUND 2 RESULTS ═══════════════ */}
      {activeTab === 'responses' && selectedRound === 'r2' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>All R2 Responses ({r2Results.length})</h3>
            <button className={styles.exportBtn} onClick={() => window.open(`${SERVER_URL}/api/export-csv`)}>⬇ Export CSV</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Team</th><th>Room</th><th>Question</th><th>Selection</th><th>Confidence</th><th>Reasoning</th><th>Understanding</th><th>Time</th></tr></thead>
              <tbody>
                {r2Results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.teamId?.name || '—'}</td><td>{r.teamId?.room || '—'}</td>
                    <td>{r.questionId?.title?.slice(0, 25) || '—'}…</td>
                    <td><span className={r.selection === 'AI' ? styles.badgeAI : r.selection === 'Human' ? styles.badgeHuman : styles.badgeUnsure}>{r.selection}</span></td>
                    <td>{r.confidence}/5</td>
                    <td className={styles.truncate}>{r.reasoning}</td>
                    <td className={styles.truncate}>{r.understanding}</td>
                    <td style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r2Results.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No responses yet.</p>}
          </div>
        </div>
      )}

      {/* ═══════════════ ROUND 2 LEADERBOARD ═══════════════ */}
      {activeTab === 'leaderboard' && selectedRound === 'r2' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3> AI-Graded R2 Leaderboard</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', marginTop: '0.25rem' }}>Scored by Google Gemini 2.0 Flash based on reasoning quality</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className={styles.startBtn} disabled={loadingR2Lb}
                onClick={async () => {
                  try { setLoadingR2Lb(true);
                    console.log('Starting AI scoring with gemini-2.0-flash...');
                    const response = await fetch(`${SERVER_URL}/api/score-responses`, { method: 'POST' });
                    if (!response.ok) throw new Error(`Scoring failed: ${await response.text()}`);
                    const res = await fetch(`${SERVER_URL}/api/leaderboard`);
                    setR2Leaderboard(await res.json());
                  } catch (err) { console.error(err); alert('Calculation failed.'); } finally { setLoadingR2Lb(false); }
                }}
              >{loadingR2Lb ? ' Scoring...' : ' Refresh R2 Rankings'}</button>
              <button className={styles.exportBtn} onClick={() => window.open(`${SERVER_URL}/api/export-llm-csv`)}>⬇ Export LLM CSV</button>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Rank</th><th>Team</th><th>Total Score</th><th>Breakdown</th></tr></thead>
              <tbody>
                {Array.isArray(r2Leaderboard) && r2Leaderboard.map((t: any, i) => (
                  <tr key={t.teamName}>
                    <td style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>#{i + 1}</td>
                    <td style={{ fontSize: '1.1rem' }}>{t.teamName}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>{t.totalScore} pts</td>
                    <td style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                      {t.breakdowns?.map((b: any, j: number) => (
                        <div key={j}><span style={{ color: b.isCorrect ? 'var(--success)' : 'var(--error)' }}>{b.qTitle?.slice(0, 12)}</span>: Base {b.basePoints} + LLM {b.llmScore}/10</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r2Leaderboard.length === 0 && !loadingR2Lb && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>Click Refresh to calculate.</p>}
          </div>
        </div>
      )}

      {/* ═══════════════ COMBINED LEADERBOARD ═══════════════ */}
      {activeTab === 'combined' && (
        <div className={styles.resultsTab}>
          <div style={{ background: 'rgba(168,85,247,0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.1)', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: '#a855f7', marginBottom: '0.25rem' }}> Event Finalization</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                Toggle to show/hide the final leaderboard result page to all participant teams.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
               <button 
                onClick={() => socket?.emit('admin-toggle-final-leaderboard')}
                style={{ 
                  background: r2GameState?.showFinalLeaderboard ? '#ef4444' : 'linear-gradient(135deg, #a855f7, #0070f3)',
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  maxWidth: '240px',
                  borderRadius: 8
                }}
               >
                 {r2GameState?.showFinalLeaderboard ? '󰄱 Final LB: Visible' : '󰄱 Final LB: Hidden'}
               </button>
               <button className={styles.dangerBtn} onClick={deleteTeams}>Delete Teams Data</button>
               <button className={styles.startBtn} onClick={fetchCombined} disabled={loadingCombined}
                style={{ background: 'rgba(255,255,255,0.05)', width: 'auto', padding: '0.7rem 1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                {loadingCombined ? 'Loading...' : ' Refresh Rankings'}
              </button>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Room</th><th>R1 Score</th><th>R2 Score</th><th>Total</th></tr>
              </thead>
              <tbody>
                {combined.map((t, i) => (
                  <tr key={t.teamName} style={{ background: i === 0 ? 'rgba(251,191,36,0.05)' : '' }}>
                    <td style={{ fontSize: '1.2rem', fontWeight: 800 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                    <td style={{ fontWeight: 600, fontSize: '1rem' }}>{t.teamName}</td>
                    <td style={{ color: 'rgba(255,255,255,0.45)' }}>{t.room || '—'}</td>
                    <td style={{ color: '#f97316', fontWeight: 700 }}>{t.r1Score} pts</td>
                    <td style={{ color: '#0070f3', fontWeight: 700 }}>{t.r2Score} pts</td>
                    <td style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.1rem' }}>{t.total} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {combined.length === 0 && !loadingCombined && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>Click Refresh to generate combined rankings.</p>}
          </div>
        </div>
      )}

      {/* ─── R2 Reset Modal ─── */}
      {showResetModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} premium-card`} style={{ maxWidth: 450 }}>
            <h3>️ Confirm Reset Round 2</h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '1rem 0 1.5rem', lineHeight: 1.5 }}>
              This sends everyone back to the R2 Lobby.<br /><br />
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>All Teams and R2 responses will be cleared.</span><br />
              <span style={{ color: 'var(--success)' }}>Questions will NOT be deleted.</span>
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className={styles.ghostBtn} onClick={() => setShowResetModal(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={resetR2}>Yes, Reset R2</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── R1 Reset Modal ─── */}
      {showR1ResetModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} premium-card`} style={{ maxWidth: 450, border: '1px solid rgba(0,112,243,0.3)' }}>
            <h3 style={{ color: '#0070f3' }}>️ Confirm Reset Round 1</h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '1rem 0 1.5rem', lineHeight: 1.5 }}>
              This sends everyone back to the R1 Lobby.<br /><br />
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>All Teams and R1 responses will be cleared.</span><br />
              <span style={{ color: 'var(--success)' }}>Questions will NOT be deleted.</span>
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className={styles.ghostBtn} onClick={() => setShowR1ResetModal(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={resetR1}>Yes, Reset R1</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
