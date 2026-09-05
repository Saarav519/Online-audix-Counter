import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * RecoEditGuard — shown when the backend refuses a reco save because somebody
 * else already entered a value for that item (400 / code "reason_required").
 *
 * It shows that item's last 5 movement-log entries so the editor can see who
 * set what and why, then takes a mandatory reason and retries the save.
 *
 * Deliberately separate from <LastEditedPopup />: that one guards barcode
 * edits and has no reason field, and its contract is pinned by tests.
 */
export default function RecoEditGuard({ isOpen, barcode, clientId, pendingQty, overwritingOther, onProceed, onCancel }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) { setLogs([]); setReason(''); return; }
    if (!barcode) return;
    setLoading(true);
    const params = new URLSearchParams({ barcode: String(barcode), limit: '5' });
    if (clientId) params.set('client_id', String(clientId));
    fetch(`${API_URL}/api/audit/portal/audit-logs/recent?${params.toString()}`)
      .then(r => (r.ok ? r.json() : { logs: [] }))
      .then(d => setLogs(Array.isArray(d?.logs) ? d.logs : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [isOpen, barcode, clientId]);

  if (!isOpen) return null;

  const canProceed = reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" data-testid="reco-guard">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-4 border-b border-gray-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900">
                {overwritingOther ? 'Someone already set a Reco for this item' : 'Why are you changing this Reco?'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Barcode <span className="font-mono">{barcode}</span>
                {pendingQty !== undefined && pendingQty !== null && <> · you are changing it to <b>{pendingQty}</b></>}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" data-testid="reco-guard-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Recent activity</p>
            {loading ? (
              <p className="text-sm text-gray-400">Loading history…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-400">No earlier entries found.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="reco-guard-logs">
                {logs.map(l => (
                  <li key={l.id} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{l.username || 'unknown user'}</span>
                      <span className="text-slate-400">{(l.timestamp || '').replace('T', ' ').slice(0, 16)}</span>
                    </div>
                    <div className="text-slate-600">
                      <span className="text-rose-600 line-through">{l.old_value || '—'}</span>
                      <span className="mx-1">→</span>
                      <span className="text-emerald-700 font-medium">{l.new_value || '—'}</span>
                      {l.location && <span className="ml-1 text-slate-400">@ {l.location}</span>}
                    </div>
                    {l.reason && <div className="text-slate-500 italic mt-0.5">“{l.reason}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Reason for changing it *
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you overriding this value?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              data-testid="reco-guard-reason"
            />
            <p className="text-xs text-gray-400 mt-1">This is stored in the Movement Log against your change.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            data-testid="reco-guard-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={() => onProceed(reason.trim())}
            disabled={!canProceed}
            className="px-4 py-2 text-sm rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="reco-guard-proceed-btn"
          >
            Proceed &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}
