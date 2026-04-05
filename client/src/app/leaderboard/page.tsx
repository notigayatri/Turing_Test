'use client';

import { useEffect, useState } from 'react';
import styles from './leaderboard.module.css';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface TeamScore {
  teamName: string;
  room: string;
  r1Score: number;
  r2Score: number;
  total: number;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/combined-leaderboard`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        const data = await response.json();
        setLeaderboard(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeaderboard();
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Final Turing Test Rankings 🏆</h1>
      
      {loading ? (
        <div className={styles.loading}>Loading Final Results...</div>
      ) : error ? (
        <div className={styles.loading} style={{ color: '#ef4444' }}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Room</th>
                <th>Round 1</th>
                <th>Round 2</th>
                <th>Final Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((t, i) => (
                <tr key={t.teamName} className={i === 0 ? styles.rowTop : ''}>
                  <td style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '1rem' }}>{t.teamName}</td>
                  <td style={{ color: 'rgba(255,255,255,0.45)' }}>{t.room || '—'}</td>
                  <td style={{ color: '#0070f3', fontWeight: 700 }}>{t.r1Score} pts</td>
                  <td style={{ color: '#a855f7', fontWeight: 700 }}>{t.r2Score} pts</td>
                  <td style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.1rem' }}>{t.total} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaderboard.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)' }}>No scores available yet.</p>}
        </div>
      )}
    </div>
  );
}
