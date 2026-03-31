'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '@/context/SocketContext';
import styles from './admin.module.css';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface Question {
  _id?: string;
  title: string;
  description: string;
  codeSnippet: string;
  language: string;
  correctOption: 'Human' | 'AI';
  timerDuration: number;
  order: number;
  answerReasoning?: string;
  purpose?: string;
}

interface GameState {
  status: 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';
  phase: 'QUESTION' | 'RESULT';
  currentQuestionIndex: number;
  timerRemaining: number;
  isPaused: boolean;
  totalQuestions: number;
  currentQuestion: Question | null;
}

interface ResultRow {
  teamId?: { name?: string; room?: string };
  questionId?: { title?: string };
  selection: 'Human' | 'AI' | 'None';
  confidence: number;
  reasoning: string;
  understanding: string;
  timestamp: string;
}

interface LeaderboardBreakdown {
  qTitle: string;
  isCorrect: boolean;
  basePoints: number;
  llmScore: number;
}

interface LeaderboardTeam {
  teamName: string;
  totalScore: number;
  breakdowns: LeaderboardBreakdown[];
}

const emptyQuestion: Question = {
  title: '',
  description: '',
  codeSnippet: '',
  language: 'javascript',
  correctOption: 'Human',
  timerDuration: 360,
  order: 1,
};

type Tab = 'control' | 'questions' | 'results' | 'leaderboard';

