import React, { useState, useEffect } from 'react';
import { 
  FileBarChart, 
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalReports() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [reportType, setReportType] = useState('');
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
      const session = sessions.find(s => s.id === selectedSession);
      setSessionInfo(session);
      // Set default report type based on variance mode
      const mode = session?.variance_mode || 'bin-wise';
      if (mode === 'bin-wise') setReportType('bin-wise');
      else if (mode === 'barcode-wise') setReportType('barcode-wise');
      else if (mode === 'article-wise') setReportType('article-wise');
    } else {
      setSessionInfo(null);
      setReportData(null);
    }
  }, [selectedSession, sessions]);

  useEffect(() => {
    if (selectedSession && reportType) {
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
    if (!selectedSession || !reportType) return;
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/reports/${selectedSession}/${reportType}`);
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

  const getReportTypeOptions = () => {
    const mode = sessionInfo?.variance_mode || 'bin-wise';
    const options = [];
    
    if (mode === 'bin-wise') {
      options.push({ value: 'bin-wise', label: 'Bin-wise Summary' });
      options.push({ value: 'detailed', label: 'Detailed Item-wise' });
    } else if (mode === 'barcode-wise') {
      options.push({ value: 'barcode-wise', label: 'Barcode-wise Variance' });
    } else if (mode === 'article-wise') {
      options.push({ value: 'article-wise', label: 'Article-wise Variance' });
    }
    
    // Category summary is always available
    options.push({ value: 'category-summary', label: 'Category-wise Summary' });
    
    return options;
  };

  const exportCSV = () => {
    if (!reportData) return;

    let csv = '';
    const rows = reportData.report || [];
    
    if (reportType === 'bin-wise') {
      csv = 'Location,Stock Qty,Physical Qty,Difference,Accuracy %,Remarks\n';
      rows.forEach(row => {
        csv += `"${row.location}",${row.stock_qty},${row.physical_qty},${row.difference_qty},${row.accuracy_pct}%,"${row.remark}"\n`;
      });
      const t = reportData.totals;
      csv += `"TOTAL",${t.stock_qty},${t.physical_qty},${t.difference_qty},${t.accuracy_pct}%,""\n`;
    } else if (reportType === 'detailed') {
      csv = 'Location,Barcode,Description,Category,MRP,Cost,Stock Qty,Stock Value,Physical Qty,Physical Value,Diff Qty,Diff Value,Accuracy %,Remarks\n';
      rows.forEach(row => {
        csv += `"${row.location}","${row.barcode}","${row.description}","${row.category}",${row.mrp},${row.cost},${row.stock_qty},${row.stock_value},${row.physical_qty},${row.physical_value},${row.diff_qty},${row.diff_value},${row.accuracy_pct}%,"${row.remark}"\n`;
      });
    } else if (reportType === 'barcode-wise') {
      csv = 'Barcode,Description,Category,MRP,Cost,Stock Qty,Stock Value,Physical Qty,Physical Value,Diff Qty,Diff Value,Accuracy %,Remarks\n';
      rows.forEach(row => {
        csv += `"${row.barcode}","${row.description}","${row.category}",${row.mrp},${row.cost},${row.stock_qty},${row.stock_value},${row.physical_qty},${row.physical_value},${row.diff_qty},${row.diff_value},${row.accuracy_pct}%,"${row.remark}"\n`;
      });
    } else if (reportType === 'article-wise') {
      csv = 'Article Code,Article Name,Category,Barcodes,MRP,Cost,Stock Qty,Stock Value,Physical Qty,Physical Value,Diff Qty,Diff Value,Accuracy %,Remarks\n';
      rows.forEach(row => {
        csv += `"${row.article_code}","${row.article_name}","${row.category}","${(row.barcodes || []).join('; ')}",${row.mrp},${row.cost},${row.stock_qty},${row.stock_value},${row.physical_qty},${row.physical_value},${row.diff_qty},${row.diff_value},${row.accuracy_pct}%,"${row.remark}"\n`;
      });
    } else if (reportType === 'category-summary') {
      csv = 'Category,Items,Stock Qty,Stock Value,Physical Qty,Physical Value,Diff Qty,Diff Value,Accuracy %,Remarks\n';
      rows.forEach(row => {
        csv += `"${row.category}",${row.item_count},${row.stock_qty},${row.stock_value},${row.physical_qty},${row.physical_value},${row.diff_qty},${row.diff_value},${row.accuracy_pct}%,"${row.remark}"\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${selectedSession}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report exported!');
  };

  const getVarianceIcon = (value) => {
    if (value > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    if (value < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  };

  const getVarianceClass = (value) => {
    if (value > 0) return 'text-emerald-600 bg-emerald-50';
    if (value < 0) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getAccuracyClass = (pct) => {
    if (pct >= 98) return 'text-emerald-700 bg-emerald-50';
    if (pct >= 90) return 'text-blue-700 bg-blue-50';
    if (pct >= 75) return 'text-amber-700 bg-amber-50';
    return 'text-red-700 bg-red-50';
  };

  const getRemarkIcon = (remark) => {
    if (remark.includes('Exact Match')) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
    if (remark.includes('Critical') || remark.includes('Not in Master') || remark.includes('Not Scanned')) return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
    if (remark.includes('Shortage') || remark.includes('Surplus')) return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
  };

  // Report type options based on session's variance mode
  const reportOptions = getReportTypeOptions();

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
                <option key={session.id} value={session.id}>
                  {session.name} ({session.variance_mode === 'bin-wise' ? 'Bin' : session.variance_mode === 'barcode-wise' ? 'Barcode' : session.variance_mode === 'article-wise' ? 'Article' : 'Bin'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              disabled={!selectedSession}
            >
              {reportOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {sessionInfo && (
            <div className="flex items-end">
              <div className="px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700 font-medium w-full text-center">
                Mode: {sessionInfo.variance_mode === 'bin-wise' ? 'Bin-wise' : sessionInfo.variance_mode === 'barcode-wise' ? 'Barcode-wise' : 'Article-wise'}
              </div>
            </div>
          )}
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
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading report...</p>
        </div>
      ) : !reportData || (reportData.report || []).length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileBarChart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No data available for this session</p>
          <p className="text-sm text-gray-400 mt-1">Import master stock and sync device data to generate reports</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {reportData.totals && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <SummaryCard label="Stock Qty" value={reportData.totals.stock_qty || 0} />
              <SummaryCard label="Physical Qty" value={reportData.totals.physical_qty || 0} />
              <SummaryCard label="Difference" value={reportData.totals.diff_qty || reportData.totals.difference_qty || 0} variant={true} />
              <SummaryCard label="Accuracy" value={`${reportData.totals.accuracy_pct || 0}%`} isAccuracy={true} pct={reportData.totals.accuracy_pct || 0} />
              {reportData.totals.diff_value !== undefined && (
                <SummaryCard label="Value Diff" value={`${(reportData.totals.diff_value || 0).toFixed(2)}`} variant={true} />
              )}
            </div>
          )}

          {/* Report Table */}
          {reportType === 'bin-wise' && <BinWiseTable data={reportData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} />}
          {reportType === 'detailed' && <DetailedTable data={reportData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} />}
          {reportType === 'barcode-wise' && <BarcodeWiseTable data={reportData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} />}
          {reportType === 'article-wise' && <ArticleWiseTable data={reportData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} />}
          {reportType === 'category-summary' && <CategorySummaryTable data={reportData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} />}
        </>
      )}
    </div>
  );
}

// ============ Summary Card ============
function SummaryCard({ label, value, variant, isAccuracy, pct }) {
  let colorClass = 'text-gray-900';
  if (variant) {
    const numVal = typeof value === 'string' ? parseFloat(value) : value;
    if (numVal > 0) colorClass = 'text-emerald-600';
    else if (numVal < 0) colorClass = 'text-red-600';
  }
  if (isAccuracy) {
    if (pct >= 98) colorClass = 'text-emerald-600';
    else if (pct >= 90) colorClass = 'text-blue-600';
    else if (pct >= 75) colorClass = 'text-amber-600';
    else colorClass = 'text-red-600';
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

// ============ Bin-wise Table ============
function BinWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Bin-wise Summary Report</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Location</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Stock Qty</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Physical Qty</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Difference</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Accuracy %</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600 min-w-[250px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{row.location || '-'}</td>
                <td className="py-3 px-4 text-right">{row.stock_qty}</td>
                <td className="py-3 px-4 text-right">{row.physical_qty}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.difference_qty)}`}>
                    {getVarianceIcon(row.difference_qty)}
                    {row.difference_qty > 0 ? '+' : ''}{row.difference_qty}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span>{row.remark}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td className="py-3 px-4">TOTAL</td>
              <td className="py-3 px-4 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-4 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-4 text-right">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(data.totals.difference_qty)}`}>
                  {getVarianceIcon(data.totals.difference_qty)}
                  {data.totals.difference_qty > 0 ? '+' : ''}{data.totals.difference_qty}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>
                  {data.totals.accuracy_pct}%
                </span>
              </td>
              <td className="py-3 px-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============ Detailed Item-wise Table ============
function DetailedTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Detailed Item-wise Report</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Location</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Barcode</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Description</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Category</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">MRP</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Cost</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Stock</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Physical</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Diff</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Accuracy</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[200px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{row.location || '-'}</td>
                <td className="py-2 px-3 font-mono">{row.barcode || '-'}</td>
                <td className="py-2 px-3">{row.description || '-'}</td>
                <td className="py-2 px-3">{row.category || '-'}</td>
                <td className="py-2 px-3 text-right">{(row.mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{(row.cost || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1 text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate max-w-[200px]" title={row.remark}>{row.remark}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Barcode-wise Table ============
function BarcodeWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          Barcode-wise Variance Report
        </h3>
        <p className="text-xs text-gray-500 mt-1">Quantities aggregated across all locations per barcode</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Barcode</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Description</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Category</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">MRP</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Cost</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Stock Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Physical Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Value</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Accuracy</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[220px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-mono text-xs">{row.barcode}</td>
                <td className="py-2 px-3">{row.description || '-'}</td>
                <td className="py-2 px-3">
                  {row.category ? (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{row.category}</span>
                  ) : '-'}
                </td>
                <td className="py-2 px-3 text-right">{(row.mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{(row.cost || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                <td className="py-2 px-3 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {getVarianceIcon(row.diff_qty)}
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value)}`}>
                    {row.diff_value > 0 ? '+' : ''}{(row.diff_value || 0).toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate max-w-[200px]" title={row.remark}>{row.remark}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td colSpan="5" className="py-3 px-3">TOTALS</td>
              <td className="py-3 px-3 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-3 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value)}`}>
                  {(data.totals.diff_value || 0).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>
                  {data.totals.accuracy_pct}%
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============ Article-wise Table ============
function ArticleWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon }) {
  const [expandedRows, setExpandedRows] = React.useState(new Set());

  const toggleRow = (index) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-500" />
          Article-wise Variance Report
        </h3>
        <p className="text-xs text-gray-500 mt-1">Barcodes grouped by article, variance at article level. Click on a row to view barcodes.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 py-3 px-2"></th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Article Code</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Article Name</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600">Category</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Barcodes</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Stock Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Physical Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Qty</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Diff Value</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600">Accuracy</th>
              <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[220px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <React.Fragment key={i}>
                <tr 
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${row.article_code === 'UNMAPPED' ? 'bg-red-50/50' : ''}`}
                  onClick={() => toggleRow(i)}
                >
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block transition-transform duration-200 text-gray-400 ${expandedRows.has(i) ? 'rotate-90' : ''}`}>
                      &#9654;
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs font-medium">{row.article_code}</td>
                  <td className="py-2 px-3">{row.article_name || '-'}</td>
                  <td className="py-2 px-3">
                    {row.category ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${row.category === 'Unmapped' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>{row.category}</span>
                    ) : '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className="text-xs text-blue-600 font-medium underline">{row.barcode_count}</span>
                  </td>
                  <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                  <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                      {getVarianceIcon(row.diff_qty)}
                      {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value)}`}>
                      {row.diff_value > 0 ? '+' : ''}{(row.diff_value || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                      {row.accuracy_pct}%
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      {getRemarkIcon(row.remark)}
                      <span className="truncate max-w-[200px]" title={row.remark}>{row.remark}</span>
                    </div>
                  </td>
                </tr>
                {expandedRows.has(i) && (
                  <tr className="bg-purple-50/50">
                    <td colSpan="11" className="py-2 px-6">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-purple-700 mr-1">Barcodes:</span>
                        {(row.barcodes || []).map((bc, j) => (
                          <span key={j} className="inline-flex items-center px-2.5 py-1 bg-white border border-purple-200 rounded-md text-xs font-mono text-purple-800 shadow-sm">
                            {bc}
                          </span>
                        ))}
                        {(!row.barcodes || row.barcodes.length === 0) && (
                          <span className="text-xs text-gray-400 italic">No barcodes</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td className="py-3 px-2"></td>
              <td colSpan="4" className="py-3 px-3">TOTALS</td>
              <td className="py-3 px-3 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-3 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value)}`}>
                  {(data.totals.diff_value || 0).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>
                  {data.totals.accuracy_pct}%
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============ Category Summary Table ============
function CategorySummaryTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-500" />
          Category-wise Summary
        </h3>
        <p className="text-xs text-gray-500 mt-1">Aggregated variance by product category</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Category</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Items</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Stock Qty</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Stock Value</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Physical Qty</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Physical Value</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Diff Qty</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Diff Value</th>
              <th className="text-right py-3 px-4 font-medium text-gray-600">Accuracy</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600 min-w-[220px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">
                  <span className={`px-2 py-1 rounded text-xs ${row.category === 'Unmapped' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {row.category}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-gray-500">{row.item_count}</td>
                <td className="py-3 px-4 text-right">{row.stock_qty}</td>
                <td className="py-3 px-4 text-right">{row.stock_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="py-3 px-4 text-right">{row.physical_qty}</td>
                <td className="py-3 px-4 text-right">{row.physical_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {getVarianceIcon(row.diff_qty)}
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value)}`}>
                    {row.diff_value > 0 ? '+' : ''}{row.diff_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate max-w-[200px]" title={row.remark}>{row.remark}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td className="py-3 px-4">TOTAL</td>
              <td className="py-3 px-4 text-right">{data.totals.item_count}</td>
              <td className="py-3 px-4 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-4 text-right">{data.totals.stock_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td className="py-3 px-4 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-4 text-right">{data.totals.physical_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value)}`}>
                  {data.totals.diff_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>
                  {data.totals.accuracy_pct}%
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
