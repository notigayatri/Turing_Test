'use client';
import { useEffect } from 'react';

/**
 * Anti-cheat hook:
 * 1. Warns on tab switch / visibility change
 * 2. Prevents back navigation
 */
export function useAntiCheat(active: boolean) {
  useEffect(() => {
    // Anti-cheat functionality intentionally disabled 
    // to prevent Socket.io timeouts during tab switching.
  }, [active]);
}
