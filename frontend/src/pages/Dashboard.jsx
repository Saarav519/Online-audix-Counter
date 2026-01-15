import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
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
  AlertCircle,
  ArrowRight,
  TrendingUp,
  BarChart3
} from 'lucide-react';

const Dashboard = () => {
  const { locations, scannedItems, currentSession, masterProducts } = useApp();

  // Calculate stats
  const totalLocations = locations.length;
  const completedLocations = locations.filter(l => l.isCompleted).length;
  const submittedLocations = locations.filter(l => l.isSubmitted).length;
  const pendingLocations = totalLocations - completedLocations;

  const totalScannedItems = Object.values(scannedItems).reduce(
    (sum, items) => sum + items.reduce((s, i) => s + i.quantity, 0),
    0
  );

  const completionPercentage = totalLocations > 0 
    ? Math.round((completedLocations / totalLocations) * 100) 
    : 0;

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

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

      {/* Recent Locations & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Locations */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-800">Recent Locations</CardTitle>
              <Link to="/locations">
                <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locations.slice(0, 4).map((location) => {
                const locationItems = scannedItems[location.id] || [];
                const itemCount = locationItems.reduce((sum, i) => sum + i.quantity, 0);
                
                return (
                  <div
                    key={location.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-lg ${
                        location.isSubmitted 
                          ? 'bg-emerald-100 text-emerald-600' 
                          : location.isCompleted 
                            ? 'bg-teal-100 text-teal-600'
                            : 'bg-slate-200 text-slate-600'
                      }`}>
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{location.name}</p>
                        <p className="text-sm text-slate-500">{location.code} • {itemCount} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {location.isSubmitted ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">Submitted</Badge>
                      ) : location.isCompleted ? (
                        <Badge className="bg-teal-100 text-teal-700 border-0">Completed</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-0">In Progress</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Stats */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-800">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/scan" className="block">
                <Button variant="outline" className="w-full justify-start h-12 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                  <ScanBarcode className="w-5 h-5 mr-3" />
                  Start New Scan
                </Button>
              </Link>
              <Link to="/locations" className="block">
                <Button variant="outline" className="w-full justify-start h-12 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                  <MapPin className="w-5 h-5 mr-3" />
                  Manage Locations
                </Button>
              </Link>
              <Link to="/master-data" className="block">
                <Button variant="outline" className="w-full justify-start h-12 border-slate-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200">
                  <Package className="w-5 h-5 mr-3" />
                  Master Data
                </Button>
              </Link>
            </CardContent>
          </Card>

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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
