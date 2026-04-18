import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, FolderOpen, Smartphone, Users,
  RefreshCw, Activity, PackageX, AlertTriangle,
  TrendingDown, TrendingUp, BarChart3, Sparkles, Zap,
  ChevronDown, ChevronUp, Lightbulb, Clock, CheckCircle2
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Area, AreaChart
} from 'recharts';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import PageHeader from '../../components/portal/PageHeader';
import StatCard from '../../components/portal/StatCard';
import EmptyState from '../../components/portal/EmptyState';
import { SkeletonCard } from '../../components/portal/Skeleton';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    stats: { clients: 0, active_sessions: 0, devices: 0, total_users: 0, pending_users: 0, empty_bins: 0, pending_conflicts: 0 },
    recent_syncs: [],
    devices: []
  });
  const [auditSummaries, setAuditSummaries] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/dashboard`);
      if (response.ok) setDashboardData(await response.json());
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const fetchAuditSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/dashboard/audit-summary`);
      if (response.ok) {
        const data = await response.json();
        setAuditSummaries(data.summaries || []);
      }
    } catch { /* silent */ }
    finally { setSummaryLoading(false); }
  };

  useEffect(() => {
    fetchDashboard();
    fetchAuditSummary();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    fetchDashboard();
    fetchAuditSummary();
    toast.success('Dashboard refreshed');
  };

  const stats = dashboardData.stats;

  // Aggregate totals across clients for overall chart
  const overallTotals = useMemo(() => {
    const totals = auditSummaries.reduce(
      (acc, s) => {
        acc.expected += s.expected_qty || 0;
        acc.physical += s.physical_qty || 0;
        acc.locations += s.locations_scanned || 0;
        return acc;
      },
      { expected: 0, physical: 0, locations: 0 }
    );
    totals.variance = totals.physical - totals.expected;
    totals.accuracy = totals.expected > 0
      ? Math.min(100, (Math.min(totals.expected, totals.physical) / totals.expected) * 100)
      : 0;
    return totals;
  }, [auditSummaries]);

  // Prepare chart data from syncs (last 7 days activity)
  const activityData = useMemo(() => {
    const map = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      map[key] = { day: key, qty: 0, items: 0 };
    }
    (dashboardData.recent_syncs || []).forEach((s) => {
      if (!s.synced_at) return;
      const d = new Date(s.synced_at);
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      if (map[key]) {
        map[key].qty += s.total_quantity || 0;
        map[key].items += s.total_items || 0;
      }
    });
    return Object.values(map);
  }, [dashboardData.recent_syncs]);

  // Smart Insights derived from data
  const insights = useMemo(() => {
    const out = [];
    if (stats.pending_conflicts > 0) {
      out.push({ type: 'warning', icon: AlertTriangle, text: `${stats.pending_conflicts} conflict${stats.pending_conflicts > 1 ? 's' : ''} need${stats.pending_conflicts === 1 ? 's' : ''} resolution`, action: '/portal/conflicts' });
    }
    if (stats.pending_users > 0) {
      out.push({ type: 'info', icon: Users, text: `${stats.pending_users} user${stats.pending_users > 1 ? 's' : ''} awaiting admin approval`, action: '/portal/users' });
    }
    const topClient = auditSummaries.slice().sort((a, b) => (b.variance_qty || 0) - (a.variance_qty || 0))[0];
    if (topClient && Math.abs(topClient.variance_qty) > 0) {
      out.push({
        type: topClient.variance_qty < 0 ? 'warning' : 'success',
        icon: topClient.variance_qty < 0 ? TrendingDown : TrendingUp,
        text: `${topClient.client_name}: variance of ${topClient.variance_qty > 0 ? '+' : ''}${topClient.variance_qty.toLocaleString('en-IN')} units`,
        action: '/portal/reports',
      });
    }
    if (stats.active_sessions > 0 && stats.devices > 0) {
      out.push({ type: 'success', icon: Activity, text: `${stats.active_sessions} live session${stats.active_sessions > 1 ? 's' : ''} · ${stats.devices} scanner${stats.devices > 1 ? 's' : ''} online`, action: null });
    }
    if (out.length === 0) {
      out.push({ type: 'info', icon: Sparkles, text: 'All systems calm. No action needed.', action: null });
    }
    return out.slice(0, 4);
  }, [stats, auditSummaries]);

  return (
    <div className="p-3 md:p-4 lg:p-5" data-testid="portal-dashboard">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time pulse of your entire audit operation"
        breadcrumbs={[{ label: 'Dashboard' }]}
        liveLabel="Live · auto-refresh 30s"
        actions={
          <Button
            onClick={handleRefresh}
            variant="outline"
            disabled={loading}
            data-testid="dashboard-refresh-btn"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Clients" value={stats.clients} icon={Building2} color="blue" testId="stats-card-clients" />
            <StatCard label="Active Sessions" value={stats.active_sessions} icon={FolderOpen} color="emerald" testId="stats-card-active-sessions" />
            <StatCard label="Devices" value={stats.devices} icon={Smartphone} color="violet" testId="stats-card-devices" />
            <StatCard label="Empty Bins" value={stats.empty_bins} icon={PackageX} color="amber" testId="stats-card-empty-bins" />
            <StatCard label="Conflicts" value={stats.pending_conflicts} icon={AlertTriangle} color="rose" testId="stats-card-conflicts" />
            <StatCard
              label="Users"
              value={stats.total_users}
              icon={Users}
              color="slate"
              trend={stats.pending_users > 0 ? { direction: 'up', value: `${stats.pending_users} pending`, label: 'approval' } : null}
              testId="stats-card-users"
            />
          </>
        )}
      </div>

      {/* Top row: Overall Progress Donut + Activity Chart + Smart Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 mb-6">
        {/* Overall Accuracy Donut */}
        <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-sm">Overall Audit Progress</h3>
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xs text-slate-500 mb-4">Accuracy across all active clients</p>
          {summaryLoading ? (
            <div className="h-48 animate-pulse bg-slate-50 rounded-xl" />
          ) : auditSummaries.length === 0 ? (
            <EmptyState size="sm" icon={BarChart3} title="No audit data yet" description="Import stock and start scanning to see progress." />
          ) : (
            <AccuracyDonut accuracy={overallTotals.accuracy} expected={overallTotals.expected} physical={overallTotals.physical} />
          )}
        </div>

        {/* Scan Activity (Last 7 days) */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-sm">Scan Activity</h3>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Last 7 days</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">Items scanned per day across all scanners</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="scanActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#334155', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="qty" stroke="#10b981" strokeWidth={2} fill="url(#scanActivity)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Smart Insights */}
        <div className="lg:col-span-3 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Smart Insights</h3>
              <p className="text-[11px] text-slate-500">Live signals from your data</p>
            </div>
          </div>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightItem key={i} insight={ins} />
            ))}
          </div>
        </div>
      </div>

      {/* Audit Summary by Client - cards grid with charts */}
      <AuditSummarySection summaries={auditSummaries} loading={summaryLoading} />

      {/* Bottom row: Devices + Recent Syncs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mt-6">
        <DeviceStatusPanel devices={dashboardData.devices} loading={loading} />
        <RecentSyncsPanel syncs={dashboardData.recent_syncs} loading={loading} />
      </div>
    </div>
  );
}

/* ----- Helpers ----- */

function AccuracyDonut({ accuracy, expected, physical }) {
  const pct = Math.min(100, Math.max(0, accuracy || 0));
  const data = [
    { name: 'Matched', value: pct },
    { name: 'Gap', value: 100 - pct },
  ];
  const color = pct >= 98 ? '#10b981' : pct >= 90 ? '#3b82f6' : pct >= 75 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} innerRadius={60} outerRadius={85} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
              <Cell fill={color} />
              <Cell fill="#f1f5f9" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-3xl font-bold text-slate-800">{pct.toFixed(1)}%</p>
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Accuracy</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Expected</p>
          <p className="text-sm font-semibold text-slate-800">{expected.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Physical</p>
          <p className="text-sm font-semibold text-emerald-700">{physical.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
}

function InsightItem({ insight }) {
  const styles = {
    success: { bg: 'bg-emerald-100', text: 'text-emerald-700', iconColor: 'text-emerald-600' },
    warning: { bg: 'bg-amber-100', text: 'text-amber-700', iconColor: 'text-amber-600' },
    info: { bg: 'bg-blue-100', text: 'text-blue-700', iconColor: 'text-blue-600' },
  }[insight.type] || { bg: 'bg-slate-100', text: 'text-slate-700', iconColor: 'text-slate-600' };
  const Icon = insight.icon;
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/60 border border-white/80 hover:bg-white transition-colors">
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${styles.bg} flex items-center justify-center`}>
        <Icon className={`w-3.5 h-3.5 ${styles.iconColor}`} strokeWidth={2.2} />
      </div>
      <p className="text-xs text-slate-700 leading-snug flex-1">{insight.text}</p>
    </div>
  );
}

function DeviceStatusPanel({ devices, loading }) {
  const isLive = (iso) => {
    if (!iso) return { label: 'Offline', color: 'slate', pulse: false };
    const diffMin = (new Date() - new Date(iso)) / 60000;
    if (diffMin < 2) return { label: 'Live', color: 'emerald', pulse: true };
    if (diffMin < 10) return { label: 'Active', color: 'emerald', pulse: false };
    if (diffMin < 60) return { label: 'Recent', color: 'amber', pulse: false };
    return { label: 'Stale', color: 'rose', pulse: false };
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    const diff = (new Date() - new Date(iso)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return new Date(iso).toLocaleDateString('en-IN');
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Device Status</h3>
          <p className="text-xs text-slate-500">Live heartbeat from scanners</p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200/60">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] text-emerald-700 font-medium">Live</span>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-50 animate-pulse" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState size="sm" icon={Smartphone} title="No devices registered" description="Register a scanner device from the Devices page to see live status here." color="violet" />
      ) : (
        <div className="space-y-2">
          {devices.slice(0, 6).map((d) => {
            const s = isLive(d.last_sync_at);
            const colorMap = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', slate: 'bg-slate-300' };
            const textColorMap = { emerald: 'text-emerald-700 bg-emerald-50', amber: 'text-amber-700 bg-amber-50', rose: 'text-rose-700 bg-rose-50', slate: 'text-slate-600 bg-slate-100' };
            return (
              <div key={d.id} className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="relative">
                  <div className={`w-2 h-2 rounded-full ${colorMap[s.color]}`} />
                  {s.pulse && (
                    <div className={`absolute inset-0 rounded-full ${colorMap[s.color]} animate-ping opacity-75`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{d.device_name}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last sync: {formatTime(d.last_sync_at)}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${textColorMap[s.color]}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecentSyncsPanel({ syncs, loading }) {
  const formatTime = (iso) => {
    if (!iso) return '';
    const diff = (new Date() - new Date(iso)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString('en-IN');
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Recent Syncs</h3>
          <p className="text-xs text-slate-500">Latest scanner data received</p>
        </div>
        <Zap className="w-4 h-4 text-blue-500" />
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-50 animate-pulse" />
          ))}
        </div>
      ) : !syncs || syncs.length === 0 ? (
        <EmptyState size="sm" icon={FolderOpen} title="No syncs yet" description="Scanner sync events will appear here in real-time." color="blue" />
      ) : (
        <div className="space-y-1.5">
          {syncs.slice(0, 6).map((s, i) => (
            <div key={i} className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-blue-500" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{s.location_name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {s.device_name} · <span className="font-medium text-slate-600">{s.total_items}</span> items · <span className="font-medium text-slate-600">{s.total_quantity}</span> qty
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">{formatTime(s.synced_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditSummarySection({ summaries, loading }) {
  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-500" />
          Audit Summary by Client
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-500" />
          Audit Summary by Client
        </h2>
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <EmptyState icon={BarChart3} title="No audit data available yet" description="Create audit sessions and import stock data to see beautiful summaries here." tip="Tip: Go to Clients → Schema first, then Sessions → Import Stock" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="audit-summary-section">
      <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-emerald-500" />
        Audit Summary by Client
        <span className="text-xs text-slate-400 font-normal">({summaries.length})</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaries.map((s) => <AuditSummaryCard key={s.client_id} summary={s} />)}
      </div>
    </div>
  );
}

function AuditSummaryCard({ summary }) {
  const [expanded, setExpanded] = useState(false);
  const s = summary;
  const varianceIsPositive = s.variance_qty > 0;
  const varianceIsNegative = s.variance_qty < 0;

  const getAccuracyColor = (pct) => {
    if (pct >= 98) return { text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-gradient-to-r from-emerald-500 to-teal-500', ring: 'ring-emerald-200' };
    if (pct >= 90) return { text: 'text-blue-700', bg: 'bg-blue-50', bar: 'bg-gradient-to-r from-blue-500 to-cyan-500', ring: 'ring-blue-200' };
    if (pct >= 75) return { text: 'text-amber-700', bg: 'bg-amber-50', bar: 'bg-gradient-to-r from-amber-500 to-orange-500', ring: 'ring-amber-200' };
    return { text: 'text-rose-700', bg: 'bg-rose-50', bar: 'bg-gradient-to-r from-rose-500 to-red-500', ring: 'ring-rose-200' };
  };
  const ac = getAccuracyColor(s.accuracy_pct);

  return (
    <div className="group rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden" data-testid={`audit-summary-card-${s.client_id}`}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 text-base truncate">{s.client_name || s.client_code || 'Unnamed'}</h3>
            {s.client_code && s.client_name && (
              <span className="text-[11px] text-slate-400 font-mono">{s.client_code}</span>
            )}
          </div>
          <div className={`px-2.5 py-1 rounded-xl text-sm font-bold ${ac.bg} ${ac.text} ring-1 ring-inset ${ac.ring}`}>
            {s.accuracy_pct.toFixed(1)}%
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 flex-wrap">
          <span className="inline-flex items-center gap-1"><FolderOpen className="w-3 h-3" />{s.total_sessions} session{s.total_sessions !== 1 ? 's' : ''}</span>
          <span className="text-slate-300">•</span>
          <span>{s.active_sessions} active</span>
          <span className="text-slate-300">•</span>
          <span>{s.locations_scanned} locations</span>
        </div>
      </div>

      <div className="px-5 py-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 px-2 py-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Expected</p>
            <p className="text-sm font-bold text-slate-800">{s.expected_qty.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-2 py-2">
            <p className="text-[10px] text-blue-600 uppercase tracking-wider">Physical</p>
            <p className="text-sm font-bold text-blue-700">{s.physical_qty.toLocaleString('en-IN')}</p>
          </div>
          <div className={`rounded-lg px-2 py-2 ${varianceIsPositive ? 'bg-emerald-50' : varianceIsNegative ? 'bg-rose-50' : 'bg-slate-50'}`}>
            <p className={`text-[10px] uppercase tracking-wider ${varianceIsPositive ? 'text-emerald-600' : varianceIsNegative ? 'text-rose-600' : 'text-slate-500'}`}>Variance</p>
            <p className={`text-sm font-bold flex items-center justify-center gap-0.5 ${varianceIsPositive ? 'text-emerald-700' : varianceIsNegative ? 'text-rose-700' : 'text-slate-700'}`}>
              {varianceIsPositive && <TrendingUp className="w-3 h-3" />}
              {varianceIsNegative && <TrendingDown className="w-3 h-3" />}
              {s.variance_qty.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full ${ac.bar} transition-[width] duration-700 ease-out`}
              style={{ width: `${Math.min(100, Math.max(0, s.accuracy_pct))}%` }}
            />
          </div>
        </div>
      </div>

      {s.top_mismatches && s.top_mismatches.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-5 py-2 flex items-center justify-between text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            data-testid={`toggle-mismatches-${s.client_id}`}
          >
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-500" />Top {s.top_mismatches.length} Mismatches</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {expanded && (
            <div className="px-5 pb-3 space-y-1.5 animate-fade-in" data-testid={`mismatches-list-${s.client_id}`}>
              {s.top_mismatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                  <div className="truncate mr-2 flex-1">
                    <span className="font-mono text-slate-600">{m.barcode}</span>
                    <span className="text-slate-400 ml-1.5">{m.description}</span>
                  </div>
                  <span className={`font-semibold whitespace-nowrap ${m.diff_qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.diff_qty > 0 ? '+' : ''}{m.diff_qty.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
