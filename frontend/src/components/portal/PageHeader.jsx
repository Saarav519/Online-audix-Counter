import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Compact unified page header with breadcrumbs, title and right-side actions.
 * Designed to take MINIMUM vertical space so content area has room to breathe.
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
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    violet: 'bg-violet-500',
    rose: 'bg-rose-500',
  }[accentColor] || 'bg-emerald-500';

  return (
    <div className="flex items-start justify-between gap-3 mb-3" data-testid="page-header">
      <div className="min-w-0 flex-1">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-[11px] text-slate-500 mb-0.5" aria-label="Breadcrumb">
            <NavLink to="/portal/dashboard" className="flex items-center gap-1 hover:text-emerald-600 transition-colors">
              <Home className="w-2.5 h-2.5" />
              <span>Portal</span>
            </NavLink>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="w-2.5 h-2.5 text-slate-300" />
                {b.to ? (
                  <NavLink to={b.to} className="hover:text-emerald-600 transition-colors">{b.label}</NavLink>
                ) : (
                  <span className="text-slate-700 font-medium">{b.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight leading-tight flex items-center gap-2" data-testid="page-title">
            <span className={`inline-block w-1 h-5 rounded-full ${accent}`} />
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          )}
          {liveLabel && (
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-700 text-[10px] font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              {liveLabel}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
