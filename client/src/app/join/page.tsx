'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useTeam } from '@/context/TeamContext';
import styles from './page.module.css';

export default function Lobby() {
  const [name, setName]     = useState('');
  const [room, setRoom]     = useState('');
  const [loading, setLoading] = useState(false);
  const socket  = useSocket();
  const { setTeam } = useTeam();
  const router  = useRouter();

  const handleJoin = () => {
    if (!name || !socket) return;
    setLoading(true);
    socket.emit('join-team', { teamName: name, roomNumber: room });

    socket.once('joined', ({ teamId }) => {
      setTeam(teamId, name, room);
      router.push('/round1');
    });

    socket.once('error', (msg: string) => {
      alert(msg);
      setLoading(false);
    });
  };

  return (
    <main className={styles.container}>
      <div className="premium-card" style={{ maxWidth: 440, width: '100%' }}>
        <h1 className="gradient-text" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Turing Test</h1>
        <p className={styles.subtitle} style={{ marginBottom: '1.75rem' }}>Enter your team details to join the event</p>

        <div className={styles.inputGroup}>
          <label>Team Name</label>
          <input
            type="text"
            placeholder="Enter your team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name && handleJoin()}
          />
        </div>

        <div className={styles.inputGroup}>
          <label>Room Number (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Room 1"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name && handleJoin()}
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={loading || !name}
          style={{
            marginTop: '1.5rem',
            width: '100%',
            padding: '1rem',
            background: loading ? 'rgba(249,115,22,0.3)' : 'var(--primary)',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: loading || !name ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading || !name ? 0.5 : 1,
            boxShadow: '0 4px 12px rgba(249,115,22,0.3)'
          }}
        >
          {loading ? 'Joining...' : 'Login'}
        </button>
      </div>
    </main>
  );
}
