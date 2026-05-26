// Audit Context shim for portal pages.
//
// Provides:
//   • portalUser     — current user object {id, username, role, ...}
//   • isAuthenticated — quick boolean
//   • isAdmin         — true when portalUser.role === 'admin'
//   • role            — string ('admin' | 'supervisor' | '')
//   • login(user)     — set the user (also stashes localStorage)
//   • logout()        — clear localStorage + state
//   • refreshMe()     — re-fetch /portal/me to sync the role after any change
//   • authHeaders()   — fetch-friendly headers {X-User-Id, X-Username}
//
// localStorage stays the source of truth (legacy compat) — context just
// mirrors it.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

const writeUser = (user) => {
  if (!user) return;
  const serialized = JSON.stringify(user);
  localStorage.setItem('auditPortalUser', serialized);
  localStorage.setItem('portalUser', serialized);
};

const headersFromUser = (user) => ({
  'X-User-Id': (user && user.id) ? String(user.id) : '',
  'X-Username': (user && user.username) ? String(user.username) : '',
});

// Module-level cache so non-React code (e.g. inline fetch helpers in
// other files) can read the latest auth headers without a hook.
let _latestUser = readUser();

export const getPortalAuthHeaders = () => headersFromUser(_latestUser);

export const AuditProvider = ({ children }) => {
  const [portalUser, setPortalUser] = useState(_latestUser);

  // Sync state when other tabs / direct localStorage writes happen.
  useEffect(() => {
    const handler = () => {
      const u = readUser();
      _latestUser = u;
      setPortalUser(u);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Refresh /me so role + approval state stay correct after admin changes.
  const refreshMe = useCallback(async () => {
    const u = readUser();
    if (!u || !u.id) return null;
    try {
      const r = await fetch(`${API_URL}/api/audit/portal/me`, {
        headers: headersFromUser(u),
      });
      if (!r.ok) return null;
      const fresh = await r.json();
      const merged = { ...u, ...fresh };
      _latestUser = merged;
      writeUser(merged);
      setPortalUser(merged);
      return merged;
    } catch {
      return null;
    }
  }, []);

  // Pull /me once at mount — covers a hard page reload after the admin
  // changes our role mid-session.
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = (user) => {
    _latestUser = user;
    setPortalUser(user);
    writeUser(user);
    // Fire-and-forget /me refresh so the fresh login carries the
    // server-authoritative role (covers the rare 'admin demoted to
    // supervisor between login attempts' case).
    refreshMe();
  };

  const logout = () => {
    _latestUser = null;
    setPortalUser(null);
    localStorage.removeItem('auditPortalUser');
    localStorage.removeItem('portalUser');
    localStorage.removeItem('portalAuth');
  };

  const role = portalUser?.role || '';
  const isAdmin = role === 'admin';

  return (
    <AuditContext.Provider
      value={{
        portalUser,
        login,
        logout,
        refreshMe,
        authHeaders: () => headersFromUser(portalUser),
        isAuthenticated: !!portalUser,
        isAdmin,
        role,
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
  // Safe fallback when AuditProvider isn't mounted yet (lazy route boot).
  const u = readUser();
  return {
    portalUser: u,
    isAuthenticated: !!u,
    isAdmin: u?.role === 'admin',
    role: u?.role || '',
    API_URL,
    authHeaders: () => headersFromUser(u),
    login: (user) => { _latestUser = user; writeUser(user); },
    logout: () => {
      _latestUser = null;
      localStorage.removeItem('auditPortalUser');
      localStorage.removeItem('portalUser');
      localStorage.removeItem('portalAuth');
    },
    refreshMe: async () => null,
  };
};

export default { AuditProvider, useAudit };
