import React, { useEffect, useState, useRef } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Notification Bell with dropdown showing recent alerts.
 * Polls /api/audit/portal/alerts every 30 seconds.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/audit/portal/alerts?limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : (data.alerts || []));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unread = alerts.filter((a) => !a.is_read).length;

  const markAllRead = async () => {
    try {
      await fetch(`${API_URL}/api/audit/portal/alerts/mark-all-read`, { method: 'PUT' });
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    } catch { /* silent */ }
  };

  const iconFor = (severity) => {
    if (severity === 'critical') return <AlertTriangle className="w-4 h-4 text-rose-500" />;
    if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <Info className="w-4 h-4 text-blue-500" />;
  };

  return (
    <div ref={ref} className="relative" data-testid="notification-bell-wrapper">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-testid="notification-bell-btn"
        className="relative w-9 h-9 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[380px] max-h-[520px] bg-white border border-slate-200 rounded-2xl shadow-xl ring-1 ring-slate-900/5 z-50 animate-scale-in origin-top-right overflow-hidden flex flex-col" data-testid="notification-dropdown">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
              <p className="text-xs text-slate-500">{unread} unread · {alerts.length} total</p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50 transition-colors flex items-center gap-1" data-testid="mark-all-read-btn">
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 bg-slate-100 rounded" />
                      <div className="h-2 w-1/2 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">You're all caught up!</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`px-4 py-3 hover:bg-slate-50 transition-colors ${!a.is_read ? 'bg-emerald-50/40' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">{iconFor(a.severity)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${!a.is_read ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                          {a.message}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      {!a.is_read && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
