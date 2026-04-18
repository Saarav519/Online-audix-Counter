import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { createPortal } from 'react-dom';
import { X, Download, Maximize2, Search, Copy, Check, Pin, PinOff, Eye, EyeOff, Columns,
  ChevronUp, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, Filter } from 'lucide-react';
import { BarcodeEditCell } from './BarcodeEditCell';

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 28;
const BUFFER_ROWS = 15;

const NUMERIC_KEYS = new Set([
  'stock_qty', 'physical_qty', 'difference_qty', 'diff_qty', 'accuracy_pct',
  'mrp', 'cost', 'stock_value_mrp', 'stock_value_cost', 'physical_value_mrp', 'physical_value_cost',
  'diff_value_mrp', 'diff_value_cost', 'final_value_mrp', 'final_value_cost',
  'phys_value_mrp', 'phys_value_cost',
  'item_count', 'barcode_count', 'reco_qty', 'final_qty', 'total_qty', 'session_count'
]);

const VALUE_KEYS = new Set([
  'stock_value_mrp', 'stock_value_cost', 'physical_value_mrp', 'physical_value_cost',
  'phys_value_mrp', 'phys_value_cost',
  'diff_value_mrp', 'diff_value_cost', 'final_value_mrp', 'final_value_cost',
  'accuracy_pct'
]);

const NUMERIC_CONDITIONS = [
  { value: 'lt0', label: '< 0', desc: 'Less than zero' },
  { value: 'eq0', label: '= 0', desc: 'Equal to zero' },
  { value: 'gt0', label: '> 0', desc: 'Greater than zero' },
];

function getColWidth(key) {
  if (key === 'barcode') return 140;
  if (key === 'description' || key === 'article_name') return 220;
  if (key === 'article_code') return 120;
  if (key === 'category' || key === 'department' || key === 'brand' || key === 'remark' || key === 'location') return 110;
  if (key === 'status') return 80;
  if (key === '_expand') return 40;
  if (VALUE_KEYS.has(key)) return 120;
  return 90;
}

