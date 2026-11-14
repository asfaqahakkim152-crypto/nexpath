import React from 'react';
import { ArrowUpRight, Route } from 'lucide-react';

interface NexPathLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export function NexPathLogo({ size = 'md', showTagline = false }: NexPathLogoProps) {
  const iconBoxClasses =
    size === 'sm'
      ? 'h-7 w-7 rounded-lg'
      : size === 'lg'
        ? 'h-10 w-10 rounded-xl'
        : 'h-8 w-8 rounded-xl';

  const iconClasses =
    size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  const textClasses =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
        ? 'text-2xl'
        : 'text-lg';

  return (
    <div className="inline-flex flex-col">
      <div className="inline-flex items-center gap-2.5" aria-label="NexPath logo">
        <span
          className={`inline-flex items-center justify-center bg-blue-600 text-white shadow-xs shrink-0 ${iconBoxClasses}`}
        >
          <Route className={iconClasses} aria-hidden="true" />
        </span>
        <span className={`inline-flex items-center gap-0.5 font-display font-bold tracking-tight text-slate-900 ${textClasses}`}>
          Nex<span className="text-blue-600">Path</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-blue-600 -mt-1.5 shrink-0" aria-hidden="true" />
        </span>
      </div>
      {showTagline && (
        <p className="mt-1 text-xs font-medium text-slate-500">
          Your next path, planned by AI.
        </p>
      )}
    </div>
  );
}
