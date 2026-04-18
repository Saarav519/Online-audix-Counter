import React from 'react';

/**
 * Beautiful empty state with illustration, title, description and optional action.
 *
 *   <EmptyState
 *     icon={FileBarChart}
 *     title="No reports yet"
 *     description="Select a client and session to generate variance reports."
 *     action={<Button>Import Stock</Button>}
 *     tip="💡 Pro tip: Upload master data first for the best experience"
 *   />
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tip,
  size = 'md',
  color = 'emerald',
  testId,
}) {
  const sizeMap = {
    sm: { container: 'py-8', iconBox: 'w-14 h-14', iconSize: 'w-6 h-6', title: 'text-base', desc: 'text-xs' },
    md: { container: 'py-14', iconBox: 'w-20 h-20', iconSize: 'w-9 h-9', title: 'text-lg', desc: 'text-sm' },
    lg: { container: 'py-20', iconBox: 'w-24 h-24', iconSize: 'w-11 h-11', title: 'text-xl', desc: 'text-base' },
  }[size] || {};

  const colorMap = {
    emerald: { bg: 'from-emerald-50 to-teal-50', icon: 'text-emerald-500', glow: 'bg-emerald-200/40' },
    blue: { bg: 'from-blue-50 to-indigo-50', icon: 'text-blue-500', glow: 'bg-blue-200/40' },
    amber: { bg: 'from-amber-50 to-orange-50', icon: 'text-amber-500', glow: 'bg-amber-200/40' },
    violet: { bg: 'from-violet-50 to-fuchsia-50', icon: 'text-violet-500', glow: 'bg-violet-200/40' },
    slate: { bg: 'from-slate-50 to-slate-100', icon: 'text-slate-400', glow: 'bg-slate-200/40' },
  }[color] || {};

  return (
    <div
      className={`relative flex flex-col items-center justify-center text-center ${sizeMap.container} px-6`}
      data-testid={testId || 'empty-state'}
    >
      {/* Icon with gradient halo */}
      {Icon && (
        <div className="relative mb-4">
          <div className={`absolute inset-0 ${colorMap.glow} blur-xl rounded-full scale-150`} />
          <div
            className={`relative ${sizeMap.iconBox} rounded-2xl bg-gradient-to-br ${colorMap.bg} flex items-center justify-center shadow-sm ring-1 ring-white/60`}
          >
            <Icon className={`${sizeMap.iconSize} ${colorMap.icon}`} strokeWidth={1.6} />
          </div>
        </div>
      )}
      <h3 className={`${sizeMap.title} font-semibold text-slate-800`}>{title}</h3>
      {description && (
        <p className={`${sizeMap.desc} text-slate-500 mt-1.5 max-w-md`}>{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
      {tip && (
        <div className="mt-6 px-4 py-2 rounded-full bg-amber-50 border border-amber-200/70 text-amber-700 text-xs font-medium">
          {tip}
        </div>
      )}
    </div>
  );
}
