import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Locations from "./pages/Locations";
import ScanItems from "./pages/ScanItems";
import MasterData from "./pages/MasterData";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { Toaster } from "./components/ui/sonner";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

// Route Persistence Hook - saves current route to localStorage
const useRoutePersistence = () => {
  const location = useLocation();
  
  useEffect(() => {
    // Save current path and search params to localStorage
    const fullPath = location.pathname + location.search;
    // Don't save login page
    if (location.pathname !== '/login') {
      localStorage.setItem('audix_last_route', fullPath);
    }
  }, [location]);
};

// Route Restoration Component - restores last route on app load
const RouteRestorer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useApp();
  const hasRestoredRef = React.useRef(false);
  
  useEffect(() => {
    // Only restore once, when authenticated and on home page
    if (isAuthenticated && location.pathname === '/' && !hasRestoredRef.current) {
      hasRestoredRef.current = true;
      const lastRoute = localStorage.getItem('audix_last_route');
      // If there's a saved route and it's not the home page or login, navigate to it
      if (lastRoute && lastRoute !== '/' && lastRoute !== '/login') {
        // Use setTimeout to avoid navigation during render
        setTimeout(() => {
          navigate(lastRoute, { replace: true });
        }, 0);
      }
    }
  }, [isAuthenticated, location.pathname, navigate]);
  
  return null;
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useApp();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <Layout>{children}</Layout>;
};

// Public Route Component (redirects to dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useApp();
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function AppRoutes() {
  // Enable route persistence
  useRoutePersistence();
  
  return (
    <>
      {/* Route restorer - silently restores last route on app load */}
      <RouteRestorer />
      
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/locations"
          element={
            <ProtectedRoute>
              <Locations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <ScanItems />
            </ProtectedRoute>
          }
        />
        <Route
          path="/master-data"
          element={
            <ProtectedRoute>
              <MasterData />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
        <PWAInstallPrompt />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
