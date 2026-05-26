import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Loader2, AlertCircle, Warehouse, Repeat, Clock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// ── Lightweight "X min ago / 2 hours ago / yesterday" helper.
// Avoids pulling date-fns as a new dependency for this single use.
function _relTime(ts) {
  if (!ts) return '—';
  let then;
  try { then = new Date(ts); } catch { return String(ts); }
  if (Number.isNaN(then.getTime())) return String(ts);
  const sec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  return then.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ── Module styling (kept in lockstep with PortalMovement)
const MODULE_BADGE = {
  warehouse:   { label: 'Warehouse',   cls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',       Icon: Warehouse },
  cycle_count: { label: 'Cycle Count', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', Icon: Repeat },
};

/**
 * Shared "Last Edited" gate used before every barcode / article / reco edit
 * across BOTH warehouse and cycle-count modules.
 *
 * Behaviour (per spec):
 *   • On open → fetch /audit-logs/recent?barcode=X&client_id=Y&limit=5
 *   • If no history → directly invoke onProceed (popup is silent / skipped)
 *   • If history → render the modal with Proceed / Cancel buttons
 *   • API failure → graceful fallback: log + invoke onProceed (no toast)
 *
 * Same component renders identical UI in both modules — the only difference
 * is the colour of the Module badge, sourced from each log row.
 */
export default function LastEditedPopup({ barcode, clientId, isOpen, onProceed, onCancel, onClose }) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [decided, setDecided] = useState(false);   // proceeded or cancelled
  // Track the in-flight fetch so a fast re-open doesn't race a stale result.
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setLogs([]); setDecided(false); setLoading(false);
      return;
    }
    if (!barcode) {
      // No barcode = nothing to look up; allow edit silently.
      try { onProceed?.(); } catch { /* noop */ }
      try { onClose?.(); } catch { /* noop */ }
      return;
    }
    const myId = ++reqIdRef.current;
    setLoading(true);
    const params = new URLSearchParams({ barcode: String(barcode), limit: '5' });
    if (clientId) params.set('client_id', String(clientId));
    fetch(`${BACKEND_URL}/api/audit/portal/audit-logs/recent?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (myId !== reqIdRef.current) return;  // newer request already in flight
        const arr = (data && Array.isArray(data.logs)) ? data.logs : [];
        if (arr.length === 0) {
          // No history → skip popup entirely (spec: "Skip ONLY when no history")
          setLoading(false);
          setDecided(true);
          try { onProceed?.(); } catch { /* noop */ }
          try { onClose?.(); } catch { /* noop */ }
          return;
        }
        setLogs(arr);
        setLoading(false);
      })
      .catch(() => {
        if (myId !== reqIdRef.current) return;
        // API failure → allow edit silently (spec: graceful fallback)
        setLoading(false);
        setDecided(true);
        try { onProceed?.(); } catch { /* noop */ }
        try { onClose?.(); } catch { /* noop */ }
      });
  }, [isOpen, barcode, clientId, onProceed, onClose]);

  // While we're waiting for the first response we DON'T want to render
  // anything visible — if there's no history, the popup is supposed to
  // never appear at all. The Dialog stays mounted but transparent until
  // we know we have history to show. We use a small loading state in
  // case the round-trip is >100ms.
  const shouldShowDialog = isOpen && !decided && (loading || logs.length > 0);

  const handleProceed = () => {
    if (decided) return;
    setDecided(true);
    try { onProceed?.(); } catch { /* noop */ }
    try { onClose?.(); } catch { /* noop */ }
  };

  const handleCancel = () => {
    if (decided) return;
    setDecided(true);
    try { onCancel?.(); } catch { /* noop */ }
    try { onClose?.(); } catch { /* noop */ }
  };

  return (
    <Dialog
      open={shouldShowDialog}
      onOpenChange={(open) => {
        // Closing via outside-click / Esc counts as Cancel (don't proceed)
        if (!open && !decided) handleCancel();
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="last-edited-popup">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Recent Edit History for</span>
            <span className="font-mono text-emerald-700">{barcode || '—'}</span>
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            This item has been edited before. Review the history below, then decide whether to proceed.
          </p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden" data-testid="last-edited-history-table">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">User</th>
                  <th className="text-left px-3 py-2 font-semibold">Module</th>
                  <th className="text-left px-3 py-2 font-semibold">Field</th>
                  <th className="text-left px-3 py-2 font-semibold">Old → New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l, idx) => {
                  const mod = MODULE_BADGE[l.module] || MODULE_BADGE.warehouse;
                  const ModIcon = mod.Icon;
                  const isMostRecent = idx === 0;
                  return (
                    <tr key={l.id} className={isMostRecent ? 'bg-amber-50/60' : 'hover:bg-slate-50'}
                        data-testid={`last-edited-row-${idx}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {_relTime(l.timestamp)}
                        {isMostRecent && (
                          <span className="ml-1.5 inline-block px-1 py-0 rounded text-[9px] font-bold bg-amber-200 text-amber-900">
                            LATEST
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{l.username || l.user_id || <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${mod.cls}`}>
                          <ModIcon className="w-3 h-3" />
                          {mod.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{l.field_name || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className="text-rose-600 line-through">{l.old_value || '—'}</span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="text-emerald-700 font-medium">{l.new_value || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              This item has been changed before. Proceeding will create a new entry in the Movement / Audit Log.
            </span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="h-9 text-xs"
            data-testid="last-edited-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleProceed}
            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700"
            data-testid="last-edited-proceed-btn"
          >
            Proceed with Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
