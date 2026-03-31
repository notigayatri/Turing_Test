'use client';
import { createContext, useContext, useReducer, useSyncExternalStore } from 'react';

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
  const [, bumpStorageVersion] = useReducer((value: number) => value + 1, 0);
  const isLoaded = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const teamId = isLoaded ? localStorage.getItem('teamId') : null;
  const teamName = isLoaded ? localStorage.getItem('teamName') : null;
  const roomNumber = isLoaded ? localStorage.getItem('roomNumber') : null;

  const setTeam = (id: string, name: string, room: string) => {
    localStorage.setItem('teamId', id);
    localStorage.setItem('teamName', name);
    localStorage.setItem('roomNumber', room);
    bumpStorageVersion();
  };

  const logout = () => {
    localStorage.removeItem('teamId');
    localStorage.removeItem('teamName');
    localStorage.removeItem('roomNumber');
    bumpStorageVersion();
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
