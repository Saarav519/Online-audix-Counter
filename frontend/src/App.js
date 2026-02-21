import React, { useEffect, Suspense } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { Toaster } from "./components/ui/sonner";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

// Lazy-load heavy pages - only loaded when navigated to
const ScanItems = React.lazy(() => import("./pages/ScanItems"));
const MasterData = React.lazy(() => import("./pages/MasterData"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Settings = React.lazy(() => import("./pages/Settings"));

// Minimal loading fallback for lazy routes
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
  </div>
);

// Route Persistence Hook - saves current route to localStorage
const useRoutePersistence = () => {
  const location = useLocation();
  
  useEffect(() => {
    const fullPath = location.pathname + location.search;
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
    if (isAuthenticated && location.pathname === '/reports' && !hasRestoredRef.current) {
      hasRestoredRef.current = true;
      const lastRoute = localStorage.getItem('audix_last_route');
      if (lastRoute && lastRoute !== '/' && lastRoute !== '/login' && lastRoute !== '/reports' && lastRoute !== '/locations') {
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

// Public Route Component (redirects to reports if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useApp();
  
  if (isAuthenticated) {
    return <Navigate to="/reports" replace />;
  }
  
  return children;
};

function AppRoutes() {
  useRoutePersistence();
  
  return (
    <>
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
        {/* Default route redirects to Reports */}
        <Route
          path="/"
          element={<Navigate to="/reports" replace />}
        />
        {/* Legacy /locations route redirects to Reports */}
        <Route
          path="/locations"
          element={<Navigate to="/reports" replace />}
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
        <Route path="*" element={<Navigate to="/reports" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" />
          <PWAInstallPrompt />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
