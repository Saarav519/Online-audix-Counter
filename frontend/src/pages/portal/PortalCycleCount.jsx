import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Trash2, Calendar, Upload, Lock, Unlock, RefreshCw, FileSpreadsheet,
  CheckCircle2, ArrowLeft, Package, TrendingUp, TrendingDown,
  Repeat, Layers, ExternalLink, Eye, Download
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '../../components/ui/dialog';
import PageHeader from '../../components/portal/PageHeader';
import EmptyState from '../../components/portal/EmptyState';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/cycle-count`;
const CLIENT_API = `${process.env.REACT_APP_BACKEND_URL}/api/audit/portal/clients`;

// ───────────────────────────────────────────────────── Page Component
export default function PortalCycleCount() {
  const navigate = useNavigate();
  const [activeProjectId, setActiveProjectId] = useState(null);

  // List view
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterClient, setFilterClient] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterClient ? `${API}/projects?client_id=${filterClient}` : `${API}/projects`;
      const r = await fetch(url);
      if (r.ok) setProjects((await r.json()).projects || []);
    } finally { setLoading(false); }
  }, [filterClient]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    fetch(CLIENT_API).then(r => r.ok && r.json()).then(d => d && setClients(d || []));
  }, []);

  const handleCreate = async () => {
    if (!newClient || !newName.trim()) { toast.error('Client and name required'); return; }
    const r = await fetch(`${API}/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: newClient, name: newName.trim() })
    });
    if (r.ok) {
      const proj = await r.json();
      toast.success('Project created');
      setShowCreate(false); setNewName(''); setNewClient('');
      setActiveProjectId(proj.id);
    } else {
      toast.error('Create failed');
    }
  };

  const handleDelete = async (pid) => {
    if (!window.confirm('Delete this project and ALL its data permanently?')) return;
    const r = await fetch(`${API}/projects/${pid}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Project deleted'); loadProjects(); }
    else toast.error('Delete failed');
  };

  if (activeProjectId) {
    return <CycleProjectDetail
      projectId={activeProjectId}
      onBack={() => { setActiveProjectId(null); loadProjects(); }}
      clients={clients}
    />;
  }

  return (
    <div className="p-3 md:p-4 lg:p-5">
      <PageHeader
        title="Cycle Count Projects"
        subtitle="Daily warehouse cycle counts with picking reconciliation"
        breadcrumbs={[{ label: 'Cycle Count' }]}
        actions={
          <div className="flex items-center gap-2">
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              data-testid="cc-client-filter"
              className="h-8 text-xs rounded-md border border-gray-200 px-2 bg-white">
              <option value="">All Clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button onClick={loadProjects} variant="outline" size="sm" className="h-8 text-xs gap-1"
              data-testid="cc-refresh-btn">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1"
                  data-testid="cc-new-project-btn">
                  <Plus className="w-3.5 h-3.5" /> New Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Cycle Count Project</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Client *</Label>
                    <select value={newClient} onChange={e => setNewClient(e.target.value)}
                      data-testid="cc-new-client"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="">Select client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Project Name *</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. Q4 2026 Warehouse Cycle Count"
                      data-testid="cc-new-name" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid="cc-create-confirm">Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No cycle count projects yet"
          description="Create your first project to track rolling daily warehouse audits with stock + picking reconciliation."
          tip="Each project spans many days; daily uploads + free-form scans roll up into one consolidated audit."
          action={<Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" /> New Project
          </Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {projects.map(p => {
            const client = clients.find(c => c.id === p.client_id);
            return (
              <div key={p.id} data-testid={`cc-project-card-${p.id}`}
                className="group bg-white rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all p-4 cursor-pointer"
                onClick={() => setActiveProjectId(p.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                      {p.status === 'completed' && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">DONE</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{client?.name || '—'}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded transition-opacity"
                    data-testid={`cc-delete-${p.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                  <Stat label="Days" value={p.days_count} />
                  <Stat label="Closed" value={p.closed_days_count} />
                  <Stat label="Bins" value={p.total_unique_bins_counted} />
                </div>
                <p className="text-[10px] text-gray-400 mt-3">
                  Created {new Date(p.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg py-1.5">
      <div className="text-base font-bold text-gray-800">{value ?? 0}</div>
      <div className="text-[10px] uppercase text-gray-500 tracking-wide">{label}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────── Project Detail
function CycleProjectDetail({ projectId, onBack, clients }) {
  const [project, setProject] = useState(null);
  const [days, setDays] = useState([]);
  const [activeDay, setActiveDay] = useState(null);
  const [tab, setTab] = useState('day');  // 'day' | 'consolidated'
  const [consolidated, setConsolidated] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/projects/${projectId}`);
      if (r.ok) {
        const data = await r.json();
        setProject(data.project); setDays(data.days || []);
        if (!activeDay && data.days?.length) {
          // pick the open day if any, else latest
          const open = data.days.find(d => d.status === 'open');
          setActiveDay(open ? open.id : data.days[data.days.length - 1].id);
        }
      }
    } finally { setLoading(false); }
  }, [projectId, activeDay]);

  useEffect(() => { load(); }, [load]);

  const loadConsolidated = useCallback(async () => {
    const r = await fetch(`${API}/projects/${projectId}/consolidated`);
    if (r.ok) setConsolidated(await r.json());
  }, [projectId]);
  useEffect(() => { if (tab === 'consolidated') loadConsolidated(); }, [tab, loadConsolidated]);

  const createDay = async () => {
    const r = await fetch(`${API}/days`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    });
    if (r.ok) {
      const day = await r.json();
      toast.success(`Day ${day.day_no} created`);
      setActiveDay(day.id);
      load();
    } else {
      const e = await r.json();
      toast.error(e.detail || 'Could not create day');
    }
  };

  const completeProject = async () => {
    if (!window.confirm('Mark this project as completed? You can reopen later.')) return;
    const r = await fetch(`${API}/projects/${projectId}/complete`, { method: 'POST' });
    if (r.ok) { toast.success('Project completed'); load(); }
  };

  const reopenProject = async () => {
    const r = await fetch(`${API}/projects/${projectId}/reopen`, { method: 'POST' });
    if (r.ok) { toast.success('Project reopened'); load(); }
  };

  const client = clients.find(c => c.id === project?.client_id);

  return (
    <div className="p-3 md:p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          data-testid="cc-back-btn">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </button>
        <div className="flex items-center gap-2">
          {project?.status === 'active' ? (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={completeProject}
              data-testid="cc-complete-project-btn">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={reopenProject}>
              <Unlock className="w-3.5 h-3.5" /> Reopen
            </Button>
          )}
          <Button size="sm" onClick={createDay} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1"
            data-testid="cc-new-day-btn">
            <Plus className="w-3.5 h-3.5" /> New Day
          </Button>
        </div>
      </div>

      {project && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
              <p className="text-sm text-gray-600 mt-0.5">{client?.name} · Started {new Date(project.created_at).toLocaleDateString('en-IN')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Pill label="Days" value={days.length} />
              <Pill label="Closed" value={days.filter(d => d.status === 'closed').length} />
              <Pill label="Bins Counted" value={project.total_unique_bins_counted ?? '—'} />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        {['day', 'consolidated'].map(t => (
          <button key={t} onClick={() => setTab(t)} data-testid={`cc-tab-${t}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t === 'day' ? 'Daily View' : 'Consolidated Report'}
          </button>
        ))}
      </div>

      {tab === 'day' && (
        <DayView days={days} activeDay={activeDay} setActiveDay={setActiveDay}
          projectId={projectId} onChange={load} loading={loading} />
      )}
      {tab === 'consolidated' && (
        <ConsolidatedView data={consolidated} onRefresh={loadConsolidated} projectId={projectId} />
      )}
    </div>
  );
}

