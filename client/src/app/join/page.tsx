'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useTeam } from '@/context/TeamContext';
import styles from './page.module.css';

export default function Lobby() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);
  const socket = useSocket();
  const { setTeam } = useTeam();
  const router = useRouter();

  const handleJoin = () => {
    if (!name || !socket) return;
    setLoading(true);
    socket.emit('join-team', { teamName: name, roomNumber: room });

    socket.once('joined', ({ teamId }) => {
      setTeam(teamId, name, room);
      router.push('/quiz');
    });

    socket.once('error', (msg) => {
      alert(msg);
      setLoading(false);
    });
  };

  return (
    <main className={styles.container}>
      <div className="premium-card">
        <h1 className="gradient-text">Turing Test</h1>
        <p className={styles.subtitle}>Round 2: PR Detective</p>
        
        <div className={styles.inputGroup}>
          <label>Team Name</label>
          <input 
            type="text" 
            placeholder="Enter your team name" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label>Room Number (Optional)</label>
          <input 
            type="text" 
            placeholder="e.g. Room 1" 
            value={room} 
            onChange={(e) => setRoom(e.target.value)}
          />
        </div>

        <button 
          className={styles.joinButton} 
          onClick={handleJoin}
          disabled={loading || !name}
        >
          {loading ? 'Joining...' : 'Join Event'}
        </button>
      </div>
    </main>
  );
}
