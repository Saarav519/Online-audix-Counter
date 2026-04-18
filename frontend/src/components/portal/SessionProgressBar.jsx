import React, { useEffect, useState } from 'react';
import { Activity, Smartphone, Package, Layers, Clock } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Session Progress Tracker.
 * Fetches /api/audit/portal/sessions/{id}/progress and renders:
 * - progress bar (scanned / total locations)
 * - quick stat pills (items, quantity, devices active)
 * - last sync timestamp
 *
 * <SessionProgressBar sessionId={s.id} varianceMode={s.variance_mode} />
 */
export default function SessionProgressBar({ sessionId, varianceMode, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/audit/portal/sessions/${sessionId}/progress`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!sessionId) return;
    load();
    // Refresh every 20 seconds
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return <div className="h-16 bg-slate-50 rounded-lg animate-pulse" />;
  }
  if (!data) return null;

  const pct = data.progress_percent || 0;
  const barColor =
    pct >= 98 ? 'from-emerald-500 to-teal-500' :
    pct >= 75 ? 'from-blue-500 to-cyan-500' :
    pct >= 40 ? 'from-amber-500 to-orange-500' :
    'from-slate-400 to-slate-500';

  const formatTime = (iso) => {
    if (!iso) return 'No scans yet';
    const diff = (new Date() - new Date(iso)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return new Date(iso).toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-2" data-testid={`session-progress-${sessionId}`}>
      {/* Progress bar + pct */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium text-slate-600 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            Scan Progress
            {varianceMode === 'bin-wise' && data.total_expected_locations > 0 && (
              <span className="text-slate-400 font-normal">
                ({data.scanned_locations} / {data.total_expected_locations} locations)
              </span>
            )}
          </span>
          <span className={`font-bold ${pct >= 98 ? 'text-emerald-600' : pct >= 75 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-slate-600'}`}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full bg-gradient-to-r ${barColor} transition-[width] duration-700 ease-out`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>

      {/* Quick stats */}
      {!compact && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {data.active_devices > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <Smartphone className="w-3 h-3" />
              <span className="font-medium">{data.active_devices} scanning live</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-slate-500">
            <Package className="w-3 h-3" />
            <span className="font-medium text-slate-700">{data.total_items.toLocaleString('en-IN')}</span>
            <span>items</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Layers className="w-3 h-3" />
            <span className="font-medium text-slate-700">{data.total_quantity.toLocaleString('en-IN')}</span>
            <span>qty</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{formatTime(data.last_sync_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
