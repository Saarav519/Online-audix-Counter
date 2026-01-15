import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
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
  MapPin,
  Plus,
  Search,
  ScanBarcode,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const Locations = () => {
  const { locations, scannedItems, addLocation, submitLocation, reopenLocation, isAuthenticated, login, user } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [newLocation, setNewLocation] = useState({ name: '', code: '' });
  const [authCredentials, setAuthCredentials] = useState({ userId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  const filteredLocations = locations.filter(
    loc =>
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddLocation = () => {
    if (newLocation.name && newLocation.code) {
      addLocation(newLocation);
      setNewLocation({ name: '', code: '' });
      setShowAddModal(false);
    }
  };

  const handleReopenRequest = (location) => {
    setSelectedLocation(location);
    setShowReopenModal(true);
  };

  const handleReopenConfirm = () => {
    setShowReopenModal(false);
    setPendingAction({ type: 'reopen', locationId: selectedLocation.id });
    setShowAuthModal(true);
  };

  const handleAuthSubmit = () => {
    const result = login(authCredentials.userId, authCredentials.password);
    if (result.success) {
      setAuthError('');
      setShowAuthModal(false);
      
      if (pendingAction?.type === 'reopen') {
        reopenLocation(pendingAction.locationId);
      }
      
      setPendingAction(null);
      setAuthCredentials({ userId: '', password: '' });
    } else {
      setAuthError('Invalid credentials. Please try again.');
    }
  };

  const getLocationStats = (locationId) => {
    const items = scannedItems[locationId] || [];
    return {
      totalItems: items.length,
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0)
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Locations</h1>
          <p className="text-slate-500 mt-1">Manage your counting zones and areas</p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

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

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLocations.map((location) => {
          const stats = getLocationStats(location.id);
          
          return (
            <Card 
              key={location.id} 
              className={`border-0 shadow-sm hover:shadow-md transition-all duration-300 ${
                location.isSubmitted ? 'bg-emerald-50/50' : location.isCompleted ? 'bg-teal-50/50' : 'bg-white'
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${
                    location.isSubmitted 
                      ? 'bg-emerald-100' 
                      : location.isCompleted 
                        ? 'bg-teal-100'
                        : 'bg-slate-100'
                  }`}>
                    <MapPin className={`w-6 h-6 ${
                      location.isSubmitted 
                        ? 'text-emerald-600' 
                        : location.isCompleted 
                          ? 'text-teal-600'
                          : 'text-slate-600'
                    }`} />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {location.isSubmitted ? (
                      <Lock className="w-4 h-4 text-emerald-600" />
                    ) : location.isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-500" />
                    )}
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!location.isSubmitted && (
                          <DropdownMenuItem asChild>
                            <Link to={`/scan?location=${location.id}`} className="flex items-center">
                              <ScanBarcode className="w-4 h-4 mr-2" />
                              Scan Items
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {location.isSubmitted && (
                          <DropdownMenuItem onClick={() => handleReopenRequest(location)}>
                            <Unlock className="w-4 h-4 mr-2" />
                            Reopen Location
                          </DropdownMenuItem>
                        )}
                        {!location.isSubmitted && location.isCompleted && (
                          <DropdownMenuItem onClick={() => submitLocation(location.id)}>
                            <Lock className="w-4 h-4 mr-2" />
                            Submit & Lock
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <h3 className="font-semibold text-slate-800 mb-1">{location.name}</h3>
                <p className="text-sm text-slate-500 mb-4">{location.code}</p>

                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-slate-500">Items: </span>
                    <span className="font-medium text-slate-700">{stats.totalItems}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Qty: </span>
                    <span className="font-medium text-slate-700">{stats.totalQuantity}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  {location.isSubmitted ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 w-full justify-center py-1">
                      <Lock className="w-3 h-3 mr-1" /> Submitted & Locked
                    </Badge>
                  ) : location.isCompleted ? (
                    <Badge className="bg-teal-100 text-teal-700 border-0 w-full justify-center py-1">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                    </Badge>
                  ) : (
                    <Link to={`/scan?location=${location.id}`}>
                      <Button variant="outline" className="w-full border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                        <ScanBarcode className="w-4 h-4 mr-2" />
                        Continue Scanning
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredLocations.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No locations found</p>
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
              <Label htmlFor="code">Location Code</Label>
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

      {/* Reopen Confirmation Modal */}
      <Dialog open={showReopenModal} onOpenChange={setShowReopenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Reopen Location?
            </DialogTitle>
            <DialogDescription>
              This location has been submitted. Reopening will allow editing of scanned items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">
              <strong>Location:</strong> {selectedLocation?.name}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              You will need to authenticate to proceed with this action.
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

      {/* Authentication Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              Please enter your credentials to proceed
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {authError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {authError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-userId">User ID</Label>
              <Input
                id="auth-userId"
                placeholder="Enter your user ID"
                value={authCredentials.userId}
                onChange={(e) => setAuthCredentials({ ...authCredentials, userId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="Enter your password"
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
              Authenticate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Locations;
