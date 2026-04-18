import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, FolderOpen, Smartphone,
  FileBarChart, Users, LogOut, Database, AlertTriangle,
  ChevronLeft, ChevronRight, Search, Menu, X
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useAudit } from '../AuditApp';
import NotificationBell from '../../components/portal/NotificationBell';
import GlobalSearch from '../../components/portal/GlobalSearch';
import KeyboardShortcuts from '../../components/portal/KeyboardShortcuts';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const navItems = [
  { to: '/portal/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portal/clients', icon: Building2, label: 'Clients' },
  { to: '/portal/sessions', icon: FolderOpen, label: 'Audit Sessions' },
  { to: '/portal/devices', icon: Smartphone, label: 'Devices' },
  { to: '/portal/reports', icon: FileBarChart, label: 'Reports' },
  { to: '/portal/sync-logs', icon: Database, label: 'Sync Logs', badgeKey: 'syncPending' },
  { to: '/portal/conflicts', icon: AlertTriangle, label: 'Conflicts', badgeKey: 'conflictsPending' },
  { to: '/portal/users', icon: Users, label: 'Users', badgeKey: 'usersPending' },
];

export default function PortalLayout({ children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('auditPortalUser') || localStorage.getItem('portalUser') || '{}');
  const { logout } = useAudit();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('portalSidebarCollapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({ syncPending: 0, conflictsPending: 0, usersPending: 0 });

  useEffect(() => {
    localStorage.setItem('portalSidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // Poll badge counts every 45s
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [conflictsRes, usersRes] = await Promise.all([
          fetch(`${API_URL}/api/audit/portal/conflicts/summary`).catch(() => null),
          fetch(`${API_URL}/api/audit/portal/users`).catch(() => null),
        ]);
        const newBadges = { syncPending: 0, conflictsPending: 0, usersPending: 0 };
        if (conflictsRes?.ok) {
          const data = await conflictsRes.json();
          newBadges.conflictsPending = data?.pending_count || data?.total_pending || 0;
        }
        if (usersRes?.ok) {
          const users = await usersRes.json();
          newBadges.usersPending = Array.isArray(users) ? users.filter((u) => !u.is_approved).length : 0;
        }
        if (alive) setBadges(newBadges);
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 45000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/portal');
  };

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  const Sidebar = ({ mobile = false }) => (
    <aside
      className={`
        ${mobile ? 'w-72' : (collapsed ? 'w-[76px]' : 'w-64')}
        bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-out
        ${mobile ? 'h-full' : 'h-screen sticky top-0'}
      `}
      data-testid="portal-sidebar"
    >
      {/* Brand */}
      <div className={`p-4 border-b border-slate-200 ${collapsed && !mobile ? 'px-3' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/25 flex-shrink-0">
            <span className="text-lg font-bold text-white">A</span>
          </div>
          {(!collapsed || mobile) && (
            <div className="min-w-0 animate-fade-in">
              <h1 className="font-bold text-slate-900 text-sm truncate">Audix Data</h1>
              <p className="text-[11px] text-slate-500 truncate">Admin Portal</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-3" data-testid="portal-nav">
        {navItems.map((item) => {
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed && !mobile ? item.label : ''}
              className={({ isActive }) => `
                group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/60'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                ${collapsed && !mobile ? 'justify-center' : ''}
              `}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {({ isActive }) => (
                <>
                  {/* Active side-bar accent */}
                  {isActive && !(collapsed && !mobile) && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-gradient-to-b from-emerald-500 to-teal-500" />
                  )}
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`} strokeWidth={2} />
                  {(!collapsed || mobile) && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center
                          ${item.badgeKey === 'conflictsPending' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                  {/* Collapsed badge dot */}
                  {(collapsed && !mobile) && badge > 0 && (
                    <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${item.badgeKey === 'conflictsPending' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom section: user + collapse toggle */}
      <div className="border-t border-slate-200 p-3">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center flex-col gap-2' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm">
            <span className="text-sm font-semibold text-slate-600">
              {user.username?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>
          {(!collapsed || mobile) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{user.username || 'Admin'}</p>
                <p className="text-[11px] text-slate-500 truncate capitalize">{user.role || 'admin'}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="portal-logout-btn"
                className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 h-8 w-8 p-0 rounded-lg"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            data-testid="sidebar-collapse-btn"
            className="mt-3 w-full flex items-center justify-center gap-2 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors text-xs font-medium"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="bg-white shadow-2xl animate-fade-in">
            <div className="flex items-center justify-end p-2">
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 h-14 bg-white/80 backdrop-blur-md border-b border-slate-200/70 flex items-center gap-2 px-4 md:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Cmd+K trigger */}
          <button
            type="button"
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: !isMac }))}
            className="flex-1 md:max-w-md flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-transparent hover:border-slate-200 text-sm text-slate-500 transition-colors"
            data-testid="global-search-trigger"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Search clients, sessions, pages…</span>
            <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-auto animate-fade-in">
          {children || <Outlet />}
        </main>
      </div>

      {/* Global Cmd+K Search */}
      <GlobalSearch />
      {/* Global Keyboard Shortcuts (? for help, g+letter for navigation) */}
      <KeyboardShortcuts />
    </div>
  );
}
