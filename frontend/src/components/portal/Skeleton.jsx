import React from 'react';

/**
 * Shimmer skeleton for loading states. Replace spinners with these for pro feel.
 *
 *   <Skeleton className="h-4 w-24" />
 *   <SkeletonCard />
 *   <SkeletonTable rows={5} />
 */

export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-slate-200/60 ${className}`}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 4, columns = 5 }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 p-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-3 border-b last:border-0 border-slate-100 flex gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 240 }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5">
      <Skeleton className="h-4 w-32 mb-3" />
      <Skeleton className="h-3 w-48 mb-6" />
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.sin(i) * 30 + Math.random() * 40}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