function Pill({ label, value }) {
  return (
    <div className="bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200 text-center min-w-[70px]">
      <div className="text-lg font-bold text-emerald-700 leading-tight">{value}</div>
      <div className="text-[9px] uppercase text-gray-500 tracking-wide">{label}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────── Day View
function DayView({ days, activeDay, setActiveDay, projectId, onChange, loading }) {
  const navigate = useNavigate();
  const day = days.find(d => d.id === activeDay);
  const [variance, setVariance] = useState(null);
  const [vLoading, setVLoading] = useState(false);

  const loadVariance = useCallback(async () => {
    if (!day) return;
    setVLoading(true);
    try {
      const r = await fetch(`${API}/days/${day.id}/variance`);
      if (r.ok) setVariance(await r.json());
    } finally { setVLoading(false); }
  }, [day]);
  useEffect(() => { loadVariance(); }, [loadVariance]);

  if (loading && !day) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  if (!day) return (
    <EmptyState
      icon={Calendar} title="No day yet"
      description='Click "New Day" above to start a daily cycle count session.'
      tip="Each day captures: morning stock + pre-pick + post-pick + scans → variance auto-computed with picking reconciliation."
    />
  );

  const closeDay = async () => {
    if (!window.confirm(`Close Day ${day.day_no}? Variance will be frozen.`)) return;
    const r = await fetch(`${API}/days/${day.id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    if (r.ok) {
      const data = await r.json();
      toast.success(`${data.message}. Bins: ${data.scanned_bins}. Variance: ${data.variance.variance >= 0 ? '+' : ''}${data.variance.variance}`);
      onChange(); loadVariance();
    } else {
      const e = await r.json(); toast.error(e.detail || 'Close failed');
    }
  };

  const reopenDay = async () => {
    if (!window.confirm(`Reopen Day ${day.day_no}? Closed-bin entries for this day will be cleared.`)) return;
    const r = await fetch(`${API}/days/${day.id}/reopen`, { method: 'POST' });
    if (r.ok) { toast.success('Day reopened'); onChange(); loadVariance(); }
  };

  const deleteDay = async () => {
    if (!window.confirm(`Delete Day ${day.day_no} and ALL its data? Cannot be undone.`)) return;
    const r = await fetch(`${API}/days/${day.id}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Day deleted'); setActiveDay(null); onChange(); }
  };

  const openInReports = () => {
    // Deep-link into Reports with this cycle-count day pre-selected.
    // Reports page reads ?client_id and ?session_id from the URL on mount.
    const params = new URLSearchParams();
    const projectClient = days[0] && days[0]._client_id;  // optional — may be undefined
    if (projectId) params.set('project_id', projectId);
    params.set('session_id', `cc_day_${day.id}`);
    navigate(`/portal/reports?${params.toString()}`);
  };

  return (
    <div>
      {/* Day Tabs */}
      <div className="flex gap-1 flex-wrap mb-3">
        {days.map(d => (
          <button key={d.id} onClick={() => setActiveDay(d.id)}
            data-testid={`cc-day-tab-${d.day_no}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              d.id === activeDay
                ? 'bg-emerald-600 text-white border-emerald-600'
                : d.status === 'closed'
                  ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
            }`}>
            Day {d.day_no}
            {d.status === 'closed' && <Lock className="w-3 h-3 ml-1 inline" />}
            <span className="text-[10px] opacity-75 ml-1">{d.date}</span>
          </button>
        ))}
      </div>

      {/* Day Actions */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Day {day.day_no} · {day.date}</h3>
            {day.status === 'closed'
              ? <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full uppercase">Closed</span>
              : <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">Open</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Stock: {day.stats?.stock_rows || 0} rows · Pre-Pick: {day.stats?.pre_pick_rows || 0} · Post-Pick: {day.stats?.post_pick_rows || 0}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={loadVariance}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          {day.status === 'open' ? (
            <Button size="sm" onClick={closeDay} data-testid="cc-close-day-btn"
              className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1">
              <Lock className="w-3.5 h-3.5" /> Close Day
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-amber-700" onClick={reopenDay}>
              <Unlock className="w-3.5 h-3.5" /> Reopen
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600" onClick={deleteDay}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 3-File Upload Strip */}
      {day.status === 'open' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <UploadCard title="Morning Stock" icon={Package} accent="emerald"
            endpoint={`${API}/days/${day.id}/upload-stock`}
            extraField={null}
            uploadedAt={day.stock_uploaded_at} filename={day.stock_filename}
            rowsCount={day.stats?.stock_rows}
            description="Today's planned bins + qty (Excel/CSV)"
            onComplete={() => { onChange(); loadVariance(); }}
            testid="upload-stock"
            sampleKind="stock"
          />
          <UploadCard title="Pre-Audit Picking" icon={TrendingDown} accent="amber"
            endpoint={`${API}/days/${day.id}/upload-picks`}
            extraField={{ pick_type: 'pre' }}
            uploadedAt={day.pre_pick_uploaded_at} filename={day.pre_pick_filename}
            rowsCount={day.stats?.pre_pick_rows}
            description="Stock picked BEFORE auditor counted"
            onComplete={() => { onChange(); loadVariance(); }}
            testid="upload-pre-pick"
            sampleKind="pre"
          />
          <UploadCard title="Post-Audit Picking" icon={TrendingUp} accent="rose"
            endpoint={`${API}/days/${day.id}/upload-picks`}
            extraField={{ pick_type: 'post' }}
            uploadedAt={day.post_pick_uploaded_at} filename={day.post_pick_filename}
            rowsCount={day.stats?.post_pick_rows}
            description="Stock picked AFTER auditor counted"
            onComplete={() => { onChange(); loadVariance(); }}
            testid="upload-post-pick"
            sampleKind="post"
          />
        </div>
      )}

      {/* Variance KPIs */}
      {variance && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
          <Kpi label="Stock Bins" value={variance.bins_summary.stock_uploaded_bins} />
          <Kpi label="Scanned" value={variance.bins_summary.scanned_bins} accent="emerald" />
          <Kpi label="Planned" value={variance.bins_summary.planned_scanned} />
          <Kpi label="Extras" value={variance.bins_summary.extras_scanned} accent="amber" />
          <Kpi label="Duplicates" value={variance.bins_summary.duplicate_bins} accent="rose" />
          <Kpi label="Variance" value={variance.totals.variance >= 0
            ? '+' + variance.totals.variance.toFixed(0)
            : variance.totals.variance.toFixed(0)
          } accent={variance.totals.variance === 0 ? 'emerald' : variance.totals.variance > 0 ? 'amber' : 'rose'} />
          <Kpi label="Effective" value={variance.totals.effective.toFixed(0)} />
        </div>
      )}

      {/* Big "Open in Reports" CTA card — links into the unified Reports page */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-6 text-center"
        data-testid="cc-open-full-report-card">
        <Eye className="w-12 h-12 mx-auto text-emerald-600 mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {vLoading ? 'Computing variance…' : (variance?.report?.length > 0
            ? `${variance.report.length} variance rows ready in Reports`
            : 'No variance rows yet')}
        </h3>
        <p className="text-sm text-gray-600 mb-4 max-w-lg mx-auto">
          {variance?.report?.length > 0
            ? 'Open this day in the Reports page to view variance side-by-side with all your other audits — same Detailed / Bin-wise / Barcode-wise / Category views, plus picking-aware columns.'
            : 'Upload morning stock and start scanning. Variance will appear here in real-time and inside the Reports section under this client.'}
        </p>
        <Button onClick={openInReports} size="lg"
          className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          data-testid="cc-open-full-report-btn">
          <ExternalLink className="w-4 h-4" />
          Open in Reports
        </Button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent = 'gray' }) {
  const cls = accent === 'emerald' ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
            : accent === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-100'
            : accent === 'rose'  ? 'text-rose-700 bg-rose-50 border-rose-100'
            : 'text-gray-700 bg-white border-gray-200';
  return (
    <div className={`rounded-xl border p-2.5 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function VarianceTable({ rows, loading, totals }) {
  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">Computing variance…</div>;
  if (!rows.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-600">No variance rows yet — start scanning to see live variance.</p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
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
                r.duplicate_warning ? 'bg-amber-50/40' : r.classification === 'extra' ? 'bg-amber-50/30' : ''
              }`}>
                <td className="py-1.5 px-2 font-mono">
                  <div className="flex items-center gap-1">
                    <span>{r.location}</span>
                    {r.duplicate_warning && (
                      <span title={`Closed in Day ${r.duplicate_warning.closed_on_day}`}
                        className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        DUP D{r.duplicate_warning.closed_on_day}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-2 font-mono">{r.barcode}</td>
                <Td align="right" mono>{r.expected_qty}</Td>
                <Td align="right" mono>{r.scanned_qty}</Td>
                <Td align="right" mono className={r.pre_pick_qty ? 'text-amber-700 font-semibold' : 'text-gray-300'}>
                  {r.pre_pick_qty || '—'}
                </Td>
                <Td align="right" mono className={r.post_pick_qty ? 'text-rose-700 font-semibold' : 'text-gray-300'}>
                  {r.post_pick_qty || '—'}
                </Td>
                <Td align="right" mono className="font-semibold">{r.effective_qty}</Td>
                <Td align="right" mono className={`font-bold ${
                  r.variance_qty === 0 ? 'text-emerald-700'
                  : r.variance_qty > 0 ? 'text-amber-700' : 'text-rose-700'
                }`}>
                  {r.variance_qty === 0 ? '0' : (r.variance_qty > 0 ? '+' + r.variance_qty : r.variance_qty)}
                </Td>
                <Td align="right" mono className="text-gray-500">{r.ending_stock}</Td>
                <td className="py-1.5 px-2">
                  <Badge classification={r.classification} reason={r.reason} />
                </td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-gray-800">
                <td colSpan="2" className="py-2 px-2">TOTALS</td>
                <Td align="right" mono>{totals.expected}</Td>
                <Td align="right" mono>{totals.scanned}</Td>
                <Td align="right" mono className={totals.pre_pick ? 'text-amber-700' : ''}>{totals.pre_pick || '—'}</Td>
                <Td align="right" mono className={totals.post_pick ? 'text-rose-700' : ''}>{totals.post_pick || '—'}</Td>
                <Td align="right" mono>{totals.effective}</Td>
                <Td align="right" mono className={totals.variance === 0 ? 'text-emerald-700' : totals.variance > 0 ? 'text-amber-700' : 'text-rose-700'}>
                  {totals.variance === 0 ? '0' : (totals.variance > 0 ? '+' + totals.variance : totals.variance)}
                </Td>
                <Td align="right" mono className="text-gray-500">{totals.ending}</Td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

const Th = ({ children, align = 'left' }) => (
  <th className={`py-2 px-2 text-${align} text-[10px] font-bold text-gray-600 uppercase tracking-wide`}>{children}</th>
);
const Td = ({ children, align = 'left', mono, className = '' }) => (
  <td className={`py-1.5 px-2 text-${align} ${mono ? 'font-mono' : ''} ${className}`}>{children}</td>
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

// ───────────────────────────────────────────────────── Upload Card
// Sample CSV templates so the user always knows the exact column format.
const SAMPLE_CSV = {
  stock: `location,barcode,qty,description,category,mrp,cost
A1,NBI001234,50,Cotton Pillow Cover,House & Home,599,280
A1,NBI001235,30,Bedsheet Queen,House & Home,1299,650
A2,NBI001236,20,Towel Set,House & Home,449,200
B5,NBI002500,100,Phone Cover,Accessories,299,120
`,
  pre: `location,barcode,qty
A1,NBI001234,2
B5,NBI002500,5
`,
  post: `location,barcode,qty
A2,NBI001236,1
`,
};

function downloadSample(kind) {
  const csv = SAMPLE_CSV[kind];
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'stock' ? 'morning_stock_sample.csv'
              : kind === 'pre' ? 'pre_audit_picking_sample.csv'
              : 'post_audit_picking_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function UploadCard({ title, icon: Icon, accent, endpoint, extraField, uploadedAt, filename, rowsCount, description, onComplete, testid, sampleKind }) {
  const [uploading, setUploading] = useState(false);
  const accentCls = accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/40'
                  : accent === 'amber' ? 'border-amber-200 bg-amber-50/40'
                  : 'border-rose-200 bg-rose-50/40';
  const iconCls = accent === 'emerald' ? 'text-emerald-600 bg-emerald-100'
                  : accent === 'amber' ? 'text-amber-600 bg-amber-100'
                  : 'text-rose-600 bg-rose-100';

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (extraField) Object.entries(extraField).forEach(([k, v]) => fd.append(k, v));
      const r = await fetch(endpoint, { method: 'POST', body: fd });
      if (r.ok) {
        const data = await r.json();
        toast.success(`${data.message} — ${data.rows} rows`);
        onComplete && onComplete();
      } else {
        const er = await r.json();
        toast.error(er.detail || 'Upload failed');
      }
    } catch (err) { toast.error(err.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div className={`rounded-xl border p-3 ${accentCls}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm text-gray-900">{title}</h4>
            <p className="text-[10px] text-gray-500 truncate">{description}</p>
          </div>
        </div>
        {sampleKind && (
          <button
            onClick={() => downloadSample(sampleKind)}
            title="Download sample CSV format"
            data-testid={`cc-${testid}-sample`}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-gray-600 hover:text-emerald-700 bg-white border border-gray-200 hover:border-emerald-300 rounded-md px-1.5 py-1"
          >
            <Download className="w-3 h-3" /> Sample
          </button>
        )}
      </div>
      {rowsCount > 0 ? (
        <div className="text-xs text-gray-700 mb-2">
          <FileSpreadsheet className="w-3 h-3 inline mr-1" />
          <span className="font-mono text-[11px]">{filename}</span>
          <span className="ml-2 font-semibold">{rowsCount} rows</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-2">No file uploaded yet</p>
      )}
      <label className={`flex items-center justify-center gap-1.5 cursor-pointer text-xs font-medium py-1.5 px-3 rounded-md border transition-colors ${
        uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
          : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'
      }`} data-testid={`cc-${testid}-label`}>
        <Upload className="w-3.5 h-3.5" />
        {uploading ? 'Uploading…' : (rowsCount > 0 ? 'Replace file' : 'Choose Excel/CSV')}
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={handleFile} disabled={uploading}
          data-testid={`cc-${testid}-input`} />
      </label>
    </div>
  );
}

// ───────────────────────────────────────────────────── Consolidated View
function ConsolidatedView({ data, onRefresh, projectId }) {
  const navigate = useNavigate();
  if (!data) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  const openInReports = () => navigate(`/portal/reports?session_id=cc_proj_${projectId}`);
  const openDayInReports = (dayId) => navigate(`/portal/reports?session_id=cc_day_${dayId}`);
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        <Kpi label="Total Bins" value={data.bins_summary.total_unique_bins_scanned} accent="emerald" />
        <Kpi label="Extras" value={data.bins_summary.extras_bins} accent="amber" />
        <Kpi label="Dup Events" value={data.bins_summary.duplicate_bin_events} accent="rose" />
        <Kpi label="Expected" value={data.totals.expected.toFixed(0)} />
        <Kpi label="Effective" value={data.totals.effective.toFixed(0)} />
        <Kpi label="Variance" value={data.totals.variance >= 0 ? '+' + data.totals.variance.toFixed(0) : data.totals.variance.toFixed(0)}
          accent={data.totals.variance === 0 ? 'emerald' : data.totals.variance > 0 ? 'amber' : 'rose'} />
        <Kpi label="Ending" value={data.totals.ending.toFixed(0)} />
      </div>

      {/* Days Breakdown — quick summary */}
      <div className="bg-white rounded-xl border border-gray-200 mb-3 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-sm text-gray-800">
            <Layers className="w-4 h-4 inline mr-1" /> Days Breakdown
          </h4>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onRefresh}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
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
                  onClick={() => openDayInReports(d.day_id)}>
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
        <p className="text-[10px] text-gray-400 px-3 py-2 bg-gray-50/60 border-t border-gray-100">
          Tip: Click any day row above to open its full variance report.
        </p>
      </div>

      {/* Big "Open Consolidated in Reports" CTA */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-6 text-center"
        data-testid="cc-cons-cta">
        <Layers className="w-12 h-12 mx-auto text-emerald-600 mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {data.report.length} bin-wise rows across {data.days.length} day{data.days.length !== 1 ? 's' : ''}
        </h3>
        <p className="text-sm text-gray-600 mb-4 max-w-lg mx-auto">
          Open the consolidated variance in the unified Reports page — same Detailed / Bin-wise / Barcode-wise / Category views as your other audits, with picking-aware columns layered on top.
        </p>
        <Button onClick={openInReports} size="lg"
          className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          data-testid="cc-open-cons-full-btn">
          <ExternalLink className="w-4 h-4" /> Open Consolidated in Reports
        </Button>
      </div>
    </div>
  );
}