function formatCellValue(key, value) {
  if (value === undefined || value === null || value === '') {
    return NUMERIC_KEYS.has(key) ? '0' : '';
  }
  if (VALUE_KEYS.has(key)) {
    const n = Number(value) || 0;
    return key === 'accuracy_pct' ? n.toFixed(1) + '%' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (NUMERIC_KEYS.has(key)) {
    return (Number(value) || 0).toLocaleString('en-IN');
  }
  return String(value);
}

function getCellColorClass(key, value) {
  const n = Number(value) || 0;
  // Accuracy uses percentage-based coloring
  if (key === 'accuracy_pct') {
    if (n >= 98) return { color: '#047857', fontWeight: 600 }; // emerald-700
    if (n >= 90) return { color: '#1d4ed8', fontWeight: 600 }; // blue-700
    if (n >= 75) return { color: '#b45309', fontWeight: 600 }; // amber-700
    return { color: '#b91c1c', fontWeight: 600 }; // red-700
  }
  // Difference/variance columns: positive = green, negative = red
  if (key.startsWith('diff') || key === 'difference_qty') {
    if (n > 0) return { color: '#059669', fontWeight: 600 }; // emerald-600
    if (n < 0) return { color: '#dc2626', fontWeight: 600 }; // red-600
    return {};
  }
  // Remark column: color based on content
  if (key === 'remark' && value) {
    const v = String(value).toLowerCase();
    if (v.includes('exact match')) return { color: '#059669', fontWeight: 600 };
    if (v.includes('not scanned') || v.includes('not in master') || v.includes('critical')) return { color: '#dc2626', fontWeight: 600 };
    if (v.includes('conflict') || v.includes('pending')) return { color: '#b45309', fontWeight: 600 };
    if (v.includes('empty bin')) return { color: '#d97706', fontWeight: 600 };
  }
  return {};
}

export function FullScreenButton({ onClick }) {
  return (
    <button onClick={onClick} data-testid="fullscreen-report-btn"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
      title="Full Screen View">
      <Maximize2 className="w-3.5 h-3.5" /> Full View
    </button>
  );
}

// ===== Inline Filter Dropdown (Excel-like: draft state + Apply/Cancel + numeric sort + range) =====
function InlineFilterDropdown({ column, allValues, activeFilters, onFilterChange, numericFilters, onNumericFilterChange, onClose, anchorRect, sortConfig, onSort }) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const isNumeric = NUMERIC_KEYS.has(column);
  const currentNumeric = numericFilters?.[column] || null;
  const currentChecked = activeFilters[column];
  const isDefaultState = currentChecked === undefined || currentChecked === null;

  // All values sorted (numeric-aware), blanks at top
  const sortedValues = useMemo(() => {
    const arr = (allValues || []).map(String).filter(v => v !== '');
    const hasBlank = (allValues || []).some(v => v === '' || v === null || v === undefined);
    if (isNumeric) {
      arr.sort((a, b) => {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      });
    } else {
      arr.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    }
    if (hasBlank) arr.unshift('');
    return arr;
  }, [allValues, isNumeric]);

  // DRAFT state (Excel: changes commit only on Apply)
  const [draftChecked, setDraftChecked] = useState(() => {
    if (isDefaultState) return null;
    return new Set(currentChecked);
  });
  const [draftNumeric, setDraftNumeric] = useState(currentNumeric);
  const initialRange = useMemo(() => {
    const r = numericFilters?.[`${column}__range`];
    return r || { min: '', max: '' };
  }, [numericFilters, column]);
  const [draftRange, setDraftRange] = useState(initialRange);

  const filteredValues = useMemo(() => {
    if (!search) return sortedValues;
    const lower = search.toLowerCase();
    return sortedValues.filter(v => v.toLowerCase().includes(lower) || (v === '' && '(blanks)'.includes(lower)));
  }, [sortedValues, search]);

  // Position popover
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!anchorRect) return;
    const dropW = 320, dropH = 480;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceRight = window.innerWidth - anchorRect.left;
    setPos({
      top: spaceBelow < dropH ? Math.max(8, anchorRect.top - dropH) : anchorRect.bottom + 4,
      left: spaceRight < dropW ? Math.max(8, anchorRect.right - dropW) : anchorRect.left,
    });
  }, [anchorRect]);

  // Close on click outside (discard draft — Excel convention)
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => { searchInputRef.current?.focus(); }, []);

  const isChecked = useCallback((strVal) => {
    if (draftChecked === null) return true;
    return draftChecked.has(strVal);
  }, [draftChecked]);

  const checkedCount = useMemo(() => {
    if (draftChecked === null) return sortedValues.length;
    return draftChecked.size;
  }, [draftChecked, sortedValues]);

  const toggleValue = (strVal) => {
    setDraftChecked(prev => {
      const base = prev === null ? new Set(sortedValues) : new Set(prev);
      if (base.has(strVal)) base.delete(strVal);
      else base.add(strVal);
      return base;
    });
  };

  const selectAll = () => setDraftChecked(null);
  const clearAll = () => setDraftChecked(new Set());
  // When search is active: "Keep only shown" = replace draft with exactly the shown items
  const selectAllInView = () => {
    if (search) {
      // Excel-like: replace selection with shown items only
      setDraftChecked(new Set(filteredValues));
    } else {
      setDraftChecked(null);
    }
  };
  const clearAllInView = () => {
    setDraftChecked(prev => {
      const base = prev === null ? new Set(sortedValues) : new Set(prev);
      filteredValues.forEach(v => base.delete(v));
      return base;
    });
  };

  const toggleNumericCondition = (condition) => {
    setDraftNumeric(prev => (prev === condition ? null : condition));
  };

  const isDirty = useMemo(() => {
    if (draftNumeric !== currentNumeric) return true;
    if ((draftRange.min || '') !== (initialRange.min || '')) return true;
    if ((draftRange.max || '') !== (initialRange.max || '')) return true;
    // Search typed + default state = will auto-narrow on Apply → dirty
    if (search && draftChecked === null && filteredValues.length !== sortedValues.length) return true;
    if (draftChecked === null) return !isDefaultState;
    if (isDefaultState) return true;
    if (draftChecked.size !== (currentChecked?.length || 0)) return true;
    for (const v of draftChecked) {
      if (!currentChecked.includes(v)) return true;
    }
    return false;
  }, [draftChecked, draftNumeric, draftRange, initialRange, currentChecked, currentNumeric, isDefaultState, search, filteredValues, sortedValues]);

  const applyFilters = () => {
    // Excel-like: if user typed in search but didn't manually check/uncheck anything,
    // treat Apply as "keep only shown" (auto-narrow to filtered values)
    let effectiveChecked = draftChecked;
    if (search && draftChecked === null) {
      effectiveChecked = new Set(filteredValues);
    }

    if (effectiveChecked === null || effectiveChecked.size === sortedValues.length) {
      onFilterChange(column, null);
    } else {
      onFilterChange(column, Array.from(effectiveChecked));
    }
    if (draftNumeric !== currentNumeric) {
      onNumericFilterChange(column, draftNumeric);
    }
    const hasRange = (draftRange.min !== '' || draftRange.max !== '');
    if (hasRange) {
      onNumericFilterChange(`${column}__range`, { ...draftRange });
    } else if (initialRange.min !== '' || initialRange.max !== '') {
      onNumericFilterChange(`${column}__range`, null);
    }
    onClose();
  };

  const displayLabel = (v) => (v === '' ? '(Blanks)' : v);
  const sortAscLabel = isNumeric ? 'Sort Smallest → Largest' : 'Sort A → Z';
  const sortDescLabel = isNumeric ? 'Sort Largest → Smallest' : 'Sort Z → A';
  const handleWheel = (e) => { e.stopPropagation(); };

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      onWheel={handleWheel}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-[10002] w-80 flex flex-col"
      style={{ top: pos.top, left: pos.left, maxHeight: 480, overscrollBehavior: 'contain' }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); applyFilters(); }
      }}
    >
      {/* Sort */}
      {onSort && (
        <div className="p-2 border-b border-gray-100 flex gap-1.5">
          <button
            onClick={() => { if (sortConfig?.key !== column || sortConfig?.direction !== 'asc') onSort(column, 'asc'); else onSort(column, 'asc'); onClose(); }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-all ${
              sortConfig?.key === column && sortConfig?.direction === 'asc' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ArrowUp className="w-3 h-3" /> {sortAscLabel}
          </button>
          <button
            onClick={() => { onSort(column, 'desc'); onClose(); }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-all ${
              sortConfig?.key === column && sortConfig?.direction === 'desc' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ArrowDown className="w-3 h-3" /> {sortDescLabel}
          </button>
        </div>
      )}

      {/* Numeric filters */}
      {isNumeric && (
        <div className="p-2 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Value Filter</p>
          <div className="flex gap-1.5 mb-2">
            {NUMERIC_CONDITIONS.map(cond => (
              <button key={cond.value}
                onClick={() => toggleNumericCondition(cond.value)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold border transition-all ${
                  draftNumeric === cond.value
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
          <div className="flex items-center gap-1.5 w-full">
            <input
              type="number"
              placeholder="Min"
              value={draftRange.min}
              onChange={(e) => setDraftRange(r => ({ ...r, min: e.target.value }))}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 w-0 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-300"
            />
            <span className="text-[10px] text-gray-400 shrink-0">to</span>
            <input
              type="number"
              placeholder="Max"
              value={draftRange.max}
              onChange={(e) => setDraftRange(r => ({ ...r, max: e.target.value }))}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 w-0 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-300"
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') { onClose(); }
            }}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-300"
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span className="text-gray-500">
            Showing <strong className="text-gray-700">{filteredValues.length.toLocaleString()}</strong> of <strong className="text-gray-700">{sortedValues.length.toLocaleString()}</strong>
          </span>
          <div className="flex gap-2">
            <button className="text-emerald-600 hover:underline font-medium" onClick={search ? selectAllInView : selectAll}>
              {search ? 'Keep only shown' : 'Select all'}
            </button>
            <button className="text-red-500 hover:underline font-medium" onClick={search ? clearAllInView : clearAll}>
              {search ? 'Clear shown' : 'Clear all'}
            </button>
          </div>
        </div>
      </div>

      {/* Values list */}
      <div className="overflow-y-auto flex-1 p-1.5" style={{ overscrollBehavior: 'contain', minHeight: 120 }} onWheel={handleWheel}>
        {filteredValues.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No matching values</p>
        ) : (
          filteredValues.map((strVal, i) => {
            const checked = isChecked(strVal);
            const isBlank = strVal === '';
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs hover:bg-gray-50 ${checked ? '' : 'opacity-60'}`}
                onClick={() => toggleValue(strVal)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="rounded border-gray-300 text-emerald-500 w-3.5 h-3.5 pointer-events-none shrink-0"
                />
                <span className={`truncate ${isBlank ? 'italic text-gray-500' : ''}`}>{displayLabel(strVal)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Apply / Cancel */}
      <div className="p-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-600">
          {checkedCount === sortedValues.length
            ? <span className="text-emerald-600 font-semibold">All selected</span>
            : <span><strong className="text-gray-800">{checkedCount.toLocaleString()}</strong> / {sortedValues.length.toLocaleString()} selected</span>}
          {isDirty && <span className="ml-1.5 text-amber-600 font-semibold">• unsaved</span>}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={applyFilters}
            disabled={!isDirty}
            className={`px-3 py-1 text-xs font-semibold rounded border transition-all ${
              isDirty
                ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ===== Column Settings Panel =====
function FSColumnSettings({ columns, hiddenColumns, frozenColumns, onToggleVisibility, onToggleFreeze, onShowAll, onReset }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen(!open)} data-testid="fs-columns-btn"
        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded transition-colors ${
          hiddenColumns.size > 0 || frozenColumns.size > 0 ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}>
        <Columns className="w-3.5 h-3.5" /> Columns
        {hiddenColumns.size > 0 && <span className="ml-0.5 px-1 text-[10px] bg-red-100 text-red-600 rounded-full">{hiddenColumns.size}</span>}
        {frozenColumns.size > 0 && <span className="ml-0.5 px-1 text-[10px] bg-blue-100 text-blue-600 rounded-full">{frozenColumns.size}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-[10003] overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Columns</span>
            <div className="flex gap-1">
              <button onClick={onShowAll} className="text-[10px] text-emerald-600 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50">Show All</button>
              <button onClick={onReset} className="text-[10px] text-gray-500 font-medium px-1.5 py-0.5 rounded hover:bg-gray-100">Reset</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {columns.filter(c => c.key !== '_expand').map(col => {
              const isHidden = hiddenColumns.has(col.key);
              const isFrozen = frozenColumns.has(col.key);
              return (
                <div key={col.key} className={`flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-50 ${isHidden ? 'opacity-50' : ''}`}>
                  <button onClick={() => onToggleVisibility(col.key)} className={`p-0.5 rounded ${isHidden ? 'text-gray-300' : 'text-emerald-500'}`}>
                    {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <span className={`flex-1 text-xs ${isHidden ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{col.label}</span>
                  <button onClick={() => onToggleFreeze(col.key)} disabled={isHidden}
                    className={`p-0.5 rounded ${isFrozen ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}>
                    {isFrozen ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Reco Cell =====
function RecoCell({ value, onSave, rowData, recoType }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || 0);
  if (!onSave) return <span className="text-gray-400">-</span>;
  if (!editing) {
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditing(true); setVal(value || 0); }}
        className="w-full text-right text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1 py-0.5 rounded text-xs cursor-pointer"
        data-testid={`reco-btn-${rowData.barcode || rowData.article_code || ''}`}>
        {value || '-'}
      </button>
    );
  }
  return (
    <input type="number" value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const params = { reco_type: recoType, reco_qty: Number(val) };
          if (recoType === 'barcode') { params.barcode = rowData.barcode; params.article_code = rowData.article_code; }
          else if (recoType === 'article') { params.article_code = rowData.article_code; }
          else if (recoType === 'detailed') { params.location = rowData.location; params.barcode = rowData.barcode; }
          onSave(params);
          setEditing(false);
        }
        if (e.key === 'Escape') setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      autoFocus
      className="w-16 px-1 py-0.5 text-xs border border-blue-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
      onClick={(e) => e.stopPropagation()} />
  );
}

// ===== Split-Pane Grid Renderer =====
function GridRenderer({
  visibleColumns, frozenColumns, frozenWidth,
  gridTotals, sortConfig, onSort,
  activeFilters, getColumnValues,
  filterCol, setFilterCol, setFilterAnchor,
  activeCell, isHeaderActive, setIsHeaderActive, setActiveCell,
  selRange, searchMatchSet,
  data, visibleRows, visibleStartIdx,
  topSpacerHeight, bottomSpacerHeight,
  scrollRef,
  onSaveReco, isConsolidated, recoType,
  handleScroll, setSelStart, setSelEnd,
  clientId, reportType, onRefresh
}) {
  const frozenCols = useMemo(() => visibleColumns.filter(c => frozenColumns.has(c.key)), [visibleColumns, frozenColumns]);
  const scrollableCols = useMemo(() => visibleColumns.filter(c => !frozenColumns.has(c.key)), [visibleColumns, frozenColumns]);
  const hasFrozen = frozenCols.length > 0;

  // Map each column key to its global index in visibleColumns
  const colGlobalIdx = useMemo(() => {
    const map = {};
    visibleColumns.forEach((c, i) => { map[c.key] = i; });
    return map;
  }, [visibleColumns]);

  const frozenPaneRef = useRef(null);
  const syncingRef = useRef(false);

  // Sync vertical scroll between panes
  const onMainScroll = useCallback((e) => {
    handleScroll(e);
    if (!hasFrozen || syncingRef.current) return;
    syncingRef.current = true;
    if (frozenPaneRef.current) frozenPaneRef.current.scrollTop = e.target.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [handleScroll, hasFrozen]);

  const onFrozenPaneScroll = useCallback((e) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (scrollRef.current) scrollRef.current.scrollTop = e.target.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [scrollRef]);

  // Forward horizontal wheel events from frozen pane to scrollable pane
  const handleFrozenWheel = useCallback((e) => {
    if (Math.abs(e.deltaX) > 0 && scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaX;
      e.preventDefault();
    }
    // Also handle shift+wheel for horizontal scroll
    if (e.shiftKey && Math.abs(e.deltaY) > 0 && scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, [scrollRef]);

  const handleCellClick = useCallback((rowIdx, globalColIdx) => {
    setIsHeaderActive(false);
    setActiveCell({ row: rowIdx, col: globalColIdx });
    setSelStart(null);
    setSelEnd(null);
  }, [setIsHeaderActive, setActiveCell, setSelStart, setSelEnd]);

  const handleHeaderClick = useCallback((globalColIdx) => {
    setIsHeaderActive(true);
    setActiveCell({ row: 0, col: globalColIdx });
    setSelStart(null);
    setSelEnd(null);
  }, [setIsHeaderActive, setActiveCell, setSelStart, setSelEnd]);

  // Render a table for the given columns
  const renderTable = (cols, isForFrozenPane) => {
    const tableWidth = cols.reduce((s, c) => s + getColWidth(c.key), 0);
    const showSubtotalLabel = isForFrozenPane || !hasFrozen;

    return (
      <table className="vgrid-table" style={{ width: tableWidth, tableLayout: 'fixed' }}>
        <thead>
          {/* Subtotals row */}
          <tr>
            {cols.map((col, i) => {
              if (i === 0 && showSubtotalLabel) {
                return (
                  <th key={col.key} style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}
                    className="text-left text-[11px] font-bold text-emerald-800 whitespace-nowrap">
                    Subtotals
                  </th>
                );
              }
              if (!gridTotals) return <th key={col.key} style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}></th>;
              const val = gridTotals[col.key];
              if (val === undefined || val === null) return <th key={col.key} style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}></th>;
              const isVar = col.key.startsWith('diff');
              const isAcc = col.key === 'accuracy_pct';
              const formatted = isAcc ? `${val}%` : typeof val === 'number' ? val.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : val;
              let colorStyle = '#1f2937'; // gray-800
              const numVal = typeof val === 'number' ? val : parseFloat(String(val));
              if (isVar && !isNaN(numVal)) colorStyle = numVal > 0 ? '#047857' : numVal < 0 ? '#b91c1c' : '#1f2937';
              if (isAcc && !isNaN(numVal)) colorStyle = numVal >= 98 ? '#047857' : numVal >= 90 ? '#1d4ed8' : numVal >= 75 ? '#b45309' : '#b91c1c';
              return (
                <th key={col.key} style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key), color: colorStyle }}
                  className="text-right text-[11px] font-bold whitespace-nowrap">
                  {formatted}
                </th>
              );
            })}
          </tr>
          {/* Header row */}
          <tr>
            {cols.map(col => {
              const globalIdx = colGlobalIdx[col.key];
              const isActive = isHeaderActive && activeCell.col === globalIdx;
              const isActiveCol = !isHeaderActive && activeCell.col === globalIdx;
              const isNumeric = NUMERIC_KEYS.has(col.key);
              const hasFilter = activeFilters?.[col.key] != null;

              return (
                <th key={col.key} data-fscol={col.key}
                  style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}
                  className={`cursor-pointer select-none ${isActive ? 'vg-header-active-cell' : isActiveCol ? 'vg-active-col-header' : ''}`}
                  onClick={() => handleHeaderClick(globalIdx)}>
                  <div className={`flex items-center gap-0.5 ${isNumeric ? 'justify-end' : ''}`}>
                    <button className="flex items-center gap-0.5 hover:text-blue-700 min-w-0"
                      onClick={(e) => { e.stopPropagation(); onSort(col.key); }}>
                      <span className="truncate">{col.label}</span>
                      {sortConfig?.key === col.key ? (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3 h-3 text-emerald-600 shrink-0" />
                      ) : <ArrowUpDown className="w-2.5 h-2.5 text-gray-400 shrink-0" />}
                    </button>
                    {getColumnValues && (
                      <button className={`p-0.5 rounded shrink-0 ${hasFilter ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-500'}`}
                        onClick={(e) => { e.stopPropagation(); setFilterCol(col.key); setFilterAnchor(e.currentTarget.getBoundingClientRect()); }}>
                        <Filter className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {topSpacerHeight > 0 && <tr style={{ height: topSpacerHeight }}><td colSpan={cols.length}></td></tr>}
          {visibleRows.map((row, vi) => {
            const rowIdx = visibleStartIdx + vi;
            const isActiveRow = !isHeaderActive && activeCell.row === rowIdx;
            return (
              <tr key={rowIdx} className={isActiveRow ? 'vg-active-row' : ''}>
                {cols.map(col => {
                  const globalIdx = colGlobalIdx[col.key];
                  const isActive = !isHeaderActive && activeCell.row === rowIdx && activeCell.col === globalIdx;
                  const isSelected = selRange && rowIdx >= selRange.r1 && rowIdx <= selRange.r2 && globalIdx >= selRange.c1 && globalIdx <= selRange.c2;
                  const isMatch = searchMatchSet.has(`${rowIdx}-${globalIdx}`);
                  const isNumeric = NUMERIC_KEYS.has(col.key);

                  let cellClass = '';
                  if (isActive) cellClass = 'vg-active-cell';
                  else if (isSelected) cellClass = 'vg-selected';
                  else if (isMatch) cellClass = 'vg-search-match';

                  // Reco column
                  if ((col.key === 'reco' || col.key === 'reco_qty') && onSaveReco && isConsolidated) {
                    return (
                      <td key={col.key} data-fsrow={rowIdx} data-fscol={globalIdx}
                        style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}
                        className={`${cellClass} ${isNumeric ? 'text-right' : ''}`}
                        onClick={() => handleCellClick(rowIdx, globalIdx)}>
                        <RecoCell value={row.reco_qty || row.reco || 0} onSave={onSaveReco} rowData={row} recoType={recoType} />
                      </td>
                    );
                  }

                  // Barcode/Article edit for extra scanned items
                  const isBarcodeCol = col.key === 'barcode' && reportType !== 'article-wise';
                  const isArticleCol = col.key === 'article_code' && reportType === 'article-wise';
                  if ((isBarcodeCol || isArticleCol) && (row.is_editable || row.is_edited) && clientId) {
                    const editField = isArticleCol ? 'article_code' : 'barcode';
                    const editReportType = reportType === 'article-wise' ? 'article-wise' : (reportType === 'detailed' ? 'detailed' : 'barcode-wise');
                    return (
                      <td key={col.key} data-fsrow={rowIdx} data-fscol={globalIdx}
                        style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key), overflow: 'visible' }}
                        className={`${cellClass}`}
                        onClick={() => handleCellClick(rowIdx, globalIdx)}>
                        <BarcodeEditCell value={row[col.key]} row={row} clientId={clientId} reportType={editReportType} field={editField} onEditComplete={onRefresh} compact />
                      </td>
                    );
                  }

                  const value = row[col.key];
                  const formatted = formatCellValue(col.key, value);
                  const colorStyle = getCellColorClass(col.key, value);
                  return (
                    <td key={col.key} data-fsrow={rowIdx} data-fscol={globalIdx}
                      style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key), ...colorStyle }}
                      className={`${cellClass} ${isNumeric ? 'text-right' : ''}`}
                      onClick={() => handleCellClick(rowIdx, globalIdx)}>
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 && <tr style={{ height: bottomSpacerHeight }}><td colSpan={cols.length}></td></tr>}
        </tbody>
      </table>
    );
  };

  // No frozen columns: single scrollable table
  if (!hasFrozen) {
    return (
      <div ref={(el) => { scrollRef.current = el; }} className="flex-1 overflow-auto" onScroll={handleScroll} data-testid="fs-grid-container">
        {renderTable(visibleColumns, false)}
      </div>
    );
  }

  // Split pane: frozen left + scrollable right
  return (
    <div className="flex-1 flex overflow-hidden" data-testid="fs-grid-container">
      <div ref={frozenPaneRef}
        className="frozen-pane overflow-y-auto overflow-x-hidden flex-shrink-0 bg-white"
        style={{ width: frozenWidth, borderRight: '2px solid #9ca3af' }}
        onScroll={onFrozenPaneScroll}
        onWheel={handleFrozenWheel}>
        {renderTable(frozenCols, true)}
      </div>
      <div ref={(el) => { scrollRef.current = el; }}
        className="flex-1 overflow-auto"
        onScroll={onMainScroll}>
        {renderTable(scrollableCols, false)}
      </div>
    </div>
  );
}

// ===== Main FullScreenReport Component =====
export function FullScreenReport({
  open, onClose, title, onExport,
  gridData, gridTotals, gridColumns,
  sortConfig, onSort,
  activeFilters, onFilterChange, numericFilters, onNumericFilterChange, getColumnValues,
  frozenColumns = new Set(), hiddenColumns = new Set(),
  onToggleFreeze, onToggleVisibility, onShowAllColumns, onResetColumns,
  onSaveReco, isConsolidated, reportType,
  children, totalRows = 0, clientId, onRefresh
}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [cellValue, setCellValue] = useState('');
  const [cellColName, setCellColName] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchInputRef = useRef(null);
  const [filterCol, setFilterCol] = useState(null);
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [isHeaderActive, setIsHeaderActive] = useState(false);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const containerRef = useRef(null);

  const useVirtualGrid = gridData && gridData.length > 0 && gridColumns && gridColumns.length > 0;

  // Visible columns (exclude hidden and _expand)
  const visibleColumns = useMemo(() => {
    if (!gridColumns) return [];
    return gridColumns.filter(c => c.key !== '_expand' && !hiddenColumns.has(c.key));
  }, [gridColumns, hiddenColumns]);

  const frozenWidth = useMemo(() => {
    return visibleColumns.filter(c => frozenColumns.has(c.key)).reduce((s, c) => s + getColWidth(c.key), 0);
  }, [visibleColumns, frozenColumns]);

  // Reco type
  const recoType = useMemo(() => {
    if (reportType === 'barcode-wise') return 'barcode';
    if (reportType === 'article-wise') return 'article';
    if (reportType === 'detailed') return 'detailed';
    return null;
  }, [reportType]);

  // Virtual scroll calculations
  const data = useMemo(() => gridData || [], [gridData]);
  const totalHeight = data.length * ROW_HEIGHT;
  const visibleStartIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const visibleEndIdx = Math.min(data.length - 1, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleRows = data.slice(visibleStartIdx, visibleEndIdx + 1);
  const topSpacerHeight = visibleStartIdx * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (data.length - visibleEndIdx - 1) * ROW_HEIGHT);

  // Measure container height
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (containerRef.current) setContainerHeight(containerRef.current.clientHeight);
    };
    measure();
    const timer = setTimeout(measure, 100);
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [open]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setActiveCell({ row: 0, col: 0 });
      setScrollTop(0);
      setIsHeaderActive(false);
      setShowSearch(false);
      setSearchTerm('');
      setSearchResults([]);
      setFilterCol(null);
      setSelStart(null);
      setSelEnd(null);
    }
  }, [open]);

  // Update cell value when active cell changes
  useEffect(() => {
    if (!useVirtualGrid) return;
    if (isHeaderActive) {
      const col = visibleColumns[activeCell.col];
      setCellValue(col?.label || '');
      setCellColName('Header');
    } else {
      const row = data[activeCell.row];
      const col = visibleColumns[activeCell.col];
      if (row && col) {
        setCellValue(formatCellValue(col.key, row[col.key]));
        setCellColName(col.label);
      }
    }
  }, [activeCell, isHeaderActive, data, visibleColumns, useVirtualGrid]);

  const copyValue = useCallback(() => {
    if (selStart && selEnd) {
      const r1 = Math.min(selStart.row, selEnd.row), r2 = Math.max(selStart.row, selEnd.row);
      const c1 = Math.min(selStart.col, selEnd.col), c2 = Math.max(selStart.col, selEnd.col);
      const lines = [];
      for (let r = r1; r <= r2; r++) {
        const row = data[r];
        if (!row) continue;
        const cells = [];
        for (let c = c1; c <= c2; c++) {
          const col = visibleColumns[c];
          cells.push(col ? (row[col.key] ?? '') : '');
        }
        lines.push(cells.join('\t'));
      }
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else if (cellValue) {
      navigator.clipboard.writeText(cellValue).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [cellValue, selStart, selEnd, data, visibleColumns]);

  // Scroll to a cell (handles both vertical and horizontal scrolling)
  const scrollToCell = useCallback((rowIdx, colIdx) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const headerH = 60;

    // Vertical scroll
    const rowTop = rowIdx * ROW_HEIGHT;
    const visibleTop = el.scrollTop + headerH;
    const visibleBottom = el.scrollTop + el.clientHeight;
    if (rowTop < visibleTop) {
      el.scrollTop = Math.max(0, rowTop - headerH - 10);
    } else if (rowTop + ROW_HEIGHT > visibleBottom) {
      el.scrollTop = rowTop + ROW_HEIGHT - el.clientHeight + 10;
    }

    // Horizontal scroll (only for non-frozen columns)
    const col = visibleColumns[colIdx];
    if (!col || frozenColumns.has(col.key)) return;

    // Calculate position of this column in the scrollable pane
    let posInScrollable = 0;
    for (let i = 0; i < visibleColumns.length; i++) {
      const c = visibleColumns[i];
      if (frozenColumns.has(c.key)) continue; // skip frozen columns
      if (c.key === col.key) break;
      posInScrollable += getColWidth(c.key);
    }
    const colWidth = getColWidth(col.key);

    if (posInScrollable < el.scrollLeft) {
      el.scrollLeft = posInScrollable;
    } else if (posInScrollable + colWidth > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = posInScrollable + colWidth - el.clientWidth;
    }
  }, [visibleColumns, frozenColumns]);

  // Search
  const performSearch = useCallback((term) => {
    if (!term || !data.length) { setSearchResults([]); setSearchIdx(0); return; }
    const lower = term.toLowerCase();
    const results = [];
    data.forEach((row, rowIdx) => {
      visibleColumns.forEach((col, colIdx) => {
        const val = String(row[col.key] || '').toLowerCase();
        if (val.includes(lower)) results.push({ row: rowIdx, col: colIdx });
      });
    });
    setSearchResults(results);
    setSearchIdx(0);
    if (results.length > 0) {
      setIsHeaderActive(false);
      setActiveCell(results[0]);
      setSelStart(null);
      setSelEnd(null);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = Math.max(0, results[0].row * ROW_HEIGHT - 80);
      }
    }
  }, [data, visibleColumns]);

  const navigateSearch = useCallback((dir) => {
    if (searchResults.length === 0) return;
    const next = dir === 'next' ? (searchIdx + 1) % searchResults.length : (searchIdx - 1 + searchResults.length) % searchResults.length;
    setSearchIdx(next);
    setIsHeaderActive(false);
    setActiveCell(searchResults[next]);
    setSelStart(null);
    setSelEnd(null);
    if (scrollRef.current) {
      const rowTop = searchResults[next].row * ROW_HEIGHT;
      const el = scrollRef.current;
      const headerH = 60;
      if (rowTop < el.scrollTop + headerH || rowTop + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
        el.scrollTop = Math.max(0, rowTop - headerH - 10);
      }
    }
  }, [searchResults, searchIdx]);

  // Keyboard handler
  useEffect(() => {
    if (!open || !useVirtualGrid) return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copyValue(); return; }
      if (e.key === 'Escape') {
        if (filterCol !== null) { setFilterCol(null); return; }
        e.preventDefault(); onClose(); return;
      }

      // Alt+Down = open filter
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        const col = visibleColumns[activeCell.col];
        if (col) {
          const th = document.querySelector(`[data-fscol="${col.key}"]`);
          if (th) {
            setFilterCol(col.key);
            setFilterAnchor(th.getBoundingClientRect());
          }
        }
        return;
      }

      // When filter dropdown is open, don't process grid navigation keys
      if (filterCol !== null) return;

      const maxRow = data.length - 1;
      const maxCol = visibleColumns.length - 1;
      let newRow = activeCell.row;
      let newCol = activeCell.col;
      let goHeader = isHeaderActive;
      const isShift = e.shiftKey;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (isHeaderActive) break;
          if (activeCell.row === 0) goHeader = true;
          else newRow = activeCell.row - 1;
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (isHeaderActive) { goHeader = false; newRow = 0; }
          else newRow = Math.min(maxRow, activeCell.row + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newCol = Math.max(0, activeCell.col - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newCol = Math.min(maxCol, activeCell.col + 1);
          break;
        case 'Home': e.preventDefault(); newCol = 0; if (e.ctrlKey) { newRow = 0; goHeader = false; } break;
        case 'End': e.preventDefault(); newCol = maxCol; if (e.ctrlKey) { newRow = maxRow; goHeader = false; } break;
        case 'PageDown': e.preventDefault(); newRow = Math.min(maxRow, activeCell.row + 25); goHeader = false; break;
        case 'PageUp': e.preventDefault(); if (activeCell.row - 25 < 0) goHeader = true; else newRow = activeCell.row - 25; break;
        case 'Tab':
          e.preventDefault();
          goHeader = false;
          if (e.shiftKey) { newCol--; if (newCol < 0) { newCol = maxCol; newRow = Math.max(0, newRow - 1); } }
          else { newCol++; if (newCol > maxCol) { newCol = 0; newRow = Math.min(maxRow, newRow + 1); } }
          break;
        case 'Enter':
          e.preventDefault();
          const col = visibleColumns[activeCell.col];
          if (col && (col.key === 'reco' || col.key === 'reco_qty') && onSaveReco) {
            const td = document.querySelector(`[data-fsrow="${activeCell.row}"][data-fscol="${activeCell.col}"] button`);
            if (td) td.click();
          }
          return;
        default: return;
      }

      // Shift+Arrow = extend selection
      if (isShift && !goHeader && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page'))) {
        if (!selStart) setSelStart({ row: activeCell.row, col: activeCell.col });
        setSelEnd({ row: newRow, col: newCol });
      } else {
        setSelStart(null);
        setSelEnd(null);
      }

      setIsHeaderActive(goHeader);
      if (newRow !== activeCell.row || newCol !== activeCell.col || goHeader !== isHeaderActive) {
        setActiveCell({ row: newRow, col: newCol });
        // Always scroll horizontally to keep active column visible (both header and data mode)
        scrollToCell(goHeader ? 0 : newRow, newCol);
        if (goHeader && scrollRef.current) scrollRef.current.scrollTop = 0;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, useVirtualGrid, activeCell, isHeaderActive, data, visibleColumns, onClose, copyValue, scrollToCell, filterCol, onSaveReco, selStart]);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  const hasColumnControls = onToggleFreeze && onToggleVisibility && gridColumns && gridColumns.length > 0;

  // Selection range for highlighting
  const selRange = useMemo(() => {
    if (!selStart || !selEnd) return null;
    return {
      r1: Math.min(selStart.row, selEnd.row), r2: Math.max(selStart.row, selEnd.row),
      c1: Math.min(selStart.col, selEnd.col), c2: Math.max(selStart.col, selEnd.col)
    };
  }, [selStart, selEnd]);

  // Search match set for fast lookup
  const searchMatchSet = useMemo(() => {
    const s = new Set();
    searchResults.forEach(({ row, col }) => s.add(`${row}-${col}`));
    return s;
  }, [searchResults]);

  if (!open) return null;

  // Fallback to children (non-virtualized)
  if (!useVirtualGrid) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-white flex flex-col" data-testid="fullscreen-report">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 truncate max-w-[300px]">{title}</h2>
          <div className="flex items-center gap-1.5">
            {onExport && <button onClick={onExport} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded"><Download className="w-3.5 h-3.5" /> Export</button>}
            <button onClick={onClose} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded"><X className="w-3.5 h-3.5" /> Close</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>, document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col" data-testid="fullscreen-report">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 truncate max-w-[300px]" title={title}>{title}</h2>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap hidden md:inline">
            Arrows | Ctrl+C copy | Ctrl+F find | Alt+Down filter | ESC close
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50); }}
            data-testid="fs-search-toggle"
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded transition-colors ${showSearch ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}>
            <Search className="w-3.5 h-3.5" /> Find
          </button>
          {hasColumnControls && (
            <FSColumnSettings columns={gridColumns} hiddenColumns={hiddenColumns} frozenColumns={frozenColumns}
              onToggleVisibility={onToggleVisibility} onToggleFreeze={onToggleFreeze} onShowAll={onShowAllColumns} onReset={onResetColumns} />
          )}
          {onExport && (
            <button onClick={onExport} data-testid="fullscreen-export-btn"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
          <button onClick={onClose} data-testid="fullscreen-close-btn"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded">
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-yellow-50 border-b border-yellow-200 flex-shrink-0">
          <Search className="w-3.5 h-3.5 text-yellow-600" />
          <input ref={searchInputRef} type="text" value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); performSearch(e.target.value); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); navigateSearch(e.shiftKey ? 'prev' : 'next'); }
              if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchTerm('');
                setSearchResults([]);
                e.target.blur();
              }
            }}
            placeholder="Search... (Enter=next, Shift+Enter=prev, Esc=close)" autoFocus data-testid="fs-search-input"
            className="flex-1 max-w-xs px-2 py-1 text-xs border border-yellow-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-400 bg-white" />
          {searchResults.length > 0 && (
            <>
              <span className="text-[10px] text-yellow-700 font-medium">{searchIdx + 1} of {searchResults.length}</span>
              <button onClick={() => navigateSearch('prev')} className="p-0.5 rounded hover:bg-yellow-100"><ChevronUp className="w-3.5 h-3.5 text-yellow-700" /></button>
              <button onClick={() => navigateSearch('next')} className="p-0.5 rounded hover:bg-yellow-100"><ChevronDown className="w-3.5 h-3.5 text-yellow-700" /></button>
            </>
          )}
          {searchTerm && searchResults.length === 0 && <span className="text-[10px] text-red-500">No matches</span>}
          <button onClick={() => { setShowSearch(false); setSearchTerm(''); setSearchResults([]); }} className="p-0.5 rounded hover:bg-yellow-100"><X className="w-3.5 h-3.5 text-yellow-600" /></button>
        </div>
      )}

      {/* Cell info bar */}
      <div className="flex items-center gap-3 px-4 py-1 bg-gray-50/50 border-b text-[11px] text-gray-500 flex-shrink-0">
        <span className="font-mono bg-white px-2 py-0.5 border rounded text-gray-700 whitespace-nowrap" data-testid="fs-cell-ref">
          {isHeaderActive ? 'Header' : `R${activeCell.row + 1}`} : C{activeCell.col + 1}
        </span>
        {cellColName && <span className="text-gray-400 font-medium whitespace-nowrap">{cellColName}</span>}
        <span className="text-gray-300">|</span>
        <span className="text-gray-700 truncate flex-1" data-testid="fs-cell-value" title={cellValue}>{cellValue || '-'}</span>
        <button onClick={copyValue} data-testid="fs-copy-btn"
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 whitespace-nowrap">
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {selRange ? `${selRange.r2 - selRange.r1 + 1}R x ${selRange.c2 - selRange.c1 + 1}C selected` : ''}
          {' '}{data.length.toLocaleString('en-IN')} rows
        </span>
      </div>

      {/* Grid Styles */}
      <style>{`
        .vgrid-table { border-collapse: separate; border-spacing: 0; table-layout: fixed; }
        .vgrid-table th, .vgrid-table td { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vgrid-table th:first-child, .vgrid-table td:first-child { border-left: 1px solid #e5e7eb; }
        .vgrid-table thead th { position: sticky; z-index: 10; background: #f8fafc; padding: 4px 8px; font-size: 11px; font-weight: 600; color: #475569; user-select: none; }
        .vgrid-table thead tr:first-child th { top: 0; z-index: 11; background: #f0fdf4; padding: 3px 8px; height: ${HEADER_HEIGHT}px; box-sizing: border-box; border-top: 1px solid #e5e7eb; }
        .vgrid-table thead tr:last-child th { top: ${HEADER_HEIGHT}px; z-index: 10; height: ${ROW_HEIGHT}px; box-sizing: border-box; }
        .vgrid-table tbody td { padding: 2px 8px; font-size: 12px; color: #1e293b; cursor: cell; height: ${ROW_HEIGHT}px; }
        .vgrid-table .vg-active-row td { background-color: #eff6ff !important; }
        .vgrid-table .vg-active-cell { background-color: #dbeafe !important; outline: 2px solid #3b82f6; outline-offset: -1px; z-index: 3; position: relative; }
        .vgrid-table .vg-active-col-header { background-color: #e0f2fe !important; color: #1d4ed8 !important; }
        .vgrid-table .vg-header-active-cell { background-color: #bfdbfe !important; outline: 2px solid #3b82f6; outline-offset: -1px; }
        .vgrid-table .vg-search-match { background-color: #fef9c3 !important; outline: 1px solid #eab308; }
        .vgrid-table .vg-selected { background-color: #c7d2fe !important; }
        .vgrid-table tbody tr:nth-child(even) td { background-color: #fafafa; }
        .vgrid-table tbody tr:hover td { background-color: #f0f9ff; }
        .vgrid-table tbody .vg-active-row td { background-color: #eff6ff !important; }
        .frozen-pane { scrollbar-width: none; -ms-overflow-style: none; }
        .frozen-pane::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Virtualized Grid - Split Pane for Freeze */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <GridRenderer
          visibleColumns={visibleColumns}
          frozenColumns={frozenColumns}
          frozenWidth={frozenWidth}
          gridTotals={gridTotals}
          sortConfig={sortConfig}
          onSort={onSort}
          activeFilters={activeFilters}
          getColumnValues={getColumnValues}
          filterCol={filterCol}
          setFilterCol={setFilterCol}
          setFilterAnchor={setFilterAnchor}
          activeCell={activeCell}
          isHeaderActive={isHeaderActive}
          setIsHeaderActive={setIsHeaderActive}
          setActiveCell={setActiveCell}
          selRange={selRange}
          searchMatchSet={searchMatchSet}
          data={data}
          visibleRows={visibleRows}
          visibleStartIdx={visibleStartIdx}
          topSpacerHeight={topSpacerHeight}
          bottomSpacerHeight={bottomSpacerHeight}
          scrollRef={scrollRef}
          onSaveReco={onSaveReco}
          isConsolidated={isConsolidated}
          recoType={recoType}
          handleScroll={handleScroll}
          setSelStart={setSelStart}
          setSelEnd={setSelEnd}
          clientId={clientId}
          reportType={reportType}
          onRefresh={onRefresh}
        />
      </div>

      {/* Filter dropdown */}
      {filterCol && getColumnValues && (
        <InlineFilterDropdown
          column={filterCol}
          allValues={getColumnValues(filterCol)}
          activeFilters={activeFilters || {}}
          onFilterChange={(col, vals) => { onFilterChange && onFilterChange(col, vals); }}
          numericFilters={numericFilters || {}}
          onNumericFilterChange={(col, cond) => { onNumericFilterChange && onNumericFilterChange(col, cond); }}
          onClose={() => setFilterCol(null)}
          anchorRect={filterAnchor}
          sortConfig={sortConfig}
          onSort={onSort}
        />
      )}
    </div>,
    document.body
  );
}

export default FullScreenReport;
