'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useTeam } from '@/context/TeamContext';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import py from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { motion, AnimatePresence } from 'framer-motion';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import styles from './quiz.module.css';

SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('python', py);
SyntaxHighlighter.registerLanguage('cpp', cpp);

export default function Quiz() {
  const socket = useSocket();
  const { teamId, teamName, roomNumber, isLoaded, logout } = useTeam();
  const router = useRouter();

  const [gameState, setGameState] = useState<any>(null);
  const [formData, setFormData] = useState({
    selection: '',
    confidence: 3,
    reasoning: '',
    understanding: ''
  });
  const [isLocked, setIsLocked] = useState(false);

  // Activate anti-cheat when the quiz is in progress
  useAntiCheat(gameState?.status === 'IN_PROGRESS');

  // Wait until localStorage is read before potentially redirecting
  useEffect(() => {
    if (!isLoaded) return;
    if (!teamName) {
      router.push('/join');
    }
  }, [isLoaded, teamName, router]);

  // On refresh: re-emit join-team so the socket session is restored
  useEffect(() => {
    if (!socket || !teamId || !teamName) return;
    socket.emit('join-team', { teamName, roomNumber: roomNumber || '' });
    socket.once('joined', () => {});
  }, [socket, teamId, teamName, roomNumber]);

  useEffect(() => {
    if (!socket) return;

    socket.on('state-update', (state) => {
      setGameState((prev: any) => {
        // Reset form when question changes
        if (prev?.currentQuestionIndex !== state.currentQuestionIndex) {
          setFormData({ selection: '', confidence: 3, reasoning: '', understanding: '' });
          setIsLocked(false);
          // Show "PR pulling" animation when question changes during the active round
          if (state.status === 'IN_PROGRESS') {
            setIsTransitioning(true);
            setTimeout(() => setIsTransitioning(false), 2000);
          }
        }
        return state;
      });
    });

    socket.on('timer-tick', ({ timerRemaining }) => {
      setGameState((prev: any) => ({ ...prev, timerRemaining }));
      if (timerRemaining <= 0) {
        setIsLocked(true);
      }
    });

    return () => {
      socket.off('state-update');
      socket.off('timer-tick');
    };
  }, [socket]);

  const autoSave = useCallback((updatedData: any) => {
    if (!socket || !teamId || !gameState?.currentQuestion?._id || isLocked) return;
    socket.emit('submit-response', {
      teamId,
      questionId: gameState.currentQuestion._id,
      ...updatedData
    });
  }, [socket, teamId, gameState?.currentQuestion?._id, isLocked]);

  const handleInputChange = (field: string, value: any) => {
    if (isLocked) return;
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    autoSave(newData);
  };

  const handleLogout = () => {
    logout();
    router.push('/join');
  };

  const [isTransitioning, setIsTransitioning] = useState(false);

  // Don't render anything until localStorage is read
  if (!isLoaded) return <div className={styles.loading}>Loading...</div>;

  if (!gameState) return <div className={styles.loading}>Connecting to session...</div>;

  // Transition screen when admin pulls next PR
  if (isTransitioning && gameState?.status === 'IN_PROGRESS') {
    return (
      <div className={styles.lobbyWait}>
        <div className={styles.pullingBox}>
          <div className={styles.scanner}></div>
          <h2 className="gradient-text">PULLING NEW PR...</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem' }}>Fetching source code and commit history</p>
        </div>
      </div>
    );
  }

  if (gameState.status === 'LOBBY') {
    return (
      <div className={styles.lobbyWait}>
        <div className="premium-card" style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <h2 className="gradient-text" style={{ fontSize: '2rem', marginBottom: '1rem' }}>Welcome, {teamName}!</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.05rem', lineHeight: 1.6 }}>
            The round will begin shortly. Please wait for the organizer to start the event.
          </p>
          <div className={styles.instructionsBox}>
            <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>How to play:</h4>
            <ul style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.5, paddingLeft: '1.5rem' }}>
              <li>You will be shown various Pull Requests (PRs).</li>
              <li>Decide if the author is <strong>Human</strong> or <strong>AI</strong>.</li>
              <li>Rate your confidence and explain your reasoning.</li>
              <li>Scores are calculated automatically by an AI Judge!</li>
              <li><strong>Do not refresh or switch tabs</strong> during a question.</li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button className={styles.leaveBtn} onClick={handleLogout} style={{ marginTop: 0 }}>Leave Event</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'FINISHED') {
    return (
      <div className={styles.lobbyWait}>
        <div className="premium-card">
          <h1 className="gradient-text">Event Finished</h1>
          <p style={{ margin: '1rem 0', color: 'rgba(255,255,255,0.6)' }}>
            Thank you for participating, <strong>{teamName}</strong>!<br/>Results will be announced soon.
          </p>
          <button className={styles.leaveBtn} onClick={handleLogout}>Leave &amp; Logout</button>
        </div>
      </div>
    );
  }

  const { currentQuestion, timerRemaining, currentQuestionIndex, totalQuestions, phase } = gameState;

  if (phase === 'RESULT') {
    return (
      <main className={styles.quizLayout}>
        <header className={styles.header}>
          <div className={styles.progress}>PR {currentQuestionIndex + 1} Result</div>
          <div className={styles.teamInfo}>{teamName}</div>
        </header>

        <div className={styles.resultContainer}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card"
            style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}
          >
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2.5rem' }}>
                The Correct Answer was:
              </h1>
              <div className={currentQuestion.correctOption === 'AI' ? styles.resultTagAI : styles.resultTagHuman} style={{ fontSize: '5rem', lineHeight: 1, marginTop: '1rem' }}>
                {currentQuestion.correctOption}
              </div>
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '2rem' }}>
                <h3 className={styles.resultHeader}>Purpose of this PR</h3>
                <p style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', fontSize: '1.05rem' }}>{currentQuestion.purpose}</p>
              </div>

              <div>
                <h3 className={styles.resultHeader}>Reasoning</h3>
                <p style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', fontSize: '1.05rem' }}>{currentQuestion.answerReasoning}</p>
              </div>
            </div>

            <p style={{ marginTop: '3rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: '0.9rem' }}>
              Waiting for the organizer to pull the next Pull Request...
            </p>
          </motion.div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.quizLayout}>
      <header className={styles.header}>
        <div className={styles.progress}>PR {currentQuestionIndex + 1} of {totalQuestions}</div>
        <div className={`${styles.timer} ${timerRemaining < 60 ? styles.timerWarning : ''}`}>
          {Math.floor(timerRemaining / 60)}:{(timerRemaining % 60).toString().padStart(2, '0')}
        </div>
        <div className={styles.teamInfo}>{teamName}</div>
      </header>

      <div className={styles.content}>
        {/* Left Side: PR Info */}
        <section className={styles.leftPanel}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={styles.questionCard}
            >
              <h2>{currentQuestion?.title}</h2>
              <div className={styles.description}>
                {currentQuestion?.description}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Right Side: Code & Inputs */}
        <section className={styles.rightPanel}>
          <div className={styles.codeContainer}>
            <SyntaxHighlighter
              language={currentQuestion?.language || 'javascript'}
              style={atomOneDark}
              customStyle={{
                borderRadius: '8px',
                padding: '1.5rem',
                fontSize: '0.9rem',
                maxHeight: '300px'
              }}
            >
              {currentQuestion?.codeSnippet || ''}
            </SyntaxHighlighter>
          </div>

          <div className={styles.inputContainer}>
            <div className={styles.formGroup}>
              <label>Who authored this PR?</label>
              <div className={styles.radioGroup}>
                {['Human', 'AI'].map(option => (
                  <button
                    key={option}
                    className={`${styles.radioBtn} ${formData.selection === option ? styles.active : ''}`}
                    onClick={() => handleInputChange('selection', option)}
                    disabled={isLocked}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Confidence Rating (1-5)</label>
              <div className={styles.confidenceGroup}>
                {[1, 2, 3, 4, 5].map(num => (
                  <button
                    key={num}
                    className={`${styles.numBtn} ${formData.confidence === num ? styles.active : ''}`}
                    onClick={() => handleInputChange('confidence', num)}
                    disabled={isLocked}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Reasoning / Explanation</label>
              <textarea
                className={styles.textarea}
                placeholder="Why do you think so?"
                rows={3}
                value={formData.reasoning}
                onChange={(e) => handleInputChange('reasoning', e.target.value)}
                disabled={isLocked}
              />
            </div>

            <div className={styles.formGroup}>
              <label>What does this code do?</label>
              <textarea
                className={styles.textarea}
                placeholder="Brief summary..."
                rows={2}
                value={formData.understanding}
                onChange={(e) => handleInputChange('understanding', e.target.value)}
                disabled={isLocked}
              />
            </div>
          </div>
        </section>
      </div>

      {isLocked && <div className={styles.lockedOverlay}>Time&apos;s Up! Submissions Locked.</div>}
    </main>
  );
}
