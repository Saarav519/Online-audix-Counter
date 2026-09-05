import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCog, FolderOpen, Share2, ArrowRight, X, Loader2, Plus,
  Warehouse, Repeat, FileText, Trash2, Check, Inbox, Send, ChevronRight,
  ShieldAlert, ClipboardList, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import PageHeader from '../../components/portal/PageHeader';
import { useAudit } from '../AuditApp';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal`;

// Keys match the Report Type values the Reports page uses, so an assignment can
// be filtered against what the assignee actually picks there.
const REPORT_TYPES = [
  { key: 'detailed',          label: 'Detailed',      desc: 'Per-bin × per-barcode' },
  { key: 'bin-wise',          label: 'Bin Wise',      desc: 'Per-bin summary' },
  { key: 'barcode-wise',      label: 'Barcode Wise',  desc: 'Per-barcode roll-up' },
  { key: 'article-wise',      label: 'Article Wise',  desc: 'Per-article roll-up' },
  { key: 'category-summary',  label: 'Category Wise', desc: 'Per-category summary' },
  { key: 'empty-bins',        label: 'Empty Bins',    desc: 'Bins found empty' },
  { key: 'pending-locations', label: 'Pending Locs',  desc: 'Not yet counted' },
];

// The Reports page picks the all-sessions roll-up with this sentinel instead of
// a session id; an assignment can name it the same way.
const CONSOLIDATED = '__consolidated__';

const sessionLabel = (sessionId, sessions = []) => {
  if (sessionId === CONSOLIDATED) return 'All Sessions (Consolidated)';
  const found = sessions.find(s => s.id === sessionId);
  return found ? found.name : `${(sessionId || '').slice(0, 8)}…`;
};

const MOD = {
  warehouse:   { label: 'Warehouse',   cls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',       Icon: Warehouse },
  cycle_count: { label: 'Cycle Count', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', Icon: Repeat },
};

function _fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return s; }
}

export default function PortalAssignments() {
  const { portalUser, authHeaders } = useAudit();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('assign');

  return (
    <div className="p-3 md:p-4 lg:p-5 space-y-3" data-testid="portal-assignments-page">
      <PageHeader
        icon={UserCog}
        title="Assignments"
        subtitle="Delegate read + reco-edit access on your sessions to other portal users. Owners keep full control."
      />

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {[
            { id: 'assign',  label: 'Assign Reports',   Icon: Plus },
            { id: 'my',      label: 'My Assignments',   Icon: Inbox },
            { id: 'by-me',   label: 'Assigned by Me',   Icon: Send },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              data-testid={`assignments-tab-${id}`}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                activeTab === id
                  ? 'border-emerald-500 text-emerald-700 bg-emerald-50/60'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'assign' && <AssignTab authHeaders={authHeaders} portalUser={portalUser} />}
          {activeTab === 'my'     && <MyAssignmentsTab authHeaders={authHeaders} navigate={navigate} />}
          {activeTab === 'by-me'  && <ByMeTab authHeaders={authHeaders} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────── TAB 1: ASSIGN
function AssignTab({ authHeaders, portalUser }) {
  const [step, setStep] = useState(1);
  const [module, setModule] = useState('warehouse');
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [assignmentType, setAssignmentType] = useState('full_session');
  const [reportTypes, setReportTypes] = useState([]);
  const [cycleDay, setCycleDay] = useState('');
  const [users, setUsers] = useState([]);
  const [assignees, setAssignees] = useState([]); // multi-select
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load reference data
  useEffect(() => {
    // Only my own clients (filter by created_by)
    fetch(`${API}/clients`).then(r => r.ok ? r.json() : []).then((all) => {
      const mine = (all || []).filter(c => (c.created_by || '') === (portalUser?.id || ''));
      setClients(mine);
    }).catch(() => setClients([]));
    fetch(`${API}/assignments/users`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, [authHeaders, portalUser?.id]);

  useEffect(() => {
    if (!clientId) { setSessions([]); setSessionId(''); return; }
    if (module === 'cycle_count') {
      // Cycle count: load projects then map to audit_session_id
      fetch(`${API}/cycle-count/projects?client_id=${clientId}`)
        .then(r => r.ok ? r.json() : [])
        .then(arr => {
          const mapped = (arr || []).map(p => ({
            id: p.audit_session_id || p.id,
            name: p.name || `Project ${p.id.slice(0, 6)}`,
            _project: p,
            days: p.days || [],
          }));
          setSessions(mapped);
        })
        .catch(() => setSessions([]));
    } else {
      fetch(`${API}/sessions?client_id=${clientId}`)
        .then(r => r.ok ? r.json() : { sessions: [] })
        .then(d => setSessions(Array.isArray(d) ? d : (d.sessions || [])))
        .catch(() => setSessions([]));
    }
  }, [clientId, module]);

  const selectedSession = useMemo(() => sessions.find(s => s.id === sessionId), [sessions, sessionId]);

  const reset = () => {
    setStep(1); setModule('warehouse'); setClientId(''); setSessionId('');
    setAssignmentType('full_session'); setReportTypes([]); setCycleDay('');
    setAssignees([]); setNotes('');
  };

  const handleAssign = async () => {
    if (!sessionId)            { toast.error('Pick a session'); return; }
    if (assignees.length === 0) { toast.error('Pick at least one user to assign'); return; }
    if (assignmentType === 'specific_reports' && reportTypes.length === 0) {
      toast.error('Pick at least one report type'); return;
    }
    setSubmitting(true);
    try {
      const ok = []; const fail = [];
      for (const uid of assignees) {
        const body = {
          module,
          assigned_to: uid,
          session_id: sessionId,
          // The consolidated view spans every session, so the backend has no
          // session to resolve the client from — name it explicitly.
          client_id: clientId,
          assignment_type: assignmentType,
          report_types: assignmentType === 'specific_reports' ? reportTypes : [],
          cycle_day: cycleDay ? Number(cycleDay) : null,
          notes,
        };
        const r = await fetch(`${API}/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body),
        });
        if (r.ok) ok.push(uid); else fail.push(uid);
      }
      if (ok.length) toast.success(`Assigned ${ok.length} user(s)`);
      if (fail.length) toast.error(`Failed for ${fail.length} user(s)`);
      reset();
    } catch (e) {
      toast.error('Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const ModBadge = ({ k }) => {
    const m = MOD[k] || MOD.warehouse;
    const I = m.Icon;
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.cls}`}>
        <I className="w-3 h-3" />{m.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Step 1+2: Module + Client */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">1. Module</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {['warehouse', 'cycle_count'].map(k => (
              <button
                key={k}
                onClick={() => { setModule(k); setClientId(''); setSessionId(''); }}
                data-testid={`assign-module-${k}`}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  module === k
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ModBadge k={k} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">2. Client (yours only)</Label>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            data-testid="assign-client-select"
            className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
          >
            <option value="">— pick a client you created —</option>
            {clients
              .filter(c => module === 'cycle_count' ? c.client_type === 'cycle_count' : c.client_type !== 'cycle_count')
              .map(c => <option key={c.id} value={c.id}>{c.name || c.code || c.id}</option>)}
          </select>
          {clients.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1">You haven't created any clients yet.</p>
          )}
        </div>
      </div>

      {clientId && (
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">3. Session</Label>
          <select
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            data-testid="assign-session-select"
            className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
          >
            <option value="">— pick a session —</option>
            {/* The client's roll-up across every session. Cycle-count clients
                have their own per-project consolidated day instead. */}
            {module !== 'cycle_count' && (
              <option value={CONSOLIDATED}>All Sessions (Consolidated)</option>
            )}
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {sessionId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">4. Scope</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[
                { k: 'full_session',     label: 'Full Session' },
                { k: 'specific_reports', label: 'Specific Reports' },
              ].map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setAssignmentType(k)}
                  data-testid={`assign-type-${k}`}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    assignmentType === k
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          {module === 'cycle_count' && selectedSession && (
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">5. Day (cycle count, optional)</Label>
              <select
                value={cycleDay}
                onChange={e => setCycleDay(e.target.value)}
                data-testid="assign-cycle-day"
                className="mt-1 w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-sm"
              >
                <option value="">Whole project</option>
                {(selectedSession.days || []).map(d => (
                  <option key={d.id} value={d.day_no}>Day {d.day_no}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {sessionId && assignmentType === 'specific_reports' && (
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">Report Types</Label>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {REPORT_TYPES.map(rt => {
              const on = reportTypes.includes(rt.key);
              return (
                <button
                  key={rt.key}
                  onClick={() => setReportTypes(prev =>
                    on ? prev.filter(x => x !== rt.key) : [...prev, rt.key]
                  )}
                  data-testid={`assign-report-${rt.key}`}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    on
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{rt.label}</span>
                    {on && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{rt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sessionId && (
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">6. Assign To (multi-select)</Label>
          <div className="mt-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-1" data-testid="assign-users-list">
            {users.length === 0 && (
              <p className="text-xs text-slate-400 p-2">No other approved users available.</p>
            )}
            {users.map(u => {
              const picked = assignees.includes(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => setAssignees(prev =>
                    picked ? prev.filter(x => x !== u.id) : [...prev, u.id]
                  )}
                  data-testid={`assign-user-${u.username}`}
                  className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                    picked ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold ${
                      u.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>{(u.username || '?').charAt(0).toUpperCase()}</span>
                    <span className="font-medium text-slate-700">{u.username}</span>
                    <span className={`text-[9px] px-1 py-0 rounded ${
                      u.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>{u.role || 'supervisor'}</span>
                  </span>
                  {picked && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sessionId && (
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500">7. Notes (optional)</Label>
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. 'Please reconcile A-block bins by Friday'"
            className="mt-1 h-9 text-sm"
            data-testid="assign-notes"
          />
        </div>
      )}

      {sessionId && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={reset} className="h-9 text-xs" data-testid="assign-reset-btn">Reset</Button>
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={submitting || assignees.length === 0}
            className="h-9 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
            data-testid="assign-submit-btn"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
            Assign
            <span className="ml-1 text-[10px] opacity-80">({assignees.length})</span>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────── TAB 2: MY
function MyAssignmentsTab({ authHeaders, navigate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/assignments/my`, { headers: authHeaders() });
      const data = await r.json();
      setRows(data.assignments || []);
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => {
    load();
    fetch(`${API}/clients`).then(r => r.ok ? r.json() : []).then(setClients).catch(() => {});
    fetch(`${API}/assignments/users`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users || []))
      .catch(() => {});
  }, [load, authHeaders]);

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const userById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);

  if (loading) return <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-sm">
        <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
        No assignments yet. Once someone delegates a session to you, it will show up here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="my-assignments-list">
      {rows.map(r => {
        const M = MOD[r.module] || MOD.warehouse; const I = M.Icon;
        const cli = clientById[r.client_id];
        const assigner = userById[r.assigned_by] || {};
        return (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-md transition-shadow"
               data-testid={`my-assignment-${r.id}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${M.cls}`}>
                <I className="w-3 h-3" />{M.label}
              </span>
              <span className="text-[10px] text-slate-400">{_fmtDate(r.assigned_at)}</span>
            </div>
            <p className="text-sm font-semibold text-slate-800 truncate">{cli?.name || r.client_id?.slice(0, 8)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Session: <span className="font-mono">{sessionLabel(r.session_id)}</span></p>
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {r.assignment_type === 'full_session' ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Full Session</span>
              ) : (
                <>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Specific</span>
                  {(r.report_types || []).map(rt => (
                    <span key={rt} className="text-[10px] px-1 py-0 rounded bg-slate-100 text-slate-600">{rt}</span>
                  ))}
                </>
              )}
              {r.cycle_day != null && r.cycle_day !== '' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Day {r.cycle_day}</span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">by <span className="font-semibold">{assigner.username || r.assigned_by?.slice(0, 8)}</span></p>
            {r.notes && (
              <p className="text-[11px] text-slate-600 mt-2 italic border-l-2 border-emerald-200 pl-2 line-clamp-2">"{r.notes}"</p>
            )}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                <ShieldAlert className="w-3 h-3" />RECO edit (Detailed only)
              </span>
              <button
                onClick={() => navigate('/portal/reports')}
                className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                data-testid={`open-assignment-${r.id}`}
              >
                Open <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────── TAB 3: BY ME
function ByMeTab({ authHeaders }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/assignments/by-me`, { headers: authHeaders() });
      const data = await r.json();
      setRows(data.assignments || []);
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => {
    load();
    fetch(`${API}/clients`).then(r => r.ok ? r.json() : []).then(setClients).catch(() => {});
    fetch(`${API}/assignments/users`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users || []))
      .catch(() => {});
  }, [load, authHeaders]);

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const userById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);

  const revoke = async (id, label) => {
    if (!window.confirm(`Revoke this assignment? ${label}`)) return;
    const r = await fetch(`${API}/assignments/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { toast.success('Revoked'); load(); }
    else      { toast.error('Revoke failed'); }
  };

  if (loading) return <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-sm">
        <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
        You haven't assigned any sessions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="by-me-table">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Module</th>
            <th className="text-left px-3 py-2 font-semibold">Client</th>
            <th className="text-left px-3 py-2 font-semibold">Session</th>
            <th className="text-left px-3 py-2 font-semibold">Scope</th>
            <th className="text-left px-3 py-2 font-semibold">Day</th>
            <th className="text-left px-3 py-2 font-semibold">Assigned To</th>
            <th className="text-left px-3 py-2 font-semibold">Date</th>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-right px-3 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const M = MOD[r.module] || MOD.warehouse; const I = M.Icon;
            const cli = clientById[r.client_id];
            const tgt = userById[r.assigned_to] || {};
            return (
              <tr key={r.id} className={r.is_active ? 'hover:bg-slate-50' : 'opacity-50'} data-testid={`by-me-row-${r.id}`}>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${M.cls}`}>
                    <I className="w-3 h-3" />{M.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">{cli?.name || r.client_id?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs font-mono text-slate-500">{r.session_id?.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  {r.assignment_type === 'full_session' ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Full</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                          title={(r.report_types || []).join(', ')}>
                      Specific ({(r.report_types || []).length})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.cycle_day != null && r.cycle_day !== '' ? `Day ${r.cycle_day}` : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-xs text-slate-700">{tgt.username || r.assigned_to?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{_fmtDate(r.assigned_at)}</td>
                <td className="px-3 py-2">
                  {r.is_active ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Revoked</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.is_active && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => revoke(r.id, `${tgt.username || r.assigned_to?.slice(0, 8)} · ${cli?.name || ''}`)}
                      className="h-7 text-[10px] border-red-200 text-red-600 hover:bg-red-50"
                      data-testid={`revoke-${r.id}`}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />Revoke
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
