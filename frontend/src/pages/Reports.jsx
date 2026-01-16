import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import {
  Download,
  Mail,
  MapPin,
  Package,
  CheckCircle2,
  BarChart3,
  Check,
  X
} from 'lucide-react';

const Reports = () => {
  const { locations, scannedItems, currentSession, masterProducts } = useApp();
  const [selectedLocations, setSelectedLocations] = useState(['all']);

  // Check if "All Locations" is selected
  const isAllSelected = selectedLocations.includes('all');

  // Handle location selection
  const handleLocationToggle = (locationId) => {
    if (locationId === 'all') {
      if (isAllSelected) {
        // Switch to first location when unchecking "All"
        if (locations.length > 0) {
          setSelectedLocations([locations[0].id]);
        }
      } else {
        setSelectedLocations(['all']);
      }
    } else {
      setSelectedLocations(prev => {
        const newSelection = prev.filter(id => id !== 'all');
        
        if (newSelection.includes(locationId)) {
          const filtered = newSelection.filter(id => id !== locationId);
          return filtered.length === 0 ? ['all'] : filtered;
        } else {
          return [...newSelection, locationId];
        }
      });
    }
  };

  // Select all locations individually
  const selectAllLocations = () => {
    setSelectedLocations(['all']);
  };

  // Clear all selections (select none)
  const clearSelections = () => {
    if (locations.length > 0) {
      setSelectedLocations([locations[0].id]);
    }
  };

  // Get items for selected locations (for export)
  const getLocationItems = useMemo(() => {
    if (isAllSelected) {
      return Object.entries(scannedItems).flatMap(([locId, items]) => {
        const loc = locations.find(l => l.id === locId);
        return items.map(item => ({ ...item, locationName: loc?.name || 'Unknown', locationId: locId }));
      });
    }
    
    if (selectedLocations.length === 0) {
      return [];
    }
    
    return selectedLocations.flatMap(locId => {
      const loc = locations.find(l => l.id === locId);
      return (scannedItems[locId] || []).map(item => ({ 
        ...item, 
        locationName: loc?.name || 'Unknown',
        locationId: locId 
      }));
    });
  }, [selectedLocations, scannedItems, locations, isAllSelected]);

  const reportItems = getLocationItems;
  const totalQuantity = reportItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = new Set(reportItems.map(item => item.barcode)).size;

  // Get master product details by barcode
  const getMasterProductDetails = (barcode) => {
    return masterProducts.find(p => p.barcode === barcode) || null;
  };

  // Get selection display text
  const getSelectionDisplayText = () => {
    if (isAllSelected) {
      return 'All Locations';
    }
    if (selectedLocations.length === 0) {
      return 'No locations selected';
    }
    if (selectedLocations.length === 1) {
      const loc = locations.find(l => l.id === selectedLocations[0]);
      return loc?.name || '1 location';
    }
    return `${selectedLocations.length} locations selected`;
  };

  const handleExportCSV = () => {
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
    
    const selectionSuffix = isAllSelected
      ? 'all_locations' 
      : `${selectedLocations.length}_locations`;
    a.download = `stock_report_${selectionSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleEmailReport = () => {
    const locationInfo = isAllSelected
      ? 'All Locations' 
      : `${selectedLocations.length} Selected Locations`;
    const subject = encodeURIComponent(`Stock Count Report - ${currentSession?.name || 'Audix'}`);
    const body = encodeURIComponent(
      `Stock Count Report\n\nSession: ${currentSession?.name}\nLocations: ${locationInfo}\nTotal Items: ${reportItems.length}\nTotal Quantity: ${totalQuantity}\nUnique Products: ${uniqueProducts}\n\nPlease find the detailed report attached.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Export Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Select locations to export</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="border-slate-200"
            disabled={reportItems.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleEmailReport}
            className="border-slate-200"
            disabled={reportItems.length === 0}
          >
            <Mail className="w-4 h-4 mr-2" />
            Email
          </Button>
        </div>
      </div>

      {/* Stats Cards - Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <MapPin className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {isAllSelected ? locations.length : selectedLocations.length}
                </p>
                <p className="text-xs text-slate-500">
                  {isAllSelected ? 'Total' : 'Selected'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{reportItems.length}</p>
                <p className="text-xs text-slate-500">Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{totalQuantity}</p>
                <p className="text-xs text-slate-500">Quantity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-teal-100 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{uniqueProducts}</p>
                <p className="text-xs text-slate-500">Unique</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selection Info Bar */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{getSelectionDisplayText()}</span>
          {!isAllSelected && selectedLocations.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedLocations.length} of {locations.length}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!isAllSelected && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={selectAllLocations}
              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <Check className="w-3 h-3 mr-1" />
              Select All
            </Button>
          )}
          {!isAllSelected && selectedLocations.length > 1 && (
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

      {/* Full-Screen Location Selection List */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* All Locations Option - Sticky at Top */}
          <div 
            className={`sticky top-0 z-10 flex items-center gap-3 p-4 border-b-2 border-slate-200 cursor-pointer transition-colors ${
              isAllSelected 
                ? 'bg-emerald-50' 
                : 'bg-white hover:bg-slate-50'
            }`}
            onClick={() => handleLocationToggle('all')}
          >
            <Checkbox 
              checked={isAllSelected}
              className="pointer-events-none h-5 w-5"
            />
            <div className="flex-1">
              <span className="text-base font-semibold text-slate-800">All Locations</span>
              <p className="text-xs text-slate-500">Select all {locations.length} locations</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-0">
              {Object.values(scannedItems).flat().length} items
            </Badge>
          </div>

          {/* Individual Locations */}
          <div className="divide-y divide-slate-100">
            {locations.map((loc) => {
              const itemCount = (scannedItems[loc.id] || []).length;
              const locQuantity = (scannedItems[loc.id] || []).reduce((sum, item) => sum + item.quantity, 0);
              const isSelected = selectedLocations.includes(loc.id);
              const isDisabled = isAllSelected;
              
              return (
                <div 
                  key={loc.id}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
                    isDisabled 
                      ? 'opacity-50 cursor-not-allowed bg-slate-50' 
                      : isSelected 
                        ? 'bg-blue-50 hover:bg-blue-100' 
                        : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    if (!isDisabled) {
                      handleLocationToggle(loc.id);
                    }
                  }}
                >
                  <Checkbox 
                    checked={isSelected || isAllSelected}
                    disabled={isDisabled}
                    className="pointer-events-none h-5 w-5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                        {loc.name}
                      </span>
                      {loc.isSubmitted && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Submitted
                        </Badge>
                      )}
                      {loc.autoCreated && (
                        <Badge variant="outline" className="text-xs border-purple-200 text-purple-600">
                          Auto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{loc.code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-700">{itemCount} items</p>
                    <p className="text-xs text-slate-500">{locQuantity} qty</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {locations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <MapPin className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">No locations available</p>
              <p className="text-sm text-slate-400">Start scanning to create locations</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Locations Summary (if individual selections) */}
      {!isAllSelected && selectedLocations.length > 0 && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 mb-2 font-medium">Selected for Export:</p>
          <div className="flex flex-wrap gap-1">
            {selectedLocations.map(locId => {
              const loc = locations.find(l => l.id === locId);
              return (
                <Badge 
                  key={locId} 
                  variant="secondary"
                  className="text-xs bg-white border border-blue-200 pr-1"
                >
                  {loc?.name}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationToggle(locId);
                    }}
                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
