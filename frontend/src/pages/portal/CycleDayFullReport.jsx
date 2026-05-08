import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, RefreshCw, Search, Download, Lock, Unlock,
  Sparkles, Calendar, Building2
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/cycle-count`;
const CLIENTS_API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/clients`;

/**
 * Full-screen variance report for a single cycle-count day.
 * Opens from the project detail page OR from the Reports session selector
 * (?from=reports — Back button then returns to Reports instead).
 */
export default function CycleDayFullReport() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromReports = new URLSearchParams(location.search).get('from') === 'reports';
  const backTarget = cameFromReports ? '/portal/reports' : '/portal/cycle-count';

  const [variance, setVariance] = useState(null);
  const [day, setDay] = useState(null);
  const [project, setProject] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/days/${dayId}/variance`);
      if (!r.ok) throw new Error('Failed to load variance');
      const v = await r.json();
      setVariance(v);
      // Fetch project + day metadata for title
      const pr = await fetch(`${API}/projects/${v.project_id}`);
      if (pr.ok) {
        const pd = await pr.json();
        setProject(pd.project);
        setDay(pd.days.find(d => d.id === dayId));
        // Fetch client
        const cr = await fetch(CLIENTS_API);
        if (cr.ok) {
          const cls = await cr.json();
          setClient(cls.find(c => c.id === pd.project.client_id));
        }
      }
    } catch (e) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }, [dayId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = variance?.report || [];
    const term = filter.trim().toLowerCase();
    return all.filter(r => {
      if (classFilter === 'planned' && r.classification !== 'planned') return false;
      if (classFilter === 'extra' && r.classification !== 'extra') return false;
      if (classFilter === 'duplicate' && !r.duplicate_warning) return false;
      if (classFilter === 'shortage' && r.variance_qty >= 0) return false;
      if (classFilter === 'surplus' && r.variance_qty <= 0) return false;
      if (!term) return true;
      return (r.location || '').toLowerCase().includes(term) ||
             (r.barcode || '').toLowerCase().includes(term);
    });
  }, [variance, filter, classFilter]);

  const exportCsv = () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const head = ['Location', 'Barcode', 'Expected', 'Scanned', 'Pre-Pick', 'Post-Pick', 'Effective', 'Variance', 'Ending', 'Classification', 'Reason', 'Duplicate Day'];
    const body = rows.map(r => [
      r.location, r.barcode, r.expected_qty, r.scanned_qty, r.pre_pick_qty, r.post_pick_qty,
      r.effective_qty, r.variance_qty, r.ending_stock, r.classification, r.reason,
      r.duplicate_warning ? `D${r.duplicate_warning.closed_on_day}` : ''
    ]);
    const csv = [head, ...body].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'cc'}-day${day?.day_no || dayId}-variance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <FullScreenLoader />;
  if (!variance) return <FullScreenError onBack={() => navigate(backTarget)} />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ───── Sticky Header ───── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate(backTarget)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                data-testid="cc-fullreport-back-btn"
              >
                <ArrowLeft className="w-4 h-4" /> Back to {cameFromReports ? 'Reports' : 'Cycle Count'}
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Day {day?.day_no} Variance Report
                  {day?.status === 'closed'
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full uppercase"><Lock className="w-3 h-3" /> Closed</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase"><Unlock className="w-3 h-3" /> Open</span>}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <Building2 className="w-3 h-3" /> {client?.name || '—'}
                  <span className="text-gray-300">·</span>
                  <span className="font-medium text-gray-700">{project?.name}</span>
                  <span className="text-gray-300">·</span>
                  <Calendar className="w-3 h-3" /> {day?.date}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={load} variant="outline" size="sm" className="h-8 text-xs gap-1"
                data-testid="cc-fullreport-refresh">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <Button onClick={exportCsv} variant="outline" size="sm" className="h-8 text-xs gap-1"
                data-testid="cc-fullreport-export">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
            <Kpi label="Stock Bins" value={variance.bins_summary.stock_uploaded_bins} />
            <Kpi label="Scanned" value={variance.bins_summary.scanned_bins} accent="emerald" />
            <Kpi label="Planned" value={variance.bins_summary.planned_scanned} />
            <Kpi label="Extras" value={variance.bins_summary.extras_scanned} accent="amber" />
            <Kpi label="Duplicates" value={variance.bins_summary.duplicate_bins} accent="rose" />
            <Kpi
              label="Variance"
              value={variance.totals.variance >= 0
                ? '+' + variance.totals.variance.toFixed(0)
                : variance.totals.variance.toFixed(0)
              }
              accent={variance.totals.variance === 0 ? 'emerald' : variance.totals.variance > 0 ? 'amber' : 'rose'}
            />
            <Kpi label="Effective" value={variance.totals.effective.toFixed(0)} />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={filter} onChange={e => setFilter(e.target.value)}
                placeholder="Search location or barcode…"
                data-testid="cc-fullreport-search"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>
            {[
              { k: 'all', label: 'All', count: variance.report.length },
              { k: 'planned', label: 'Planned', count: variance.report.filter(r => r.classification === 'planned').length },
              { k: 'extra', label: 'Extras', count: variance.report.filter(r => r.classification === 'extra').length },
              { k: 'shortage', label: 'Shortage', count: variance.report.filter(r => r.variance_qty < 0).length },
              { k: 'surplus', label: 'Surplus', count: variance.report.filter(r => r.variance_qty > 0).length },
              { k: 'duplicate', label: 'Duplicates', count: variance.report.filter(r => r.duplicate_warning).length },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setClassFilter(t.k)}
                data-testid={`cc-fullreport-filter-${t.k}`}
                className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
                  classFilter === t.k
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                {t.label} <span className="opacity-75 ml-1">({t.count})</span>
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500 self-center">
              Showing <b className="text-gray-800">{rows.length}</b> of {variance.report.length} rows
            </span>
          </div>
        </div>
      </header>

      {/* ───── Table ───── */}
      <main className="px-4 lg:px-6 py-4">
        {rows.length === 0 ? (
          <EmptyTable hasAny={variance.report.length > 0} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <Th>Location</Th>
                    <Th>Barcode</Th>
                    <Th align="right">Expected</Th>
                    <Th align="right">Scanned</Th>
                    <Th align="right">Pre-Pick</Th>
                    <Th align="right">Post-Pick</Th>
                    <Th align="right">Effective</Th>
                    <Th align="right">Variance</Th>
                    <Th align="right">Ending</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 ${
                      r.duplicate_warning ? 'bg-amber-50/40' : r.classification === 'extra' ? 'bg-amber-50/20' : ''
                    }`}>
                      <td className="py-2 px-3 font-mono text-gray-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{r.location}</span>
                          {r.duplicate_warning && (
                            <span title={`Closed on Day ${r.duplicate_warning.closed_on_day}`}
                              className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              DUP D{r.duplicate_warning.closed_on_day}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-gray-700">{r.barcode}</td>
                      <Td align="right" mono>{r.expected_qty}</Td>
                      <Td align="right" mono className="font-semibold text-gray-800">{r.scanned_qty}</Td>
                      <Td align="right" mono className={r.pre_pick_qty ? 'text-amber-700 font-semibold' : 'text-gray-300'}>
                        {r.pre_pick_qty || '—'}
                      </Td>
                      <Td align="right" mono className={r.post_pick_qty ? 'text-rose-700 font-semibold' : 'text-gray-300'}>
                        {r.post_pick_qty || '—'}
                      </Td>
                      <Td align="right" mono className="font-bold text-gray-900">{r.effective_qty}</Td>
                      <Td align="right" mono className={`font-bold ${
                        r.variance_qty === 0 ? 'text-emerald-700'
                        : r.variance_qty > 0 ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {r.variance_qty === 0 ? '0' : (r.variance_qty > 0 ? '+' + r.variance_qty : r.variance_qty)}
                      </Td>
                      <Td align="right" mono className="text-gray-500">{r.ending_stock}</Td>
                      <td className="py-2 px-3"><Badge classification={r.classification} reason={r.reason} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr className="font-bold text-gray-800 text-xs">
                    <td colSpan="2" className="py-2.5 px-3">TOTALS</td>
                    <Td align="right" mono>{variance.totals.expected}</Td>
                    <Td align="right" mono>{variance.totals.scanned}</Td>
                    <Td align="right" mono className={variance.totals.pre_pick ? 'text-amber-700' : ''}>
                      {variance.totals.pre_pick || '—'}
                    </Td>
                    <Td align="right" mono className={variance.totals.post_pick ? 'text-rose-700' : ''}>
                      {variance.totals.post_pick || '—'}
                    </Td>
                    <Td align="right" mono>{variance.totals.effective}</Td>
                    <Td align="right" mono className={
                      variance.totals.variance === 0 ? 'text-emerald-700'
                      : variance.totals.variance > 0 ? 'text-amber-700' : 'text-rose-700'
                    }>
                      {variance.totals.variance === 0 ? '0' : (variance.totals.variance > 0 ? '+' + variance.totals.variance : variance.totals.variance)}
                    </Td>
                    <Td align="right" mono className="text-gray-500">{variance.totals.ending}</Td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ───────── helpers ─────────
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
  <th className={`py-2.5 px-3 text-${align} text-[10px] font-bold text-gray-600 uppercase tracking-wide bg-gray-50`}>
    {children}
  </th>
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

function EmptyTable({ hasAny }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
      <Sparkles className="w-14 h-14 mx-auto mb-3 text-gray-300" />
      <h3 className="text-base font-semibold text-gray-700">
        {hasAny ? 'No rows match your filters' : 'No variance data yet'}
      </h3>
      <p className="text-sm text-gray-500 mt-1">
        {hasAny
          ? 'Try clearing the search or selecting a different filter.'
          : 'Upload morning stock and start scanning to see variance roll in live.'}
      </p>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
}

function FullScreenError({ onBack }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
      <p className="text-gray-600">Could not load this report.</p>
      <Button onClick={onBack}>Back to Cycle Count</Button>
    </div>
  );
}
