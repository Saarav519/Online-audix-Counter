import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Unified page header with breadcrumbs, title, subtitle, live status and right-side actions.
 *
 *   <PageHeader
 *     title="Clients"
 *     subtitle="Manage your client companies"
 *     breadcrumbs={[{label: 'Clients'}]}
 *     actions={<Button>Add Client</Button>}
 *   />
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  liveLabel,
  accentColor = 'emerald',
}) {
  const accent = {
    emerald: 'from-emerald-500 to-teal-500',
    blue: 'from-blue-500 to-indigo-500',
    amber: 'from-amber-500 to-orange-500',
    violet: 'from-violet-500 to-fuchsia-500',
  }[accentColor] || 'from-emerald-500 to-teal-500';

  return (
    <div className="relative pb-4 mb-5 border-b border-slate-200/70" data-testid="page-header">
      {/* Breadcrumbs */}
      {(breadcrumbs.length > 0) && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
          <NavLink to="/portal/dashboard" className="flex items-center gap-1 hover:text-emerald-600 transition-colors">
            <Home className="w-3 h-3" />
            <span>Portal</span>
          </NavLink>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              {b.to ? (
                <NavLink to={b.to} className="hover:text-emerald-600 transition-colors">{b.label}</NavLink>
              ) : (
                <span className="text-slate-700 font-medium">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="relative">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight" data-testid="page-title">
            {title}
          </h1>
          {/* Subtle accent bar under title */}
          <div className={`absolute -bottom-1 left-0 h-1 w-12 rounded-full bg-gradient-to-r ${accent} opacity-80`} />
          {subtitle && (
            <p className="text-sm text-slate-500 mt-2">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {liveLabel && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-700 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {liveLabel}
            </div>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
