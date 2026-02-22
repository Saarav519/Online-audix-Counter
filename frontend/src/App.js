import React, { useEffect, Suspense } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { Toaster } from "./components/ui/sonner";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import MobileOnlyGuard from "./components/MobileOnlyGuard";

// Lazy-load heavy pages - only loaded when navigated to
const ScanItems = React.lazy(() => import("./pages/ScanItems"));
const MasterData = React.lazy(() => import("./pages/MasterData"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Settings = React.lazy(() => import("./pages/Settings"));

// Portal pages (lazy-loaded)
const PortalLogin = React.lazy(() => import("./pages/portal/PortalLogin"));
const PortalLayout = React.lazy(() => import("./pages/portal/PortalLayout"));
const PortalDashboard = React.lazy(() => import("./pages/portal/PortalDashboard"));
const PortalClients = React.lazy(() => import("./pages/portal/PortalClients"));
const PortalSessions = React.lazy(() => import("./pages/portal/PortalSessions"));
const PortalDevices = React.lazy(() => import("./pages/portal/PortalDevices"));
const PortalReports = React.lazy(() => import("./pages/portal/PortalReports"));
const PortalSyncLogs = React.lazy(() => import("./pages/portal/PortalSyncLogs"));
const PortalUsers = React.lazy(() => import("./pages/portal/PortalUsers"));
const PortalConflicts = React.lazy(() => import("./pages/portal/PortalConflicts"));

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

// Portal Login Wrapper - redirects to dashboard if already logged in
const PortalLoginWrapper = () => {
  const portalUser = localStorage.getItem('portalUser');
  
  if (portalUser) {
    return <Navigate to="/portal/dashboard" replace />;
  }
  
  return <PortalLogin />;
};

// Portal Auth Guard
const PortalProtectedRoute = ({ children }) => {
  const portalUser = localStorage.getItem('portalUser');
  
  if (!portalUser) {
    return <Navigate to="/portal" replace />;
  }
  
  return children;
};

function AppRoutes() {
  useRoutePersistence();
  
  return (
    <>
      <RouteRestorer />
      
      <Routes>
        {/* Portal Login - exact match only */}
        <Route
          path="/portal"
          element={
            <Suspense fallback={<PageLoader />}>
              <PortalLoginWrapper />
            </Suspense>
          }
        />
        {/* Portal Protected Routes */}
        <Route
          path="/portal/dashboard"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalDashboard /></Suspense>} />
        </Route>
        <Route
          path="/portal/clients"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalClients /></Suspense>} />
        </Route>
        <Route
          path="/portal/sessions"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalSessions /></Suspense>} />
        </Route>
        <Route
          path="/portal/devices"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalDevices /></Suspense>} />
        </Route>
        <Route
          path="/portal/reports"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalReports /></Suspense>} />
        </Route>
        <Route
          path="/portal/sync-logs"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalSyncLogs /></Suspense>} />
        </Route>
        <Route
          path="/portal/users"
          element={
            <PortalProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <PortalLayout />
              </Suspense>
            </PortalProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><PortalUsers /></Suspense>} />
        </Route>

        {/* Scanner App Routes - Mobile Only */}
        <Route
          path="/login"
          element={
            <MobileOnlyGuard>
              <PublicRoute>
                <Login />
              </PublicRoute>
            </MobileOnlyGuard>
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
            <MobileOnlyGuard>
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ScanItems />
                </Suspense>
              </ProtectedRoute>
            </MobileOnlyGuard>
          }
        />
        <Route
          path="/master-data"
          element={
            <MobileOnlyGuard>
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <MasterData />
                </Suspense>
              </ProtectedRoute>
            </MobileOnlyGuard>
          }
        />
        <Route
          path="/reports"
          element={
            <MobileOnlyGuard>
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Reports />
                </Suspense>
              </ProtectedRoute>
            </MobileOnlyGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <MobileOnlyGuard>
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Settings />
                </Suspense>
              </ProtectedRoute>
            </MobileOnlyGuard>
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
