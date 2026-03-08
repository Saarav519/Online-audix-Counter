import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  FolderOpen, 
  Smartphone, 
  Users,
  RefreshCw,
  Activity,
  PackageX,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Target,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

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
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/dashboard/audit-summary`);
      if (response.ok) {
        const data = await response.json();
        setAuditSummaries(data.summaries || []);
      }
    } catch (error) {
      console.error('Failed to fetch audit summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchAuditSummary();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setSummaryLoading(true);
    fetchDashboard();
    fetchAuditSummary();
    toast.success('Dashboard refreshed');
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6" data-testid="portal-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Real-time overview of your stock audits</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={loading} data-testid="dashboard-refresh-btn">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <StatsCard icon={Building2} label="Clients" value={dashboardData.stats.clients} color="blue" />
        <StatsCard icon={FolderOpen} label="Active Sessions" value={dashboardData.stats.active_sessions} color="emerald" />
        <StatsCard icon={Smartphone} label="Devices" value={dashboardData.stats.devices} color="purple" />
        <StatsCard icon={PackageX} label="Empty Bins" value={dashboardData.stats.empty_bins} color="amber" />
        <StatsCard icon={AlertTriangle} label="Conflicts" value={dashboardData.stats.pending_conflicts} color="red" />
        <StatsCard icon={Users} label="Users" value={`${dashboardData.stats.total_users}${dashboardData.stats.pending_users > 0 ? ` (${dashboardData.stats.pending_users} pending)` : ''}`} color="amber" />
      </div>

      {/* Audit Summary Section */}
      <AuditSummarySection summaries={auditSummaries} loading={summaryLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Device Status</h2>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          {dashboardData.devices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No devices registered yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.devices.map((device) => (
                <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${device.last_sync_at && (new Date() - new Date(device.last_sync_at)) < 3600000 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900">{device.device_name}</p>
                      <p className="text-xs text-gray-500">Last sync: {formatTime(device.last_sync_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${device.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {device.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Syncs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Syncs</h2>
            <RefreshCw className="w-5 h-5 text-blue-500" />
          </div>
          {dashboardData.recent_syncs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No syncs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.recent_syncs.slice(0, 5).map((sync, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{sync.location_name}</p>
                    <p className="text-xs text-gray-500">{sync.device_name} &bull; {sync.total_items} items &bull; {sync.total_quantity} qty</p>
                  </div>
                  <span className="text-xs text-gray-500">{formatTime(sync.synced_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditSummarySection({ summaries, loading }) {
  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit Summary by Client</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit Summary by Client</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No audit data available yet. Create sessions and import stock data to see summaries here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6" data-testid="audit-summary-section">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit Summary by Client</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaries.map(s => (
          <AuditSummaryCard key={s.client_id} summary={s} />
        ))}
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
    if (pct >= 98) return 'text-emerald-600 bg-emerald-50';
    if (pct >= 90) return 'text-blue-600 bg-blue-50';
    if (pct >= 75) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const accuracyColor = getAccuracyColor(s.accuracy_pct);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" data-testid={`audit-summary-card-${s.client_id}`}>
      {/* Card Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">{s.client_name || s.client_code || 'Unnamed Client'}</h3>
            {s.client_code && s.client_name && (
              <span className="text-xs text-gray-400 font-mono">{s.client_code}</span>
            )}
          </div>
          <div className={`px-2.5 py-1 rounded-lg text-sm font-bold ${accuracyColor}`}>
            {s.accuracy_pct.toFixed(1)}%
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>{s.total_sessions} session{s.total_sessions !== 1 ? 's' : ''}</span>
          <span className="text-gray-300">&bull;</span>
          <span>{s.active_sessions} active</span>
          <span className="text-gray-300">&bull;</span>
          <span>{s.locations_scanned} locations</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Expected</p>
            <p className="text-sm font-semibold text-gray-800">{s.expected_qty.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Physical</p>
            <p className="text-sm font-semibold text-gray-800">{s.physical_qty.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Variance</p>
            <p className={`text-sm font-bold flex items-center justify-center gap-0.5 ${varianceIsPositive ? 'text-emerald-600' : varianceIsNegative ? 'text-red-600' : 'text-gray-600'}`}>
              {varianceIsPositive && <TrendingUp className="w-3 h-3" />}
              {varianceIsNegative && <TrendingDown className="w-3 h-3" />}
              {s.variance_qty.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Accuracy Bar */}
        <div className="mt-3">
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all ${s.accuracy_pct >= 98 ? 'bg-emerald-500' : s.accuracy_pct >= 90 ? 'bg-blue-500' : s.accuracy_pct >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, s.accuracy_pct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Expandable Top Mismatches */}
      {s.top_mismatches && s.top_mismatches.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-5 py-2 flex items-center justify-between text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            data-testid={`toggle-mismatches-${s.client_id}`}
          >
            <span>Top {s.top_mismatches.length} Mismatches</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {expanded && (
            <div className="px-5 pb-3 space-y-1.5" data-testid={`mismatches-list-${s.client_id}`}>
              {s.top_mismatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                  <div className="truncate mr-2 flex-1">
                    <span className="font-mono text-gray-600">{m.barcode}</span>
                    <span className="text-gray-400 ml-1.5">{m.description}</span>
                  </div>
                  <span className={`font-semibold whitespace-nowrap ${m.diff_qty > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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

function StatsCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" data-testid={`stats-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
