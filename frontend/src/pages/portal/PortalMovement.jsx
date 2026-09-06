import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  History, Filter as FilterIcon, RotateCcw, Download, ChevronDown, ChevronUp,
  Warehouse, Repeat, Loader2, Search
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import PageHeader from '../../components/portal/PageHeader';
import useLiveActivity, { describeActivity } from '../../hooks/useLiveActivity';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal`;

// ─────────────────────────────────────────── Action / Module styling
const MODULE_BADGE = {
  warehouse: { label: 'Warehouse', cls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200', Icon: Warehouse },
  cycle_count: { label: 'Cycle Count', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', Icon: Repeat },
};
const ACTION_BADGE = {
  edit: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  undo: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
  reco_adjust: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  delete: 'bg-slate-200 text-slate-800 ring-1 ring-slate-300',
  assign: 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200',
  revoke: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  verify: 'bg-teal-100 text-teal-800 ring-1 ring-teal-200',
};

const PAGE_SIZE = 50;

const initialFilters = {
  module: 'all',
  client_id: '',
  session_id: '',
  cycle_day: '',
  barcode: '',
  user_id: '',
  action_type: '',
  start_date: '',
  end_date: '',
};

function _fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch { return String(ts); }
}

export default function PortalMovement() {
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Reference data for dropdowns
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [users, setUsers] = useState([]);

  // Result data
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ──────────── Load reference data once
  useEffect(() => {
    fetch(`${API}/clients`).then(r => r.ok ? r.json() : []).then(setClients).catch(() => setClients([]));
    fetch(`${API}/users`).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => setUsers([]));
  }, []);

  // Sessions filtered by client (loaded on demand)
  useEffect(() => {
    if (!filters.client_id) { setSessions([]); return; }
    fetch(`${API}/sessions?client_id=${filters.client_id}`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(d => setSessions(Array.isArray(d) ? d : (d.sessions || [])))
      .catch(() => setSessions([]));
  }, [filters.client_id]);

  // ──────────── Search
  const runSearch = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const body = {
        ...filters,
        cycle_day: filters.cycle_day === '' ? null : Number(filters.cycle_day),
        limit: PAGE_SIZE,
        skip: (pageNum - 1) * PAGE_SIZE,
      };
      const r = await fetch(`${API}/audit-logs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('search failed');
      const data = await r.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(pageNum);
    } catch (e) {
      toast.error('Failed to load audit log');
      setLogs([]); setTotal(0);
    } finally { setLoading(false); }
  }, [filters]);

  // First load: pull most recent across all modules
  useEffect(() => { runSearch(1); /* eslint-disable-next-line */ }, []);

  // ──────────── Live tail
  // The log is a live record, so an edit made elsewhere should land here on its
  // own. Only refresh while sitting on page 1 — pulling the newest rows in
  // under someone reading page 4 would shuffle the page out from under them.
  const pageRef = React.useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  const handleLiveActivity = useCallback((entries) => {
    if (pageRef.current !== 1) return;
    const first = entries[0];
    toast.info(
      entries.length === 1
        ? describeActivity(first)
        : `${describeActivity(first)} · +${entries.length - 1} more`,
      { duration: 6000 }
    );
    runSearch(1);
  }, [runSearch]);

  useLiveActivity({
    clientId: filters.client_id || '',
    sessionId: filters.session_id || '',
    onActivity: handleLiveActivity,
  });

  // Switching tab is a search on its own — don't make the user hit Apply.
  const tabsMounted = React.useRef(false);
  useEffect(() => {
    if (!tabsMounted.current) { tabsMounted.current = true; return; }
    runSearch(1);
    /* eslint-disable-next-line */
  }, [filters.action_type]);

  const handleApply = () => runSearch(1);
  const handleReset = () => { setFilters(initialFilters); setTimeout(() => runSearch(1), 0); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const body = {
        ...filters,
        cycle_day: filters.cycle_day === '' ? null : Number(filters.cycle_day),
      };
      const r = await fetch(`${API}/audit-logs/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_movement_log_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
      toast.success('Excel exported');
    } catch (e) {
      toast.error('Export failed');
    } finally { setExporting(false); }
  };

  // ──────────── Helpers
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clientNameById = useMemo(() => {
    const m = {}; (clients || []).forEach(c => { m[c.id] = c.name || c.code || c.id; });
    return m;
  }, [clients]);
  const sessionNameById = useMemo(() => {
    const m = {}; (sessions || []).forEach(s => { m[s.id] = s.name || s.id; });
    return m;
  }, [sessions]);

  const showCycleDay = filters.module === 'cycle_count';

  // ──────────── Filter chip / section
  const FilterSection = (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" data-testid="movement-filters-card">
      <button
        onClick={() => setFiltersOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        data-testid="movement-filters-toggle"
      >
        <div className="flex items-center gap-2 text-slate-700">
          <FilterIcon className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold">Filters</span>
          {total > 0 && (
            <span className="ml-1 text-xs text-slate-500">· {total.toLocaleString()} entries</span>
          )}
        </div>
        {filtersOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {/* Barcode edits and Reco adjustments are two different kinds of change —
          keep them apart by default instead of interleaving them. */}
      <div className="px-4 pt-3 flex flex-wrap gap-1.5" data-testid="movement-tabs">
        {[
          { key: '', label: 'All changes' },
          { key: 'edit', label: 'Barcode / Article edits' },
          { key: 'reco_adjust', label: 'Reco adjustments' },
          { key: 'verify', label: 'Bin verifications' },
        ].map(t => (
          <button
            key={t.key || 'all'}
            onClick={() => setFilters(f => ({ ...f, action_type: t.key }))}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              (filters.action_type || '') === t.key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            data-testid={`movement-tab-${t.key || 'all'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtersOpen && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
          {/* Module */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Module</Label>
            <select
              value={filters.module}
              onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}
              className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              data-testid="movement-filter-module"
            >
              <option value="all">All</option>
              <option value="warehouse">Warehouse</option>
              <option value="cycle_count">Cycle Count</option>
            </select>
          </div>

          {/* Client */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Client</Label>
            <select
              value={filters.client_id}
              onChange={e => setFilters(f => ({ ...f, client_id: e.target.value, session_id: '' }))}
              className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              data-testid="movement-filter-client"
            >
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name || c.code || c.id}</option>)}
            </select>
          </div>

          {/* Session */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Session</Label>
            <select
              value={filters.session_id}
              onChange={e => setFilters(f => ({ ...f, session_id: e.target.value }))}
              disabled={!filters.client_id}
              className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              data-testid="movement-filter-session"
            >
              <option value="">All sessions</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
            </select>
          </div>

          {/* Cycle Day (only for cycle_count) */}
          {showCycleDay && (
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">Cycle Day</Label>
              <Input
                type="number"
                min={1}
                value={filters.cycle_day}
                onChange={e => setFilters(f => ({ ...f, cycle_day: e.target.value }))}
                placeholder="Day No"
                className="mt-1 h-9 text-sm"
                data-testid="movement-filter-cycle-day"
              />
            </div>
          )}

          {/* Barcode */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Barcode</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                value={filters.barcode}
                onChange={e => setFilters(f => ({ ...f, barcode: e.target.value }))}
                placeholder="Search barcode…"
                className="mt-1 pl-7 h-9 text-sm"
                data-testid="movement-filter-barcode"
              />
            </div>
          </div>

          {/* User */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">User</Label>
            <select
              value={filters.user_id}
              onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}
              className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              data-testid="movement-filter-user"
            >
              <option value="">All users</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">From</Label>
            <Input
              type="date"
              value={filters.start_date}
              onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))}
              className="mt-1 h-9 text-sm"
              data-testid="movement-filter-start"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">To</Label>
            <Input
              type="date"
              value={filters.end_date}
              onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))}
              className="mt-1 h-9 text-sm"
              data-testid="movement-filter-end"
            />
          </div>

          {/* Buttons */}
          <div className="col-span-full flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 h-9 text-xs gap-1"
              data-testid="movement-apply-filters-btn"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilterIcon className="w-3.5 h-3.5" />}
              Apply Filters
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="h-9 text-xs gap-1"
              data-testid="movement-reset-filters-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
                className="h-9 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                data-testid="movement-export-btn"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export Excel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ──────────── Render
  return (
    <div className="p-3 md:p-4 lg:p-5 space-y-3" data-testid="portal-movement-page">
      <PageHeader
        icon={History}
        title="Movement / Audit Log"
        subtitle="Track every barcode edit, undo, reco adjustment, and day-wise lock across warehouse & cycle count modules."
      />

      {FilterSection}

      {/* Results table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" data-testid="movement-results-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Timestamp</th>
                <th className="text-left px-3 py-2 font-semibold">Module</th>
                <th className="text-left px-3 py-2 font-semibold">Action</th>
                <th className="text-left px-3 py-2 font-semibold">User</th>
                <th className="text-left px-3 py-2 font-semibold">Client</th>
                <th className="text-left px-3 py-2 font-semibold">Session</th>
                <th className="text-left px-3 py-2 font-semibold">Day</th>
                <th className="text-left px-3 py-2 font-semibold">Barcode</th>
                <th className="text-left px-3 py-2 font-semibold">Location</th>
                <th className="text-left px-3 py-2 font-semibold">Field</th>
                <th className="text-left px-3 py-2 font-semibold">Old → New</th>
                <th className="text-left px-3 py-2 font-semibold">Final Qty</th>
                <th className="text-left px-3 py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={13} className="text-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-slate-400 text-sm">
                    No audit-log entries match the current filters.
                  </td>
                </tr>
              )}
              {!loading && logs.map(l => {
                const mod = MODULE_BADGE[l.module] || MODULE_BADGE.warehouse;
                const ModIcon = mod.Icon;
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors" data-testid={`movement-log-row-${l.id}`}>
                    <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap font-mono">{_fmtTime(l.timestamp)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${mod.cls}`}>
                        <ModIcon className="w-3 h-3" />
                        {mod.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${ACTION_BADGE[l.action_type] || 'bg-slate-100 text-slate-700'}`}>
                        {l.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{l.username || l.user_id || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{clientNameById[l.client_id] || l.client_id || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{sessionNameById[l.session_id] || (l.session_id ? <span className="font-mono text-[10px]">{l.session_id.slice(0, 8)}…</span> : <span className="text-slate-300">—</span>)}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{l.cycle_day != null && l.cycle_day !== '' ? `Day ${l.cycle_day}` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-700 font-mono">{l.barcode || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{l.location || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{l.field_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="text-rose-600 line-through">{l.old_value || '—'}</span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="text-emerald-700 font-medium">{l.new_value || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">{l.final_qty !== null && l.final_qty !== undefined ? l.final_qty : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 max-w-[220px] truncate" title={l.reason || ''}>{l.reason || <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
            <div>
              Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span>
              <span className="ml-2 text-slate-400">({total.toLocaleString()} total)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                disabled={page <= 1 || loading}
                onClick={() => runSearch(page - 1)}
                data-testid="movement-pagination-prev"
              >Prev</Button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                disabled={page >= totalPages || loading}
                onClick={() => runSearch(page + 1)}
                data-testid="movement-pagination-next"
              >Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
