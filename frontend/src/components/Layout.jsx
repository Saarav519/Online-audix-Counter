import React, { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import {
  LayoutDashboard,
  MapPin,
  Package,
  ScanBarcode,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const Layout = ({ children }) => {
  const { user, logout, isAuthenticated, settings } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isScanner, isSmallScreen, isMobile } = useDeviceDetection();

  // Determine if we should show scanner mode UI
  const showScannerMode = isScanner || isSmallScreen;

  // Filter nav items based on mode
  // In Pre-Assigned mode, hide Scan Items from sidebar - it should only be accessed via opening a location
  const navItems = useMemo(() => {
    const baseItems = [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/locations', icon: MapPin, label: 'Locations' },
      { path: '/scan', icon: ScanBarcode, label: 'Scan Items', hideInPreAssigned: true },
      { path: '/master-data', icon: Package, label: 'Master Data' },
      { path: '/reports', icon: FileSpreadsheet, label: 'Reports' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ];
    
    // Filter out Scan Items in Pre-Assigned mode
    if (settings?.locationScanMode === 'preassigned') {
      return baseItems.filter(item => !item.hideInPreAssigned);
    }
    
    return baseItems;
  }, [settings?.locationScanMode]);

  // Bottom nav items for scanner mode (limited to 5 for better UX)
  const bottomNavItems = useMemo(() => {
    const items = [
      { path: '/', icon: LayoutDashboard, label: 'Home' },
      { path: '/locations', icon: MapPin, label: 'Locations' },
      { path: '/scan', icon: ScanBarcode, label: 'Scan', hideInPreAssigned: true },
      { path: '/reports', icon: FileSpreadsheet, label: 'Reports' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ];
    
    if (settings?.locationScanMode === 'preassigned') {
      return items.filter(item => !item.hideInPreAssigned);
    }
    
    return items;
  }, [settings?.locationScanMode]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Scanner Device Layout - Bottom navigation with large buttons
  if (showScannerMode) {
    return (
      <div className="min-h-screen min-h-[-webkit-fill-available] bg-slate-50 flex flex-col overflow-hidden">
        {/* Compact Header for Scanner Devices */}
        <header className="fixed top-0 left-0 right-0 h-12 bg-white border-b border-slate-200 z-50 px-3 flex items-center justify-between shadow-sm">
          {/* Logo moved to corner - smaller and non-interactive to avoid accidental clicks */}
          <div className="flex items-center pointer-events-none select-none">
            <span className="text-sm font-bold text-emerald-700">AUDIX</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-1.5 h-auto">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.role}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/master-data" className="cursor-pointer">
                  <Package className="w-4 h-4 mr-2" />
                  Master Data
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Main Content - Adjusted for smaller header and bottom nav */}
        <main className="flex-1 pt-12 pb-20 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="p-3 min-h-full">
            {children}
          </div>
        </main>

        {/* Large Bottom Navigation for Scanner Devices */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50">
          <div className="grid grid-cols-5 h-18">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center justify-center py-2 transition-colors touch-manipulation ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
                  }`}
                  data-testid={`bottom-nav-${item.label.toLowerCase()}`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : ''}`} />
                  <span className={`text-xs mt-1 font-medium ${isActive ? 'text-emerald-700' : ''}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  // Standard Desktop/Tablet Layout
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 px-4 flex items-center justify-between">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <Menu className="w-6 h-6 text-slate-700" />
        </button>
        
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-emerald-700">AUDIX</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="p-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-emerald-100 text-emerald-700">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-emerald-700">AUDIX</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-700" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Stock Management</p>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-slate-400 hover:text-red-600">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
