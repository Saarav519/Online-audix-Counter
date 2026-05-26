import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Undo2, Check, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import LastEditedPopup from './LastEditedPopup';
import useLastEditPopup from '../hooks/useLastEditPopup';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Best-effort attribution for the Movement / Audit Log. Reads the
// portal user that was stashed by PortalLogin at login time. If the
// user object is missing the request still succeeds — the audit log
// just records an empty user (handled gracefully by the backend).
function _portalUser() {
  try {
    const raw = localStorage.getItem('auditPortalUser') || localStorage.getItem('portalUser');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function BarcodeEditCell({
  value,
  row,
  clientId,
  reportType,
  field = 'barcode',
  onEditComplete,
  compact = false,
  readOnly = false,
  // Audit-trail attribution (optional)
  sessionId = '',
  cycleDay = null,
  module: moduleProp = null
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
  const [focusIdx, setFocusIdx] = useState(0);  // default to first suggestion
  const [errorMsg, setErrorMsg] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  // Last-Edited gate — same hook is used by both warehouse AND cycle count
  // (cycle-count edits go through this exact component via PortalReports).
  const lastEdit = useLastEditPopup();

  // Search master data for auto-complete
  const searchMaster = useCallback(async (q) => {
    if (!q || q.length < 2 || !clientId) { setSuggestions([]); return; }
    try {
      const searchField = field === 'article_code' ? 'article_code' : 'barcode';
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/master/search/${clientId}?q=${encodeURIComponent(q)}&field=${searchField}`);
      const text = await res.text();
      const data = JSON.parse(text);
      setSuggestions(data.results || []);
      setFocusIdx(0);  // always pre-select first suggestion
    } catch { setSuggestions([]); }
  }, [clientId, field]);

  useEffect(() => {
    if (editing) {
      const timer = setTimeout(() => searchMaster(inputVal), 300);
      return () => clearTimeout(timer);
    }
  }, [inputVal, editing, searchMaster]);

  // Hard read-only override (e.g. Cycle Count Consolidated view).
  // When set, render plain value with no edit affordance, regardless of
  // the row's server-side is_editable flag.
  // NOTE: kept after all hooks above to preserve hook call order.
  if (readOnly) {
    return <span className={compact ? 'text-xs font-mono' : 'font-mono'}>{value || '-'}</span>;
  }

  const startEdit = (e) => {
    e.stopPropagation();
    // The actual "enter edit mode" steps — kept identical to pre-popup
    // behaviour. Wrapped in a fn so the popup can call it on Proceed.
    const _openEditor = () => {
      setEditing(true);
      setInputVal(value || '');
      setSuggestions([]);
      setFocusIdx(0);
      setErrorMsg('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    };
    // Show Last-Edited popup gate. If the barcode has no history the
    // popup silently calls _openEditor (no UI flash). If it has history,
    // user clicks Proceed → _openEditor; Cancel → noop.
    const _bc = isEdited ? originalValue : value;
    lastEdit.openPopup(_bc, clientId, _openEditor);
  };

  const cancelEdit = () => {
    setEditing(false);
    setInputVal('');
    setSuggestions([]);
    setErrorMsg('');
  };

  const showSavedFlash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const submitEdit = async (newValue) => {
    const trimmed = (newValue || '').trim();
    // Inline error for empty input
    if (!trimmed) {
      setErrorMsg('Please type a barcode or select a suggestion');
      return;
    }
    // If user didn't change anything AND this isn't an edited row, nothing to do
    if (!isEdited && trimmed === value) {
      setErrorMsg('No changes to save — type a different barcode');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const _u = _portalUser();
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/reports/edit-barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          report_type: reportType,
          original_value: isEdited ? originalValue : value,
          new_value: trimmed,
          location: row?.location || '',
          // Movement / Audit Log attribution
          user_id: _u.id || '',
          username: _u.username || '',
          session_id: sessionId || '',
          cycle_day: cycleDay != null ? cycleDay : undefined,
          module: moduleProp || undefined,
        })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { detail: text || 'Unknown error' }; }
      if (res.ok && data.success) {
        cancelEdit();
        showSavedFlash();
        if (onEditComplete) onEditComplete();
      } else {
        // Inline error (replaces jarring alert())
        setErrorMsg(data.detail || 'Edit failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const undoEdit = async (e) => {
    e.stopPropagation();
    if (!editId) return;
    setUndoing(true);
    try {
      const _u = _portalUser();
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/reports/undo-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_id: editId,
          user_id: _u.id || '',
          username: _u.username || '',
          session_id: sessionId || '',
          cycle_day: cycleDay != null ? cycleDay : undefined,
          module: moduleProp || undefined,
        })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = {}; }
      if (res.ok && data.success) {
        showSavedFlash();
        if (onEditComplete) onEditComplete();
      } else {
        setErrorMsg(data.detail || 'Undo failed');
      }
    } catch (err) {
      setErrorMsg('Undo failed: ' + err.message);
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

  // Determine if submit should be enabled
  const trimmedInput = (inputVal || '').trim();
  const canSubmit = trimmedInput && (isEdited || trimmedInput !== value);

  // Editing mode
  if (editing) {
    return (
      <>
      <div className="relative" onClick={(e) => e.stopPropagation()} ref={dropdownRef}>
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setFocusIdx(0); setErrorMsg(''); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') { cancelEdit(); return; }
              if (e.key === 'Enter') {
                e.preventDefault();
                // Priority: if a suggestion is highlighted & input matches its prefix, select it
                if (focusIdx >= 0 && suggestions[focusIdx]) {
                  const s = suggestions[focusIdx];
                  const sVal = field === 'article_code' ? s.article_code : s.barcode;
                  // If user typed exactly the suggestion, or if they typed a prefix, use the suggestion
                  if (sVal === trimmedInput || sVal.toLowerCase().startsWith(trimmedInput.toLowerCase())) {
                    selectSuggestion(s);
                    return;
                  }
                }
                submitEdit(inputVal);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusIdx(f => Math.min(suggestions.length - 1, f + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusIdx(f => Math.max(0, f - 1));
              }
              if (e.key === 'Tab' && suggestions.length > 0) {
                // Tab = autocomplete to highlighted suggestion text (doesn't submit)
                e.preventDefault();
                const s = suggestions[focusIdx] || suggestions[0];
                if (s) {
                  const sVal = field === 'article_code' ? s.article_code : s.barcode;
                  setInputVal(sVal);
                }
              }
            }}
            placeholder={`Enter new ${field === 'article_code' ? 'article' : 'barcode'}...`}
            className={`w-40 px-1.5 py-0.5 text-xs border rounded focus:outline-none focus:ring-1 ${
              errorMsg ? 'border-red-400 focus:ring-red-300' : 'border-blue-400 focus:ring-blue-300'
            }`}
            data-testid="barcode-edit-input"
          />
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          ) : (
            <>
              <button
                onClick={() => submitEdit(inputVal)}
                disabled={!canSubmit}
                className={`p-0.5 rounded ${
                  canSubmit
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
                title={canSubmit ? 'Save (Enter)' : 'Type a new value to save'}
                data-testid="barcode-edit-confirm"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={cancelEdit}
                className="p-0.5 text-red-500 hover:bg-red-50 rounded"
                title="Cancel (Esc)"
                data-testid="barcode-edit-cancel"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Inline error message */}
        {errorMsg && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-red-50 border border-red-200 rounded-md px-2 py-1 flex items-start gap-1 shadow-sm z-[10006]" data-testid="barcode-edit-error">
            <AlertCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
            <span className="text-[11px] text-red-700 leading-tight">{errorMsg}</span>
          </div>
        )}

        {/* Auto-complete dropdown */}
        {!errorMsg && suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-72 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[10005]">
            <div className="px-2 py-1 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {suggestions.length} {suggestions.length === 1 ? 'match' : 'matches'}
              </span>
              <span className="text-[9px] text-gray-400">↑↓ navigate · ⏎ select · Tab complete</span>
            </div>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`px-2 py-1.5 text-xs cursor-pointer border-b border-gray-50 ${focusIdx === i ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : 'hover:bg-gray-50'}`}
                onClick={() => selectSuggestion(s)}
                onMouseEnter={() => setFocusIdx(i)}
                data-testid={`suggestion-${i}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-gray-800 shrink-0">
                    {field === 'article_code' ? s.article_code : s.barcode}
                  </span>
                  {focusIdx === i && <span className="text-[9px] px-1 py-0.5 bg-blue-500 text-white rounded">Enter to select</span>}
                </div>
                {s.description && <div className="text-gray-600 mt-0.5 truncate">{s.description}</div>}
                <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5">
                  {s.category && <span>📦 {s.category}</span>}
                  {s.mrp > 0 && <span>MRP: ₹{s.mrp}</span>}
                  {s.cost > 0 && <span>Cost: ₹{s.cost}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <LastEditedPopup {...lastEdit.popupProps} />
      </>
    );
  }

  // Display mode with edit/undo buttons
  return (
    <>
    <div className={`flex items-center gap-1 group ${savedFlash ? 'animate-pulse' : ''}`}>
      <span className={`${compact ? 'text-xs' : ''} ${isEdited ? 'text-blue-600 font-semibold' : ''} ${savedFlash ? 'text-emerald-600' : ''}`}>
        {value || '-'}
      </span>
      {savedFlash && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
      {isEdited && !savedFlash && (
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
      {isEditable && !isEdited && !savedFlash && (
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-blue-500 hover:bg-blue-50 rounded transition-opacity"
          title="Edit barcode — replace with master entry"
          data-testid="barcode-edit-btn"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      {isEdited && !savedFlash && (
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
    <LastEditedPopup {...lastEdit.popupProps} />
    </>
  );
}

export default BarcodeEditCell;
