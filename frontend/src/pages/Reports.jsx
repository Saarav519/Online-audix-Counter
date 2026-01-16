import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {
  FileSpreadsheet,
  Download,
  Mail,
  MapPin,
  Package,
  CheckCircle2,
  BarChart3,
  ChevronDown,
  X
} from 'lucide-react';

const Reports = () => {
  const { locations, scannedItems, currentSession, masterProducts } = useApp();
  const [selectedLocations, setSelectedLocations] = useState(['all']); // Multiple selection
  const [filterOpen, setFilterOpen] = useState(false);

  // Handle location selection
  const handleLocationToggle = (locationId) => {
    if (locationId === 'all') {
      // If "All" is selected, clear other selections
      setSelectedLocations(['all']);
    } else {
      setSelectedLocations(prev => {
        // Remove 'all' if it was selected
        const newSelection = prev.filter(id => id !== 'all');
        
        if (newSelection.includes(locationId)) {
          // Remove location if already selected
          const filtered = newSelection.filter(id => id !== locationId);
          // If no locations selected, default to 'all'
          return filtered.length === 0 ? ['all'] : filtered;
        } else {
          // Add location to selection
          return [...newSelection, locationId];
        }
      });
    }
  };

  // Clear all selections
  const clearSelections = () => {
    setSelectedLocations(['all']);
  };

  // Get items for selected locations
  const getLocationItems = useMemo(() => {
    if (selectedLocations.includes('all')) {
      return Object.entries(scannedItems).flatMap(([locId, items]) => {
        const loc = locations.find(l => l.id === locId);
        return items.map(item => ({ ...item, locationName: loc?.name || 'Unknown', locationId: locId }));
      });
    }
    
    // Get items only for selected locations
    return selectedLocations.flatMap(locId => {
      const loc = locations.find(l => l.id === locId);
      return (scannedItems[locId] || []).map(item => ({ 
        ...item, 
        locationName: loc?.name || 'Unknown',
        locationId: locId 
      }));
    });
  }, [selectedLocations, scannedItems, locations]);

  const reportItems = getLocationItems;

  const totalQuantity = reportItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = new Set(reportItems.map(item => item.barcode)).size;

  // Get master product details by barcode
  const getMasterProductDetails = (barcode) => {
    return masterProducts.find(p => p.barcode === barcode) || null;
  };

  // Get display text for selected locations
  const getSelectionDisplayText = () => {
    if (selectedLocations.includes('all')) {
      return 'All Locations';
    }
    if (selectedLocations.length === 1) {
      const loc = locations.find(l => l.id === selectedLocations[0]);
      return loc?.name || 'Select Location';
    }
    return `${selectedLocations.length} locations selected`;
  };

  const handleExportCSV = () => {
    // Export only data for selected locations
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
    
    // Include selection info in filename
    const selectionSuffix = selectedLocations.includes('all') 
      ? 'all_locations' 
      : `${selectedLocations.length}_locations`;
    a.download = `stock_report_${selectionSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleEmailReport = () => {
    const locationInfo = selectedLocations.includes('all') 
      ? 'All Locations' 
      : `${selectedLocations.length} Selected Locations`;
    const subject = encodeURIComponent(`Stock Count Report - ${currentSession?.name || 'Audix'}`);
    const body = encodeURIComponent(
      `Stock Count Report\n\nSession: ${currentSession?.name}\nLocations: ${locationInfo}\nTotal Items: ${reportItems.length}\nTotal Quantity: ${totalQuantity}\nUnique Products: ${uniqueProducts}\n\nPlease find the detailed report attached.`
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
                <p className="text-2xl font-bold text-slate-800">
                  {selectedLocations.includes('all') ? locations.length : selectedLocations.length}
                </p>
                <p className="text-sm text-slate-500">
                  {selectedLocations.includes('all') ? 'Total' : 'Selected'} Locations
                </p>
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

      {/* Filter - Multiple Location Selection */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Filter by Location (Multiple Selection)
              </label>
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-between h-10 border-slate-200"
                  >
                    <span className="truncate">{getSelectionDisplayText()}</span>
                    <ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <div className="p-2 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Select Locations</span>
                      {!selectedLocations.includes('all') && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={clearSelections}
                          className="h-7 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto p-2">
                    {/* All Locations Option */}
                    <div 
                      className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-md cursor-pointer"
                      onClick={() => handleLocationToggle('all')}
                    >
                      <Checkbox 
                        id="all-locations"
                        checked={selectedLocations.includes('all')}
                        onCheckedChange={() => handleLocationToggle('all')}
                      />
                      <label 
                        htmlFor="all-locations" 
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        All Locations
                      </label>
                      <Badge variant="secondary" className="text-xs">
                        {locations.length}
                      </Badge>
                    </div>
                    
                    <div className="my-2 border-t border-slate-100" />
                    
                    {/* Individual Locations */}
                    {locations.map((loc) => {
                      const itemCount = (scannedItems[loc.id] || []).length;
                      return (
                        <div 
                          key={loc.id}
                          className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-md cursor-pointer"
                          onClick={() => handleLocationToggle(loc.id)}
                        >
                          <Checkbox 
                            id={loc.id}
                            checked={selectedLocations.includes(loc.id) || selectedLocations.includes('all')}
                            disabled={selectedLocations.includes('all')}
                            onCheckedChange={() => handleLocationToggle(loc.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <label 
                              htmlFor={loc.id} 
                              className="text-sm cursor-pointer block truncate"
                            >
                              {loc.name}
                            </label>
                            <span className="text-xs text-slate-400">{loc.code}</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-xs shrink-0 ${
                              loc.isSubmitted 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                                : 'border-slate-200'
                            }`}
                          >
                            {itemCount} items
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-2 border-t border-slate-100 bg-slate-50">
                    <Button 
                      size="sm" 
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setFilterOpen(false)}
                    >
                      Apply Filter
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Selected locations badges */}
              {!selectedLocations.includes('all') && selectedLocations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedLocations.map(locId => {
                    const loc = locations.find(l => l.id === locId);
                    return (
                      <Badge 
                        key={locId} 
                        variant="secondary"
                        className="text-xs pr-1"
                      >
                        {loc?.name}
                        <button 
                          onClick={() => handleLocationToggle(locId)}
                          className="ml-1 hover:bg-slate-300 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-start">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Session</p>
                <p className="text-sm font-medium text-slate-700">{currentSession?.name}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table - Horizontal AND Vertical Scrolling */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Inventory Report
            <Badge variant="secondary" className="ml-2">
              {reportItems.length} items
            </Badge>
            {!selectedLocations.includes('all') && (
              <Badge variant="outline" className="ml-1 text-xs">
                {selectedLocations.length} location(s)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportItems.length === 0 ? (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No data to display</p>
              <p className="text-sm text-slate-400 mt-1">
                {selectedLocations.includes('all') 
                  ? 'Start scanning items to generate reports'
                  : 'No items found for selected locations'}
              </p>
            </div>
          ) : (
            // Scrollable container - both horizontal and vertical
            <div className="overflow-auto max-h-[500px] relative">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow className="bg-slate-50">
                    <TableHead className="min-w-[120px]">Location</TableHead>
                    <TableHead className="min-w-[130px]">Barcode</TableHead>
                    <TableHead className="min-w-[150px]">Product Name</TableHead>
                    <TableHead className="min-w-[100px]">SKU</TableHead>
                    <TableHead className="min-w-[100px]">Category</TableHead>
                    <TableHead className="text-right min-w-[80px]">Price</TableHead>
                    <TableHead className="text-center min-w-[70px]">Qty</TableHead>
                    <TableHead className="min-w-[150px]">Scanned At</TableHead>
                    <TableHead className="text-center min-w-[90px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportItems.map((item, index) => {
                    const masterProduct = getMasterProductDetails(item.barcode);
                    return (
                      <TableRow key={`${item.id}-${index}`} className="hover:bg-slate-50">
                        <TableCell>
                          <Badge variant="outline" className="border-slate-200 text-xs">
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
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Master</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Non-Master</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
