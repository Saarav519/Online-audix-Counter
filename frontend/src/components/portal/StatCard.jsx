import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import CountUp from './CountUp';

/**
 * Premium animated KPI card with gradient accent, icon, trend arrow and hover lift.
 *
 *   <StatCard
 *     label="Active Sessions"
 *     value={12}
 *     icon={FolderOpen}
 *     color="emerald"
 *     trend={{ value: 12.5, label: 'vs last week', direction: 'up' }}
 *   />
 */
const colorStyles = {
  emerald: {
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    ring: 'ring-emerald-200/60',
    accent: 'from-emerald-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
  blue: {
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
    ring: 'ring-blue-200/60',
    accent: 'from-blue-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
  violet: {
    iconBg: 'bg-violet-50',
    iconText: 'text-violet-600',
    ring: 'ring-violet-200/60',
    accent: 'from-violet-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
  amber: {
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    ring: 'ring-amber-200/60',
    accent: 'from-amber-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
  rose: {
    iconBg: 'bg-rose-50',
    iconText: 'text-rose-600',
    ring: 'ring-rose-200/60',
    accent: 'from-rose-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
  slate: {
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
    ring: 'ring-slate-200/60',
    accent: 'from-slate-400/10 via-transparent to-transparent',
    valueText: 'text-slate-900',
  },
};

export default function StatCard({
  label,
  value = 0,
  icon: Icon,
  color = 'emerald',
  trend,
  suffix = '',
  prefix = '',
  decimals = 0,
  onClick,
  loading = false,
  testId,
}) {
  const c = colorStyles[color] || colorStyles.emerald;

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-5 shadow-sm animate-pulse">
        <div className="flex items-start justify-between">
          <div className="w-20 h-3 bg-slate-200 rounded" />
          <div className="w-10 h-10 bg-slate-100 rounded-xl" />
        </div>
        <div className="mt-4 w-24 h-8 bg-slate-200 rounded" />
        <div className="mt-3 w-16 h-3 bg-slate-100 rounded" />
      </div>
    );
  }

  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend?.direction === 'up' ? 'text-emerald-600 bg-emerald-50' :
    trend?.direction === 'down' ? 'text-rose-600 bg-rose-50' :
    'text-slate-500 bg-slate-100';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid={testId}
      className={`
        group relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm
        text-left w-full transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 ${c.ring}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      {/* Gradient accent overlay */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
            <div className={`mt-2 text-3xl font-bold ${c.valueText}`}>
              <CountUp value={Number(value) || 0} prefix={prefix} suffix={suffix} decimals={decimals} duration={900} />
            </div>
          </div>
          {Icon && (
            <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${c.iconBg} ${c.iconText} flex items-center justify-center shadow-sm ring-1 ring-inset ring-white/50`}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
          )}
        </div>

        {trend && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${trendColor}`}>
              <TrendIcon className="w-3 h-3" strokeWidth={2.5} />
              {typeof trend.value === 'number' ? `${Math.abs(trend.value)}%` : trend.value}
            </span>
            {trend.label && <span className="text-xs text-slate-500">{trend.label}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
