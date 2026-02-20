import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  MapPin,
  Package,
  ScanBarcode,
  CheckCircle2,
  Clock,
  Settings,
  FileSpreadsheet,
  LayoutDashboard,
  BarChart3
} from 'lucide-react';

const Dashboard = () => {
  const { locations, scannedItems, currentSession, masterProducts, settings } = useApp();
  const { isScanner, isSmallScreen, isMobile } = useDeviceDetection();

  // Determine if we should show scanner mode UI
  const showScannerMode = isScanner || isSmallScreen;

  // Calculate stats
  const totalLocations = locations.length;
  const completedLocations = locations.filter(l => l.isCompleted).length;
  const submittedLocations = locations.filter(l => l.isSubmitted).length;
  const pendingLocations = totalLocations - completedLocations;

  const totalScannedItems = Object.values(scannedItems || {}).reduce(
    (sum, items) => sum + (items || []).reduce((s, i) => s + i.quantity, 0),
    0
  );

  const completionPercentage = totalLocations > 0 
    ? Math.round((completedLocations / totalLocations) * 100) 
    : 0;

  // Navigation items for scanner mode
  const scannerNavItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', color: 'bg-slate-600 hover:bg-slate-700' },
    { path: '/locations', icon: MapPin, label: 'Locations', color: 'bg-blue-600 hover:bg-blue-700' },
    { path: '/scan', icon: ScanBarcode, label: 'Scan Items', color: 'bg-emerald-600 hover:bg-emerald-700', hideInPreAssigned: true },
    { path: '/master-data', icon: Package, label: 'Master Data', color: 'bg-purple-600 hover:bg-purple-700' },
    { path: '/reports', icon: FileSpreadsheet, label: 'Reports', color: 'bg-orange-600 hover:bg-orange-700' },
    { path: '/settings', icon: Settings, label: 'Settings', color: 'bg-gray-600 hover:bg-gray-700' },
  ].filter(item => !(settings?.locationScanMode === 'preassigned' && item.hideInPreAssigned));

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardContent className={`${showScannerMode ? 'p-4' : 'p-6'}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className={`font-medium text-slate-500 ${showScannerMode ? 'text-xs' : 'text-sm'}`}>{title}</p>
            <p className={`font-bold text-slate-800 mt-1 ${showScannerMode ? 'text-2xl' : 'text-3xl'}`}>{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className={`rounded-xl ${color} ${showScannerMode ? 'p-2' : 'p-3'}`}>
            <Icon className={`text-white ${showScannerMode ? 'w-5 h-5' : 'w-6 h-6'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Scanner Mode UI - Large buttons, optimized for one-handed operation
  if (showScannerMode) {
    return (
      <div className="space-y-4 pb-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
            <p className="text-xs text-slate-500">Stock Overview</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {settings?.locationScanMode === 'preassigned' ? 'Pre-Assigned' : 'Dynamic'}
          </Badge>
        </div>

        {/* Current Session - Compact */}
        {currentSession && (
          <Card className="border-0 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Badge className="bg-white/20 text-white border-0 text-xs mb-1">
                    Active Session
                  </Badge>
                  <h2 className="text-base font-semibold">{currentSession.name}</h2>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{completedLocations}/{totalLocations}</p>
                  <p className="text-emerald-100 text-xs">Locations</p>
                </div>
              </div>
              <Progress value={completionPercentage} className="h-1.5 bg-white/20 mt-3" />
            </CardContent>
          </Card>
        )}

        {/* Stats Grid - Compact */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="Locations"
            value={totalLocations}
            icon={MapPin}
            color="bg-blue-500"
          />
          <StatCard
            title="Items"
            value={totalScannedItems}
            icon={Package}
            color="bg-emerald-500"
          />
          <StatCard
            title="Completed"
            value={completedLocations}
            icon={CheckCircle2}
            color="bg-teal-500"
          />
          <StatCard
            title="Pending"
            value={pendingLocations}
            icon={Clock}
            color="bg-amber-500"
          />
        </div>

        {/* Large Navigation Buttons for Scanner Devices */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-base font-semibold text-slate-800">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-2 gap-2">
              {scannerNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} className="block">
                    <Button 
                      className={`w-full h-16 flex flex-col items-center justify-center gap-1 text-white ${item.color} shadow-md active:scale-95 transition-transform touch-manipulation`}
                      data-testid={`nav-btn-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Master Products Count */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{masterProducts.length}</p>
                <p className="text-xs text-slate-500">Master Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Desktop/Tablet UI - Standard layout
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">Welcome back! Here's your inventory overview.</p>
        </div>
        <Link to="/scan">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200">
            <ScanBarcode className="w-4 h-4 mr-2" />
            Start Scanning
          </Button>
        </Link>
      </div>

      {/* Current Session Banner */}
      {currentSession && (
        <Card className="border-0 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <Badge className="bg-white/20 text-white border-0 mb-2">
                  Active Session
                </Badge>
                <h2 className="text-xl font-semibold">{currentSession.name}</h2>
                <p className="text-emerald-100 text-sm mt-1">
                  {currentSession.startDate} - {currentSession.endDate}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold">{completedLocations}/{totalLocations}</p>
                  <p className="text-emerald-100 text-sm">Locations Complete</p>
                </div>
                <div className="hidden lg:block w-32">
                  <Progress value={completionPercentage} className="h-2 bg-white/20" />
                  <p className="text-xs text-emerald-100 mt-1 text-center">{completionPercentage}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Locations"
          value={totalLocations}
          icon={MapPin}
          color="bg-blue-500"
          subtitle="Active count zones"
        />
        <StatCard
          title="Items Scanned"
          value={totalScannedItems}
          icon={Package}
          color="bg-emerald-500"
          subtitle="Total quantity"
        />
        <StatCard
          title="Completed"
          value={completedLocations}
          icon={CheckCircle2}
          color="bg-teal-500"
          subtitle={`${submittedLocations} submitted`}
        />
        <StatCard
          title="Pending"
          value={pendingLocations}
          icon={Clock}
          color="bg-amber-500"
          subtitle="Awaiting count"
        />
      </div>

      {/* Quick Actions & Master Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-slate-800">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {scannerNavItems.filter(item => item.path !== '/').map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} className="block">
                    <Button 
                      variant="outline" 
                      className={`w-full h-24 flex flex-col items-center justify-center gap-2 border-slate-200 hover:border-slate-300 transition-all`}
                      data-testid={`quick-action-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className="w-6 h-6 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Master Products */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-slate-800">Master Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{masterProducts.length}</p>
                <p className="text-sm text-slate-500">Products in database</p>
              </div>
            </div>
            <Link to="/master-data" className="block mt-4">
              <Button variant="outline" className="w-full border-slate-200">
                <Package className="w-4 h-4 mr-2" />
                Manage Master Data
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
