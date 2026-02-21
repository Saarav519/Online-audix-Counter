import React, { useState, useEffect } from 'react';
import { 
  FileBarChart, 
  Download,
  Building2,
  FolderOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalReports() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [reportType, setReportType] = useState('bin-wise');
  const [reportData, setReportData] = useState(null);
  const [dailyProgress, setDailyProgress] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchSessions(selectedClient);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (selectedSession) {
      fetchReport();
      fetchDailyProgress();
    }
  }, [selectedSession, reportType]);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/clients`);
      if (response.ok) setClients(await response.json());
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchSessions = async (clientId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions?client_id=${clientId}`);
      if (response.ok) setSessions(await response.json());
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchReport = async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const endpoint = reportType === 'bin-wise' ? 'bin-wise' : 'detailed';
      const response = await fetch(`${BACKEND_URL}/api/portal/reports/${selectedSession}/${endpoint}`);
      if (response.ok) {
        setReportData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyProgress = async () => {
    if (!selectedSession) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/reports/${selectedSession}/daily-progress`);
      if (response.ok) {
        setDailyProgress(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch daily progress:', error);
    }
  };

  const exportCSV = () => {
    if (!reportData) return;

    let csv = '';
    
    if (reportType === 'bin-wise') {
      csv = 'Location,Stock Qty,Physical Qty,Difference Qty\n';
      reportData.report.forEach(row => {
        csv += `"${row.location}",${row.stock_qty},${row.physical_qty},${row.difference_qty}\n`;
      });
      csv += `"TOTAL",${reportData.totals.stock_qty},${reportData.totals.physical_qty},${reportData.totals.difference_qty}\n`;
    } else {
      csv = 'Location,Barcode,Description,MRP,Cost,Stock Qty,Stock Value,Physical Qty,Physical Value,Diff Qty,Diff Value\n';
      reportData.report.forEach(row => {
        csv += `"${row.location}","${row.barcode}","${row.description}",${row.mrp},${row.cost},${row.stock_qty},${row.stock_value},${row.physical_qty},${row.physical_value},${row.diff_qty},${row.diff_value}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${selectedSession}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported!');
  };

  const getVarianceIcon = (value) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getVarianceClass = (value) => {
    if (value > 0) return 'text-emerald-600 bg-emerald-50';
    if (value < 0) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Variance analysis and audit reports</p>
        </div>
        {reportData && (
          <Button onClick={exportCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSelectedSession('');
                setReportData(null);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Select Client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Audit Session</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              disabled={!selectedClient}
            >
              <option value="">Select Session</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>{session.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="bin-wise">Bin-wise Summary</option>
              <option value="detailed">Detailed Item-wise</option>
            </select>
          </div>
        </div>
      </div>

      {/* Daily Progress */}
      {selectedSession && dailyProgress.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-500" />
            Daily Progress
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Locations</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Items</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Quantity</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Devices</th>
                </tr>
              </thead>
              <tbody>
                {dailyProgress.map((day, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">{day.date}</td>
                    <td className="py-2 px-3 text-right">{day.locations}</td>
                    <td className="py-2 px-3 text-right">{day.items}</td>
                    <td className="py-2 px-3 text-right">{day.quantity}</td>
                    <td className="py-2 px-3">{day.devices.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Content */}
      {!selectedSession ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileBarChart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Select a client and session to view reports</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Loading report...</p>
        </div>
      ) : !reportData || reportData.report.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileBarChart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No data available for this session</p>
          <p className="text-sm text-gray-400 mt-1">Import expected stock and sync device data to generate reports</p>
        </div>
      ) : reportType === 'bin-wise' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Bin-wise Summary Report</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Location</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Stock Qty</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Physical Qty</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Difference</th>
                </tr>
              </thead>
              <tbody>
                {reportData.report.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium">{row.location}</td>
                    <td className="py-3 px-4 text-right">{row.stock_qty}</td>
                    <td className="py-3 px-4 text-right">{row.physical_qty}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${getVarianceClass(row.difference_qty)}`}>
                        {getVarianceIcon(row.difference_qty)}
                        {row.difference_qty > 0 ? '+' : ''}{row.difference_qty}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="py-3 px-4">TOTAL</td>
                  <td className="py-3 px-4 text-right">{reportData.totals.stock_qty}</td>
                  <td className="py-3 px-4 text-right">{reportData.totals.physical_qty}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${getVarianceClass(reportData.totals.difference_qty)}`}>
                      {getVarianceIcon(reportData.totals.difference_qty)}
                      {reportData.totals.difference_qty > 0 ? '+' : ''}{reportData.totals.difference_qty}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Detailed Item-wise Report</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Location</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Barcode</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Description</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">MRP</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Cost</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Stock Qty</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Stock Value</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Physical Qty</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Physical Value</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Qty</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Value</th>
                </tr>
              </thead>
              <tbody>
                {reportData.report.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 px-3">{row.location || '-'}</td>
                    <td className="py-2 px-3 font-mono text-xs">{row.barcode || '-'}</td>
                    <td className="py-2 px-3">{row.description || '-'}</td>
                    <td className="py-2 px-3 text-right">{(row.mrp || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">{(row.cost || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">{row.stock_qty || 0}</td>
                    <td className="py-2 px-3 text-right">{(row.stock_value || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">{row.physical_qty || 0}</td>
                    <td className="py-2 px-3 text-right">{(row.physical_value || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_qty || 0)}`}>
                        {(row.diff_qty || 0) > 0 ? '+' : ''}{row.diff_qty || 0}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value || 0)}`}>
                        {(row.diff_value || 0) > 0 ? '+' : ''}{(row.diff_value || 0).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-sm">
                <tr>
                  <td colSpan="5" className="py-3 px-3">TOTALS</td>
                  <td className="py-3 px-3 text-right">{reportData.totals?.stock_qty || 0}</td>
                  <td className="py-3 px-3 text-right">{(reportData.totals?.stock_value || 0).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">{reportData.totals?.physical_qty || 0}</td>
                  <td className="py-3 px-3 text-right">{(reportData.totals?.physical_value || 0).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded ${getVarianceClass(reportData.totals?.diff_qty || 0)}`}>
                      {(reportData.totals?.diff_qty || 0) > 0 ? '+' : ''}{reportData.totals?.diff_qty || 0}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded ${getVarianceClass(reportData.totals?.diff_value || 0)}`}>
                      {(reportData.totals?.diff_value || 0) > 0 ? '+' : ''}{(reportData.totals?.diff_value || 0).toFixed(2)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
