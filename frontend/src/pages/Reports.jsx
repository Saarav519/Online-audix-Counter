import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  FileSpreadsheet,
  Download,
  Mail,
  MapPin,
  Package,
  Calendar,
  CheckCircle2,
  Clock,
  BarChart3
} from 'lucide-react';

const Reports = () => {
  const { locations, scannedItems, sessions, currentSession, masterProducts } = useApp();
  const [selectedLocation, setSelectedLocation] = useState('all');

  const getLocationItems = (locationId) => {
    if (locationId === 'all') {
      return Object.entries(scannedItems).flatMap(([locId, items]) => {
        const loc = locations.find(l => l.id === locId);
        return items.map(item => ({ ...item, locationName: loc?.name || 'Unknown' }));
      });
    }
    const loc = locations.find(l => l.id === locationId);
    return (scannedItems[locationId] || []).map(item => ({ ...item, locationName: loc?.name }));
  };

  const reportItems = getLocationItems(selectedLocation);

  const totalQuantity = reportItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = new Set(reportItems.map(item => item.barcode)).size;

  // Get master product details by barcode
  const getMasterProductDetails = (barcode) => {
    return masterProducts.find(p => p.barcode === barcode) || null;
  };

  const handleExportCSV = () => {
    // Include all master data columns in export
    const headers = ['Location', 'Barcode', 'Product Name', 'SKU', 'Category', 'Price', 'Quantity', 'Scanned At', 'Status'];
    const rows = reportItems.map(item => {
      const masterProduct = getMasterProductDetails(item.barcode);
      return [
        `"${item.locationName}"`,
        item.barcode,
        `"${item.productName}"`,
        masterProduct?.sku || '',
        `"${masterProduct?.category || 'Unknown'}"`,
        masterProduct?.price?.toFixed(2) || '0.00',
        item.quantity,
        new Date(item.scannedAt).toLocaleString(),
        item.isMaster !== false ? 'Master' : 'Non-Master'
      ];
    });
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleEmailReport = () => {
    const subject = encodeURIComponent(`Stock Count Report - ${currentSession?.name || 'Audix'}`);
    const body = encodeURIComponent(
      `Stock Count Report\n\nSession: ${currentSession?.name}\nTotal Items: ${reportItems.length}\nTotal Quantity: ${totalQuantity}\nUnique Products: ${uniqueProducts}\n\nPlease find the detailed report attached.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 mt-1">View and export your inventory reports</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="border-slate-200"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleEmailReport}
            className="border-slate-200"
          >
            <Mail className="w-4 h-4 mr-2" />
            Email Report
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <MapPin className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{locations.length}</p>
                <p className="text-sm text-slate-500">Locations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{reportItems.length}</p>
                <p className="text-sm text-slate-500">Line Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalQuantity}</p>
                <p className="text-sm text-slate-500">Total Quantity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{uniqueProducts}</p>
                <p className="text-sm text-slate-500">Unique Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Filter by Location</label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Session</p>
                <p className="text-sm font-medium text-slate-700">{currentSession?.name}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Inventory Report
            <Badge variant="secondary" className="ml-2">
              {reportItems.length} items
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportItems.length === 0 ? (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No data to display</p>
              <p className="text-sm text-slate-400 mt-1">Start scanning items to generate reports</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Location</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead>Scanned At</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportItems.map((item, index) => {
                    const masterProduct = getMasterProductDetails(item.barcode);
                    return (
                      <TableRow key={`${item.id}-${index}`} className="hover:bg-slate-50">
                        <TableCell>
                          <Badge variant="outline" className="border-slate-200">
                            {item.locationName}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{masterProduct?.sku || '-'}</TableCell>
                        <TableCell>
                          {masterProduct?.category ? (
                            <Badge variant="outline" className="border-slate-200 text-xs">
                              {masterProduct.category}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {masterProduct?.price ? `₹${masterProduct.price.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {new Date(item.scannedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isMaster !== false ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0">Master</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-0">Non-Master</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Session History */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            Session History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-lg ${
                    session.status === 'active' ? 'bg-emerald-100' : 'bg-slate-200'
                  }`}>
                    {session.status === 'active' ? (
                      <Clock className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{session.name}</p>
                    <p className="text-sm text-slate-500">
                      {session.startDate} - {session.endDate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                      {session.completedLocations}/{session.locations.length} locations
                    </p>
                    <p className="text-xs text-slate-500">{session.totalItems} items</p>
                  </div>
                  <Badge className={session.status === 'active' 
                    ? 'bg-emerald-100 text-emerald-700 border-0' 
                    : 'bg-slate-200 text-slate-600 border-0'
                  }>
                    {session.status === 'active' ? 'Active' : 'Completed'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
