'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useTeam } from '@/context/TeamContext';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import py from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp';
import ts from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './round1.module.css';

SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('python', py);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('typescript', ts);

export default function Round1() {
  const socket = useSocket();
  const { teamId, teamName, roomNumber, isLoaded, logout } = useTeam();
  const router = useRouter();

  const [gameState, setGameState] = useState<any>(null);
  const [selected, setSelected] = useState<'Human' | 'AI' | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [myScore, setMyScore] = useState<number | null>(null);
  const submitTimeRef = useRef<number>(Date.now());

  // Redirect to join if not registered
  useEffect(() => {
    if (!isLoaded) return;
    if (!teamName) router.push('/join');
  }, [isLoaded, teamName, router]);

  // Re-join socket room on refresh
  useEffect(() => {
    if (!socket || !teamId || !teamName) return;
    socket.emit('join-team', { teamName, roomNumber: roomNumber || '' });
    socket.once('joined', () => { });
  }, [socket, teamId, teamName, roomNumber]);

  // Main socket event handlers
  useEffect(() => {
    if (!socket) return;

    socket.on('r1-state-update', (state: any) => {
      setGameState((prev: any) => {
        // Reset UI on new question
        if (prev?.currentQuestionIndex !== state.currentQuestionIndex) {
          setSelected(null);
          setIsLocked(false);
          setSubmitted(false);
          setMyScore(null);
          submitTimeRef.current = Date.now();
        }
        // Correctly calculate lock state based on phase and timer balance
        const shouldBeLocked = state.phase === 'RESULT' || state.timerRemaining <= 0;
        setIsLocked(shouldBeLocked);
        
        return state;
      });
    });

    socket.on('r1-timer-tick', ({ timerRemaining, timerTotal }: any) => {
      setGameState((prev: any) => ({ ...prev, timerRemaining, timerTotal }));
      setIsLocked(timerRemaining <= 0);
    });

    socket.on('r1-leaderboard-update', (lb: any[]) => {
      setLeaderboard(lb);
    });

    socket.on('r1-response-saved', () => {
    });

    socket.on('state-update', (state: any) => {
      // Only redirect to Round 2 if it's explicitly started
      if (state.status === 'IN_PROGRESS') {
        router.push('/quiz');
      }
    });

    socket.on('admin-delete-teams', async () => {
      try {
        // Logic handled on server side, client just resets local state
        setGameState(null);
        setLeaderboard([]);
        setSelected(null);
      } catch (err) {
        console.error('Error in admin-delete-teams:', err);
      }
    });

    socket.on('redirect-home', () => {
      localStorage.clear();
      router.push('/');
    });

    socket.emit('r1-get-state');

    return () => {
      socket.off('r1-state-update');
      socket.off('r1-timer-tick');
      socket.off('r1-leaderboard-update');
      socket.off('r1-response-saved');
      socket.off('state-update');
      socket.off('admin-delete-teams');
      socket.off('redirect-home');
    };
  }, [socket, router]);

  const submitAnswer = useCallback((answer: 'Human' | 'AI') => {
    if (!socket || !teamId || !gameState?.currentQuestion?._id || isLocked) return;
    setSelected(answer);
    socket.emit('r1-submit', {
      teamId,
      questionId: gameState.currentQuestion._id,
      answer,
    });
  }, [socket, teamId, gameState?.currentQuestion?._id, isLocked]);

  const handleLogout = () => { logout(); router.push('/join'); };

  // ── Loading guards ──
  if (!isLoaded) return <div className={styles.loading}>Loading...</div>;
  if (!gameState) return <div className={styles.loading}>Connecting to Round 1...</div>;

  const { status, phase, currentQuestion, timerRemaining, timerTotal,
    currentQuestionIndex, totalQuestions, showLeaderboard } = gameState;

  const timerPct = timerTotal > 0 ? (timerRemaining / timerTotal) * 100 : 0;
  const isDanger = timerRemaining <= 10 && timerRemaining > 0;
  const mm = Math.floor(timerRemaining / 60);
  const ss = (timerRemaining % 60).toString().padStart(2, '0');

  // ── LOBBY ──
  if (status === 'LOBBY') {
    return (
      <div className={styles.lobbyWrap} style={{ paddingTop: '5vh' }}>
        <div className="premium-card" style={{ maxWidth: 640, textAlign: 'center', border: '1px solid rgba(168,85,247,0.3)', background: 'linear-gradient(135deg, rgba(20,20,30,0.9), rgba(10,10,15,0.95))' }}>
          <h2 style={{ fontSize: '3rem', marginBottom: '0.75rem', fontWeight: 800, background: 'linear-gradient(90deg, #a855f7, #0070f3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block', lineHeight: 1.2, width: '100%' }}>
            Welcome, {teamName}!
          </h2>
          <div style={{ color: '#0070f3', fontSize: '1rem', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800 }}>
            Round 1: Multimedia Detection
          </div>

          <div className={styles.howtoBox} style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', margin: '1.5rem 0', borderRadius: '12px' }}>
            <h4 style={{ color: '#0070f3', marginBottom: '1rem', fontSize: '1.2rem', textAlign: 'center', fontWeight: 'bold' }}>How to play:</h4>
            <ul style={{ textAlign: 'left', color: 'rgba(255,255,255,0.8)', fontSize: '1rem', lineHeight: 1.7, paddingLeft: '1.5rem' }}>
              <li>Analyze: <strong>Text, Code, Images, Audio, or Video</strong> content.</li>
              <li>Decide: Was this created by a <strong>Human</strong> or <strong>AI</strong>?</li>
              <li>Speed: Quick correct answers earn higher rewards!</li>
              <li>Timer: Answer before the clock hits zero to secure points.</li>
              <li>Scores: R1 and R2 scores combine for your <strong>Final Rank</strong>.</li>
            </ul>
          </div>

          <div className={styles.pulseContainer} style={{ marginTop: '2rem' }}>
            <div className={styles.pulseDot} style={{ background: '#0070f3' }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', fontWeight: 500 }}>
              WAITING FOR ORGANIZER TO START EVENT...
            </p>
          </div>
          <div style={{ marginTop: '2.5rem' }}>
            <button className={styles.leaveBtn} onClick={handleLogout}>Leave Event</button>
          </div>
        </div>
      </div>
    );
  }

  // ── FINISHED ──
  if (status === 'FINISHED') {
    return (
      <div className={styles.lobbyWrap}>
        <div className={styles.lobbyCard}>
          <div style={{ fontSize: '3rem' }}></div>
          <div className={styles.r1Title}>Round 1 Complete!</div>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '2rem', lineHeight: 1.6 }}>
            Well done, <strong style={{ color: '#f97316' }}>{teamName}</strong>!<br />
            {showLeaderboard ? 'Check out the final Round 1 rankings below.' : 'The organizer will announce results shortly.'}
          </p>
          {showLeaderboard && leaderboard.length > 0 && (
            <div className={styles.leaderboard} style={{ padding: 0, marginBottom: '2rem' }}>
              <div className={styles.lbTitle} style={{ color: '#f97316' }}>🏆 Round 1 Rankings</div>
              {leaderboard.map((t, i) => (
                <div key={i} className={styles.lbRow}>
                  <span className={`${styles.lbRank} ${i === 0 ? styles.top1 : i === 1 ? styles.top2 : i === 2 ? styles.top3 : ''}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <span className={styles.lbTeam}>{t.teamName}</span>
                  <span className={styles.lbScore}>{t.totalScore} pts</span>
                </div>
              ))}
            </div>
          )}
          <button
            className={styles.leaveBtn}
            onClick={() => router.push('/quiz')}
            style={{
              marginTop: '1.5rem',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '1rem 2rem',
              fontWeight: 'bold',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Next Round →
          </button>
        </div>
      </div>
    );
  }

  // ── RESULT PHASE ──
  if (phase === 'RESULT' && currentQuestion) {
    const correct = currentQuestion.correctAnswer;
    const isRight = selected === correct;
    const noAnswer = !selected;

    return (
      <div className={styles.r1Layout}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.roundBadge}>
            <span className={styles.roundDot} />
            Round 1 · Results
          </div>
          <div className={styles.progress}>Q {currentQuestionIndex + 1} / {totalQuestions}</div>
          <div className={styles.teamChip}>{teamName}</div>
        </header>

        <div className={styles.resultReveal}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`result-${currentQuestionIndex}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className={styles.revealCard}
            >
              {noAnswer ? (
                <>
                  <div style={{ fontSize: '2.8rem', marginBottom: '0.5rem' }}>⏰</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>Time&apos;s up — no answer recorded</div>
                </>
              ) : isRight ? (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.3rem' }}></div>
                  <div className={styles.correctBadge}>Correct!</div>
                  {myScore !== null && <div className={styles.yourScore}>+{myScore} pts</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.3rem' }}></div>
                  <div className={styles.wrongBadge}>Wrong Answer</div>
                </>
              )}

              {/* Correct Answer reveal */}
              <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                The content was:
              </div>
              <div className={`${styles.answerTag} ${correct === 'Human' ? styles.answerTagHuman : styles.answerTagAI}`}>
                {correct === 'Human' ? ' Human' : ' AI'}
              </div>

              {/* Explanation */}
              {currentQuestion.explanation && (
                <div className={styles.explanationBox}>
                  <h4> Explanation</h4>
                  <p>{currentQuestion.explanation}</p>
                </div>
              )}

              <div className={styles.waitNote}>
                Waiting for the organizer to continue...
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Leaderboard (if enabled by admin) */}
        {showLeaderboard && leaderboard.length > 0 && (
          <div className={styles.leaderboard}>
            <div className={styles.lbTitle}> Live Rankings</div>
            <AnimatePresence>
              {leaderboard.map((t, i) => (
                <motion.div
                  key={t.teamName}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={styles.lbRow}
                  style={t.teamName === teamName ? { borderColor: 'rgba(0,112,243,0.4)', background: 'rgba(0,112,243,0.07)' } : {}}
                >
                  <span className={`${styles.lbRank} ${i === 0 ? styles.top1 : i === 1 ? styles.top2 : i === 2 ? styles.top3 : ''}`}>
                    {i === 0 ? '' : i === 1 ? '' : i === 2 ? '' : `#${i + 1}`}
                  </span>
                  <span className={styles.lbTeam}>{t.teamName}</span>
                  <span className={styles.lbCorrect}>{t.correct}/{t.answered} </span>
                  <span className={styles.lbScore}>{t.totalScore} pts</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE QUESTION PHASE ──
  const q = currentQuestion;

  return (
    <div className={styles.r1Layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.roundBadge}>
          <span className={styles.roundDot} />
          Round 1
        </div>
        <div className={styles.progress}>Q {currentQuestionIndex + 1} / {totalQuestions}</div>
        <div className={styles.teamChip}>{teamName}</div>
      </header>

      {/* Timer bar */}
      <div className={styles.timerSection}>
        <div className={styles.timerTopRow}>
          <span className={styles.timerLabel}>Time Remaining</span>
          <span className={`${styles.timerCount} ${isDanger ? styles.danger : ''}`}>
            {mm}:{ss}
          </span>
        </div>
        <div className={styles.timerBarWrap}>
          <div
            className={`${styles.timerBarFill} ${isDanger ? styles.danger : ''}`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Prompt chip */}
        <div className={styles.promptChip}>
          {q?.prompt || 'Is the following content AI-generated or Human-created?'}
        </div>

        {/* Multimedia card */}
        {q && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`q-${currentQuestionIndex}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className={styles.mediaCard}
            >
              <div className={styles.mediaGrid}>
                {/* Text block */}
                {q.mediaText && (
                  <div className={styles.mediaBlock}>
                    <div className={styles.mediaLabel}> Text</div>
                    <div className={styles.mediaText}>{q.mediaText}</div>
                  </div>
                )}

                {/* Code block */}
                {q.mediaCode && (
                  <div className={styles.mediaBlock}>
                    <div className={styles.mediaLabel}> Code</div>
                    <div className={styles.codeWrap}>
                      <SyntaxHighlighter
                        language={q.mediaCodeLang || 'javascript'}
                        style={atomOneDark}
                        customStyle={{ margin: 0, borderRadius: '10px', fontSize: '0.88rem', padding: '1.25rem' }}
                      >
                        {q.mediaCode}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                )}

                {/* Image block */}
                {q.mediaImageUrl && (
                  <div className={styles.mediaBlock}>
                    <div className={styles.mediaLabel}>️ Image</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={q.mediaImageUrl} alt="Question media" className={styles.mediaImage} />
                  </div>
                )}

                {/* Audio block */}
                {q.mediaAudioUrl && (
                  <div className={styles.mediaBlock}>
                    <div className={styles.mediaLabel}> Audio</div>
                    <audio controls className={styles.mediaAudio} src={q.mediaAudioUrl} />
                  </div>
                )}

                {/* Video block */}
                {q.mediaVideoUrl && (
                  <div className={styles.mediaBlock}>
                    <div className={styles.mediaLabel}> Video</div>
                    <video controls className={styles.mediaVideo} src={q.mediaVideoUrl} />
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* MCQ Buttons */}
        <div className={styles.mcqSection}>
          <div className={styles.mcqLabel}>Your Answer</div>
          <div className={styles.mcqRow}>
            <button
              id="r1-btn-human"
              className={`${styles.mcqBtn} ${styles.human} ${selected === 'Human' ? styles.selected : ''}`}
              onClick={() => submitAnswer('Human')}
              disabled={isLocked}
            >
              <span className={styles.mcqIcon}></span>
              <span>Human</span>
              <span className={styles.mcqSub}>Created by a person</span>
            </button>
            <button
              id="r1-btn-ai"
              className={`${styles.mcqBtn} ${styles.ai} ${selected === 'AI' ? styles.selected : ''}`}
              onClick={() => submitAnswer('AI')}
              disabled={isLocked}
            >
              <span className={styles.mcqIcon}></span>
              <span>AI</span>
              <span className={styles.mcqSub}>Generated by AI</span>
            </button>
          </div>
        </div>

        {/* No submitted pill as requested, multiple clicks allow modification */}
      </div>

      {/* Locked banner */}
      {isLocked && !submitted && phase === 'QUESTION' && (
        <div className={styles.lockedBanner}>
          ⏰ Time&apos;s Up — Submissions Locked
        </div>
      )}
    </div>
  );
}
