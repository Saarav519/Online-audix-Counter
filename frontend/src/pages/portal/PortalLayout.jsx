import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  FolderOpen, 
  Smartphone, 
  FileBarChart, 
  Users,
  LogOut,
  Database
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const navItems = [
  { to: '/portal/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portal/clients', icon: Building2, label: 'Clients' },
  { to: '/portal/sessions', icon: FolderOpen, label: 'Audit Sessions' },
  { to: '/portal/devices', icon: Smartphone, label: 'Devices' },
  { to: '/portal/reports', icon: FileBarChart, label: 'Reports' },
  { to: '/portal/sync-logs', icon: Database, label: 'Sync Logs' },
  { to: '/portal/users', icon: Users, label: 'Users' },
];

export default function PortalLayout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('portalUser') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('portalUser');
    localStorage.removeItem('portalAuth');
    navigate('/portal');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-emerald-600">A</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">AUDIX</h1>
              <p className="text-xs text-gray-500">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">
                  {user.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user.username}</p>
                <p className="text-xs text-gray-500">{user.role}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-600"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