export default function Admin() {
  const socket = useSocket();
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('control');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState<Question>(emptyQuestion);
  const [savingQ, setSavingQ] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardTeam[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    const savedPwd = sessionStorage.getItem('adminPwd');
    const savedTab = sessionStorage.getItem('adminTab') as Tab | null;
    if (savedPwd) setIsAuthorized(true);
    if (savedTab) setActiveTab(savedTab);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('adminTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!socket) return;

    const handleAuthorized = () => {
      setIsAuthorized(true);
      setLoginError('');
    };
    const handleAdminError = (msg: string) => {
      setLoginError(msg);
      sessionStorage.removeItem('adminPwd');
      setIsAuthorized(false);
    };
    const handleStateUpdate = (state: GameState) => setGameState(state);

    socket.on('admin-authorized', handleAuthorized);
    socket.on('admin-error', handleAdminError);
    socket.on('state-update', handleStateUpdate);

    const savedPwd = sessionStorage.getItem('adminPwd');
    if (savedPwd) {
      socket.emit('admin-join', savedPwd);
    }

    return () => {
      socket.off('admin-authorized', handleAuthorized);
      socket.off('admin-error', handleAdminError);
      socket.off('state-update', handleStateUpdate);
    };
  }, [socket]);

  const adminHeaders = useCallback(
    (): HeadersInit => ({
      'Content-Type': 'application/json',
      'x-admin-secret': sessionStorage.getItem('adminPwd') || '',
    }),
    []
  );

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/questions`, { headers: adminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setQuestions(await res.json());
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    }
  }, [adminHeaders]);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/results`, { headers: adminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResults(await res.json());
    } catch (err) {
      console.error('Failed to fetch results:', err);
    }
  }, [adminHeaders]);

  const exportWithAuth = useCallback(
    async (path: string, filename: string) => {
      const res = await fetch(`${SERVER_URL}${path}`, { headers: adminHeaders() });
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    [adminHeaders]
  );

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchQuestions();
    void fetchResults();
  }, [fetchQuestions, fetchResults, isAuthorized]);

  const handleLogin = () => {
    setLoginError('');
    if (socket && password) {
      sessionStorage.setItem('adminPwd', password);
      socket.emit('admin-join', password);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminPwd');
    setIsAuthorized(false);
    setPassword('');
  };

  const startQuiz = () => socket?.emit('admin-start');
  const togglePause = () => socket?.emit('admin-pause');
  const nextQuestion = () => socket?.emit('admin-next');

  const resetEvent = () => {
    socket?.emit('admin-reset');
    setShowResetModal(false);
    setResults([]);
    setLeaderboard([]);
  };

  const saveQuestion = async () => {
    setSavingQ(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/questions`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(newQuestion),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Error saving question: ${err.error || res.status}`);
      } else {
        setNewQuestion(emptyQuestion);
        await fetchQuestions();
      }
    } catch {
      alert('Network error saving question.');
    } finally {
      setSavingQ(false);
    }
  };

  const deleteQuestion = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await fetch(`${SERVER_URL}/api/questions/${id}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      await fetchQuestions();
    } catch {
      alert('Failed to delete question.');
    }
  };

  const refreshLeaderboard = async () => {
    try {
      setLoadingLb(true);
      await fetch(`${SERVER_URL}/api/score-responses`, {
        method: 'POST',
        headers: adminHeaders(),
      });
      const res = await fetch(`${SERVER_URL}/api/leaderboard`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
      alert('Calculation failed. Please check the server logs.');
      setLeaderboard([]);
    } finally {
      setLoadingLb(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className={styles.loginContainer}>
        <div className="premium-card" style={{ minWidth: 340 }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Organizer Access</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Enter the admin password to continue
          </p>
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', marginBottom: '1rem', borderColor: loginError ? 'var(--danger)' : 'rgba(255,255,255,0.2)' }}
          />
          {loginError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '1rem', marginTop: '-0.5rem' }}>
              {loginError}
            </p>
          )}
          <button className={styles.startBtn} style={{ width: '100%', padding: '0.9rem' }} onClick={handleLogin}>
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.adminLayout}>
      <header className={styles.header}>
        <h1>Organizer Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className={styles.status}>
            Status: <span className={styles[gameState?.status || 'LOBBY'] || ''}>{gameState?.status || '...'}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className={styles.tabs}>
        {(['control', 'questions', 'results', 'leaderboard'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'results') {
                void fetchResults();
              }
            }}
          >
            {tab === 'control' && 'Round Control'}
            {tab === 'questions' && 'Questions'}
            {tab === 'results' && 'Responses'}
            {tab === 'leaderboard' && 'Leaderboard'}
          </button>
        ))}
      </div>

      {activeTab === 'control' && (
        <div className={styles.grid}>
          <section className="premium-card">
            <h3>Quiz Controls</h3>
            <div className={styles.controls}>
              {gameState?.status === 'LOBBY' && <button className={styles.startBtn} onClick={startQuiz}>Start Round</button>}
              {gameState?.status === 'IN_PROGRESS' && (
                <>
                  <button className={styles.pauseBtn} onClick={togglePause}>{gameState.isPaused ? 'Resume' : 'Pause'}</button>
                  <button className={styles.nextBtn} onClick={nextQuestion}>
                    {gameState.phase === 'QUESTION'
                      ? 'Show Results'
                      : gameState.currentQuestionIndex === questions.length - 1
                        ? 'End Event'
                        : 'Next PR'}
                  </button>
                </>
              )}
              {(gameState?.status === 'IN_PROGRESS' || gameState?.status === 'FINISHED') && (
                <button className={styles.dangerBtn} onClick={() => setShowResetModal(true)}>Reset the round</button>
              )}
              <button
                className={styles.dangerBtn}
                onClick={() => {
                  if (confirm('Delete ALL teams and their responses? This cannot be undone.')) {
                    socket?.emit('admin-delete-teams');
                  }
                }}
                title="Deletes all teams and responses"
              >
                Delete Teams Data
              </button>
              <button
                className={styles.exportBtn}
                onClick={() => exportWithAuth('/api/export-csv', 'results.csv').catch(() => {
                  alert('Failed to export responses.');
                })}
              >
                Export Responses CSV
              </button>
            </div>
          </section>
          <section className="premium-card">
            <h3>Live Stats</h3>
            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.label}>Question</span>
                <span className={styles.value}>{(gameState?.currentQuestionIndex ?? 0) + 1} / {gameState?.totalQuestions ?? '-'}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.label}>Timer</span>
                <span className={`${styles.value} ${gameState && gameState.timerRemaining < 60 ? styles.danger : ''}`}>
                  {Math.floor((gameState?.timerRemaining ?? 0) / 60)}:{((gameState?.timerRemaining ?? 0) % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </section>
          <section className={`${styles.fullWidth} premium-card`}>
            <h3>Current Question Preview</h3>
            {gameState?.currentQuestion ? (
              <div className={styles.preview}>
                <h4>{gameState.currentQuestion.title}</h4>
                <p style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>{gameState.currentQuestion.description}</p>
              </div>
            ) : <p style={{ color: 'rgba(255,255,255,0.4)' }}>No question active.</p>}
          </section>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className={styles.qManager}>
          <section className="premium-card">
            <h3>Add New Question</h3>
            <div className={styles.qForm}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>PR Title</label>
                  <input value={newQuestion.title} onChange={(e) => setNewQuestion({ ...newQuestion, title: e.target.value })} placeholder="e.g. Refactor auth flow" />
                </div>
                <div className={styles.field}>
                  <label>Language</label>
                  <select value={newQuestion.language} onChange={(e) => setNewQuestion({ ...newQuestion, language: e.target.value })}>
                    {['javascript', 'python', 'java', 'cpp', 'typescript', 'go', 'rust'].map((language) => <option key={language} value={language}>{language}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label>PR Description</label>
                <textarea rows={2} value={newQuestion.description} onChange={(e) => setNewQuestion({ ...newQuestion, description: e.target.value })} placeholder="What does this PR do?" />
              </div>
              <div className={styles.field}>
                <label>Code Snippet</label>
                <textarea rows={8} value={newQuestion.codeSnippet} onChange={(e) => setNewQuestion({ ...newQuestion, codeSnippet: e.target.value })} placeholder="Paste code here..." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Correct Answer</label>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {(['Human', 'AI'] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => setNewQuestion({ ...newQuestion, correctOption: option })}
                        style={{
                          flex: 1,
                          padding: '0.6rem',
                          borderRadius: 8,
                          border: '1px solid',
                          borderColor: newQuestion.correctOption === option ? 'var(--primary)' : 'var(--border)',
                          background: newQuestion.correctOption === option ? 'var(--primary)' : 'transparent',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Timer (seconds)</label>
                  <input type="number" min={30} max={600} value={newQuestion.timerDuration} onChange={(e) => setNewQuestion({ ...newQuestion, timerDuration: Number(e.target.value) })} />
                </div>
                <div className={styles.field}>
                  <label>Order</label>
                  <input type="number" min={1} value={newQuestion.order} onChange={(e) => setNewQuestion({ ...newQuestion, order: Number(e.target.value) })} />
                </div>
              </div>
              <button className={styles.startBtn} onClick={saveQuestion} disabled={savingQ || !newQuestion.title}>
                {savingQ ? 'Saving...' : 'Save Question'}
              </button>
            </div>
          </section>
          <section className="premium-card" style={{ marginTop: '2rem' }}>
            <h3>All Questions ({questions.length})</h3>
            <div className={styles.qList}>
              {questions.map((q, i) => (
                <div key={q._id || i} className={styles.qItem}>
                  <div className={styles.qMeta}>
                    <span className={styles.qOrder}>#{q.order}</span>
                    <span className={styles.qLang}>{q.language}</span>
                    <span className={q.correctOption === 'AI' ? styles.badgeAI : styles.badgeHuman}>{q.correctOption}</span>
                  </div>
                  <div className={styles.qTitle}>{q.title}</div>
                  <div className={styles.qTimer}>Timer {q.timerDuration}s</div>
                  <button className={styles.deleteBtn} onClick={() => q._id && deleteQuestion(q._id, q.title)} title="Delete question">Delete</button>
                </div>
              ))}
              {questions.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No questions yet. Add one above.</p>}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'results' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>All Responses ({results.length})</h3>
            <button className={styles.exportBtn} onClick={() => exportWithAuth('/api/export-csv', 'results.csv').catch(() => {
              alert('Failed to export responses.');
            })}>Export CSV</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Team</th><th>Room</th><th>Question</th><th>Selection</th><th>Confidence</th><th>Reasoning</th><th>Understanding</th><th>Time</th></tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={`${result.timestamp}-${i}`}>
                    <td>{result.teamId?.name || '-'}</td>
                    <td>{result.teamId?.room || '-'}</td>
                    <td>{result.questionId?.title ? `${result.questionId.title.slice(0, 30)}...` : '-'}</td>
                    <td><span className={result.selection === 'AI' ? styles.badgeAI : result.selection === 'Human' ? styles.badgeHuman : styles.badgeUnsure}>{result.selection}</span></td>
                    <td>{result.confidence}/5</td>
                    <td className={styles.truncate}>{result.reasoning}</td>
                    <td className={styles.truncate}>{result.understanding}</td>
                    <td style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{new Date(result.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No responses yet.</p>}
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className={styles.resultsTab}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3>AI-Graded Leaderboard</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '0.3rem' }}>Scores are calculated automatically via Google Gemini based on the participants&apos; reasoning.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className={styles.startBtn} onClick={() => void refreshLeaderboard()} disabled={loadingLb}>
                {loadingLb ? 'Scoring with Gemini...' : 'Refresh Rankings'}
              </button>
              <button className={styles.exportBtn} onClick={() => exportWithAuth('/api/export-llm-csv', 'llm-feedback.csv').catch(() => {
                alert('Failed to export LLM feedback.');
              })}>Export LLM Feedback</button>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Total Score</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((team, i) => (
                  <tr key={team.teamName}>
                    <td style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>#{i + 1}</td>
                    <td style={{ fontSize: '1.1rem' }}>{team.teamName}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>{team.totalScore} pts</td>
                    <td style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                      {team.breakdowns.map((breakdown, j) => (
                        <div key={`${team.teamName}-${j}`} style={{ marginBottom: '4px' }}>
                          <span style={{ color: breakdown.isCorrect ? 'var(--success)' : 'var(--error)' }}>{breakdown.qTitle.slice(0, 15)}</span>:
                          Base {breakdown.basePoints} + LLM {breakdown.llmScore}/10
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leaderboard.length === 0 && !loadingLb && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem' }}>No leaderboard data available. Click Refresh to calculate.</p>}
          </div>
        </div>
      )}

      {showResetModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} premium-card`} style={{ maxWidth: 450 }}>
            <h3>Confirm Reset</h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '1rem 0 1.5rem', lineHeight: 1.5 }}>
              Are you sure you want to reset the round? This will send everyone back to the lobby.
              <br /><br />
              <span style={{ color: 'var(--warning)' }}>All team responses and leaderboard scores will be cleared.</span>
              <br />
              <span style={{ color: 'var(--success)' }}>Questions will not be deleted.</span>
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className={styles.ghostBtn} onClick={() => setShowResetModal(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={resetEvent}>Yes, Reset</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
