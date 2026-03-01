import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Clock,
  Package,
  Filter
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalConflicts() {
  const [conflicts, setConflicts] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedConflict, setExpandedConflict] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchClients = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients`);
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const url = selectedClient
        ? `${BACKEND_URL}/api/audit/portal/sessions?client_id=${selectedClient}`
        : `${BACKEND_URL}/api/audit/portal/sessions`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  }, [selectedClient]);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${BACKEND_URL}/api/audit/portal/conflicts?`;
      if (selectedClient) url += `client_id=${selectedClient}&`;
      if (selectedSession) url += `session_id=${selectedSession}&`;
      if (statusFilter) url += `status=${statusFilter}&`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setConflicts(data);
      }
    } catch (error) {
      console.error('Failed to fetch conflicts:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedClient, selectedSession, statusFilter]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const handleApprove = async (conflictId, entryId, deviceName) => {
    if (!window.confirm(`Approve entry from "${deviceName}"? This will add its data to the variance and reject all other entries.`)) return;
    setActionLoading(`${conflictId}-${entryId}`);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/conflicts/${conflictId}/approve/${entryId}`, {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        fetchConflicts();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to approve');
      }
    } catch (error) {
      toast.error('Failed to approve entry');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAll = async (conflictId, locationName) => {
    if (!window.confirm(`Reject ALL entries for "${locationName}"? The location will go back to Pending (needs re-scan).`)) return;
    setActionLoading(`${conflictId}-reject-all`);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/conflicts/${conflictId}/reject-all`, {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        fetchConflicts();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to reject');
      }
    } catch (error) {
      toast.error('Failed to reject entries');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  const pendingCount = conflicts.filter(c => c.status === 'pending').length;
  const resolvedCount = conflicts.filter(c => c.status === 'resolved').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conflict Resolution</h1>
          <p className="text-gray-500">Resolve duplicate location scans from multiple devices</p>
        </div>
        <Button onClick={fetchConflicts} variant="outline" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
            <select
              value={selectedClient}
              onChange={(e) => { setSelectedClient(e.target.value); setSelectedSession(''); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Audit Session</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Sessions</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-sm font-medium">
          <AlertTriangle className="w-4 h-4" />
          {statusFilter === 'pending' ? conflicts.length : pendingCount} Pending
        </span>
        {statusFilter !== 'pending' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {resolvedCount} Resolved
          </span>
        )}
      </div>

      {/* Conflicts List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-gray-400" />
          Loading conflicts...
        </div>
      ) : conflicts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Conflicts Found</h3>
          <p className="text-gray-500 text-sm">
            {statusFilter === 'pending' ? 'All duplicate scans have been resolved.' : 'No conflicts match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              expanded={expandedConflict === conflict.id}
              onToggle={() => setExpandedConflict(expandedConflict === conflict.id ? null : conflict.id)}
              onApprove={handleApprove}
              onRejectAll={handleRejectAll}
              actionLoading={actionLoading}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConflictCard({ conflict, expanded, onToggle, onApprove, onRejectAll, actionLoading, formatDate }) {
  const isPending = conflict.status === 'pending';
  const entries = conflict.entries || [];

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${isPending ? 'border-red-200' : 'border-gray-200'} overflow-hidden`}>
      {/* Header */}
      <div
        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isPending ? 'bg-red-50/40' : 'bg-gray-50/40'}`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPending ? 'bg-red-100' : 'bg-emerald-100'}`}>
              {isPending ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{conflict.location_name}</h3>
              <p className="text-xs text-gray-500">
                {conflict.client_name} → {conflict.session_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              isPending ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isPending ? 'Pending Review' : 'Resolved'}
            </span>
            <span className="text-xs text-gray-400">
              {entries.length} entries
            </span>
            {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Compare entries from different scanners and approve the correct one:
              </p>
              {isPending && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRejectAll(conflict.id, conflict.location_name)}
                  disabled={actionLoading === `${conflict.id}-reject-all`}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject All (Re-scan Needed)
                </Button>
              )}
            </div>

            {/* Entries Grid */}
            <div className={`grid gap-4 ${entries.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {entries.map((entry, idx) => (
                <EntryCard
                  key={entry.entry_id}
                  entry={entry}
                  index={idx}
                  conflictId={conflict.id}
                  isPending={isPending}
                  onApprove={onApprove}
                  actionLoading={actionLoading}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </div>

          {/* Resolved Info */}
          {!isPending && conflict.resolved_at && (
            <div className="px-4 pb-4">
              <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
                Resolved by <strong>{conflict.resolved_by || 'admin'}</strong> on {formatDate(conflict.resolved_at)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, index, conflictId, isPending, onApprove, actionLoading, formatDate }) {
  const isApproved = entry.status === 'approved';
  const isRejected = entry.status === 'rejected';
  const items = entry.items || [];
  const loadingKey = `${conflictId}-${entry.entry_id}`;

  const borderColor = isApproved
    ? 'border-emerald-300 bg-emerald-50/50'
    : isRejected
    ? 'border-red-200 bg-red-50/30 opacity-60'
    : 'border-gray-200';

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${borderColor}`}>
      {/* Entry Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900">{entry.device_name}</span>
            <span className="text-xs text-gray-400">Entry {index + 1}</span>
          </div>
          {isApproved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-3 h-3" /> Approved
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
              <XCircle className="w-3 h-3" /> Rejected
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(entry.synced_at)}
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-3 h-3" />
            {entry.total_items} items • {entry.total_quantity} qty
          </span>
          {entry.is_empty && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              Empty Bin
            </span>
          )}
        </div>
      </div>

      {/* Items Table */}
      {items.length > 0 && (
        <div className="max-h-60 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left py-2 px-4 font-medium text-gray-600">Barcode</th>
                <th className="text-left py-2 px-4 font-medium text-gray-600">Product</th>
                <th className="text-right py-2 px-4 font-medium text-gray-600">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1.5 px-4 font-mono text-gray-700">{item.barcode}</td>
                  <td className="py-1.5 px-4 text-gray-600">{item.product_name || '-'}</td>
                  <td className="py-1.5 px-4 text-right font-semibold">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="py-2 px-4" colSpan={2}>Total</td>
                <td className="py-2 px-4 text-right">{entry.total_quantity}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {entry.is_empty && items.length === 0 && (
        <div className="p-6 text-center text-gray-500 text-sm">
          <Package className="w-8 h-8 mx-auto mb-2 text-amber-400" />
          Location marked as Empty Bin
          {entry.empty_remarks && (
            <p className="text-xs text-gray-400 mt-1">{entry.empty_remarks}</p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {isPending && (
        <div className="p-3 border-t border-gray-100 bg-gray-50/50">
          <Button
            onClick={() => onApprove(conflictId, entry.entry_id, entry.device_name)}
            disabled={actionLoading === loadingKey}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
          >
            {actionLoading === loadingKey ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Approve This Entry
          </Button>
        </div>
      )}
    </div>
  );
}
