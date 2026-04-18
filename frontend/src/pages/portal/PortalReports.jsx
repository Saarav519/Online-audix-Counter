import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  Columns,
  Smartphone,
  Send
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { FullScreenButton, FullScreenReport } from '../../components/FullScreenReport';
import { BarcodeEditCell } from '../../components/BarcodeEditCell';
import PageHeader from '../../components/portal/PageHeader';
import { generatePDF } from '../../utils/pdfGenerator';
import { FileText as FilePdfIcon } from 'lucide-react';

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

// Safely get numeric value (handles null, undefined, NaN without treating 0 as falsy)
const n = (v) => (v != null && !isNaN(v)) ? Number(v) : 0;

// Recalculate totals from filtered rows
function recalcTotals(rows, reportType) {
  if (!rows || rows.length === 0) return null;
  const totals = { stock_qty: 0, physical_qty: 0, reco_qty: 0, final_qty: 0, diff_qty: 0, difference_qty: 0, accuracy_pct: 0,
    stock_value_mrp: 0, stock_value_cost: 0, physical_value_mrp: 0, physical_value_cost: 0,
    final_value_mrp: 0, final_value_cost: 0, diff_value_mrp: 0, diff_value_cost: 0, item_count: 0 };
  rows.forEach(row => {
    totals.stock_qty += n(row.stock_qty);
    totals.physical_qty += n(row.physical_qty);
    totals.reco_qty += n(row.reco_qty);
    // final_qty = physical_qty + reco_qty; use row value if present, else compute
    totals.final_qty += (row.final_qty != null ? n(row.final_qty) : n(row.physical_qty) + n(row.reco_qty));
    const d = row.diff_qty != null ? n(row.diff_qty) : n(row.difference_qty);
    totals.diff_qty += d;
    totals.difference_qty += d;
    totals.stock_value_mrp += n(row.stock_value_mrp);
    totals.stock_value_cost += n(row.stock_value_cost);
    totals.physical_value_mrp += n(row.physical_value_mrp);
    totals.physical_value_cost += n(row.physical_value_cost);
    totals.final_value_mrp += n(row.final_value_mrp);
    totals.final_value_cost += n(row.final_value_cost);
    totals.diff_value_mrp += n(row.diff_value_mrp);
    totals.diff_value_cost += n(row.diff_value_cost);
    totals.item_count += n(row.item_count);
  });
  totals.accuracy_pct = totals.stock_qty > 0 ? Math.round((Math.min(totals.final_qty, totals.stock_qty) / totals.stock_qty) * 1000) / 10 : (totals.final_qty === 0 ? 100 : 0);
  return totals;
}

