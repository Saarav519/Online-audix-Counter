import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  XCircle,
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X,
  ChevronDown,
  PackageX,
  Clock,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Columns
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// ============ Variance Category Filter Options ============
const VARIANCE_CATEGORIES = [
  { value: 'all', label: 'All', description: 'Show all items' },
  { value: 'negative', label: 'Overall Negative', description: 'Physical < Stock (Shortage)' },
  { value: 'positive', label: 'Overall Positive', description: 'Physical > Stock (Surplus)' },
  { value: 'matched', label: 'Overall Matched', description: 'Physical = Stock' },
  { value: 'in_system_not_found', label: 'In System, Not Found', description: 'Stock > 0, Physical = 0' },
  { value: 'found_not_in_system', label: 'Found, Not In System', description: 'Stock = 0, Physical > 0' },
];

// Filter rows by variance category
function filterByVarianceCategory(rows, category) {
  if (!rows || category === 'all') return rows;
  return rows.filter(row => {
    const stockQty = row.stock_qty || 0;
    const finalQty = row.final_qty !== undefined ? row.final_qty : (row.physical_qty || 0);
    const diffQty = row.diff_qty !== undefined ? row.diff_qty : (row.difference_qty !== undefined ? row.difference_qty : finalQty - stockQty);
    switch (category) {
      case 'negative': return diffQty < 0;
      case 'positive': return diffQty > 0;
      case 'matched': return diffQty === 0 && (stockQty > 0 || finalQty > 0);
      case 'in_system_not_found': return stockQty > 0 && finalQty === 0;
      case 'found_not_in_system': return (stockQty === 0) && finalQty > 0;
      default: return true;
    }
  });
}

// Numeric columns that support < 0 / > 0 / = 0 filtering
const NUMERIC_COLUMNS = new Set([
  'stock_qty', 'physical_qty', 'difference_qty', 'diff_qty', 'accuracy_pct',
  'mrp', 'cost', 'stock_value_mrp', 'stock_value_cost', 'physical_value_mrp', 'physical_value_cost',
  'diff_value_mrp', 'diff_value_cost', 'final_value_mrp', 'final_value_cost',
  'item_count', 'barcode_count', 'reco_qty', 'final_qty'
]);

const NUMERIC_CONDITIONS = [
  { value: 'lt0', label: '< 0', desc: 'Less than zero' },
  { value: 'eq0', label: '= 0', desc: 'Equal to zero' },
  { value: 'gt0', label: '> 0', desc: 'Greater than zero' },
];

// Recalculate totals from filtered rows
function recalcTotals(rows, reportType) {
  if (!rows || rows.length === 0) return null;
  const totals = { stock_qty: 0, physical_qty: 0, reco_qty: 0, final_qty: 0, diff_qty: 0, difference_qty: 0, accuracy_pct: 0,
    stock_value_mrp: 0, stock_value_cost: 0, physical_value_mrp: 0, physical_value_cost: 0,
    final_value_mrp: 0, final_value_cost: 0, diff_value_mrp: 0, diff_value_cost: 0, item_count: 0 };
  rows.forEach(row => {
    totals.stock_qty += (row.stock_qty || 0);
    totals.physical_qty += (row.physical_qty || 0);
    totals.reco_qty += (row.reco_qty || 0);
    totals.final_qty += (row.final_qty || row.physical_qty || 0);
    const d = row.diff_qty !== undefined ? row.diff_qty : (row.difference_qty || 0);
    totals.diff_qty += d;
    totals.difference_qty += d;
    totals.stock_value_mrp += (row.stock_value_mrp || 0);
    totals.stock_value_cost += (row.stock_value_cost || 0);
    totals.physical_value_mrp += (row.physical_value_mrp || 0);
    totals.physical_value_cost += (row.physical_value_cost || 0);
    totals.final_value_mrp += (row.final_value_mrp || 0);
    totals.final_value_cost += (row.final_value_cost || 0);
    totals.diff_value_mrp += (row.diff_value_mrp || 0);
    totals.diff_value_cost += (row.diff_value_cost || 0);
    totals.item_count += (row.item_count || 0);
  });
  totals.accuracy_pct = totals.stock_qty > 0 ? Math.round((Math.min(totals.final_qty, totals.stock_qty) / totals.stock_qty) * 1000) / 10 : (totals.final_qty === 0 ? 100 : 0);
  return totals;
}

