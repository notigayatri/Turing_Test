'use client';
import { createContext, useContext, useState, useEffect } from 'react';

interface TeamContextType {
  teamId: string | null;
  teamName: string | null;
  roomNumber: string | null;
  isLoaded: boolean;
  setTeam: (id: string, name: string, room: string) => void;
  logout: () => void;
}

const TeamContext = createContext<TeamContextType | null>(null);

export const TeamProvider = ({ children }: { children: React.ReactNode }) => {
  const [teamId, setTeamId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('teamId');
    return null;
  });
  const [teamName, setTeamName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('teamName');
    return null;
  });
  const [roomNumber, setRoomNumber] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('roomNumber');
    return null;
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const setTeam = (id: string, name: string, room: string) => {
    setTeamId(id);
    setTeamName(name);
    setRoomNumber(room);
    localStorage.setItem('teamId', id);
    localStorage.setItem('teamName', name);
    localStorage.setItem('roomNumber', room);
  };

  const logout = () => {
    setTeamId(null);
    setTeamName(null);
    setRoomNumber(null);
    localStorage.removeItem('teamId');
    localStorage.removeItem('teamName');
    localStorage.removeItem('roomNumber');
  };

  return (
    <TeamContext.Provider value={{ teamId, teamName, roomNumber, isLoaded, setTeam, logout }}>
      {children}
    </TeamContext.Provider>
  );
};

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
