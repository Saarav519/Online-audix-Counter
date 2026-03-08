import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Undo2, Check, X, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function BarcodeEditCell({
  value,
  row,
  clientId,
  reportType,
  field = 'barcode',
  onEditComplete,
  compact = false
}) {
  const isEditable = row?.is_editable;
  const isEdited = row?.is_edited;
  const editId = row?._edit_id;
  const originalValue = row?._original_value;

  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Search master data for auto-complete
  const searchMaster = useCallback(async (q) => {
    if (!q || q.length < 2 || !clientId) { setSuggestions([]); return; }
    try {
      const searchField = field === 'article_code' ? 'article_code' : 'barcode';
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/master/search/${clientId}?q=${encodeURIComponent(q)}&field=${searchField}`);
      const text = await res.text();
      const data = JSON.parse(text);
      setSuggestions(data.results || []);
    } catch { setSuggestions([]); }
  }, [clientId, field]);

  useEffect(() => {
    if (editing) {
      const timer = setTimeout(() => searchMaster(inputVal), 300);
      return () => clearTimeout(timer);
    }
  }, [inputVal, editing, searchMaster]);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditing(true);
    setInputVal('');
    setSuggestions([]);
    setFocusIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditing(false);
    setInputVal('');
    setSuggestions([]);
  };

  const submitEdit = async (newValue) => {
    if (!newValue || newValue === value) { cancelEdit(); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/reports/edit-barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          report_type: reportType,
          original_value: isEdited ? originalValue : value,
          new_value: newValue,
          location: row?.location || ''
        })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { detail: text || 'Unknown error' }; }
      if (res.ok && data.success) {
        cancelEdit();
        if (onEditComplete) onEditComplete();
      } else {
        alert(data.detail || 'Edit failed');
      }
    } catch (err) {
      alert('Edit failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const undoEdit = async (e) => {
    e.stopPropagation();
    if (!editId) return;
    setUndoing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/reports/undo-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edit_id: editId })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = {}; }
      if (res.ok && data.success) {
        if (onEditComplete) onEditComplete();
      } else {
        alert(data.detail || 'Undo failed');
      }
    } catch (err) {
      alert('Undo failed: ' + err.message);
    } finally {
      setUndoing(false);
    }
  };

  const selectSuggestion = (s) => {
    const val = field === 'article_code' ? s.article_code : s.barcode;
    submitEdit(val);
  };

  // Not editable and not edited - just show value
  if (!isEditable && !isEdited) {
    return <span className={compact ? 'text-xs' : ''}>{value || '-'}</span>;
  }

  // Editing mode
  if (editing) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()} ref={dropdownRef}>
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setFocusIdx(-1); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') cancelEdit();
              if (e.key === 'Enter') {
                if (focusIdx >= 0 && suggestions[focusIdx]) {
                  selectSuggestion(suggestions[focusIdx]);
                } else if (inputVal.trim()) {
                  submitEdit(inputVal.trim());
                }
              }
              if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(f => Math.min(suggestions.length - 1, f + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(f => Math.max(-1, f - 1)); }
            }}
            placeholder={`Enter new ${field === 'article_code' ? 'article' : 'barcode'}...`}
            className="w-32 px-1.5 py-0.5 text-xs border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="barcode-edit-input"
          />
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          ) : (
            <>
              <button onClick={() => inputVal.trim() && submitEdit(inputVal.trim())} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded" data-testid="barcode-edit-confirm"><Check className="w-3 h-3" /></button>
              <button onClick={cancelEdit} className="p-0.5 text-red-500 hover:bg-red-50 rounded" data-testid="barcode-edit-cancel"><X className="w-3 h-3" /></button>
            </>
          )}
        </div>
        {/* Auto-complete dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[10005]">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`px-2 py-1.5 text-xs cursor-pointer border-b border-gray-50 ${focusIdx === i ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => selectSuggestion(s)}
                data-testid={`suggestion-${i}`}
              >
                <span className="font-mono font-semibold">{field === 'article_code' ? s.article_code : s.barcode}</span>
                <span className="text-gray-500 ml-2">{s.description}</span>
                {s.mrp > 0 && <span className="text-gray-400 ml-1">MRP: {s.mrp}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Display mode with edit/undo buttons
  return (
    <div className="flex items-center gap-1 group">
      <span className={`${compact ? 'text-xs' : ''} ${isEdited ? 'text-blue-600 font-semibold' : ''}`}>
        {value || '-'}
      </span>
      {isEdited && (
        <button
          onClick={undoEdit}
          disabled={undoing}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-amber-600 hover:bg-amber-50 rounded transition-opacity"
          title={`Undo — revert to original: ${originalValue}`}
          data-testid="barcode-undo-btn"
        >
          {undoing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
        </button>
      )}
      {isEditable && !isEdited && (
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-blue-500 hover:bg-blue-50 rounded transition-opacity"
          title="Edit barcode"
          data-testid="barcode-edit-btn"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      {isEdited && (
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-blue-500 hover:bg-blue-50 rounded transition-opacity"
          title="Re-edit barcode"
          data-testid="barcode-reedit-btn"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default BarcodeEditCell;