// ============ Column Filter Dropdown ============
function ColumnFilterDropdown({ column, allValues, activeFilters, onFilterChange, numericFilters, onNumericFilterChange, onClose }) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const isNumeric = NUMERIC_COLUMNS.has(column);
  const currentNumeric = numericFilters?.[column] || null;
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  // INCLUSION MODEL:
  const currentChecked = activeFilters[column];
  const isDefaultState = currentChecked === undefined || currentChecked === null;
  
  const filteredValues = useMemo(() => {
    if (!search) return allValues;
    const lower = search.toLowerCase();
    return allValues.filter(v => String(v).toLowerCase().includes(lower));
  }, [allValues, search]);

  useEffect(() => {
    // Calculate position relative to the trigger button
    if (dropdownRef.current) {
      const parent = dropdownRef.current.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        const dropH = 384; // max-h-96 = 24rem = 384px
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosition({
          top: spaceBelow < dropH ? Math.max(8, rect.top - dropH) : rect.bottom + 4,
          left: Math.min(rect.left, window.innerWidth - 272)
        });
      }
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const isChecked = (strVal) => {
    if (isDefaultState) return true;
    return currentChecked.includes(strVal);
  };

  const toggleValue = (value) => {
    const strVal = String(value);
    if (isDefaultState) {
      const newChecked = allValues.map(String).filter(v => v !== strVal);
      onFilterChange(column, newChecked);
    } else {
      const current = new Set(currentChecked);
      if (current.has(strVal)) {
        current.delete(strVal);
      } else {
        current.add(strVal);
      }
      const arr = Array.from(current);
      if (arr.length === allValues.length) {
        onFilterChange(column, null);
      } else {
        onFilterChange(column, arr);
      }
    }
  };

  const selectAll = () => onFilterChange(column, null);
  const clearAll = () => onFilterChange(column, []);

  const toggleNumericCondition = (condition) => {
    if (currentNumeric === condition) {
      onNumericFilterChange(column, null); // toggle off
    } else {
      onNumericFilterChange(column, condition);
    }
  };

  return (
    <div ref={dropdownRef} className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] w-64 max-h-96 flex flex-col" style={{ top: position.top, left: position.left }} onClick={(e) => e.stopPropagation()}>
      {/* Numeric Quick Filter (for number columns) */}
      {isNumeric && (
        <div className="p-2 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Value Filter</p>
          <div className="flex gap-1.5">
            {NUMERIC_CONDITIONS.map(cond => (
              <button
                key={cond.value}
                onClick={() => toggleNumericCondition(cond.value)}
                title={cond.desc}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all border ${
                  currentNumeric === cond.value
                    ? cond.value === 'lt0' ? 'bg-red-500 text-white border-red-500'
                      : cond.value === 'gt0' ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cond.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Checkbox Value Filter */}
      <div className="p-2 border-b border-gray-100">
        {isNumeric && <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Value List</p>}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Search & press Enter..." value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                const matchedValues = filteredValues.map(String);
                if (matchedValues.length > 0) {
                  onFilterChange(column, matchedValues);
                  onClose();
                }
              }
            }}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-300" autoFocus />
        </div>
        <div className="flex gap-2 mt-1.5">
          <button className="text-xs text-emerald-600 hover:underline" onClick={selectAll}>Select All</button>
          <button className="text-xs text-red-500 hover:underline" onClick={clearAll}>Clear All</button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 p-1.5">
        {filteredValues.map((val, i) => {
          const strVal = String(val);
          const checked = isChecked(strVal);
          return (
            <label key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs">
              <input type="checkbox" checked={checked} onChange={() => toggleValue(strVal)} className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 w-3.5 h-3.5" />
              <span className="truncate">{strVal || '(empty)'}</span>
            </label>
          );
        })}
        {filteredValues.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No values found</p>}
      </div>
    </div>
  );
}

// ============ Column Settings Panel ============
function ColumnSettingsPanel({ columns, hiddenColumns, frozenColumns, onToggleVisibility, onToggleFreeze, onShowAll, onReset }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hiddenCount = hiddenColumns.size;
  const frozenCount = frozenColumns.size;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        onClick={() => setOpen(!open)}
        variant="outline"
        size="sm"
        className={`gap-1.5 ${hiddenCount > 0 || frozenCount > 0 ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : ''}`}
      >
        <Columns className="w-4 h-4" />
        Columns
        {hiddenCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">{hiddenCount} hidden</span>}
        {frozenCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">{frozenCount} pinned</span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Column Settings</span>
            <div className="flex gap-1">
              <button onClick={onShowAll} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-0.5 rounded hover:bg-emerald-50">Show All</button>
              <button onClick={onReset} className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-0.5 rounded hover:bg-gray-100">Reset</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {columns.map(col => {
              const isHidden = hiddenColumns.has(col.key);
              const isFrozen = frozenColumns.has(col.key);
              return (
                <div key={col.key} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 ${isHidden ? 'opacity-50' : ''}`}>
                  <button
                    onClick={() => onToggleVisibility(col.key)}
                    className={`p-1 rounded transition-colors ${isHidden ? 'text-gray-300 hover:text-gray-500' : 'text-emerald-500 hover:text-emerald-600'}`}
                    title={isHidden ? 'Show column' : 'Hide column'}
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <span className={`flex-1 text-sm ${isHidden ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{col.label}</span>
                  <button
                    onClick={() => onToggleFreeze(col.key)}
                    className={`p-1 rounded transition-colors ${isFrozen ? 'text-blue-500 hover:text-blue-600 bg-blue-50' : 'text-gray-300 hover:text-gray-500'}`}
                    title={isFrozen ? 'Unfreeze column' : 'Freeze column'}
                    disabled={isHidden}
                  >
                    {isFrozen ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 bg-gray-50 border-t">
            <p className="text-xs text-gray-400">
              <Eye className="w-3 h-3 inline mr-1" />Show/Hide &nbsp;
              <Pin className="w-3 h-3 inline mr-1" />Freeze column
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Sortable + Filterable Header ============
function SortableHeader({ column, label, align, sortConfig, onSort, allValues, activeFilters, onFilterChange, numericFilters, onNumericFilterChange, className }) {
  const [showFilter, setShowFilter] = useState(false);
  const currentFilter = activeFilters[column];
  const hasCheckboxFilter = currentFilter !== undefined && currentFilter !== null && currentFilter.length > 0 && currentFilter.length < (allValues || []).length;
  const hasNumericFilter = numericFilters?.[column] != null;
  const isFiltered = hasCheckboxFilter || hasNumericFilter;
  const isSorted = sortConfig.key === column;
  
  return (
    <th data-col={column} className={`py-3 px-3 font-medium text-gray-600 relative group whitespace-nowrap text-xs ${align === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}>
      <div className={`flex items-center gap-1 w-full ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <button className="flex items-center gap-0.5 hover:text-emerald-600 transition-colors" onClick={() => onSort(column)}>
          <span className="select-none">{label}</span>
          {isSorted ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-emerald-500" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
        {allValues && allValues.length > 0 && (
          <button className={`ml-0.5 p-0.5 rounded hover:bg-gray-100 ${isFiltered ? 'text-emerald-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'} transition-all`} onClick={(e) => { e.stopPropagation(); setShowFilter(!showFilter); }}>
            <Filter className="w-3 h-3" />
          </button>
        )}
      </div>
      {showFilter && (
        <ColumnFilterDropdown column={column} allValues={allValues} activeFilters={activeFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} onClose={() => setShowFilter(false)} />
      )}
    </th>
  );
}

export default function PortalReports() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [reportType, setReportType] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [varianceCategory, setVarianceCategory] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnFilters, setColumnFilters] = useState({});
  const [numericFilters, setNumericFilters] = useState({});
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [frozenColumns, setFrozenColumns] = useState(new Set());
  const tableContainerRef = useRef(null);

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
      if (selectedSession === '__consolidated__') {
        // Consolidated mode: determine primary variance mode from client's sessions
        const modes = sessions.map(s => s.variance_mode || 'bin-wise');
        const modeCount = {};
        modes.forEach(m => { modeCount[m] = (modeCount[m] || 0) + 1; });
        const primaryMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'bin-wise';
        setSessionInfo({ variance_mode: primaryMode, name: 'All Sessions (Consolidated)', session_modes: [...new Set(modes)] });
        if (primaryMode === 'barcode-wise') setReportType('barcode-wise');
        else if (primaryMode === 'article-wise') setReportType('article-wise');
        else setReportType('bin-wise');
      } else {
        const session = sessions.find(s => s.id === selectedSession);
        setSessionInfo(session);
        // Set default report type based on variance mode
        const mode = session?.variance_mode || 'bin-wise';
        if (mode === 'bin-wise') setReportType('bin-wise');
        else if (mode === 'barcode-wise') setReportType('barcode-wise');
        else if (mode === 'article-wise') setReportType('article-wise');
      }
    } else {
      setSessionInfo(null);
      setReportData(null);
    }
  }, [selectedSession, sessions]);

  // Reset filters when session or report type changes
  useEffect(() => {
    setVarianceCategory('all');
    setSortConfig({ key: null, direction: 'asc' });
    setColumnFilters({});
    setNumericFilters({});
  }, [selectedSession, reportType]);

  useEffect(() => {
    if (selectedSession && reportType) {
      fetchReport();
    }
  }, [selectedSession, reportType]);

  // Sort handler
  const handleSort = useCallback((column) => {
    setSortConfig(prev => ({
      key: column,
      direction: prev.key === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  // Column filter handler (INCLUSION MODEL)
  // values = null → remove filter (all shown)
  // values = [] → all unchecked (no filter, all shown)
  // values = [items] → inclusion filter (only those items shown)
  const handleColumnFilter = useCallback((column, values) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (values === null || values === undefined) {
        delete next[column]; // Remove filter entirely
      } else {
        next[column] = values;
      }
      return next;
    });
  }, []);

  // Numeric filter handler: 'lt0' | 'gt0' | 'eq0' | null
  const handleNumericFilter = useCallback((column, condition) => {
    setNumericFilters(prev => {
      const next = { ...prev };
      if (condition === null || condition === undefined) {
        delete next[column];
      } else {
        next[column] = condition;
      }
      return next;
    });
  }, []);

  // Apply all filters: variance category → column filters → sort
  const filteredData = useMemo(() => {
    if (!reportData) return null;
    // For pending-locations and empty-bins, return data as-is (no filtering needed)
    if (reportType === 'pending-locations' || reportType === 'empty-bins') return reportData;
    if (!reportData.report) return null;
    let rows = [...reportData.report];

    // Step 1: Variance category filter
    rows = filterByVarianceCategory(rows, varianceCategory);

    // Step 2: Column filters (INCLUSION MODEL)
    // Only filter when there's a non-empty inclusion list
    Object.entries(columnFilters).forEach(([col, checkedVals]) => {
      if (checkedVals && checkedVals.length > 0) {
        // Inclusion filter: only show rows whose value is in the checked list
        rows = rows.filter(row => {
          const val = String(row[col] !== undefined && row[col] !== null ? row[col] : '');
          return checkedVals.includes(val);
        });
      }
      // If checkedVals is null/undefined/[] → no filter → all data shown
    });

    // Step 3: Numeric filters (< 0, > 0, = 0)
    Object.entries(numericFilters).forEach(([col, condition]) => {
      if (condition) {
        rows = rows.filter(row => {
          const val = Number(row[col]) || 0;
          switch (condition) {
            case 'lt0': return val < 0;
            case 'gt0': return val > 0;
            case 'eq0': return val === 0;
            default: return true;
          }
        });
      }
    });

    // Step 3: Sort
    if (sortConfig.key) {
      rows.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        // Handle nulls
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';
        // Numeric sort
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        // String sort
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Recalculate totals for filtered data
    const totals = recalcTotals(rows, reportType);

    return { report: rows, totals: totals || reportData.totals, summary: reportData.summary };
  }, [reportData, varianceCategory, columnFilters, numericFilters, sortConfig, reportType]);

  // Get unique values for a column (from unfiltered data, for column filter dropdowns)
  const getColumnValues = useCallback((column) => {
    if (!reportData || !reportData.report) return [];
    const vals = new Set();
    reportData.report.forEach(row => {
      const v = row[column];
      vals.add(v !== undefined && v !== null ? String(v) : '');
    });
    return Array.from(vals).sort();
  }, [reportData]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (varianceCategory !== 'all') count++;
    // Only count column filters that have actual inclusions (not empty arrays)
    Object.values(columnFilters).forEach(v => {
      if (v && v.length > 0) count++;
    });
    // Count numeric filters
    count += Object.keys(numericFilters).length;
    return count;
  }, [varianceCategory, columnFilters, numericFilters]);

  const clearAllFilters = () => {
    setVarianceCategory('all');
    setColumnFilters({});
    setNumericFilters({});
    setSortConfig({ key: null, direction: 'asc' });
  };

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
      let response;
      if (selectedSession === '__consolidated__') {
        // Consolidated: fetch from all sessions endpoint
        response = await fetch(`${BACKEND_URL}/api/portal/reports/consolidated/${selectedClient}/${reportType}`);
      } else {
        response = await fetch(`${BACKEND_URL}/api/portal/reports/${selectedSession}/${reportType}`);
      }
      if (response.ok) {
        setReportData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveRecoAdjustment = async (params) => {
    try {
      if (selectedSession !== '__consolidated__' || !selectedClient) { toast.error('Reco is only available in consolidated view'); return; }
      const body = { client_id: selectedClient, ...params };
      const response = await fetch(`${BACKEND_URL}/api/portal/reco-adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) {
        // Optimistic local state update - no full page refresh
        setReportData(prev => {
          if (!prev || !prev.report) return prev;
          const updated = { ...prev, report: prev.report.map(row => {
            let match = false;
            if (params.reco_type === 'detailed') {
              match = row.location === params.location && row.barcode === params.barcode;
            } else if (params.reco_type === 'barcode') {
              match = row.barcode === params.barcode;
            } else if (params.reco_type === 'article') {
              match = row.article_code === params.article_code;
            }
            if (!match) return row;
            const newReco = params.reco_qty;
            const physQty = row.physical_qty || 0;
            const finalQty = physQty + newReco;
            const stockQty = row.stock_qty || 0;
            const diffQty = finalQty - stockQty;
            const cost = row.cost || 0;
            const accuracy = stockQty > 0 ? Math.round((Math.min(finalQty, stockQty) / stockQty) * 1000) / 10 : (finalQty === 0 ? 100 : 0);
            return { ...row, reco_qty: newReco, final_qty: finalQty, diff_qty: diffQty,
              final_value_mrp: finalQty * (row.mrp || 0), final_value_cost: finalQty * cost,
              diff_value_mrp: (finalQty - stockQty) * (row.mrp || 0), diff_value_cost: (finalQty - stockQty) * cost,
              accuracy_pct: accuracy };
          })};
          // Recalc totals
          const t = { stock_qty: 0, physical_qty: 0, reco_qty: 0, final_qty: 0, diff_qty: 0,
            stock_value_mrp: 0, stock_value_cost: 0, physical_value_mrp: 0, physical_value_cost: 0,
            final_value_mrp: 0, final_value_cost: 0, diff_value_mrp: 0, diff_value_cost: 0 };
          updated.report.forEach(r => {
            t.stock_qty += (r.stock_qty || 0);
            t.physical_qty += (r.physical_qty || 0);
            t.reco_qty += (r.reco_qty || 0);
            t.final_qty += (r.final_qty || r.physical_qty || 0);
            t.diff_qty += (r.diff_qty || 0);
            t.stock_value_mrp += (r.stock_value_mrp || 0);
            t.stock_value_cost += (r.stock_value_cost || 0);
            t.physical_value_mrp += (r.physical_value_mrp || 0);
            t.physical_value_cost += (r.physical_value_cost || 0);
            t.final_value_mrp += (r.final_value_mrp || 0);
            t.final_value_cost += (r.final_value_cost || 0);
            t.diff_value_mrp += (r.diff_value_mrp || 0);
            t.diff_value_cost += (r.diff_value_cost || 0);
          });
          t.accuracy_pct = t.stock_qty > 0 ? Math.round((Math.min(t.final_qty, t.stock_qty) / t.stock_qty) * 1000) / 10 : (t.final_qty === 0 ? 100 : 0);
          updated.totals = { ...prev.totals, ...t };
          return updated;
        });
        toast.success('Reco saved');
      } else {
        toast.error('Failed to save Reco adjustment');
      }
    } catch (error) {
      console.error('Failed to save reco:', error);
      toast.error('Failed to save Reco adjustment');
    }
  };

  const getReportTypeOptions = () => {
    // If consolidated, only show report types relevant to client's session modes
    if (selectedSession === '__consolidated__') {
      const activeModes = new Set(sessionInfo?.session_modes || sessions.map(s => s.variance_mode || 'bin-wise'));
      const optMap = new Map();
      if (activeModes.has('bin-wise')) {
        optMap.set('bin-wise', { value: 'bin-wise', label: 'Bin-wise Summary' });
        optMap.set('detailed', { value: 'detailed', label: 'Detailed Item-wise' });
        optMap.set('barcode-wise', { value: 'barcode-wise', label: 'Barcode-wise Variance' });
      }
      if (activeModes.has('barcode-wise')) {
        optMap.set('barcode-wise', { value: 'barcode-wise', label: 'Barcode-wise Variance' });
      }
      if (activeModes.has('article-wise')) {
        optMap.set('article-wise', { value: 'article-wise', label: 'Article-wise Variance' });
      }
      optMap.set('category-summary', { value: 'category-summary', label: 'Category-wise Summary' });
      optMap.set('empty-bins', { value: 'empty-bins', label: 'Empty Bins' });
      optMap.set('pending-locations', { value: 'pending-locations', label: 'Pending Locations' });
      return Array.from(optMap.values());
    }
    const mode = sessionInfo?.variance_mode || 'bin-wise';
    const options = [];
    
    if (mode === 'bin-wise') {
      options.push({ value: 'bin-wise', label: 'Bin-wise Summary' });
      options.push({ value: 'detailed', label: 'Detailed Item-wise' });
      options.push({ value: 'barcode-wise', label: 'Barcode-wise Variance' });
    } else if (mode === 'barcode-wise') {
      options.push({ value: 'barcode-wise', label: 'Barcode-wise Variance' });
    } else if (mode === 'article-wise') {
      options.push({ value: 'article-wise', label: 'Article-wise Variance' });
    }
    
    // Category summary always available
    options.push({ value: 'category-summary', label: 'Category-wise Summary' });
    
    // Empty bins available in session view
    options.push({ value: 'empty-bins', label: 'Empty Bins' });
    
    // Pending Locations only in consolidated view (not session-wise)
    // Session-wise only shows scanned data, pending makes sense only in consolidated
    
    return options;
  };

  const isConsolidatedView = selectedSession === '__consolidated__';

  // ============ Column Settings Logic ============
  const isRecoEditable = useMemo(() => {
    if (!isConsolidatedView || !sessionInfo) return false;
    if (reportType === 'detailed') return sessionInfo.variance_mode === 'bin-wise';
    if (reportType === 'barcode-wise') return sessionInfo.variance_mode === 'barcode-wise';
    if (reportType === 'article-wise') return sessionInfo.variance_mode === 'article-wise';
    return false;
  }, [isConsolidatedView, sessionInfo, reportType]);

  const extraColumns = useMemo(() => reportData?.extra_columns || [], [reportData]);

  const columnConfig = useMemo(() => {
    const ec = extraColumns.map(c => ({ key: c.name, label: c.label }));
    switch (reportType) {
      case 'bin-wise':
        return [
          { key: 'status', label: 'Status' },
          { key: 'location', label: 'Location' },
          { key: 'stock_qty', label: 'Stock Qty' },
          { key: 'physical_qty', label: 'Physical' },
          ...(isConsolidatedView ? [{ key: 'reco_qty', label: 'Reco Qty' }] : []),
          ...(isConsolidatedView ? [{ key: 'final_qty', label: 'Final Qty' }] : []),
          { key: 'difference_qty', label: 'Difference' },
          { key: 'accuracy_pct', label: 'Accuracy %' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'detailed':
        return [
          { key: 'location', label: 'Location' },
          { key: 'barcode', label: 'Barcode' },
          { key: 'description', label: 'Description' },
          { key: 'category', label: 'Category' },
          ...ec,
          { key: 'stock_qty', label: 'Stock Qty' },
          { key: 'stock_value_mrp', label: 'Stock Val(MRP)' },
          { key: 'stock_value_cost', label: 'Stock Val(Cost)' },
          { key: 'physical_qty', label: 'Physical Qty' },
          { key: 'physical_value_mrp', label: 'Phys Val(MRP)' },
          { key: 'physical_value_cost', label: 'Phys Val(Cost)' },
          ...(isConsolidatedView ? [{ key: 'reco', label: 'Reco' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            { key: 'final_value_mrp', label: 'Final Val(MRP)' },
            { key: 'final_value_cost', label: 'Final Val(Cost)' },
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          { key: 'diff_value_mrp', label: 'Diff Val(MRP)' },
          { key: 'diff_value_cost', label: 'Diff Val(Cost)' },
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'barcode-wise':
        return [
          { key: 'barcode', label: 'Barcode' },
          { key: 'description', label: 'Description' },
          { key: 'category', label: 'Category' },
          ...ec,
          { key: 'stock_qty', label: 'Stock Qty' },
          { key: 'stock_value_mrp', label: 'Stock Val(MRP)' },
          { key: 'stock_value_cost', label: 'Stock Val(Cost)' },
          { key: 'physical_qty', label: 'Physical' },
          { key: 'physical_value_mrp', label: 'Phys Val(MRP)' },
          { key: 'physical_value_cost', label: 'Phys Val(Cost)' },
          ...(isConsolidatedView ? [{ key: 'reco', label: 'Reco' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            { key: 'final_value_mrp', label: 'Final Val(MRP)' },
            { key: 'final_value_cost', label: 'Final Val(Cost)' },
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          { key: 'diff_value_mrp', label: 'Diff Val(MRP)' },
          { key: 'diff_value_cost', label: 'Diff Val(Cost)' },
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'article-wise':
        return [
          { key: '_expand', label: 'Expand' },
          { key: 'article_code', label: 'Article Code' },
          { key: 'article_name', label: 'Article Name' },
          { key: 'category', label: 'Category' },
          ...ec,
          { key: 'barcode_count', label: 'Barcodes' },
          { key: 'stock_qty', label: 'Stock Qty' },
          { key: 'stock_value_mrp', label: 'Stock Val(MRP)' },
          { key: 'stock_value_cost', label: 'Stock Val(Cost)' },
          { key: 'physical_qty', label: 'Physical' },
          { key: 'physical_value_mrp', label: 'Phys Val(MRP)' },
          { key: 'physical_value_cost', label: 'Phys Val(Cost)' },
          ...(isConsolidatedView ? [{ key: 'reco', label: 'Reco' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            { key: 'final_value_mrp', label: 'Final Val(MRP)' },
            { key: 'final_value_cost', label: 'Final Val(Cost)' },
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          { key: 'diff_value_mrp', label: 'Diff Val(MRP)' },
          { key: 'diff_value_cost', label: 'Diff Val(Cost)' },
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'category-summary':
        return [
          { key: 'category', label: 'Category' },
          { key: 'item_count', label: 'Items' },
          { key: 'stock_qty', label: 'Stock Qty' },
          { key: 'stock_value_mrp', label: 'Stock Val(MRP)' },
          { key: 'stock_value_cost', label: 'Stock Val(Cost)' },
          { key: 'physical_qty', label: 'Physical' },
          { key: 'physical_value_mrp', label: 'Phys Val(MRP)' },
          { key: 'physical_value_cost', label: 'Phys Val(Cost)' },
          ...(isConsolidatedView ? [{ key: 'final_qty', label: 'Final Qty' }] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          { key: 'diff_value_mrp', label: 'Diff Val(MRP)' },
          { key: 'diff_value_cost', label: 'Diff Val(Cost)' },
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      default:
        return [];
    }
  }, [reportType, isConsolidatedView, isRecoEditable, extraColumns]);

  // Reset column settings when report type changes
  useEffect(() => {
    setHiddenColumns(new Set());
    setFrozenColumns(new Set());
  }, [reportType, selectedSession]);

  // Generate dynamic CSS for hidden/frozen columns (fast CSS injection instead of slow DOM manipulation)
  const [columnStyleCSS, setColumnStyleCSS] = useState('');

  useEffect(() => {
    if (!tableContainerRef.current) { setColumnStyleCSS(''); return; }
    const table = tableContainerRef.current.querySelector('table');
    if (!table) { setColumnStyleCSS(''); return; }

    const headerCells = Array.from(table.querySelectorAll('thead > tr > th'));

    // Build column key → nth-child index map (1-based)
    const colIndexMap = {};
    headerCells.forEach((th, idx) => {
      const col = th.getAttribute('data-col');
      if (col) colIndexMap[col] = idx + 1;
    });

    let css = '';

    // Hidden columns — CSS nth-child rules (instant, no row iteration)
    hiddenColumns.forEach(colKey => {
      const nth = colIndexMap[colKey];
      if (!nth) return;
      css += `#report-table-area thead tr th:nth-child(${nth}),
              #report-table-area tbody tr td:nth-child(${nth}),
              #report-table-area tbody tr th:nth-child(${nth}) { display: none !important; }\n`;
    });

    // Frozen columns — measure widths and generate sticky CSS
    let offset = 0;
    headerCells.forEach((th, idx) => {
      const col = th.getAttribute('data-col');
      if (!col || !frozenColumns.has(col) || hiddenColumns.has(col)) return;

      const width = th.getBoundingClientRect().width;
      const nth = idx + 1;

      // Header: sticky both top AND left
      css += `#report-table-area thead tr th:nth-child(${nth}) {
        position: sticky !important; left: ${offset}px; top: 0;
        z-index: 30 !important; background-color: #f9fafb !important;
        box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
      }\n`;

      // Body cells: sticky left only
      css += `#report-table-area tbody tr td:nth-child(${nth}) {
        position: sticky !important; left: ${offset}px;
        z-index: 20 !important; background-color: white !important;
        box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
      }\n`;

      offset += width;
    });

    setColumnStyleCSS(css);
  }, [hiddenColumns, frozenColumns, reportType, filteredData, selectedSession]);

  const toggleColumnVisibility = useCallback((colKey) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
    // Unfreeze if hidden
    setFrozenColumns(prev => {
      const next = new Set(prev);
      next.delete(colKey);
      return next;
    });
  }, []);

  const toggleColumnFreeze = useCallback((colKey) => {
    setFrozenColumns(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
  }, []);

  const resetColumnSettings = useCallback(() => {
    setHiddenColumns(new Set());
    setFrozenColumns(new Set());
  }, []);

  const exportCSV = () => {
    if (!filteredData) return;

    let csv = '';
    const rows = filteredData.report || [];
    const ec = reportData?.extra_columns || [];
    const ecHeaders = ec.map(c => c.label).join(',');
    const ecVals = (row) => ec.map(c => `"${row[c.name] || ''}"`).join(',');
    
    if (reportType === 'bin-wise') {
      if (isConsolidatedView) {
        csv = 'Status,Location,Stock Qty,Physical Qty,Final Qty,Difference,Accuracy %,Remarks\n';
        rows.forEach(row => {
          const status = row.status === 'empty_bin' ? 'Empty Bin' : row.status === 'pending' ? 'Pending' : row.status === 'conflict' ? 'Conflict' : 'Completed';
          csv += `"${status}","${row.location}",${row.stock_qty},${row.physical_qty},${row.final_qty ?? row.physical_qty},${row.difference_qty},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
        const t = filteredData.totals;
        csv += `"","TOTAL",${t.stock_qty},${t.physical_qty},${t.final_qty ?? t.physical_qty},${t.difference_qty},${t.accuracy_pct}%,""\n`;
      } else {
        csv = 'Status,Location,Stock Qty,Physical Qty,Difference,Accuracy %,Remarks\n';
        rows.forEach(row => {
          const status = row.status === 'empty_bin' ? 'Empty Bin' : row.status === 'pending' ? 'Pending' : row.status === 'conflict' ? 'Conflict' : 'Completed';
          csv += `"${status}","${row.location}",${row.stock_qty},${row.physical_qty},${row.difference_qty},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
        const t = filteredData.totals;
        csv += `"","TOTAL",${t.stock_qty},${t.physical_qty},${t.difference_qty},${t.accuracy_pct}%,""\n`;
      }
    } else if (reportType === 'detailed') {
      const extraH = ec.length ? ',' + ecHeaders : '';
      if (isConsolidatedView) {
        csv = `Location,Barcode,Description,Category${extraH},Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Reco,Final Qty,Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.location}","${row.barcode}","${row.description}","${row.category}"${ev},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.reco_qty || 0},${row.final_qty ?? row.physical_qty},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      } else {
        csv = `Location,Barcode,Description,Category${extraH},Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.location}","${row.barcode}","${row.description}","${row.category}"${ev},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      }
    } else if (reportType === 'barcode-wise') {
      const extraH = ec.length ? ',' + ecHeaders : '';
      if (isConsolidatedView) {
        csv = `Barcode,Description,Category${extraH},Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Reco,Final Qty,Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.barcode}","${row.description}","${row.category}"${ev},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.reco_qty || 0},${row.final_qty ?? row.physical_qty},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      } else {
        csv = `Barcode,Description,Category${extraH},Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.barcode}","${row.description}","${row.category}"${ev},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      }
    } else if (reportType === 'article-wise') {
      const extraH = ec.length ? ',' + ecHeaders : '';
      if (isConsolidatedView) {
        csv = `Article Code,Article Name,Category${extraH},Barcodes,Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Reco,Final Qty,Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.article_code}","${row.article_name}","${row.category}"${ev},"${(row.barcodes || []).join('; ')}",${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.reco_qty || 0},${row.final_qty ?? row.physical_qty},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      } else {
        csv = `Article Code,Article Name,Category${extraH},Barcodes,Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n`;
        rows.forEach(row => {
          const ev = ec.length ? ',' + ecVals(row) : '';
          csv += `"${row.article_code}","${row.article_name}","${row.category}"${ev},"${(row.barcodes || []).join('; ')}",${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      }
    } else if (reportType === 'category-summary') {
      if (isConsolidatedView) {
        csv = 'Category,Items,Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Final Qty,Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n';
        rows.forEach(row => {
          csv += `"${row.category}",${row.item_count},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.final_qty ?? row.physical_qty},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      } else {
        csv = 'Category,Items,Stock Qty,Stock Val(MRP),Stock Val(Cost),Physical Qty,Phys Val(MRP),Phys Val(Cost),Diff Qty,Diff Val(MRP),Diff Val(Cost),Accuracy %,Remarks\n';
        rows.forEach(row => {
          csv += `"${row.category}",${row.item_count},${row.stock_qty},${row.stock_value_mrp || 0},${row.stock_value_cost || 0},${row.physical_qty},${row.physical_value_mrp || 0},${row.physical_value_cost || 0},${row.diff_qty},${row.diff_value_mrp || 0},${row.diff_value_cost || 0},${row.accuracy_pct}%,"${row.remark}"\n`;
        });
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = varianceCategory !== 'all' ? `_${varianceCategory}` : '';
    a.download = `${reportType}_report${suffix}_${selectedSession}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Report exported! (${rows.length} rows)`);
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
    if (remark.includes('Conflict')) return <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
    if (remark.includes('Empty Bin')) return <PackageX className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    if (remark.includes('Pending')) return <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
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
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button onClick={clearAllFilters} variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50">
              <X className="w-3.5 h-3.5 mr-1" />
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </Button>
          )}
          {filteredData && columnConfig.length > 0 && (
            <ColumnSettingsPanel
              columns={columnConfig}
              hiddenColumns={hiddenColumns}
              frozenColumns={frozenColumns}
              onToggleVisibility={toggleColumnVisibility}
              onToggleFreeze={toggleColumnFreeze}
              onShowAll={showAllColumns}
              onReset={resetColumnSettings}
            />
          )}
          {filteredData && (
            <Button onClick={exportCSV} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {selectedClient && (
                <option value="__consolidated__">All Sessions (Consolidated)</option>
              )}
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
        </div>
        {/* Variance Category Filter Row */}
        {selectedSession && reportData && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Variance:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VARIANCE_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setVarianceCategory(cat.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    varianceCategory === cat.value
                      ? cat.value === 'all' ? 'bg-gray-800 text-white'
                        : cat.value === 'negative' ? 'bg-red-500 text-white'
                        : cat.value === 'positive' ? 'bg-emerald-500 text-white'
                        : cat.value === 'matched' ? 'bg-blue-500 text-white'
                        : cat.value === 'in_system_not_found' ? 'bg-amber-500 text-white'
                        : 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={cat.description}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {filteredData && reportData && filteredData.report && reportData.report && (
              <span className="text-xs text-gray-400 ml-auto">
                Showing {filteredData.report.length} of {reportData.report.length} rows
              </span>
            )}
          </div>
        )}
      </div>

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
      ) : !filteredData || ((reportType !== 'pending-locations' && reportType !== 'empty-bins') && (filteredData.report || []).length === 0) ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileBarChart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">{varianceCategory !== 'all' && reportData && (reportData.report || []).length > 0 ? 'No items match the selected variance filter' : 'No data available for this session'}</p>
          {varianceCategory !== 'all' && reportData && (reportData.report || []).length > 0 && (
            <button onClick={() => setVarianceCategory('all')} className="mt-2 text-sm text-emerald-600 hover:underline">Clear variance filter</button>
          )}
          {varianceCategory === 'all' && (
            <p className="text-sm text-gray-400 mt-1">Import master stock and sync device data to generate reports</p>
          )}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {filteredData.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <SummaryCard label="Stock Qty" value={filteredData.totals.stock_qty || 0} />
              <SummaryCard label="Stock Value" value={(filteredData.totals.stock_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} />
              <SummaryCard label="Physical Qty" value={filteredData.totals.physical_qty || 0} />
              <SummaryCard label="Physical Value" value={(filteredData.totals.physical_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} />
              <SummaryCard label="Difference Qty" value={filteredData.totals.diff_qty || filteredData.totals.difference_qty || 0} variant={true} />
              <SummaryCard label="Difference Value" value={(filteredData.totals.diff_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} variant={true} />
              <SummaryCard label="Accuracy" value={`${filteredData.totals.accuracy_pct || 0}%`} isAccuracy={true} pct={filteredData.totals.accuracy_pct || 0} />
            </div>
          )}

          {/* Report Table — Reco editing only on the primary report type for the session's variance mode */}
          {columnStyleCSS && <style>{columnStyleCSS}</style>}
          <div ref={tableContainerRef} id="report-table-area">
          {reportType === 'bin-wise' && <BinWiseTable data={filteredData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} isConsolidated={isConsolidatedView} />}
          {reportType === 'detailed' && <DetailedTable data={filteredData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isConsolidated={isConsolidatedView} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'bin-wise'} extraColumns={reportData?.extra_columns || []} />}
          {reportType === 'barcode-wise' && <BarcodeWiseTable data={filteredData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'barcode-wise'} isConsolidated={isConsolidatedView} extraColumns={reportData?.extra_columns || []} />}
          {reportType === 'article-wise' && <ArticleWiseTable data={filteredData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'article-wise'} isConsolidated={isConsolidatedView} extraColumns={reportData?.extra_columns || []} />}
          {reportType === 'category-summary' && <CategorySummaryTable data={filteredData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} isConsolidated={isConsolidatedView} />}
          </div>
          {reportType === 'empty-bins' && <EmptyBinsView data={reportData} />}
          {reportType === 'pending-locations' && <PendingLocationsView data={reportData} />}
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
function BinWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, isConsolidated }) {
  const summary = data.summary || {};
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Bin-wise Summary Report</h3>
          {(summary.total_locations > 0) && (
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> {summary.completed || 0} Completed
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                <PackageX className="w-3 h-3" /> {summary.empty_bins || 0} Empty Bins
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                <Clock className="w-3 h-3" /> {summary.pending || 0} Pending
              </span>
              {(summary.conflicts || 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700">
                  <AlertTriangle className="w-3 h-3" /> {summary.conflicts} Conflicts
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableHeader column="status" label="Status" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('status')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="location" label="Location" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('location')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="difference_qty" label="Difference" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('difference_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy %" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[250px]" />
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => {
              const isEmptyBin = row.status === 'empty_bin' || row.is_empty;
              const isPending = row.status === 'pending';
              const isConflict = row.status === 'conflict';
              const rowBg = isConflict ? 'bg-red-50/60 hover:bg-red-50' : isEmptyBin ? 'bg-amber-50/60 hover:bg-amber-50' : isPending ? 'bg-gray-50/60 hover:bg-gray-100' : 'hover:bg-gray-50';
              return (
                <tr key={i} className={`border-b border-gray-100 ${rowBg}`}>
                  <td className="py-3 px-4">
                    {isConflict ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" /> Conflict
                      </span>
                    ) : isEmptyBin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        <PackageX className="w-3 h-3" /> Empty
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-medium">{row.location || '-'}</td>
                  <td className="py-3 px-4 text-right">{row.stock_qty}</td>
                  <td className="py-3 px-4 text-right">{row.physical_qty}</td>
                  {isConsolidated && <td className="py-3 px-4 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
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
                  <td className="py-2 px-4 remark-cell">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      {getRemarkIcon(row.remark)}
                      <span className="truncate" title={row.remark}>{row.remark}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td className="py-3 px-4"></td>
              <td className="py-3 px-4">TOTAL</td>
              <td className="py-3 px-4 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-4 text-right">{data.totals.physical_qty}</td>
              {isConsolidated && <td className="py-3 px-4 text-right font-bold">{data.totals.final_qty ?? data.totals.physical_qty}</td>}
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

// ============ Reco Input Component ============
function RecoInput({ value, onSave, dataTestId }) {
  const [editing, setEditing] = React.useState(false);
  const [inputVal, setInputVal] = React.useState(value || 0);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setInputVal(value || 0); }, [value]);

  const handleSave = () => {
    const num = parseFloat(inputVal) || 0;
    if (num !== (value || 0)) onSave(num);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button data-testid={dataTestId} onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full text-right px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50 transition-colors ${value ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-400'}`}>
        {value ? (value > 0 ? `+${value}` : value) : '—'}
      </button>
    );
  }
  return (
    <input ref={inputRef} type="number" value={inputVal} onChange={e => setInputVal(e.target.value)}
      onBlur={handleSave} onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
      className="w-16 text-right px-1 py-0.5 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
  );
}

// ============ Detailed Item-wise Table ============
function DetailedTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isConsolidated, isRecoEditable, extraColumns = [] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Detailed Item-wise Report</h3>
        {isRecoEditable && <p className="text-xs text-gray-500 mt-1">Click the Reco column to adjust quantities. Final Qty = Physical + Reco.</p>}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-xs report-table">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableHeader column="location" label="Location" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('location')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="barcode" label="Barcode" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="description" label="Description" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('description')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <th data-col="reco" className="py-3 px-3 text-right text-xs font-semibold text-blue-700 bg-blue-50/50">Reco</th>}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[200px]" />
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{row.location || '-'}</td>
                <td className="py-2 px-3 font-mono">{row.barcode || '-'}</td>
                <td className="py-2 px-3">{row.description || '-'}</td>
                <td className="py-2 px-3">{row.category || '-'}</td>
                {extraColumns.map(col => (
                  <td key={col.name} className="py-2 px-3 text-purple-700">{row[col.name] || '-'}</td>
                ))}
                <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_cost || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_cost || 0).toFixed(2)}</td>
                {isRecoEditable && (
                  <td className="py-1 px-2 bg-blue-50/30">
                    <RecoInput dataTestId={`reco-input-detailed-${i}`} value={row.reco_qty || 0} onSave={(val) => onSaveReco({ reco_type: 'detailed', barcode: row.barcode, location: row.location, reco_qty: val })} />
                  </td>
                )}
                {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_mrp)}`}>
                    {(row.diff_value_mrp || 0).toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_cost)}`}>
                    {(row.diff_value_cost || 0).toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-3 remark-cell">
                  <div className="flex items-center gap-1 text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate" title={row.remark}>{row.remark}</span>
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
function BarcodeWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isRecoEditable, isConsolidated, extraColumns = [] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          Barcode-wise Variance Report
        </h3>
        {isRecoEditable ? (
          <p className="text-xs text-gray-500 mt-1">Click the Reco column to adjust quantities. Final Qty = Physical + Reco.</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Variance report by barcode across all locations</p>
        )}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableHeader column="barcode" label="Barcode" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="description" label="Description" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('description')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <th data-col="reco" className="py-3 px-3 text-right text-xs font-semibold text-blue-700 bg-blue-50/50">Reco</th>}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[220px]" />
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
                {extraColumns.map(col => (
                  <td key={col.name} className="py-2 px-3 text-xs text-purple-700">{row[col.name] || '-'}</td>
                ))}
                <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_cost || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_mrp || 0).toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_cost || 0).toFixed(2)}</td>
                {isRecoEditable && (
                  <td className="py-1 px-2 bg-blue-50/30">
                    <RecoInput dataTestId={`reco-input-barcode-${i}`} value={row.reco_qty || 0} onSave={(val) => onSaveReco({ reco_type: 'barcode', barcode: row.barcode, reco_qty: val })} />
                  </td>
                )}
                {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                <td className="py-2 px-3 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {getVarianceIcon(row.diff_qty)}
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_mrp)}`}>
                    {(row.diff_value_mrp || 0).toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_cost)}`}>
                    {(row.diff_value_cost || 0).toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>
                    {row.accuracy_pct}%
                  </span>
                </td>
                <td className="py-2 px-3 remark-cell">
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate" title={row.remark}>{row.remark}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-sm">
            <tr>
              <td colSpan={3 + extraColumns.length} className="py-3 px-3">TOTALS</td>
              <td className="py-3 px-3 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.stock_value_mrp || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.stock_value_cost || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.physical_value_mrp || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.physical_value_cost || 0).toFixed(2)}</td>
              {isRecoEditable && <td className="py-3 px-3 text-right text-blue-700">{data.totals.reco_qty || 0}</td>}
              {isConsolidated && <td className="py-3 px-3 text-right font-bold">{data.totals.final_qty ?? data.totals.physical_qty}</td>}
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_mrp)}`}>
                  {(data.totals.diff_value_mrp || 0).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_cost)}`}>
                  {(data.totals.diff_value_cost || 0).toFixed(2)}
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
function ArticleWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isRecoEditable, isConsolidated, extraColumns = [] }) {
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
        {isRecoEditable ? (
          <p className="text-xs text-gray-500 mt-1">Click the Reco column to adjust quantities. Final Qty = Physical + Reco.</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Variance report by article. Click a row to view barcodes.</p>
        )}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th data-col="_expand" className="w-8 py-3 px-2"></th>
              <SortableHeader column="article_code" label="Article Code" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('article_code')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="article_name" label="Article Name" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('article_name')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              <SortableHeader column="barcode_count" label="Barcodes" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode_count')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <th data-col="reco" className="py-3 px-3 text-right text-xs font-semibold text-blue-700 bg-blue-50/50">Reco</th>}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[220px]" />
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <React.Fragment key={i}>
                <tr className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${row.article_code === 'UNMAPPED' ? 'bg-red-50/50' : ''}`} onClick={() => toggleRow(i)}>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block transition-transform duration-200 text-gray-400 ${expandedRows.has(i) ? 'rotate-90' : ''}`}>&#9654;</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs font-medium">{row.article_code}</td>
                  <td className="py-2 px-3">{row.article_name || '-'}</td>
                  <td className="py-2 px-3">
                    {row.category ? <span className={`px-2 py-0.5 rounded text-xs ${row.category === 'Unmapped' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>{row.category}</span> : '-'}
                  </td>
                  {extraColumns.map(col => (
                    <td key={col.name} className="py-2 px-3 text-xs text-purple-700">{row[col.name] || '-'}</td>
                  ))}
                  <td className="py-2 px-3 text-right"><span className="text-xs text-blue-600 font-medium underline">{row.barcode_count}</span></td>
                  <td className="py-2 px-3 text-right">{row.stock_qty}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_mrp || 0).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{(row.stock_value_cost || 0).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">{row.physical_qty}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_mrp || 0).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{(row.physical_value_cost || 0).toFixed(2)}</td>
                  {isRecoEditable && (
                    <td className="py-1 px-2 bg-blue-50/30" onClick={e => e.stopPropagation()}>
                      <RecoInput dataTestId={`reco-input-article-${i}`} value={row.reco_qty || 0} onSave={(val) => onSaveReco({ reco_type: 'article', article_code: row.article_code, reco_qty: val })} />
                    </td>
                  )}
                  {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                  <td className="py-2 px-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                      {getVarianceIcon(row.diff_qty)}
                      {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_mrp)}`}>
                      {(row.diff_value_mrp || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_cost)}`}>
                      {(row.diff_value_cost || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>{row.accuracy_pct}%</span>
                  </td>
                  <td className="py-2 px-3 remark-cell">
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      {getRemarkIcon(row.remark)}
                      <span className="truncate" title={row.remark}>{row.remark}</span>
                    </div>
                  </td>
                </tr>
                {expandedRows.has(i) && (
                  <tr className="bg-purple-50/50">
                    <td colSpan={12 + extraColumns.length} className="py-2 px-6">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-purple-700 mr-1">Barcodes:</span>
                        {(row.barcodes || []).map((bc, j) => (
                          <span key={j} className="inline-flex items-center px-2.5 py-1 bg-white border border-purple-200 rounded-md text-xs font-mono text-purple-800 shadow-sm">{bc}</span>
                        ))}
                        {(!row.barcodes || row.barcodes.length === 0) && <span className="text-xs text-gray-400 italic">No barcodes</span>}
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
              <td colSpan={4 + extraColumns.length} className="py-3 px-3">TOTALS</td>
              <td className="py-3 px-3 text-right">{data.totals.stock_qty}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.stock_value_mrp || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.stock_value_cost || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.physical_value_mrp || 0).toFixed(2)}</td>
              <td className="py-3 px-3 text-right text-gray-500">{(data.totals.physical_value_cost || 0).toFixed(2)}</td>
              {isRecoEditable && <td className="py-3 px-3 text-right text-blue-700">{data.totals.reco_qty || 0}</td>}
              {isConsolidated && <td className="py-3 px-3 text-right font-bold">{data.totals.final_qty ?? data.totals.physical_qty}</td>}
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_mrp)}`}>
                  {(data.totals.diff_value_mrp || 0).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_cost)}`}>
                  {(data.totals.diff_value_cost || 0).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>{data.totals.accuracy_pct}%</span>
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
function CategorySummaryTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, isConsolidated }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-500" />
          Category-wise Summary
        </h3>
        <p className="text-xs text-gray-500 mt-1">{isConsolidated ? 'Aggregated variance by product category (using Final Qty)' : 'Aggregated variance by product category'}</p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="item_count" label="Items" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('item_count')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[220px]" />
            </tr>
          </thead>
          <tbody>
            {data.report.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">
                  <span className={`px-2 py-1 rounded text-xs ${row.category === 'Unmapped' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{row.category}</span>
                </td>
                <td className="py-3 px-4 text-right text-gray-500">{row.item_count}</td>
                <td className="py-3 px-4 text-right">{row.stock_qty}</td>
                <td className="py-3 px-4 text-right text-gray-500">{(row.stock_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="py-3 px-4 text-right text-gray-500">{(row.stock_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="py-3 px-4 text-right">{row.physical_qty}</td>
                <td className="py-3 px-4 text-right text-gray-500">{(row.physical_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="py-3 px-4 text-right text-gray-500">{(row.physical_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                {isConsolidated && <td className="py-3 px-4 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                <td className="py-3 px-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getVarianceClass(row.diff_qty)}`}>
                    {getVarianceIcon(row.diff_qty)}
                    {row.diff_qty > 0 ? '+' : ''}{row.diff_qty}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_mrp)}`}>
                    {(row.diff_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(row.diff_value_cost)}`}>
                    {(row.diff_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(row.accuracy_pct)}`}>{row.accuracy_pct}%</span>
                </td>
                <td className="py-2 px-4 remark-cell">
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    {getRemarkIcon(row.remark)}
                    <span className="truncate" title={row.remark}>{row.remark}</span>
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
              <td className="py-3 px-4 text-right text-gray-500">{(data.totals.stock_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td className="py-3 px-4 text-right text-gray-500">{(data.totals.stock_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td className="py-3 px-4 text-right">{data.totals.physical_qty}</td>
              <td className="py-3 px-4 text-right text-gray-500">{(data.totals.physical_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td className="py-3 px-4 text-right text-gray-500">{(data.totals.physical_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              {isConsolidated && <td className="py-3 px-4 text-right font-bold">{data.totals.final_qty ?? data.totals.physical_qty}</td>}
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded ${getVarianceClass(data.totals.diff_qty)}`}>
                  {data.totals.diff_qty > 0 ? '+' : ''}{data.totals.diff_qty}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_mrp)}`}>
                  {(data.totals.diff_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs ${getVarianceClass(data.totals.diff_value_cost)}`}>
                  {(data.totals.diff_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAccuracyClass(data.totals.accuracy_pct)}`}>{data.totals.accuracy_pct}%</span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============ Empty Bins View ============
function EmptyBinsView({ data }) {
  if (!data) return <div className="text-center py-8 text-gray-500">Loading...</div>;
  
  const emptyLocations = data.all_empty_locations || [];
  const byDate = data.by_date || [];
  
  if (emptyLocations.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No Empty Bins Found</h3>
        <p className="text-gray-500">All scanned locations have items. No bins were marked as empty.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-700">{data.total_empty_bins || 0}</p>
          <p className="text-sm text-amber-600 mt-1">Total Empty Bins</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{byDate.length}</p>
          <p className="text-sm text-blue-600 mt-1">Days with Empty Bins</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-lg font-bold text-gray-700 truncate">{data.session_name || '-'}</p>
          <p className="text-sm text-gray-500 mt-1">Session</p>
        </div>
      </div>

      {/* By Date */}
      {byDate.map((dateGroup) => (
        <div key={dateGroup.date} className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-amber-800">{dateGroup.date}</span>
            </div>
            <span className="text-sm text-amber-600 font-medium">{dateGroup.count} empty bin{dateGroup.count !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y">
            {dateGroup.locations.map((loc, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{loc.location_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{loc.empty_remarks || 'Marked as empty'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">{loc.device_name}</p>
                  <p className="text-xs text-gray-400">{loc.synced_at ? new Date(loc.synced_at).toLocaleTimeString() : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Pending Locations View ============
function PendingLocationsView({ data }) {
  if (!data) return <div className="text-center py-8 text-gray-500">Loading...</div>;
  
  const summary = data.summary || {};
  const pending = data.pending || [];
  const completed = data.completed || [];
  const emptyBins = data.empty_bins || [];
  
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{summary.total_expected || 0}</p>
          <p className="text-xs text-blue-600">Total Expected</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{summary.total_completed || 0}</p>
          <p className="text-xs text-emerald-600">Completed</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{summary.total_empty || 0}</p>
          <p className="text-xs text-amber-600">Empty Bins</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{summary.total_pending || 0}</p>
          <p className="text-xs text-red-600">Pending</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">{summary.completion_pct || 0}%</p>
          <p className="text-xs text-purple-600">Completion</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm text-gray-500">
            {(summary.total_completed || 0) + (summary.total_empty || 0)} of {summary.total_expected || 0} locations done
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
            style={{ width: `${Math.min(summary.completion_pct || 0, 100)}%` }}
          />
        </div>
      </div>

      {/* Pending Locations */}
      {pending.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Pending Locations ({pending.length})
            </h3>
            <p className="text-xs text-red-600 mt-0.5">These locations have not been scanned yet — need physical verification</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-4 text-left">#</th>
                  <th className="py-2 px-4 text-left">Location Name</th>
                  <th className="py-2 px-4 text-center">Status</th>
                  <th className="py-2 px-4 text-center">In Expected</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((loc, idx) => (
                  <tr key={idx} className="hover:bg-red-50/30">
                    <td className="py-2.5 px-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{loc.location_name}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Pending</span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {loc.in_expected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty Bins */}
      {emptyBins.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Empty Bins ({emptyBins.length})
            </h3>
            <p className="text-xs text-amber-600 mt-0.5">These locations were found empty during physical count</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-4 text-left">#</th>
                  <th className="py-2 px-4 text-left">Location Name</th>
                  <th className="py-2 px-4 text-left">Remarks</th>
                  <th className="py-2 px-4 text-left">Device</th>
                  <th className="py-2 px-4 text-left">Synced At</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {emptyBins.map((loc, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/30">
                    <td className="py-2.5 px-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{loc.location_name}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">{loc.empty_remarks || 'Found empty'}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-500">{loc.device_name}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-400">{loc.synced_at ? new Date(loc.synced_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed Locations */}
      {completed.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Completed Locations ({completed.length})
            </h3>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-4 text-left">#</th>
                  <th className="py-2 px-4 text-left">Location Name</th>
                  <th className="py-2 px-4 text-right">Items</th>
                  <th className="py-2 px-4 text-right">Quantity</th>
                  <th className="py-2 px-4 text-left">Device</th>
                  <th className="py-2 px-4 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {completed.map((loc, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/30">
                    <td className="py-2.5 px-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{loc.location_name}</td>
                    <td className="py-2.5 px-4 text-sm text-right text-gray-700">{loc.total_items}</td>
                    <td className="py-2.5 px-4 text-sm text-right font-medium text-gray-900">{loc.total_quantity}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-500">{loc.device_name}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-400">{loc.sync_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Data */}
      {pending.length === 0 && emptyBins.length === 0 && completed.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No location data available. Import expected stock to see pending locations.</p>
        </div>
      )}
    </div>
  );
}

