'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminPanelView } from '@/components/AdminPanelView';
import { AdminUnlock } from '@/components/AdminUnlock';
import { setUnauthorizedHandler } from '@/lib/api';

export default function AdminPage() {
  const [locked, setLocked] = useState(false);
  // Remounts the panel after unlocking so every panel refetches with the token.
  const [session, setSession] = useState(0);

  // Any 401 from the API — expired token, token rotated on the server, or none
  // set yet — sends the whole panel back to the unlock screen. Rendering empty
  // dashboards instead would read as "you have no customers".
  const handleUnauthorized = useCallback(() => setLocked(true), []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
  }, [handleUnauthorized]);

  if (locked) {
    return (
      <AdminUnlock
        onUnlocked={() => {
          setLocked(false);
          setSession(n => n + 1);
        }}
      />
    );
  }

  return <AdminPanelView key={session} />;
}