// ============ Column Filter Dropdown ============
function ColumnFilterDropdown({ column, allValues, activeFilters, onFilterChange, numericFilters, onNumericFilterChange, onClose, triggerRef, sortConfig, onSort }) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const listRef = useRef(null);
  const [focusIdx, setFocusIdx] = useState(-1);
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
    // Calculate position from the trigger button
    const trigger = triggerRef?.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const dropW = 256; // w-64 = 16rem = 256px
      const dropH = 384; // max-h-96 = 24rem = 384px
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      setPosition({
        top: spaceBelow < dropH ? Math.max(8, rect.top - dropH) : rect.bottom + 4,
        left: spaceRight < dropW ? Math.max(8, rect.right - dropW) : rect.left
      });
    }
  }, [triggerRef]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && triggerRef?.current && !triggerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

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

  return ReactDOM.createPortal(
    <div ref={dropdownRef} className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] w-64 max-h-96 flex flex-col" style={{ top: position.top, left: position.left }} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {/* Sort Options */}
      {onSort && (
        <div className="p-2 border-b border-gray-100">
          <div className="flex gap-1.5">
            <button
              onClick={() => { onSort(column); onClose(); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                sortConfig?.key === column && sortConfig?.direction === 'asc' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <ArrowUp className="w-3 h-3" /> Sort A-Z
            </button>
            <button
              onClick={() => { onSort(column); if (sortConfig?.key !== column || sortConfig?.direction !== 'desc') onSort(column); onClose(); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                sortConfig?.key === column && sortConfig?.direction === 'desc' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <ArrowDown className="w-3 h-3" /> Sort Z-A
            </button>
          </div>
        </div>
      )}
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
          <input type="text" placeholder="Search & press Enter..." value={search} onChange={(e) => { setSearch(e.target.value); setFocusIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(0); listRef.current?.querySelector('[data-filter-item="0"]')?.focus(); return; }
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
      <div className="overflow-y-auto flex-1 p-1.5" ref={listRef} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
        const max = filteredValues.length - 1;
        if (e.key === 'ArrowDown') { e.preventDefault(); const next = Math.min(max, focusIdx + 1); setFocusIdx(next); listRef.current?.querySelector(`[data-filter-item="${next}"]`)?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const prev = Math.max(0, focusIdx - 1); setFocusIdx(prev); listRef.current?.querySelector(`[data-filter-item="${prev}"]`)?.focus(); }
        if ((e.key === 'Enter' || e.key === ' ') && focusIdx >= 0) { e.preventDefault(); toggleValue(filteredValues[focusIdx]); }
      }}>
        {filteredValues.map((val, i) => {
          const strVal = String(val);
          const checked = isChecked(strVal);
          return (
            <div key={i} data-filter-item={i} tabIndex={0}
              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs outline-none ${
                focusIdx === i ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'
              }`}
              onClick={() => toggleValue(strVal)}
              onFocus={() => setFocusIdx(i)}
            >
              <input type="checkbox" checked={checked} readOnly className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 w-3.5 h-3.5 pointer-events-none" />
              <span className="truncate">{strVal || '(empty)'}</span>
            </div>
          );
        })}
        {filteredValues.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No values found</p>}
      </div>
    </div>,
    document.body
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
  const filterBtnRef = useRef(null);
  const currentFilter = activeFilters[column];
  const hasCheckboxFilter = currentFilter !== undefined && currentFilter !== null && currentFilter.length > 0 && currentFilter.length < (allValues || []).length;
  const hasNumericFilter = numericFilters?.[column] != null;
  const isFiltered = hasCheckboxFilter || hasNumericFilter;
  const isSorted = sortConfig.key === column;
  
  return (
    <th data-col={column} className={`py-3 px-3 font-medium text-gray-600 relative group whitespace-nowrap text-xs ${align === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}>
      <div className={`flex items-center gap-1 w-full ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <button className="flex items-center gap-0.5 hover:text-emerald-700 transition-colors" onClick={() => onSort(column)}>
          <span className="select-none">{label}</span>
          {isSorted ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400" />
          )}
        </button>
        {allValues && allValues.length > 0 && (
          <button ref={filterBtnRef} className={`ml-0.5 p-0.5 rounded hover:bg-gray-200 ${isFiltered ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-600'} transition-all`} onClick={(e) => { e.stopPropagation(); setShowFilter(!showFilter); }}>
            <Filter className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {showFilter && (
        <ColumnFilterDropdown column={column} allValues={allValues} activeFilters={activeFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} onClose={() => setShowFilter(false)} triggerRef={filterBtnRef} sortConfig={sortConfig} onSort={onSort} />
      )}
    </th>
  );
}

const MAX_VISIBLE_ROWS = 500;

export default function PortalReports() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [reportType, setReportType] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [varianceCategory, setVarianceCategory] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnFilters, setColumnFilters] = useState({});
  const [numericFilters, setNumericFilters] = useState({});
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [frozenColumns, setFrozenColumns] = useState(new Set());
  const tableContainerRef = useRef(null);
  const [schemaValueFields, setSchemaValueFields] = useState({ has_mrp: true, has_cost: true });
  const [visibleRowCount, setVisibleRowCount] = useState(MAX_VISIBLE_ROWS);

  // Report cache: stores fetched data keyed by `${sessionId}_${reportType}`
  const reportCache = useRef({});

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchSessions(selectedClient);
      fetchSchemaValueFields(selectedClient);
      // Invalidate report cache when client changes
      reportCache.current = {};
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
    setVisibleRowCount(MAX_VISIBLE_ROWS);
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

  // Display data with row limiting for performance (don't render 18k+ DOM rows)
  const displayData = useMemo(() => {
    if (!filteredData) return null;
    if (reportType === 'pending-locations' || reportType === 'empty-bins') return filteredData;
    if (!filteredData.report) return filteredData;
    const totalRows = filteredData.report.length;
    if (totalRows <= visibleRowCount) return filteredData;
    return { ...filteredData, report: filteredData.report.slice(0, visibleRowCount), _totalFilteredRows: totalRows };
  }, [filteredData, visibleRowCount, reportType]);

  const hasMoreRows = filteredData?.report?.length > visibleRowCount;
  const loadMoreRows = useCallback(() => {
    setVisibleRowCount(prev => prev + MAX_VISIBLE_ROWS);
  }, []);
  const showAllRows = useCallback(() => {
    if (filteredData?.report) setVisibleRowCount(filteredData.report.length);
  }, [filteredData]);

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
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients`);
      if (response.ok) setClients(await response.json());
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchSessions = async (clientId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/sessions?client_id=${clientId}`);
      if (response.ok) setSessions(await response.json());
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchSchemaValueFields = async (clientId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${clientId}/schema`);
      if (response.ok) {
        const schema = await response.json();
        const fields = schema.fields || [];
        const fieldMap = {};
        fields.forEach(f => { fieldMap[f.name] = f; });
        setSchemaValueFields({
          has_mrp: fieldMap.mrp ? fieldMap.mrp.enabled : true,
          has_cost: fieldMap.cost ? fieldMap.cost.enabled : true
        });
      }
    } catch (error) {
      console.error('Failed to fetch schema:', error);
      setSchemaValueFields({ has_mrp: true, has_cost: true });
    }
  };

  const fetchReport = useCallback(async (forceRefresh = false) => {
    if (!selectedSession || !reportType) return;
    
    const cacheKey = `${selectedSession}_${reportType}`;
    
    // Check cache first (unless forced refresh)
    if (!forceRefresh && reportCache.current[cacheKey]) {
      setReportData(reportCache.current[cacheKey]);
      return;
    }
    
    setLoading(true);
    try {
      let response;
      if (selectedSession === '__consolidated__') {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/reports/consolidated/${selectedClient}/${reportType}`);
      } else {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/reports/${selectedSession}/${reportType}`);
      }
      if (response.ok) {
        const data = await response.json();
        // Store in cache
        reportCache.current[cacheKey] = data;
        setReportData(data);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSession, reportType, selectedClient]);

  // Effect to fetch report when session or report type changes
  useEffect(() => {
    if (selectedSession && reportType) {
      fetchReport();
    }
  }, [selectedSession, reportType, fetchReport]);

  const saveRecoAdjustment = async (params) => {
    try {
      if (selectedSession !== '__consolidated__' || !selectedClient) { toast.error('Reco is only available in consolidated view'); return; }
      const body = { client_id: selectedClient, ...params };
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/reco-adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) {
        // Invalidate all cached reports for this session (reco affects multiple report types)
        Object.keys(reportCache.current).forEach(key => {
          if (key.startsWith(`${selectedSession}_`)) delete reportCache.current[key];
        });
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
            t.stock_qty += n(r.stock_qty);
            t.physical_qty += n(r.physical_qty);
            t.reco_qty += n(r.reco_qty);
            t.final_qty += (r.final_qty != null ? n(r.final_qty) : n(r.physical_qty) + n(r.reco_qty));
            t.diff_qty += n(r.diff_qty);
            t.stock_value_mrp += n(r.stock_value_mrp);
            t.stock_value_cost += n(r.stock_value_cost);
            t.physical_value_mrp += n(r.physical_value_mrp);
            t.physical_value_cost += n(r.physical_value_cost);
            t.final_value_mrp += n(r.final_value_mrp);
            t.final_value_cost += n(r.final_value_cost);
            t.diff_value_mrp += n(r.diff_value_mrp);
            t.diff_value_cost += n(r.diff_value_cost);
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
      // Empty Bins and Pending Locations only for bin-wise mode
      if (activeModes.has('bin-wise')) {
        optMap.set('empty-bins', { value: 'empty-bins', label: 'Empty Bins' });
        optMap.set('pending-locations', { value: 'pending-locations', label: 'Pending Locations' });
      }
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
    
    // Empty bins only for bin-wise mode
    if (mode === 'bin-wise') {
      options.push({ value: 'empty-bins', label: 'Empty Bins' });
    }
    
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
    const { has_mrp, has_cost } = schemaValueFields;
    
    // Helper to conditionally include MRP/Cost value columns
    const valCols = (prefix, mrpLabel, costLabel) => {
      const cols = [];
      if (has_mrp) cols.push({ key: `${prefix}_mrp`, label: mrpLabel });
      if (has_cost) cols.push({ key: `${prefix}_cost`, label: costLabel });
      // If neither, show a generic "Value" column using whichever is available
      if (!has_mrp && !has_cost) {
        cols.push({ key: `${prefix}_mrp`, label: mrpLabel.replace('(MRP)', 'Value') });
      }
      return cols;
    };

    // Per-unit price columns (from schema). Shown when schema has mrp/cost enabled.
    const priceCols = () => {
      const cols = [];
      if (has_mrp) cols.push({ key: 'mrp', label: 'MRP' });
      if (has_cost) cols.push({ key: 'cost', label: 'Cost' });
      return cols;
    };
    
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
          ...priceCols(),
          { key: 'stock_qty', label: 'Stock Qty' },
          ...valCols('stock_value', 'Stock Val(MRP)', 'Stock Val(Cost)'),
          { key: 'physical_qty', label: 'Physical Qty' },
          ...valCols('physical_value', 'Phys Val(MRP)', 'Phys Val(Cost)'),
          ...(isConsolidatedView ? [{ key: 'reco_qty', label: 'Reco Qty' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            ...valCols('final_value', 'Final Val(MRP)', 'Final Val(Cost)'),
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          ...valCols('diff_value', 'Diff Val(MRP)', 'Diff Val(Cost)'),
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'barcode-wise':
        return [
          { key: 'barcode', label: 'Barcode' },
          { key: 'description', label: 'Description' },
          { key: 'category', label: 'Category' },
          ...ec,
          ...priceCols(),
          { key: 'stock_qty', label: 'Stock Qty' },
          ...valCols('stock_value', 'Stock Val(MRP)', 'Stock Val(Cost)'),
          { key: 'physical_qty', label: 'Physical' },
          ...valCols('physical_value', 'Phys Val(MRP)', 'Phys Val(Cost)'),
          ...(isConsolidatedView ? [{ key: 'reco_qty', label: 'Reco Qty' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            ...valCols('final_value', 'Final Val(MRP)', 'Final Val(Cost)'),
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          ...valCols('diff_value', 'Diff Val(MRP)', 'Diff Val(Cost)'),
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
          ...priceCols(),
          { key: 'barcode_count', label: 'Barcodes' },
          { key: 'stock_qty', label: 'Stock Qty' },
          ...valCols('stock_value', 'Stock Val(MRP)', 'Stock Val(Cost)'),
          { key: 'physical_qty', label: 'Physical' },
          ...valCols('physical_value', 'Phys Val(MRP)', 'Phys Val(Cost)'),
          ...(isConsolidatedView ? [{ key: 'reco_qty', label: 'Reco Qty' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            ...valCols('final_value', 'Final Val(MRP)', 'Final Val(Cost)'),
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          ...valCols('diff_value', 'Diff Val(MRP)', 'Diff Val(Cost)'),
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      case 'category-summary':
        return [
          { key: 'category', label: 'Category' },
          { key: 'item_count', label: 'Items' },
          { key: 'stock_qty', label: 'Stock Qty' },
          ...valCols('stock_value', 'Stock Val(MRP)', 'Stock Val(Cost)'),
          { key: 'physical_qty', label: 'Physical' },
          ...valCols('physical_value', 'Phys Val(MRP)', 'Phys Val(Cost)'),
          ...(isConsolidatedView ? [{ key: 'reco_qty', label: 'Reco Qty' }] : []),
          ...(isConsolidatedView ? [
            { key: 'final_qty', label: 'Final Qty' },
            ...valCols('final_value', 'Final Val(MRP)', 'Final Val(Cost)'),
          ] : []),
          { key: 'diff_qty', label: 'Diff Qty' },
          ...valCols('diff_value', 'Diff Val(MRP)', 'Diff Val(Cost)'),
          { key: 'accuracy_pct', label: 'Accuracy' },
          { key: 'remark', label: 'Remarks' },
        ];
      default:
        return [];
    }
  }, [reportType, isConsolidatedView, extraColumns, schemaValueFields]);

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

    const headerCells = Array.from(table.querySelectorAll('thead > tr:last-child > th'));

    // Build column key → nth-child index map (1-based)
    const colIndexMap = {};
    headerCells.forEach((th, idx) => {
      const col = th.getAttribute('data-col');
      if (col) colIndexMap[col] = idx + 1;
    });

    let css = '';

    // CRITICAL: Apply sticky top to ALL th elements individually
    // Two rows in thead: subtotals row (first-child) at top:0, headers (last-child) at top:28px
    css += `#report-table-area thead tr:first-child th {
      position: sticky !important; top: 0; z-index: 11 !important;
      background-color: #f0fdf4 !important;
    }\n`;
    css += `#report-table-area thead tr:last-child th {
      position: sticky !important; top: 28px; z-index: 10 !important;
      background-color: #f9fafb !important;
    }\n`;
    // Remove sticky from thead itself to avoid conflicts
    css += `#report-table-area thead {
      position: static !important;
    }\n`;

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

      // Header: sticky both top AND left for BOTH thead rows (z-index higher than non-frozen)
      css += `#report-table-area thead tr:first-child th:nth-child(${nth}) {
        position: sticky !important; left: ${offset}px; top: 0;
        z-index: 31 !important; background-color: #f0fdf4 !important;
        box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
      }\n`;
      css += `#report-table-area thead tr:last-child th:nth-child(${nth}) {
        position: sticky !important; left: ${offset}px; top: 28px;
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
  }, [hiddenColumns, frozenColumns, reportType, displayData, selectedSession]);

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

  const exportReport = () => {
    if (!filteredData) return;

    const rows = filteredData.report || [];
    if (rows.length === 0) { toast.error('No data to export'); return; }

    // Build export columns — include mrp/cost as data columns for formulas
    const visibleCols = columnConfig.filter(c => c.key !== '_expand' && !hiddenColumns.has(c.key));
    
    // Determine which extra "source" columns to add (mrp, cost) that formulas need
    const visibleKeys = new Set(visibleCols.map(c => c.key));
    const needsMrp = ['stock_value_mrp', 'physical_value_mrp', 'final_value_mrp', 'diff_value_mrp'].some(k => visibleKeys.has(k));
    const needsCost = ['stock_value_cost', 'physical_value_cost', 'final_value_cost', 'diff_value_cost'].some(k => visibleKeys.has(k));
    
    const exportCols = [...visibleCols];
    if (needsMrp && !visibleKeys.has('mrp')) exportCols.push({ key: 'mrp', label: 'MRP' });
    if (needsCost && !visibleKeys.has('cost')) exportCols.push({ key: 'cost', label: 'Cost' });

    // Map column key → Excel column letter
    const colLetter = (idx) => {
      let s = '';
      let n = idx;
      while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
      return s;
    };
    const keyToCol = {};
    exportCols.forEach((c, i) => { keyToCol[c.key] = colLetter(i); });

    // Formula columns mapping
    const formulaKeys = {
      'stock_value_mrp':    (r) => keyToCol['stock_qty'] && keyToCol['mrp'] ? `${keyToCol['stock_qty']}${r}*${keyToCol['mrp']}${r}` : null,
      'stock_value_cost':   (r) => keyToCol['stock_qty'] && keyToCol['cost'] ? `${keyToCol['stock_qty']}${r}*${keyToCol['cost']}${r}` : null,
      'physical_value_mrp': (r) => keyToCol['physical_qty'] && keyToCol['mrp'] ? `${keyToCol['physical_qty']}${r}*${keyToCol['mrp']}${r}` : null,
      'physical_value_cost':(r) => keyToCol['physical_qty'] && keyToCol['cost'] ? `${keyToCol['physical_qty']}${r}*${keyToCol['cost']}${r}` : null,
      'final_qty':          (r) => keyToCol['physical_qty'] && keyToCol['reco_qty'] ? `${keyToCol['physical_qty']}${r}+${keyToCol['reco_qty']}${r}` : null,
      'final_value_mrp':    (r) => keyToCol['final_qty'] && keyToCol['mrp'] ? `${keyToCol['final_qty']}${r}*${keyToCol['mrp']}${r}` : null,
      'final_value_cost':   (r) => keyToCol['final_qty'] && keyToCol['cost'] ? `${keyToCol['final_qty']}${r}*${keyToCol['cost']}${r}` : null,
      'diff_qty':           (r) => {
        const physCol = keyToCol['final_qty'] || keyToCol['physical_qty'];
        return physCol && keyToCol['stock_qty'] ? `${physCol}${r}-${keyToCol['stock_qty']}${r}` : null;
      },
      'difference_qty':     (r) => {
        const physCol = keyToCol['final_qty'] || keyToCol['physical_qty'];
        return physCol && keyToCol['stock_qty'] ? `${physCol}${r}-${keyToCol['stock_qty']}${r}` : null;
      },
      'diff_value_mrp':     (r) => {
        const fvCol = keyToCol['final_value_mrp'] || keyToCol['physical_value_mrp'];
        return fvCol && keyToCol['stock_value_mrp'] ? `${fvCol}${r}-${keyToCol['stock_value_mrp']}${r}` : null;
      },
      'diff_value_cost':    (r) => {
        const fvCol = keyToCol['final_value_cost'] || keyToCol['physical_value_cost'];
        return fvCol && keyToCol['stock_value_cost'] ? `${fvCol}${r}-${keyToCol['stock_value_cost']}${r}` : null;
      },
      'accuracy_pct':       (r) => {
        const sqCol = keyToCol['stock_qty'];
        const pqCol = keyToCol['final_qty'] || keyToCol['physical_qty'];
        return sqCol && pqCol ? `IF(${sqCol}${r}=0,IF(${pqCol}${r}=0,100,0),MIN(${pqCol}${r}/${sqCol}${r}*100,100))` : null;
      },
    };

    // Text/non-formula columns
    const textKeys = new Set(['location', 'barcode', 'description', 'category', 'article_code', 'article_name', 'status', 'remark']);

    // Build worksheet
    const wb = XLSX.utils.book_new();
    const wsData = [];

    // Header row
    wsData.push(exportCols.map(c => c.label));

    // Data rows (with raw values — formulas will be overlaid)
    rows.forEach(row => {
      wsData.push(exportCols.map(col => {
        let val = row[col.key];
        if (col.key === 'status') val = val === 'empty_bin' ? 'Empty Bin' : val === 'pending' ? 'Pending' : val === 'conflict' ? 'Conflict' : 'Completed';
        if (col.key === 'barcode_count') val = row.barcodes ? row.barcodes.length : (val || 0);
        if (val === undefined || val === null) val = '';
        return val;
      }));
    });

    // Totals row placeholder
    wsData.push(exportCols.map(() => ''));

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Overlay formulas on data rows
    const dataStartRow = 2; // row 1 = header (1-indexed in Excel)
    const dataEndRow = dataStartRow + rows.length - 1;
    const totalsRow = dataEndRow + 1;

    for (let ri = 0; ri < rows.length; ri++) {
      const excelRow = dataStartRow + ri;
      exportCols.forEach((col, ci) => {
        const cellRef = `${colLetter(ci)}${excelRow}`;
        if (formulaKeys[col.key]) {
          const formula = formulaKeys[col.key](excelRow);
          if (formula) {
            const currentVal = rows[ri][col.key];
            ws[cellRef] = { t: 'n', f: formula, v: typeof currentVal === 'number' ? currentVal : 0 };
          }
        }
      });
    }

    // Totals row with SUM formulas
    exportCols.forEach((col, ci) => {
      const cellRef = `${colLetter(ci)}${totalsRow}`;
      if (ci === 0) {
        ws[cellRef] = { t: 's', v: 'TOTAL' };
      } else if (textKeys.has(col.key) || col.key === 'barcode_count') {
        ws[cellRef] = { t: 's', v: '' };
      } else if (col.key === 'accuracy_pct') {
        const sqCol = keyToCol['stock_qty'];
        const pqCol = keyToCol['final_qty'] || keyToCol['physical_qty'];
        if (sqCol && pqCol) {
          const formula = `IF(${sqCol}${totalsRow}=0,IF(${pqCol}${totalsRow}=0,100,0),MIN(${pqCol}${totalsRow}/${sqCol}${totalsRow}*100,100))`;
          ws[cellRef] = { t: 'n', f: formula, v: filteredData.totals?.accuracy_pct || 0 };
        }
      } else {
        const sumFormula = `SUM(${colLetter(ci)}${dataStartRow}:${colLetter(ci)}${dataEndRow})`;
        const fallbackVal = filteredData.totals?.[col.key] || 0;
        ws[cellRef] = { t: 'n', f: sumFormula, v: typeof fallbackVal === 'number' ? fallbackVal : 0 };
      }
    });

    // Set column widths
    ws['!cols'] = exportCols.map(col => {
      if (textKeys.has(col.key)) return { wch: col.key === 'description' ? 30 : col.key === 'remark' ? 25 : 15 };
      return { wch: 14 };
    });

    // Update sheet range
    ws['!ref'] = `A1:${colLetter(exportCols.length - 1)}${totalsRow}`;

    XLSX.utils.book_append_sheet(wb, ws, 'Variance Report');

    const suffix = varianceCategory !== 'all' ? `_${varianceCategory}` : '';
    const filename = `${reportType}_report${suffix}_${selectedSession}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`Report exported with formulas! (${rows.length} rows)`);
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

  // ─── PDF EXPORT ─── Branded PDF with summary KPIs + table
  const exportPDF = () => {
    if (!filteredData) return;
    const rows = filteredData.report || [];
    if (rows.length === 0) { toast.error('No data to export'); return; }

    const client = clients.find(c => c.id === selectedClient);
    const session = selectedSession === '__consolidated__'
      ? { name: 'All Sessions (Consolidated)', variance_mode: '—' }
      : sessions.find(s => s.id === selectedSession);

    const reportLabel = reportOptions.find(r => r.value === reportType)?.label || reportType;
    const visibleCols = columnConfig.filter(c => c.key !== '_expand' && !hiddenColumns.has(c.key));

    // Summary KPIs from current filtered data
    const totals = rows.reduce((acc, r) => {
      acc.stock += Number(r.stock_qty || 0);
      acc.physical += Number(r.physical_qty || 0);
      acc.diff += Number(r.diff_qty || 0);
      return acc;
    }, { stock: 0, physical: 0, diff: 0 });
    const accuracy = totals.stock > 0
      ? Math.min(100, (Math.min(totals.stock, totals.physical) / totals.stock) * 100)
      : 0;

    const summary = [
      { label: 'Expected', value: totals.stock.toLocaleString('en-IN'), color: 'slate' },
      { label: 'Physical', value: totals.physical.toLocaleString('en-IN'), color: 'blue' },
      { label: 'Variance', value: (totals.diff > 0 ? '+' : '') + totals.diff.toLocaleString('en-IN'), color: totals.diff < 0 ? 'rose' : 'emerald' },
      { label: 'Accuracy', value: accuracy.toFixed(1) + '%', color: accuracy >= 98 ? 'emerald' : accuracy >= 75 ? 'amber' : 'rose' },
      { label: 'Rows', value: rows.length.toLocaleString('en-IN'), color: 'emerald' },
    ];

    // Table head & body from visible columns
    const formatCell = (v, col) => {
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'number') {
        const needsDecimals = ['mrp', 'cost'].some(k => col.key.includes(k)) || col.key.includes('value');
        return v.toLocaleString('en-IN', { minimumFractionDigits: needsDecimals ? 2 : 0, maximumFractionDigits: needsDecimals ? 2 : 0 });
      }
      return String(v).slice(0, 60);
    };

    const head = [visibleCols.map(c => c.label)];
    const body = rows.map(r => visibleCols.map(c => formatCell(r[c.key], c)));

    const meta = {
      'Client': client?.name || '—',
      'Session': session?.name || '—',
      'Report Type': reportLabel,
      'Variance Mode': session?.variance_mode || '—',
      'Generated By': JSON.parse(localStorage.getItem('auditPortalUser') || '{}').username || 'admin',
      'Total Rows': rows.length,
    };

    const filename = `${(client?.code || client?.name || 'audit').replace(/\s+/g, '_')}_${reportLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

    try {
      generatePDF({
        title: `${reportLabel} Report`,
        subtitle: `${client?.name || 'Client'} · ${session?.name || ''}`,
        meta,
        summary,
        tableHead: head,
        tableBody: body,
        filename,
      });
      toast.success('PDF downloaded');
    } catch (e) {
      console.error(e);
      toast.error('PDF generation failed');
    }
  };

  return (
    <div className="p-3 md:p-4 lg:p-5">
      <PageHeader
        title="Reports"
        subtitle="Variance analysis and audit reports"
        breadcrumbs={[{ label: 'Reports' }]}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeFilterCount > 0 && (
              <Button onClick={clearAllFilters} variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-xs">
                <X className="w-3 h-3 mr-1" />
                Clear {activeFilterCount}
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
              <Button onClick={exportReport} variant="outline" size="sm" data-testid="export-excel-btn" className="h-8 text-xs gap-1">
                <Download className="w-3.5 h-3.5" />
                Excel
              </Button>
            )}
            {filteredData && (
              <Button onClick={exportPDF} variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50 h-8 text-xs gap-1" data-testid="export-pdf-btn">
                <FilePdfIcon className="w-3.5 h-3.5" />
                PDF
              </Button>
            )}
            {filteredData && reportType !== 'pending-locations' && reportType !== 'empty-bins' && (
              <FullScreenButton onClick={() => setIsFullScreen(true)} />
            )}
          </div>
        }
      />

      {/* Compact Filters Bar */}
      <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-slate-200">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Client</label>
          <select
            value={selectedClient}
            onChange={(e) => {
              setSelectedClient(e.target.value);
              setSelectedSession('');
              setReportData(null);
            }}
            className="w-full h-8 px-2 border border-slate-200 rounded-md text-[13px] bg-white hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors"
          >
            <option value="">Select Client</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Audit Session</label>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="w-full h-8 px-2 border border-slate-200 rounded-md text-[13px] bg-white hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors disabled:bg-slate-50 disabled:text-slate-400"
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
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full h-8 px-2 border border-slate-200 rounded-md text-[13px] bg-white hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors disabled:bg-slate-50 disabled:text-slate-400"
            disabled={!selectedSession}
          >
            {reportOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Variance Category Filter Row (compact pill bar) */}
      {selectedSession && reportData && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Variance</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {VARIANCE_CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setVarianceCategory(cat.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  varianceCategory === cat.value
                    ? cat.value === 'all' ? 'bg-slate-800 text-white'
                      : cat.value === 'negative' ? 'bg-rose-500 text-white'
                      : cat.value === 'positive' ? 'bg-emerald-500 text-white'
                      : cat.value === 'matched' ? 'bg-blue-500 text-white'
                      : cat.value === 'in_system_not_found' ? 'bg-amber-500 text-white'
                      : 'bg-violet-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={cat.description}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {filteredData && reportData && filteredData.report && reportData.report && (
            <span className="text-[11px] text-slate-400 ml-auto">
              Showing <span className="font-semibold text-slate-700">{filteredData.report.length.toLocaleString('en-IN')}</span> of <span className="font-semibold text-slate-700">{reportData.report.length.toLocaleString('en-IN')}</span> rows
            </span>
          )}
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
          {/* Subtotals are now shown as first row inside each table's thead */}

          {/* Report Table — Reco editing only on the primary report type for the session's variance mode */}
          {columnStyleCSS && <style>{columnStyleCSS}</style>}
          <div ref={tableContainerRef} id="report-table-area">
          {reportType === 'bin-wise' && <BinWiseTable data={displayData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} isConsolidated={isConsolidatedView} />}
          {reportType === 'detailed' && <DetailedTable data={displayData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isConsolidated={isConsolidatedView} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'bin-wise'} extraColumns={reportData?.extra_columns || []} clientId={selectedClient} onRefresh={fetchReport} schemaValueFields={schemaValueFields} />}
          {reportType === 'barcode-wise' && <BarcodeWiseTable data={displayData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'barcode-wise'} isConsolidated={isConsolidatedView} extraColumns={reportData?.extra_columns || []} clientId={selectedClient} onRefresh={fetchReport} schemaValueFields={schemaValueFields} />}
          {reportType === 'article-wise' && <ArticleWiseTable data={displayData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} onSaveReco={saveRecoAdjustment} isRecoEditable={isConsolidatedView && sessionInfo?.variance_mode === 'article-wise'} isConsolidated={isConsolidatedView} extraColumns={reportData?.extra_columns || []} clientId={selectedClient} onRefresh={fetchReport} schemaValueFields={schemaValueFields} />}
          {reportType === 'category-summary' && <CategorySummaryTable data={displayData} getVarianceIcon={getVarianceIcon} getVarianceClass={getVarianceClass} getAccuracyClass={getAccuracyClass} getRemarkIcon={getRemarkIcon} sortConfig={sortConfig} onSort={handleSort} columnFilters={columnFilters} onFilterChange={handleColumnFilter} numericFilters={numericFilters} onNumericFilterChange={handleNumericFilter} getColumnValues={getColumnValues} isConsolidated={isConsolidatedView} />}
          </div>
          {/* Load More button for large datasets */}
          {hasMoreRows && reportType !== 'empty-bins' && reportType !== 'pending-locations' && (
            <div className="mt-3 bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {visibleRowCount} of {filteredData.report.length} rows
              </span>
              <div className="flex gap-2">
                <Button onClick={loadMoreRows} variant="outline" size="sm">
                  Load {Math.min(MAX_VISIBLE_ROWS, filteredData.report.length - visibleRowCount)} More
                </Button>
                <Button onClick={showAllRows} variant="outline" size="sm" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                  Show All ({filteredData.report.length})
                </Button>
              </div>
            </div>
          )}
          {reportType === 'empty-bins' && <EmptyBinsView data={reportData} />}
          {reportType === 'pending-locations' && <PendingLocationsView data={reportData} clientId={selectedClient} />}
        </>
      )}

      {/* Full Screen Report View */}
      <FullScreenReport
        open={isFullScreen}
        onClose={() => setIsFullScreen(false)}
        title={`${reportOptions.find(o => o.value === reportType)?.label || reportType} — ${sessions.find(s => s.id === selectedSession)?.name || 'All Consolidated'}`}
        onExport={exportReport}
        gridData={filteredData?.report || []}
        gridTotals={filteredData?.totals || null}
        gridColumns={columnConfig}
        sortConfig={sortConfig}
        onSort={handleSort}
        activeFilters={columnFilters}
        onFilterChange={handleColumnFilter}
        numericFilters={numericFilters}
        onNumericFilterChange={handleNumericFilter}
        getColumnValues={getColumnValues}
        frozenColumns={frozenColumns}
        hiddenColumns={hiddenColumns}
        onToggleFreeze={toggleColumnFreeze}
        onToggleVisibility={toggleColumnVisibility}
        onShowAllColumns={showAllColumns}
        onResetColumns={resetColumnSettings}
        onSaveReco={saveRecoAdjustment}
        isConsolidated={isConsolidatedView}
        reportType={reportType}
        totalRows={filteredData?.report?.length || 0}
        clientId={selectedClient}
        onRefresh={fetchReport}
      />
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
    <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[10px] text-gray-500 leading-tight truncate">{label}</p>
      <p className={`text-sm font-bold ${colorClass} leading-snug`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

// ============ Subtotal Cell Helper ============
function SubtotalCell({ value, isVariance, isAccuracy, className = '' }) {
  if (value === undefined || value === null || value === '') return <th className={`py-1.5 px-3 text-right text-[11px] font-semibold ${className}`}></th>;
  let colorClass = 'text-gray-800';
  const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,%]/g, ''));
  if (isVariance && !isNaN(numVal)) {
    if (numVal > 0) colorClass = 'text-emerald-700';
    else if (numVal < 0) colorClass = 'text-red-700';
  }
  if (isAccuracy && !isNaN(numVal)) {
    if (numVal >= 98) colorClass = 'text-emerald-700';
    else if (numVal >= 90) colorClass = 'text-blue-700';
    else if (numVal >= 75) colorClass = 'text-amber-700';
    else colorClass = 'text-red-700';
  }
  const display = typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
  return <th className={`py-1.5 px-3 text-right text-[11px] font-bold ${colorClass} ${className}`}>{display}</th>;
}

