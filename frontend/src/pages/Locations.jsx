import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { downloadCSV, getCSVAcceptTypes, isValidCSV } from '../utils/fileDownload';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  MapPin,
  Plus,
  Search,
  ScanBarcode,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  MoreVertical,
  Trash2,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  UserCheck,
  AlertCircle,
  Download,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const Locations = () => {
  const navigate = useNavigate();
  const { 
    locations, 
    scannedItems, 
    settings,
    addLocation, 
    deleteLocation, 
    submitLocation, 
    reopenLocation,
    renameLocation,
    importAssignedLocations,
    clearAssignedLocations,
    verifyAuthorizationCredentials 
  } = useApp();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [newLocation, setNewLocation] = useState({ name: '', code: '' });
  const [newLocationName, setNewLocationName] = useState('');
  const [authCredentials, setAuthCredentials] = useState({ userId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);

  const isPreAssignedMode = settings.locationScanMode === 'preassigned';

  // Filter locations based on current mode
  const modeFilteredLocations = locations.filter(loc => {
    if (isPreAssignedMode) {
      return loc.isAssigned === true;
    } else {
      return loc.autoCreated === true || loc.isAssigned === false;
    }
  });

  // Sort locations - most recently updated/scanned at TOP
  const sortedLocations = [...modeFilteredLocations].sort((a, b) => {
    // Sort by lastUpdated descending (newest first)
    const dateA = new Date(a.lastUpdated || 0);
    const dateB = new Date(b.lastUpdated || 0);
    return dateB - dateA;
  });

  const filteredLocations = sortedLocations.filter(
    loc =>
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const assignedLocationsCount = locations.filter(loc => loc.isAssigned).length;
  const pendingLocationsCount = filteredLocations.filter(loc => !loc.isSubmitted).length;
  const completedLocationsCount = filteredLocations.filter(loc => loc.isSubmitted).length;

  const handleAddLocation = () => {
    if (newLocation.name && newLocation.code) {
      addLocation(newLocation);
      setNewLocation({ name: '', code: '' });
      setShowAddModal(false);
    }
  };

  const handleOpenLocation = (location) => {
    if (location.isSubmitted) {
      handleReopenRequest(location);
    } else {
      navigate(`/scan?location=${location.id}`);
    }
  };

  const handleReopenRequest = (location) => {
    setSelectedLocation(location);
    setShowReopenModal(true);
  };

  const handleDeleteRequest = (location) => {
    setSelectedLocation(location);
    setShowDeleteModal(true);
  };

  const handleReopenConfirm = () => {
    setShowReopenModal(false);
    setPendingAction({ type: 'reopen', locationId: selectedLocation.id });
    setShowAuthModal(true);
  };

  const handleDeleteConfirm = () => {
    deleteLocation(selectedLocation.id);
    setShowDeleteModal(false);
    setSelectedLocation(null);
  };

  // Handle rename location
  const handleRenameRequest = (location) => {
    setSelectedLocation(location);
    setNewLocationName(location.name);
    setShowRenameModal(true);
  };

  const handleRenameConfirm = () => {
    if (newLocationName.trim()) {
      renameLocation(selectedLocation.id, newLocationName.trim());
      setShowRenameModal(false);
      setSelectedLocation(null);
      setNewLocationName('');
    }
  };

  const handleAuthSubmit = () => {
    // Use authorization credentials for reopen/delete actions
    const result = verifyAuthorizationCredentials(authCredentials.userId, authCredentials.password);
    if (result.success) {
      setAuthError('');
      setShowAuthModal(false);
      
      if (pendingAction?.type === 'reopen') {
        reopenLocation(pendingAction.locationId);
      }
      
      setPendingAction(null);
      setAuthCredentials({ userId: '', password: '' });
    } else {
      setAuthError('Invalid authorization credentials. Use credentials from "Import Users" in Master Data.');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('code') || firstLine.includes('name') || firstLine.includes('location');
        const dataLines = hasHeader ? lines.slice(1) : lines;
        
        const locationsData = dataLines.map(line => {
          const parts = line.split(',').map(s => s.trim().replace(/"/g, ''));
          if (parts.length >= 2) {
            return { code: parts[0], name: parts[1] };
          } else {
            return { code: parts[0], name: parts[0] };
          }
        }).filter(loc => loc.code);

        if (locationsData.length === 0) {
          setImportResult({ success: false, error: 'No valid locations found in CSV file' });
          return;
        }

        const count = importAssignedLocations(locationsData);
        setImportResult({ success: true, count });
      } catch (error) {
        setImportResult({ success: false, error: 'Failed to parse CSV file' });
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAssigned = () => {
    clearAssignedLocations();
    setImportResult(null);
  };

  const downloadSampleCSV = async () => {
    const sampleData = `Location Code,Location Name
WH-A1,Warehouse A - Section 1
WH-A2,Warehouse A - Section 2
WH-B1,Warehouse B - Section 1
STORE-01,Retail Store Front
COLD-01,Cold Storage Unit 1`;
    
    await downloadCSV(sampleData, 'sample_locations.csv');
  };

  const getLocationStats = (locationId) => {
    const items = scannedItems[locationId] || [];
    return {
      totalItems: items.length,
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0)
    };
  };

  // Render List View for Pre-Assigned Mode
  const renderListView = () => (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            Assigned Locations
            <Badge variant="secondary" className="ml-2">
              {pendingLocationsCount} pending • {completedLocationsCount} completed
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Outer container with vertical scroll */}
        <div 
          className="overflow-y-auto overflow-x-auto" 
          style={{ 
            maxHeight: '500px', 
            WebkitOverflowScrolling: 'touch' 
          }}
        >
          {/* Inner container with minimum width for horizontal scroll */}
          <div style={{ minWidth: '800px' }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-[50px] sticky top-0 bg-slate-50 z-10">#</TableHead>
                  <TableHead className="sticky top-0 bg-slate-50 z-10">Location Code</TableHead>
                  <TableHead className="sticky top-0 bg-slate-50 z-10">Location Name</TableHead>
                  <TableHead className="text-center sticky top-0 bg-slate-50 z-10">Items</TableHead>
                  <TableHead className="text-center sticky top-0 bg-slate-50 z-10">Qty</TableHead>
                  <TableHead className="text-center sticky top-0 bg-slate-50 z-10">Status</TableHead>
                  <TableHead className="text-right sticky top-0 bg-slate-50 z-10">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location, index) => {
                  const stats = getLocationStats(location.id);
                  return (
                    <TableRow 
                      key={location.id} 
                      className={`hover:bg-slate-50 ${location.isSubmitted ? 'bg-emerald-50/30' : ''}`}
                    >
                      <TableCell className="font-medium text-slate-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {location.code}
                      </TableCell>
                      <TableCell>{location.name}</TableCell>
                      <TableCell className="text-center">{stats.totalItems}</TableCell>
                      <TableCell className="text-center font-medium">{stats.totalQuantity}</TableCell>
                      <TableCell className="text-center">
                        {location.isSubmitted ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0">
                            <Lock className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : stats.totalItems > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 border-0">
                            <Clock className="w-3 h-3 mr-1" />
                            In Progress
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 border-0">
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleOpenLocation(location)}
                            className={location.isSubmitted 
                              ? "bg-amber-500 hover:bg-amber-600" 
                              : "bg-emerald-600 hover:bg-emerald-700"
                            }
                          >
                            {location.isSubmitted ? (
                              <>
                                <Unlock className="w-3 h-3 mr-1" />
                                Reopen
                              </>
                            ) : (
                              <>
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Open
                              </>
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleDeleteRequest(location)}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Render Compact List View for Dynamic Mode
  const renderCompactListView = () => (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-purple-600" />
            Locations
            <Badge variant="secondary" className="ml-2">
              {filteredLocations.length} locations
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div 
          className="overflow-y-auto" 
          style={{ 
            maxHeight: '500px', 
            WebkitOverflowScrolling: 'touch' 
          }}
        >
          {filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p>No locations yet</p>
              <p className="text-xs text-slate-400 mt-1">Scan a location code to start</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLocations.map((location, index) => {
                const stats = getLocationStats(location.id);
                
                return (
                  <div 
                    key={location.id} 
                    className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${
                      location.isSubmitted ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    {/* Left: Location Info - Only Name, No Zone */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Status Icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        location.isSubmitted 
                          ? 'bg-emerald-100' 
                          : stats.totalItems > 0 
                            ? 'bg-amber-100'
                            : 'bg-slate-100'
                      }`}>
                        {location.isSubmitted ? (
                          <Lock className="w-4 h-4 text-emerald-600" />
                        ) : stats.totalItems > 0 ? (
                          <Clock className="w-4 h-4 text-amber-600" />
                        ) : (
                          <MapPin className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      
                      {/* Location Name & Code - Show both for clarity */}
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 text-sm truncate block">
                          {location.name || location.code}
                        </span>
                        {/* Show code below if different from name, or show "Dynamic" label */}
                        {location.autoCreated && (
                          <span className="text-xs text-purple-500 font-medium">Dynamic Location</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Middle: Quantity - More Space */}
                    <div className="flex items-center gap-3 px-2">
                      <div className="text-center min-w-[45px]">
                        <p className="text-lg font-bold text-slate-700">{stats.totalQuantity}</p>
                        <p className="text-xs text-slate-400">Qty</p>
                      </div>
                    </div>
                    
                    {/* Right: Three Dots Menu Only (Scan moved inside) */}
                    <div className="flex items-center flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Scan/Open option moved here */}
                          <DropdownMenuItem 
                            onClick={() => handleOpenLocation(location)}
                            className={location.isSubmitted 
                              ? "text-amber-600 focus:text-amber-600 focus:bg-amber-50" 
                              : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                            }
                          >
                            {location.isSubmitted ? (
                              <>
                                <Unlock className="w-4 h-4 mr-2" />
                                Reopen
                              </>
                            ) : (
                              <>
                                <ScanBarcode className="w-4 h-4 mr-2" />
                                Scan
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {!location.isSubmitted && stats.totalItems > 0 && (
                            <>
                              <DropdownMenuItem onClick={() => submitLocation(location.id)}>
                                <Lock className="w-4 h-4 mr-2" />
                                Submit & Lock
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteRequest(location)}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Locations</h1>
          <p className="text-slate-500 mt-1">Manage your counting zones and areas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isPreAssignedMode && (
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Locations
            </Button>
          )}
          {!isPreAssignedMode && (
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          )}
        </div>
      </div>

      {/* Mode Info Banner */}
      {isPreAssignedMode && (
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800">Pre-Assigned Location Mode</h3>
                <p className="text-sm text-blue-600 mt-1">
                  Scan assigned locations in order. After completing one, the next pending location will be ready.
                </p>
                <div className="flex gap-2 mt-2">
                  <Badge className="bg-blue-100 text-blue-700 border-0">
                    {assignedLocationsCount} assigned
                  </Badge>
                  <Badge className="bg-amber-100 text-amber-700 border-0">
                    {pendingLocationsCount} pending
                  </Badge>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">
                    {completedLocationsCount} completed
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder="Search locations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11 border-slate-200"
        />
      </div>

      {/* Locations Display - List View for Both Modes */}
      {isPreAssignedMode ? renderListView() : renderCompactListView()}

      {filteredLocations.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No locations found</p>
          {isPreAssignedMode && (
            <p className="text-sm text-slate-400 mt-2">
              Import locations using the "Import Locations" button above
            </p>
          )}
        </div>
      )}

      {/* Add Location Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
            <DialogDescription>
              Create a new counting zone or area
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Location Name</Label>
              <Input
                id="name"
                placeholder="e.g., Warehouse A - Section 1"
                value={newLocation.name}
                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Location Code (for scanning)</Label>
              <Input
                id="code"
                placeholder="e.g., WH-A1"
                value={newLocation.code}
                onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddLocation} className="bg-emerald-600 hover:bg-emerald-700">
              Add Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Locations Modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) setImportResult(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Import Assigned Locations
            </DialogTitle>
            <DialogDescription>
              Import locations from CSV file for scanning
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {assignedLocationsCount > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-700">
                  <UserCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">{assignedLocationsCount} locations assigned</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAssigned}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear All
                </Button>
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                Location Code,Location Name
              </code>
              <Button
                variant="link"
                size="sm"
                onClick={downloadSampleCSV}
                className="text-blue-600 p-0 h-auto mt-2"
              >
                <Download className="w-3 h-3 mr-1" />
                Download Sample CSV
              </Button>
            </div>

            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload</p>
                <p className="text-xs text-slate-400">CSV or TXT files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={getCSVAcceptTypes()}
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {importResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {importResult.success ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm">
                  {importResult.success 
                    ? `Successfully imported ${importResult.count} location(s)`
                    : importResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete Location?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the location and all its scanned items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="font-medium text-slate-800">{selectedLocation?.name}</p>
              <p className="text-sm text-slate-500">Code: {selectedLocation?.code}</p>
              {selectedLocation && (
                <p className="text-sm text-red-600 mt-2">
                  {getLocationStats(selectedLocation.id).totalItems} items will be deleted
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteConfirm} 
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Confirmation Modal */}
      <Dialog open={showReopenModal} onOpenChange={setShowReopenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Reopen Location?
            </DialogTitle>
            <DialogDescription>
              This location has been completed. Reopening will allow editing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">
              <strong>Location:</strong> {selectedLocation?.name}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              You will need to authenticate to proceed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleReopenConfirm} className="bg-amber-500 hover:bg-amber-600">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authentication Modal for Authorization Actions */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authorization Required</DialogTitle>
            <DialogDescription>
              Enter authorization credentials to proceed (from Master Data → Import Users)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {authError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {authError}
              </div>
            )}
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>Note:</strong> Use credentials from "Import Users" in Master Data, not your login credentials.
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-userId">Authorization User ID</Label>
              <Input
                id="auth-userId"
                placeholder="Enter authorization user ID"
                value={authCredentials.userId}
                onChange={(e) => setAuthCredentials({ ...authCredentials, userId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="Enter password"
                value={authCredentials.password}
                onChange={(e) => setAuthCredentials({ ...authCredentials, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAuthModal(false);
              setAuthCredentials({ userId: '', password: '' });
              setAuthError('');
            }}>
              Cancel
            </Button>
            <Button onClick={handleAuthSubmit} className="bg-emerald-600 hover:bg-emerald-700">
              Authorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Locations;
