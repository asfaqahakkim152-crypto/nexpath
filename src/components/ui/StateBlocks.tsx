import React from 'react';
import { AlertCircle, HelpCircle, Loader2, RefreshCw } from 'lucide-react';

export function FriendlyErrorCard({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-red-900"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-900">Something interrupted this step</p>
          <p className="text-sm text-red-800 mt-0.5">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 self-start sm:self-center rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function AgentLoadingBanner({
  agentName,
  taskDescription,
}: {
  agentName: string;
  taskDescription: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-slate-800">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-indigo-200 text-indigo-600">
        <Loader2 className="h-4.5 w-4.5 animate-spin" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{agentName} is working</p>
        <p className="text-xs text-slate-600 mt-0.5">{taskDescription}</p>
      </div>
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading content">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="h-14 w-full rounded-xl border border-slate-200 bg-slate-100/80 animate-pulse"
        />
      ))}
    </div>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle ml-1.5">
      <button
        type="button"
        aria-label={text}
        className="text-slate-400 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-normal leading-relaxed text-slate-600 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
