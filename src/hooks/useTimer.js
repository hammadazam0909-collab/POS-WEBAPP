// Countdown timer hook — returns { elapsed, remaining, urgency }
// urgency: 'safe' | 'warning' | 'danger' | 'overdue'
import { useState, useEffect } from 'react';

export function useTimer(orderPlacedAt, maxSeconds, stopped = false) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stopped]);

  if (!orderPlacedAt) return { elapsed: 0, remaining: maxSeconds, urgency: 'safe', display: '--:--' };

  const startMs = orderPlacedAt?.toDate ? orderPlacedAt.toDate().getTime() : new Date(orderPlacedAt).getTime();
  const elapsed = Math.floor((now - startMs) / 1000);
  const remaining = Math.max(0, maxSeconds - elapsed);

  let urgency = 'safe';
  const pct = elapsed / maxSeconds;
  if (elapsed > maxSeconds) urgency = 'overdue';
  else if (pct >= 0.85) urgency = 'danger';
  else if (pct >= 0.5) urgency = 'warning';

  function fmt(secs) {
    const m = Math.floor(Math.abs(secs) / 60);
    const s = Math.abs(secs) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return {
    elapsed,
    remaining,
    urgency,
    elapsedDisplay: fmt(elapsed),
    remainingDisplay: elapsed > maxSeconds ? `+${fmt(elapsed - maxSeconds)}` : fmt(remaining),
  };
}

// Format seconds to mm:ss
export function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
