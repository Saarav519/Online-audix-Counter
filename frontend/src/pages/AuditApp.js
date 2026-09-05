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

// The backend scopes what it returns to the calling user, so every portal API
// call has to carry the identity. Portal pages reach the API through plain
// fetch() in several hundred places, so attach it once here instead of
// threading headers through each one. Only this app's own API is touched, a
// header the caller set itself always wins, and a browser with no logged-in
// portal user (a scanner device) is left exactly as it was.
const installIdentityInterceptor = () => {
  if (typeof window === 'undefined' || window.__audixIdentityFetch) return;
  if (typeof window.fetch !== 'function') return;
  // Bound to window — fetch throws "Illegal invocation" when called detached.
  const nativeFetch = window.fetch.bind(window);
  window.__audixIdentityFetch = true;

  window.fetch = function audixFetch(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const user = _latestUser;
      if (!user || !user.id || !url.includes('/api/audit/')) {
        return nativeFetch(input, init);
      }
      const headers = new Headers(
        (init && init.headers) || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has('X-User-Id')) headers.set('X-User-Id', String(user.id));
      if (!headers.has('X-Username') && user.username) headers.set('X-Username', String(user.username));
      return nativeFetch(input, { ...(init || {}), headers });
    } catch {
      // Never let the interceptor be the reason a request fails.
      return nativeFetch(input, init);
    }
  };
};

installIdentityInterceptor();

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
