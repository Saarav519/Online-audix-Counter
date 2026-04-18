import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Keyboard } from 'lucide-react';

/**
 * Keyboard shortcuts system.
 * - Press `?` anywhere → help modal opens.
 * - Press `g` then a letter → navigate (g d = dashboard, g c = clients, etc.)
 * - Press Esc → close modal.
 *
 * Mount once at app root (inside PortalLayout).
 */
const SHORTCUTS = [
  { keys: ['?'], label: 'Show this help', category: 'General' },
  { keys: ['⌘', 'K'], label: 'Open global search', category: 'General', macOnly: false },
  { keys: ['Esc'], label: 'Close modal / overlay', category: 'General' },
  { keys: ['G', 'D'], label: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['G', 'C'], label: 'Go to Clients', category: 'Navigation' },
  { keys: ['G', 'S'], label: 'Go to Sessions', category: 'Navigation' },
  { keys: ['G', 'V'], label: 'Go to Devices', category: 'Navigation' },
  { keys: ['G', 'R'], label: 'Go to Reports', category: 'Navigation' },
  { keys: ['G', 'L'], label: 'Go to Sync Logs', category: 'Navigation' },
  { keys: ['G', 'X'], label: 'Go to Conflicts', category: 'Navigation' },
  { keys: ['G', 'U'], label: 'Go to Users', category: 'Navigation' },
];

const NAV_MAP = {
  d: '/portal/dashboard',
  c: '/portal/clients',
  s: '/portal/sessions',
  v: '/portal/devices',
  r: '/portal/reports',
  l: '/portal/sync-logs',
  x: '/portal/conflicts',
  u: '/portal/users',
};

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let gPending = false;
    let gTimer = null;

    const handler = (e) => {
      // Skip if typing in input/textarea/contenteditable
      const target = e.target;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTyping) return;

      // `?` to open help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        setOpen(false);
        gPending = false;
        if (gTimer) { clearTimeout(gTimer); gTimer = null; }
        return;
      }

      // `g` then letter for navigation
      if (e.key === 'g' || e.key === 'G') {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        gPending = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPending = false; }, 1500);
        return;
      }
      if (gPending) {
        const letter = e.key.toLowerCase();
        const target = NAV_MAP[letter];
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        gPending = false;
        if (gTimer) { clearTimeout(gTimer); gTimer = null; }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  if (!open) return null;

  const grouped = SHORTCUTS.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
      data-testid="keyboard-shortcuts-overlay"
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden animate-scale-in origin-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/30">
              <Keyboard className="w-4 h-4 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Keyboard Shortcuts</h3>
              <p className="text-[11px] text-slate-500">Power through the portal with your keyboard</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-5 last:mb-0">
              <h4 className="text-[11px] uppercase font-semibold tracking-wider text-slate-400 mb-2">{category}</h4>
              <div className="space-y-1.5">
                {items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-sm text-slate-700">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          <kbd className="inline-flex items-center h-6 min-w-[24px] px-1.5 text-[11px] font-mono font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded shadow-sm">
                            {k}
                          </kbd>
                          {ki < s.keys.length - 1 && <span className="text-slate-300 text-xs">then</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Tip: Shortcuts don't fire while typing in inputs.</span>
          <span>Press <kbd className="px-1 bg-white border border-slate-200 rounded text-[10px] font-mono">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
