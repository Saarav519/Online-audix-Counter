// Minimal Audit Context shim for portal pages
// Provides `useAudit` hook expected by portal components.
// Backed by localStorage to stay compatible with App.js route guards.
import { createContext, useContext, useState, useEffect } from 'react';

const AuditContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const readUser = () => {
  try {
    const raw = localStorage.getItem('auditPortalUser') || localStorage.getItem('portalUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuditProvider = ({ children }) => {
  const [portalUser, setPortalUser] = useState(readUser);

  // Keep state in sync across tabs / manual localStorage writes
  useEffect(() => {
    const handler = () => setPortalUser(readUser());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const login = (user) => {
    setPortalUser(user);
    const serialized = JSON.stringify(user);
    localStorage.setItem('auditPortalUser', serialized);
    localStorage.setItem('portalUser', serialized);
  };

  const logout = () => {
    setPortalUser(null);
    localStorage.removeItem('auditPortalUser');
    localStorage.removeItem('portalUser');
    localStorage.removeItem('portalAuth');
  };

  return (
    <AuditContext.Provider
      value={{
        portalUser,
        login,
        logout,
        isAuthenticated: !!portalUser,
        API_URL,
      }}
    >
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => {
  const ctx = useContext(AuditContext);
  if (ctx) return ctx;
  // Safe fallback when AuditProvider isn't mounted yet (e.g. during lazy route boot).
  // Portal components only use .logout / .isAuthenticated / .login from this hook.
  return {
    portalUser: readUser(),
    isAuthenticated: !!readUser(),
    API_URL,
    login: (user) => {
      const serialized = JSON.stringify(user);
      localStorage.setItem('auditPortalUser', serialized);
      localStorage.setItem('portalUser', serialized);
    },
    logout: () => {
      localStorage.removeItem('auditPortalUser');
      localStorage.removeItem('portalUser');
      localStorage.removeItem('portalAuth');
    },
  };
};

export default { AuditProvider, useAudit };
