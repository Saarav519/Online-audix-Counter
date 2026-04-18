import React, { useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import {
  Search, LayoutDashboard, Building2, FolderOpen, Smartphone,
  FileBarChart, Database, AlertTriangle, Users, Plus, Upload, LogOut
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Cmd+K / Ctrl+K Global Search Modal.
 * Lists quick navigation, clients, sessions. Keyboard-first UX.
 */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch(`${API_URL}/api/audit/portal/clients`),
          fetch(`${API_URL}/api/audit/portal/sessions`),
        ]);
        if (cRes.ok) setClients(await cRes.json());
        if (sRes.ok) setSessions(await sRes.json());
      } catch { /* silent */ }
    })();
  }, [open]);

  const quickActions = useMemo(() => ([
    { id: 'dash', label: 'Go to Dashboard', icon: LayoutDashboard, action: () => navigate('/portal/dashboard') },
    { id: 'clients', label: 'Manage Clients', icon: Building2, action: () => navigate('/portal/clients') },
    { id: 'sessions', label: 'Audit Sessions', icon: FolderOpen, action: () => navigate('/portal/sessions') },
    { id: 'devices', label: 'Devices', icon: Smartphone, action: () => navigate('/portal/devices') },
    { id: 'reports', label: 'Open Reports', icon: FileBarChart, action: () => navigate('/portal/reports') },
    { id: 'synclogs', label: 'Sync Logs & Inbox', icon: Database, action: () => navigate('/portal/sync-logs') },
    { id: 'conflicts', label: 'Resolve Conflicts', icon: AlertTriangle, action: () => navigate('/portal/conflicts') },
    { id: 'users', label: 'User Management', icon: Users, action: () => navigate('/portal/users') },
  ]), [navigate]);

  const actions = useMemo(() => ([
    { id: 'new-session', label: 'Create New Audit Session', icon: Plus, shortcut: 'N S', action: () => navigate('/portal/sessions?new=1') },
    { id: 'new-client', label: 'Add New Client', icon: Plus, shortcut: 'N C', action: () => navigate('/portal/clients?new=1') },
    { id: 'upload-backup', label: 'Upload Sync Backup CSV', icon: Upload, action: () => navigate('/portal/sync-logs') },
    { id: 'logout', label: 'Sign Out', icon: LogOut, action: () => {
      localStorage.removeItem('auditPortalUser');
      localStorage.removeItem('portalUser');
      localStorage.removeItem('portalAuth');
      navigate('/portal');
    } },
  ]), [navigate]);

  const run = (fn) => { setOpen(false); fn(); };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
      data-testid="global-search-overlay"
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden animate-scale-in origin-top"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Global Search" className="flex flex-col max-h-[60vh]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <Command.Input
              placeholder="Search clients, sessions, or jump to a page…"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-800 placeholder:text-slate-400"
              autoFocus
              data-testid="global-search-input"
            />
            <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded">ESC</kbd>
          </div>

          <Command.List className="flex-1 overflow-y-auto py-2">
            <Command.Empty className="py-8 text-center text-sm text-slate-500">
              No results found. Try a different query.
            </Command.Empty>

            <Command.Group heading={<div className="px-4 pt-2 pb-1 text-[11px] uppercase font-semibold tracking-wider text-slate-400">Quick Navigation</div>}>
              {quickActions.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`nav ${a.label}`}
                  onSelect={() => run(a.action)}
                  className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer text-sm text-slate-700 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-700"
                >
                  <a.icon className="w-4 h-4 text-slate-500" />
                  <span>{a.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {clients.length > 0 && (
              <Command.Group heading={<div className="px-4 pt-3 pb-1 text-[11px] uppercase font-semibold tracking-wider text-slate-400">Clients ({clients.length})</div>}>
                {clients.slice(0, 10).map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`client ${c.name} ${c.code}`}
                    onSelect={() => run(() => navigate(`/portal/clients?focus=${c.id}`))}
                    className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer text-sm text-slate-700 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-700"
                  >
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-slate-400">{c.code}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {sessions.length > 0 && (
              <Command.Group heading={<div className="px-4 pt-3 pb-1 text-[11px] uppercase font-semibold tracking-wider text-slate-400">Audit Sessions ({sessions.length})</div>}>
                {sessions.slice(0, 10).map((s) => (
                  <Command.Item
                    key={s.id}
                    value={`session ${s.name}`}
                    onSelect={() => run(() => navigate(`/portal/reports?session=${s.id}&client=${s.client_id}`))}
                    className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer text-sm text-slate-700 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-700"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {s.status}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={<div className="px-4 pt-3 pb-1 text-[11px] uppercase font-semibold tracking-wider text-slate-400">Actions</div>}>
              {actions.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`action ${a.label}`}
                  onSelect={() => run(a.action)}
                  className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer text-sm text-slate-700 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-700"
                >
                  <a.icon className="w-4 h-4 text-slate-500" />
                  <span className="flex-1">{a.label}</span>
                  {a.shortcut && (
                    <span className="text-[10px] text-slate-400 font-mono">{a.shortcut}</span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="px-1 bg-white border border-slate-200 rounded">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 bg-white border border-slate-200 rounded">↵</kbd> select</span>
            </div>
            <span className="text-slate-400">AudiX Quick Search</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