// ============ Bin-wise Table ============
function BinWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, isConsolidated }) {
  const summary = data.summary || {};
  const t = data.totals || {};
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
          <thead className="bg-gray-50">
            <tr>
              <th data-col="status" className="py-1.5 px-4 text-left text-[11px] font-bold text-emerald-800">Subtotals</th>
              <th data-col="location" className="py-1.5 px-4"></th>
              <SubtotalCell value={t.stock_qty} />
              <SubtotalCell value={t.physical_qty} />
              {isConsolidated && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_qty ?? t.physical_qty} />}
              <SubtotalCell value={t.difference_qty} isVariance />
              <SubtotalCell value={`${t.accuracy_pct || 0}%`} isAccuracy />
              <th data-col="remark" className="py-1.5 px-4"></th>
            </tr>
            <tr>
              <SortableHeader column="status" label="Status" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('status')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="location" label="Location" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('location')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isConsolidated && <SortableHeader column="reco_qty" label="Reco Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
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
                  {isConsolidated && <td className="py-3 px-4 text-right text-blue-600">{row.reco_qty || 0}</td>}
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
function DetailedTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isConsolidated, isRecoEditable, extraColumns = [], clientId, onRefresh, schemaValueFields = { has_mrp: true, has_cost: true } }) {
  const t = data.totals || {};
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: data.report.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Detailed Item-wise Report</h3>
        {isRecoEditable && <p className="text-xs text-gray-500 mt-1">Click the Reco column to adjust quantities. Final Qty = Physical + Reco.</p>}
        {isConsolidated && !isRecoEditable && <p className="text-xs text-gray-500 mt-1">Reco Qty and Final Qty shown from consolidated adjustments (read-only).</p>}
      </div>
      <div ref={parentRef} className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-xs report-table">
          <thead className="bg-gray-50">
            <tr>
              <th data-col="location" className="py-1.5 px-3 text-left text-[11px] font-bold text-emerald-800">Subtotals</th>
              <th data-col="barcode" className="py-1.5 px-3"></th>
              <th data-col="description" className="py-1.5 px-3"></th>
              <th data-col="category" className="py-1.5 px-3"></th>
              {extraColumns.map(col => <th key={col.name} data-col={col.name} className="py-1.5 px-3"></th>)}
              {schemaValueFields.has_mrp && <th data-col="mrp" className="py-1.5 px-3"></th>}
              {schemaValueFields.has_cost && <th data-col="cost" className="py-1.5 px-3"></th>}
              <SubtotalCell value={t.stock_qty} />
              <SubtotalCell value={t.stock_value_mrp || 0} />
              <SubtotalCell value={t.stock_value_cost || 0} />
              <SubtotalCell value={t.physical_qty} />
              <SubtotalCell value={t.physical_value_mrp || 0} />
              <SubtotalCell value={t.physical_value_cost || 0} />
              {isRecoEditable && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && !isRecoEditable && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_qty ?? t.physical_qty} />}
              {isConsolidated && <SubtotalCell value={t.final_value_mrp || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_value_cost || 0} />}
              <SubtotalCell value={t.diff_qty} isVariance />
              <SubtotalCell value={t.diff_value_mrp || 0} isVariance />
              <SubtotalCell value={t.diff_value_cost || 0} isVariance />
              <SubtotalCell value={`${t.accuracy_pct || 0}%`} isAccuracy />
              <th data-col="remark" className="py-1.5 px-3"></th>
            </tr>
            <tr>
              <SortableHeader column="location" label="Location" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('location')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="barcode" label="Barcode" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="description" label="Description" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('description')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              {schemaValueFields.has_mrp && <SortableHeader column="mrp" label="MRP" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {schemaValueFields.has_cost && <SortableHeader column="cost" label="Cost" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <SortableHeader column="reco_qty" label="Reco" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-blue-700 bg-blue-50/50" />}
              {isConsolidated && !isRecoEditable && <SortableHeader column="reco_qty" label="Reco Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_mrp" label="Final Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_cost" label="Final Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[200px]" />
            </tr>
          </thead>
          <tbody>
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }} />
            )}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = data.report[virtualRow.index];
              const i = virtualRow.index;
              return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">{row.location || '-'}</td>
                <td className="py-2 px-3 font-mono"><BarcodeEditCell value={row.barcode} row={row} clientId={clientId} reportType="detailed" field="barcode" onEditComplete={onRefresh} /></td>
                <td className="py-2 px-3">{row.description || '-'}</td>
                <td className="py-2 px-3">{row.category || '-'}</td>
                {extraColumns.map(col => (
                  <td key={col.name} className="py-2 px-3 text-purple-700">{row[col.name] || '-'}</td>
                ))}
                {schemaValueFields.has_mrp && <td className="py-2 px-3 text-right text-gray-500">{(row.mrp || 0).toFixed(2)}</td>}
                {schemaValueFields.has_cost && <td className="py-2 px-3 text-right text-gray-500">{(row.cost || 0).toFixed(2)}</td>}
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
                {isConsolidated && !isRecoEditable && <td className="py-2 px-3 text-right text-blue-600">{row.reco_qty || 0}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_mrp || 0).toFixed(2)}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_cost || 0).toFixed(2)}</td>}
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
              );
            })}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0)}px` }} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Barcode-wise Table ============
function BarcodeWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isRecoEditable, isConsolidated, extraColumns = [], clientId, onRefresh, schemaValueFields = { has_mrp: true, has_cost: true } }) {
  const t = data.totals || {};
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: data.report.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          Barcode-wise Variance Report
        </h3>
        {isRecoEditable ? (
          <p className="text-xs text-gray-500 mt-1">Click the Reco column to adjust quantities. Final Qty = Physical + Reco.</p>
        ) : isConsolidated ? (
          <p className="text-xs text-gray-500 mt-1">Reco Qty and Final Qty shown from consolidated adjustments (read-only).</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Variance report by barcode across all locations</p>
        )}
      </div>
      <div ref={parentRef} className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50">
            <tr>
              <th data-col="barcode" className="py-1.5 px-3 text-left text-[11px] font-bold text-emerald-800">Subtotals</th>
              <th data-col="description" className="py-1.5 px-3"></th>
              <th data-col="category" className="py-1.5 px-3"></th>
              {extraColumns.map(col => <th key={col.name} data-col={col.name} className="py-1.5 px-3"></th>)}
              {schemaValueFields.has_mrp && <th data-col="mrp" className="py-1.5 px-3"></th>}
              {schemaValueFields.has_cost && <th data-col="cost" className="py-1.5 px-3"></th>}
              <SubtotalCell value={t.stock_qty} />
              <SubtotalCell value={t.stock_value_mrp || 0} />
              <SubtotalCell value={t.stock_value_cost || 0} />
              <SubtotalCell value={t.physical_qty} />
              <SubtotalCell value={t.physical_value_mrp || 0} />
              <SubtotalCell value={t.physical_value_cost || 0} />
              {isRecoEditable && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && !isRecoEditable && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_qty ?? t.physical_qty} />}
              {isConsolidated && <SubtotalCell value={t.final_value_mrp || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_value_cost || 0} />}
              <SubtotalCell value={t.diff_qty} isVariance />
              <SubtotalCell value={t.diff_value_mrp || 0} isVariance />
              <SubtotalCell value={t.diff_value_cost || 0} isVariance />
              <SubtotalCell value={`${t.accuracy_pct || 0}%`} isAccuracy />
              <th data-col="remark" className="py-1.5 px-3"></th>
            </tr>
            <tr>
              <SortableHeader column="barcode" label="Barcode" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="description" label="Description" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('description')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              {schemaValueFields.has_mrp && <SortableHeader column="mrp" label="MRP" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {schemaValueFields.has_cost && <SortableHeader column="cost" label="Cost" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <SortableHeader column="reco_qty" label="Reco" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-blue-700 bg-blue-50/50" />}
              {isConsolidated && !isRecoEditable && <SortableHeader column="reco_qty" label="Reco Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_mrp" label="Final Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_cost" label="Final Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="diff_qty" label="Diff Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_mrp" label="Diff Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="diff_value_cost" label="Diff Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('diff_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="accuracy_pct" label="Accuracy" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('accuracy_pct')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="remark" label="Remarks" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('remark')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="min-w-[220px]" />
            </tr>
          </thead>
          <tbody>
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }} />
            )}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = data.report[virtualRow.index];
              const i = virtualRow.index;
              return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-mono text-xs"><BarcodeEditCell value={row.barcode} row={row} clientId={clientId} reportType="barcode-wise" field="barcode" onEditComplete={onRefresh} compact /></td>
                <td className="py-2 px-3">{row.description || '-'}</td>
                <td className="py-2 px-3">
                  {row.category ? (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{row.category}</span>
                  ) : '-'}
                </td>
                {extraColumns.map(col => (
                  <td key={col.name} className="py-2 px-3 text-xs text-purple-700">{row[col.name] || '-'}</td>
                ))}
                {schemaValueFields.has_mrp && <td className="py-2 px-3 text-right text-gray-500">{(row.mrp || 0).toFixed(2)}</td>}
                {schemaValueFields.has_cost && <td className="py-2 px-3 text-right text-gray-500">{(row.cost || 0).toFixed(2)}</td>}
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
                {isConsolidated && !isRecoEditable && <td className="py-2 px-3 text-right text-blue-600">{row.reco_qty || 0}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_mrp || 0).toFixed(2)}</td>}
                {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_cost || 0).toFixed(2)}</td>}
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
              );
            })}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0)}px` }} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Article-wise Table ============
function ArticleWiseTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, onSaveReco, isRecoEditable, isConsolidated, extraColumns = [], clientId, onRefresh, schemaValueFields = { has_mrp: true, has_cost: true } }) {
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
        ) : isConsolidated ? (
          <p className="text-xs text-gray-500 mt-1">Reco Qty and Final Qty shown from consolidated adjustments (read-only). Click a row to view barcodes.</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Variance report by article. Click a row to view barcodes.</p>
        )}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-full text-sm report-table">
          <thead className="bg-gray-50">
            <tr>
              <th data-col="_expand" className="py-1.5 px-2"></th>
              <th data-col="article_code" className="py-1.5 px-3 text-left text-[11px] font-bold text-emerald-800">Subtotals</th>
              <th data-col="article_name" className="py-1.5 px-3"></th>
              <th data-col="category" className="py-1.5 px-3"></th>
              {extraColumns.map(col => <th key={col.name} data-col={col.name} className="py-1.5 px-3"></th>)}
              {schemaValueFields.has_mrp && <th data-col="mrp" className="py-1.5 px-3"></th>}
              {schemaValueFields.has_cost && <th data-col="cost" className="py-1.5 px-3"></th>}
              <SubtotalCell value={data.totals?.barcode_count_total} />
              <SubtotalCell value={data.totals?.stock_qty} />
              <SubtotalCell value={data.totals?.stock_value_mrp || 0} />
              <SubtotalCell value={data.totals?.stock_value_cost || 0} />
              <SubtotalCell value={data.totals?.physical_qty} />
              <SubtotalCell value={data.totals?.physical_value_mrp || 0} />
              <SubtotalCell value={data.totals?.physical_value_cost || 0} />
              {isRecoEditable && <SubtotalCell value={data.totals?.reco_qty || 0} />}
              {isConsolidated && !isRecoEditable && <SubtotalCell value={data.totals?.reco_qty || 0} />}
              {isConsolidated && <SubtotalCell value={data.totals?.final_qty ?? data.totals?.physical_qty} />}
              {isConsolidated && <SubtotalCell value={data.totals?.final_value_mrp || 0} />}
              {isConsolidated && <SubtotalCell value={data.totals?.final_value_cost || 0} />}
              <SubtotalCell value={data.totals?.diff_qty} isVariance />
              <SubtotalCell value={data.totals?.diff_value_mrp || 0} isVariance />
              <SubtotalCell value={data.totals?.diff_value_cost || 0} isVariance />
              <SubtotalCell value={`${data.totals?.accuracy_pct || 0}%`} isAccuracy />
              <th data-col="remark" className="py-1.5 px-3"></th>
            </tr>
            <tr>
              <th data-col="_expand" className="w-8 py-3 px-2"></th>
              <SortableHeader column="article_code" label="Article Code" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('article_code')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="article_name" label="Article Name" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('article_name')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {extraColumns.map(col => (
                <SortableHeader key={col.name} column={col.name} label={col.label} sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues(col.name)} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-purple-600" />
              ))}
              {schemaValueFields.has_mrp && <SortableHeader column="mrp" label="MRP" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {schemaValueFields.has_cost && <SortableHeader column="cost" label="Cost" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              <SortableHeader column="barcode_count" label="Barcodes" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('barcode_count')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isRecoEditable && <SortableHeader column="reco_qty" label="Reco" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} className="text-blue-700 bg-blue-50/50" />}
              {isConsolidated && !isRecoEditable && <SortableHeader column="reco_qty" label="Reco Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_mrp" label="Final Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_cost" label="Final Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
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
                  <td className="py-2 px-3 font-mono text-xs font-medium"><BarcodeEditCell value={row.article_code} row={row} clientId={clientId} reportType="article-wise" field="article_code" onEditComplete={onRefresh} compact /></td>
                  <td className="py-2 px-3">{row.article_name || '-'}</td>
                  <td className="py-2 px-3">
                    {row.category ? <span className={`px-2 py-0.5 rounded text-xs ${row.category === 'Unmapped' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>{row.category}</span> : '-'}
                  </td>
                  {extraColumns.map(col => (
                    <td key={col.name} className="py-2 px-3 text-xs text-purple-700">{row[col.name] || '-'}</td>
                  ))}
                  {schemaValueFields.has_mrp && <td className="py-2 px-3 text-right text-gray-500">{(row.mrp || 0).toFixed(2)}</td>}
                  {schemaValueFields.has_cost && <td className="py-2 px-3 text-right text-gray-500">{(row.cost || 0).toFixed(2)}</td>}
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
                  {isConsolidated && !isRecoEditable && <td className="py-2 px-3 text-right text-blue-600">{row.reco_qty || 0}</td>}
                  {isConsolidated && <td className="py-2 px-3 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                  {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_mrp || 0).toFixed(2)}</td>}
                  {isConsolidated && <td className="py-2 px-3 text-right text-gray-500">{(row.final_value_cost || 0).toFixed(2)}</td>}
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
                    <td colSpan={12 + extraColumns.length + (schemaValueFields.has_mrp ? 1 : 0) + (schemaValueFields.has_cost ? 1 : 0)} className="py-2 px-6">
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
        </table>
      </div>
    </div>
  );
}

// ============ Category Summary Table ============
function CategorySummaryTable({ data, getVarianceIcon, getVarianceClass, getAccuracyClass, getRemarkIcon, sortConfig, onSort, columnFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues, isConsolidated }) {
  const t = data.totals || {};
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
          <thead className="bg-gray-50">
            <tr>
              <th data-col="category" className="py-1.5 px-4 text-left text-[11px] font-bold text-emerald-800">Subtotals</th>
              <SubtotalCell value={t.item_count} />
              <SubtotalCell value={t.stock_qty} />
              <SubtotalCell value={t.stock_value_mrp || 0} />
              <SubtotalCell value={t.stock_value_cost || 0} />
              <SubtotalCell value={t.physical_qty} />
              <SubtotalCell value={t.physical_value_mrp || 0} />
              <SubtotalCell value={t.physical_value_cost || 0} />
              {isConsolidated && <SubtotalCell value={t.reco_qty || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_qty ?? t.physical_qty} />}
              {isConsolidated && <SubtotalCell value={t.final_value_mrp || 0} />}
              {isConsolidated && <SubtotalCell value={t.final_value_cost || 0} />}
              <SubtotalCell value={t.diff_qty} isVariance />
              <SubtotalCell value={t.diff_value_mrp || 0} isVariance />
              <SubtotalCell value={t.diff_value_cost || 0} isVariance />
              <SubtotalCell value={`${t.accuracy_pct || 0}%`} isAccuracy />
              <th data-col="remark" className="py-1.5 px-4"></th>
            </tr>
            <tr>
              <SortableHeader column="category" label="Category" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('category')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="item_count" label="Items" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('item_count')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_qty" label="Stock Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_mrp" label="Stock Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="stock_value_cost" label="Stock Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('stock_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_qty" label="Physical" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_mrp" label="Phys Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              <SortableHeader column="physical_value_cost" label="Phys Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('physical_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />
              {isConsolidated && <SortableHeader column="reco_qty" label="Reco Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('reco_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_qty" label="Final Qty" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_qty')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_mrp" label="Final Val(MRP)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_mrp')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
              {isConsolidated && <SortableHeader column="final_value_cost" label="Final Val(Cost)" align="right" sortConfig={sortConfig} onSort={onSort} allValues={getColumnValues('final_value_cost')} activeFilters={columnFilters} onFilterChange={onFilterChange} numericFilters={numericFilters} onNumericFilterChange={onNumericFilterChange} />}
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
                {isConsolidated && <td className="py-3 px-4 text-right text-blue-600">{row.reco_qty || 0}</td>}
                {isConsolidated && <td className="py-3 px-4 text-right font-semibold">{row.final_qty ?? row.physical_qty}</td>}
                {isConsolidated && <td className="py-3 px-4 text-right text-gray-500">{(row.final_value_mrp || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>}
                {isConsolidated && <td className="py-3 px-4 text-right text-gray-500">{(row.final_value_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>}
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
function PendingLocationsView({ data, clientId }) {
  const [selectedLocs, setSelectedLocs] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const summary = data?.summary || {};
  const pending = data?.pending || [];
  const completed = data?.completed || [];
  const emptyBins = data?.empty_bins || [];

  // Build a map: location_name → assigned device
  const assignedMap = useMemo(() => {
    const m = {};
    (assignments || []).forEach(a => {
      (a.location_names || []).forEach(loc => { m[loc] = a.device_name; });
    });
    return m;
  }, [assignments]);

  // Fetch devices & existing assignments
  const fetchDevicesAndAssignments = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const [devRes, assRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/audit/portal/devices`),
        fetch(`${BACKEND_URL}/api/audit/portal/location-assignments?client_id=${clientId}`)
      ]);
      if (devRes.ok) { const devs = await devRes.json(); setDevices(devs || []); }
      if (assRes.ok) { const ass = await assRes.json(); setAssignments(ass.assignments || []); }
    } catch (e) { console.error(e); }
    setLoadingDevices(false);
  }, [clientId]);

  useEffect(() => { if (clientId) fetchDevicesAndAssignments(); }, [clientId, fetchDevicesAndAssignments]);

  if (!data) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const toggleLoc = (locName) => {
    setSelectedLocs(prev => {
      const next = new Set(prev);
      if (next.has(locName)) next.delete(locName); else next.add(locName);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLocs.size === pending.length) setSelectedLocs(new Set());
    else setSelectedLocs(new Set(pending.map(l => l.location_name)));
  };

  const handleAssign = async () => {
    if (!selectedDevice || selectedLocs.size === 0) return;
    setAssigning(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/assign-pending-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          session_id: '',
          device_name: selectedDevice,
          location_names: Array.from(selectedLocs)
        })
      });
      if (res.ok) {
        const r = await res.json();
        toast.success(r.message || 'Locations assigned!');
        setSelectedLocs(new Set());
        setShowAssignModal(false);
        setSelectedDevice('');
        fetchDevicesAndAssignments();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Assignment failed');
      }
    } catch (e) { toast.error('Network error'); }
    setAssigning(false);
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/location-assignments/${assignmentId}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Assignment removed'); fetchDevicesAndAssignments(); }
    } catch (e) { toast.error('Failed to remove'); }
  };
  
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

      {/* Device Assignments Summary */}
      {assignments.length > 0 && (
        <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-indigo-800 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Location Assignments
            </h3>
          </div>
          <div className="p-3 space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-indigo-50/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{a.device_name}</span>
                  <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium shrink-0">{(a.location_names || []).length} locations</span>
                </div>
                <button onClick={() => handleRemoveAssignment(a.id)} className="text-red-400 hover:text-red-600 p-1" title="Remove assignment">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Locations with Checkboxes */}
      {pending.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Pending Locations ({pending.length})
                </h3>
                <p className="text-xs text-red-600 mt-0.5">Select locations and assign to a scanner device</p>
              </div>
              {selectedLocs.size > 0 && (
                <Button size="sm" onClick={() => setShowAssignModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1">
                  <Send className="w-3.5 h-3.5" />
                  Assign {selectedLocs.size} to Device
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-3 text-left w-10">
                    <input type="checkbox" checked={selectedLocs.size === pending.length && pending.length > 0} onChange={toggleAll} className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400 w-4 h-4" />
                  </th>
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">Location Name</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-center">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((loc, idx) => {
                  const isSelected = selectedLocs.has(loc.location_name);
                  const assignedTo = assignedMap[loc.location_name];
                  return (
                    <tr key={idx} className={`hover:bg-red-50/30 ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                      <td className="py-2 px-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleLoc(loc.location_name)} className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400 w-4 h-4" />
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-500">{idx + 1}</td>
                      <td className="py-2 px-3 text-sm font-medium text-gray-900">{loc.location_name}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Pending</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {assignedTo ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 font-medium inline-flex items-center gap-1">
                            <Smartphone className="w-3 h-3" />
                            {assignedTo}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-indigo-600 px-6 py-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Send className="w-5 h-5" />
                Assign {selectedLocs.size} Locations
              </h3>
              <p className="text-sm text-indigo-200 mt-0.5">Select a scanner device to assign these locations</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Device</label>
                {loadingDevices ? (
                  <p className="text-sm text-gray-500">Loading devices...</p>
                ) : (
                  <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm">
                    <option value="">-- Choose Device --</option>
                    {devices.map((d) => (
                      <option key={d.id || d.device_name} value={d.device_name}>
                        {d.device_name} {d.is_online ? '(Online)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-gray-500 mb-2">Selected Locations:</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedLocs).map((loc) => (
                    <span key={loc} className="bg-white border border-gray-200 text-xs text-gray-700 px-2 py-1 rounded-md">{loc}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAssignModal(false)} className="text-sm">Cancel</Button>
              <Button onClick={handleAssign} disabled={!selectedDevice || assigning} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm gap-1">
                {assigning ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
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

