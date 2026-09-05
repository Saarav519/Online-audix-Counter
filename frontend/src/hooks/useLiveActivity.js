import { useEffect, useRef } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * useLiveActivity — polls the audit trail for edits made by other people while
 * a page is open, so a reco somebody else just entered shows up without the
 * user having to refresh.
 *
 * Usage:
 *
 *   useLiveActivity({
 *     clientId, sessionId,
 *     enabled: !!selectedClient,
 *     onActivity: (entries) => { toast(...); refresh(); },
 *   });
 *
 * Behaviour:
 *   • On enable it primes its cursor from the SERVER clock, so opening a page
 *     never replays history and a skewed browser clock cannot skip entries.
 *   • Each tick asks for entries newer than that cursor and advances it to the
 *     server time that came back with them.
 *   • `onActivity` receives only entries written by OTHER users — your own
 *     edits already updated your screen and should not announce themselves.
 *   • A tab in the background is left alone; it catches up on the first tick
 *     after it becomes visible again, in one request rather than a backlog.
 *   • The callback is held in a ref, so a caller passing an inline arrow does
 *     not restart the poll on every render.
 */
export default function useLiveActivity({
  clientId = '',
  sessionId = '',
  enabled = true,
  intervalMs = 8000,
  onActivity,
}) {
  const cursorRef = useRef(null);
  const onActivityRef = useRef(onActivity);
  const inFlightRef = useRef(false);

  useEffect(() => { onActivityRef.current = onActivity; }, [onActivity]);

  useEffect(() => {
    if (!enabled) return undefined;

    let alive = true;
    cursorRef.current = null;   // re-prime whenever the target changes

    const url = (since) => {
      const qs = new URLSearchParams();
      if (clientId) qs.set('client_id', clientId);
      if (sessionId) qs.set('session_id', sessionId);
      if (since) qs.set('since', since);
      return `${BACKEND_URL}/api/audit/portal/audit-logs/activity?${qs.toString()}`;
    };

    const tick = async () => {
      if (!alive || inFlightRef.current) return;
      // Nothing to catch up on while hidden — and polling a background tab
      // just burns requests.
      if (typeof document !== 'undefined' && document.hidden) return;
      inFlightRef.current = true;
      try {
        const r = await fetch(url(cursorRef.current));
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        const hadCursor = !!cursorRef.current;
        cursorRef.current = data.server_time || cursorRef.current;
        if (!hadCursor) return;             // priming tick — nothing to report
        const fromOthers = (data.entries || []).filter(e => !e.is_self);
        if (fromOthers.length > 0) {
          try { onActivityRef.current?.(fromOthers); } catch { /* never break the poll */ }
        }
      } catch {
        // Offline / server hiccup — keep the cursor and try again next tick.
      } finally {
        inFlightRef.current = false;
      }
    };

    tick();                                  // prime immediately
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId, sessionId, enabled, intervalMs]);
}

/**
 * Turn an audit entry into the one-line "who changed what" a toast shows.
 * Exported so the Reports page and the Movement Log word it identically.
 */
export function describeActivity(entry) {
  const who = entry.username || entry.user_id?.slice(0, 8) || 'Someone';
  const item = entry.barcode || '';
  const from = entry.old_value === '' || entry.old_value == null ? '—' : entry.old_value;
  const to = entry.new_value === '' || entry.new_value == null ? '—' : entry.new_value;

  if (entry.action_type === 'reco_adjust') {
    return `${who} changed Reco Qty${item ? ` for ${item}` : ''}: ${from} → ${to}`;
  }
  if (entry.action_type === 'undo') {
    return `${who} undid an edit${item ? ` on ${item}` : ''}`;
  }
  const field = (entry.field_name || 'value').replace(/_/g, ' ');
  return `${who} changed ${field}${item ? ` for ${item}` : ''}: ${from} → ${to}`;
}
