import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, Search, Download, Layers, Building2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/cycle-count`;
const CLIENTS_API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/clients`;

/**
 * Full-screen consolidated cycle-count report. Auto-aggregates every day
 * (open + closed) for the project so any mid-day edit is reflected on refresh.
 * Honours ?from=reports so the Back button returns the user to wherever they came from.
 */
export default function CycleConsolidatedFullReport() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromReports = new URLSearchParams(location.search).get('from') === 'reports';
  const backTarget = cameFromReports ? '/portal/reports' : '/portal/cycle-count';

  const [data, setData] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/projects/${projectId}/consolidated`);
      if (!r.ok) throw new Error('Could not load consolidated report');
      const d = await r.json();
      setData(d);
      const cr = await fetch(CLIENTS_API);
      if (cr.ok) {
        const cls = await cr.json();
        setClient(cls.find(c => c.id === d.project.client_id));
      }
    } catch (e) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = data?.report || [];
    const term = filter.trim().toLowerCase();
    return all.filter(r => {
      if (classFilter === 'planned' && r.classification !== 'planned') return false;
      if (classFilter === 'extra' && r.classification !== 'extra') return false;
      if (classFilter === 'recount' && !r.is_recount) return false;
      if (classFilter === 'shortage' && r.variance_qty >= 0) return false;
      if (classFilter === 'surplus' && r.variance_qty <= 0) return false;
      if (!term) return true;
      return (r.location || '').toLowerCase().includes(term) ||
             (r.barcode || '').toLowerCase().includes(term);
    });
  }, [data, filter, classFilter]);

  const exportCsv = () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const head = ['Day', 'Date', 'Location', 'Barcode', 'Expected', 'Scanned', 'Pre-Pick', 'Post-Pick', 'Effective', 'Variance', 'Ending', 'Classification', 'Recount'];
    const body = rows.map(r => [
      r.day_no, r.day_date, r.location, r.barcode, r.expected_qty, r.scanned_qty,
      r.pre_pick_qty, r.post_pick_qty, r.effective_qty, r.variance_qty, r.ending_stock,
      r.classification, r.is_recount ? 'YES' : ''
    ]);
    const csv = [head, ...body].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data?.project?.name || 'cc'}-consolidated.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate(backTarget)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                data-testid="cc-cons-back"
              >
                <ArrowLeft className="w-4 h-4" /> Back to {cameFromReports ? 'Reports' : 'Cycle Count'}
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" /> Consolidated Report
                </h1>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                  <Building2 className="w-3 h-3" /> {client?.name || '—'}
                  <span className="text-gray-300">·</span>
                  <span className="font-medium text-gray-700">{data.project.name}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={load} variant="outline" size="sm" className="h-8 text-xs gap-1"
                data-testid="cc-cons-refresh">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <Button onClick={exportCsv} variant="outline" size="sm" className="h-8 text-xs gap-1"
                data-testid="cc-cons-export">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
            <Kpi label="Total Bins" value={data.bins_summary.total_unique_bins_scanned} accent="emerald" />
            <Kpi label="Extras" value={data.bins_summary.extras_bins} accent="amber" />
            <Kpi label="Dup Events" value={data.bins_summary.duplicate_bin_events} accent="rose" />
            <Kpi label="Expected" value={data.totals.expected.toFixed(0)} />
            <Kpi label="Effective" value={data.totals.effective.toFixed(0)} />
            <Kpi
              label="Variance"
              value={data.totals.variance >= 0 ? '+' + data.totals.variance.toFixed(0) : data.totals.variance.toFixed(0)}
              accent={data.totals.variance === 0 ? 'emerald' : data.totals.variance > 0 ? 'amber' : 'rose'}
            />
            <Kpi label="Ending" value={data.totals.ending.toFixed(0)} />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={filter} onChange={e => setFilter(e.target.value)}
                placeholder="Search location or barcode…"
                data-testid="cc-cons-search"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            {[
              { k: 'all', label: 'All', count: data.report.length },
              { k: 'planned', label: 'Planned', count: data.report.filter(r => r.classification === 'planned').length },
              { k: 'extra', label: 'Extras', count: data.report.filter(r => r.classification === 'extra').length },
              { k: 'shortage', label: 'Shortage', count: data.report.filter(r => r.variance_qty < 0).length },
              { k: 'surplus', label: 'Surplus', count: data.report.filter(r => r.variance_qty > 0).length },
              { k: 'recount', label: 'Recounts', count: data.report.filter(r => r.is_recount).length },
            ].map(t => (
              <button key={t.k} onClick={() => setClassFilter(t.k)}
                data-testid={`cc-cons-filter-${t.k}`}
                className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
                  classFilter === t.k ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                }`}>
                {t.label} <span className="opacity-75 ml-1">({t.count})</span>
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500 self-center">
              Showing <b className="text-gray-800">{rows.length}</b> of {data.report.length}
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 lg:px-6 py-4 space-y-4">
        {/* Days Summary */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-gray-100">
            <h4 className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Days Breakdown
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Day</Th><Th>Date</Th><Th>Status</Th>
                  <Th align="right">Stock Bins</Th><Th align="right">Scanned</Th>
                  <Th align="right">Extras</Th><Th align="right">Duplicates</Th>
                  <Th align="right">Variance</Th>
                </tr>
              </thead>
              <tbody>
                {data.days.map(d => (
                  <tr key={d.day_id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/portal/cycle-count/days/${d.day_id}/full`)}>
                    <Td><b>D{d.day_no}</b></Td>
                    <Td>{d.date}</Td>
                    <Td>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                        d.status === 'closed' ? 'bg-gray-100 text-gray-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>{d.status}</span>
                    </Td>
                    <Td align="right" mono>{d.stock_uploaded_bins}</Td>
                    <Td align="right" mono>{d.scanned_bins}</Td>
                    <Td align="right" mono className={d.extras_scanned ? 'text-amber-700 font-semibold' : 'text-gray-300'}>
                      {d.extras_scanned || '—'}
                    </Td>
                    <Td align="right" mono className={d.duplicate_bins ? 'text-rose-700 font-semibold' : 'text-gray-300'}>
                      {d.duplicate_bins || '—'}
                    </Td>
                    <Td align="right" mono className={
                      d.totals.variance === 0 ? 'text-emerald-700 font-bold'
                      : d.totals.variance > 0 ? 'text-amber-700 font-bold' : 'text-rose-700 font-bold'
                    }>
                      {d.totals.variance === 0 ? '0' : (d.totals.variance > 0 ? '+' + d.totals.variance : d.totals.variance)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bin-wise consolidated */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-gray-100">
            <h4 className="font-semibold text-sm text-gray-800">Bin-wise Consolidated</h4>
          </div>
          {rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">No rows match your filters.</div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 540px)' }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <Th>Day</Th><Th>Location</Th><Th>Barcode</Th>
                    <Th align="right">Expected</Th><Th align="right">Scanned</Th>
                    <Th align="right">Pre-Pick</Th><Th align="right">Post-Pick</Th>
                    <Th align="right">Variance</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 ${r.is_recount ? 'bg-amber-50/30' : ''}`}>
                      <Td>
                        <span className="font-semibold">D{r.day_no}</span>
                        {r.is_recount && (
                          <span className="ml-1 text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded-full">RECOUNT</span>
                        )}
                      </Td>
                      <Td className="font-mono">{r.location}</Td>
                      <Td className="font-mono">{r.barcode}</Td>
                      <Td align="right" mono>{r.expected_qty}</Td>
                      <Td align="right" mono>{r.scanned_qty}</Td>
                      <Td align="right" mono className={r.pre_pick_qty ? 'text-amber-700 font-semibold' : 'text-gray-300'}>{r.pre_pick_qty || '—'}</Td>
                      <Td align="right" mono className={r.post_pick_qty ? 'text-rose-700 font-semibold' : 'text-gray-300'}>{r.post_pick_qty || '—'}</Td>
                      <Td align="right" mono className={`font-bold ${
                        r.variance_qty === 0 ? 'text-emerald-700' : r.variance_qty > 0 ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {r.variance_qty === 0 ? '0' : (r.variance_qty > 0 ? '+' + r.variance_qty : r.variance_qty)}
                      </Td>
                      <Td><Badge classification={r.classification} reason={r.reason} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value, accent = 'gray' }) {
  const cls = accent === 'emerald' ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
            : accent === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-100'
            : accent === 'rose' ? 'text-rose-700 bg-rose-50 border-rose-100'
            : 'text-gray-700 bg-white border-gray-200';
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80 font-semibold">{label}</div>
      <div className="text-xl font-bold mt-0.5 leading-tight">{value}</div>
    </div>
  );
}
const Th = ({ children, align = 'left' }) => (
  <th className={`py-2.5 px-3 text-${align} text-[10px] font-bold text-gray-600 uppercase tracking-wide bg-gray-50`}>{children}</th>
);
const Td = ({ children, align = 'left', mono, className = '' }) => (
  <td className={`py-2 px-3 text-${align} ${mono ? 'font-mono' : ''} ${className}`}>{children}</td>
);
function Badge({ classification, reason }) {
  const cls = classification === 'extra' ? 'bg-amber-100 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  const reasonLabel = {
    match: 'Match', surplus: 'Surplus', shortage: 'Shortage', reconciled_via_picks: 'Picks Reconciled'
  }[reason] || reason;
  const reasonCls = reason === 'shortage' ? 'bg-rose-100 text-rose-700 border-rose-200'
            : reason === 'surplus' ? 'bg-amber-100 text-amber-800 border-amber-200'
            : reason === 'reconciled_via_picks' ? 'bg-blue-50 text-blue-700 border-blue-100'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold uppercase ${cls}`}>{classification}</span>
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${reasonCls}`}>{reasonLabel}</span>
    </div>
  );
}
