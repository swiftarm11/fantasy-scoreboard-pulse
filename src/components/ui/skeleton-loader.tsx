import React from 'react';
import { Skeleton } from './skeleton';

interface SkeletonLoaderProps {
  variant?: 'league-block' | 'mobile-card' | 'compact-summary' | 'settings';
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant = 'league-block', 
  count = 1 
}) => {
  const renderLeagueBlockSkeleton = () => (
    <div className="league-block-skeleton relative overflow-hidden rounded-xl w-80 h-[450px] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 animate-pulse">
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative z-10 p-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-6 w-48 mb-2 bg-white/20" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32 bg-white/15" />
              <Skeleton className="h-4 w-16 bg-white/15" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-md bg-white/20" />
        </div>

        {/* Scores */}
        <div className="flex items-center justify-between mb-4 bg-white/10 rounded-lg p-4">
          <div className="text-center">
            <Skeleton className="h-4 w-16 mb-2 bg-white/15" />
            <Skeleton className="h-8 w-12 bg-white/20" />
          </div>
          <Skeleton className="h-5 w-6 bg-white/15" />
          <div className="text-center">
            <Skeleton className="h-4 w-20 mb-2 bg-white/15" />
            <Skeleton className="h-8 w-12 bg-white/20" />
          </div>
        </div>

        {/* Activity Section */}
        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <Skeleton className="h-5 w-32 bg-white/20" />
            <Skeleton className="h-3 w-16 bg-white/15" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 rounded-md p-3">
                <div className="flex justify-between items-start mb-2">
                  <Skeleton className="h-4 w-24 bg-white/15" />
                  <Skeleton className="h-3 w-12 bg-white/10" />
                </div>
                <Skeleton className="h-3 w-full mb-1 bg-white/10" />
                <Skeleton className="h-4 w-16 bg-white/15" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-3 text-center">
          <Skeleton className="h-3 w-28 bg-white/10 mx-auto" />
        </div>
      </div>
    </div>
  );

  const renderMobileCardSkeleton = () => (
    <div className="mobile-card-skeleton relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 animate-pulse">
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative z-10 p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-5 w-40 mb-1 bg-white/20" />
            <Skeleton className="h-4 w-32 bg-white/15" />
          </div>
          <Skeleton className="h-5 w-12 bg-white/20" />
        </div>

        {/* Scores */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <Skeleton className="h-6 w-12 bg-white/20" />
          </div>
          <Skeleton className="h-4 w-4 bg-white/15" />
          <div>
            <Skeleton className="h-6 w-12 bg-white/20" />
          </div>
        </div>

        {/* Events */}
        <div className="space-y-1">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-3 w-full bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );

  const renderCompactSummarySkeleton = () => (
    <div className="compact-summary-skeleton bg-white/5 rounded-lg p-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full bg-white/20" />
          <div>
            <Skeleton className="h-4 w-24 mb-1 bg-white/15" />
            <Skeleton className="h-3 w-16 bg-white/10" />
          </div>
        </div>
        <Skeleton className="h-5 w-12 bg-white/15" />
      </div>
    </div>
  );

  const renderSettingsSkeleton = () => (
    <div className="settings-skeleton space-y-4 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded bg-slate-200 dark:bg-slate-700" />
            <div>
              <Skeleton className="h-4 w-32 mb-1 bg-slate-200 dark:bg-slate-700" />
              <Skeleton className="h-3 w-48 bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
          <Skeleton className="h-6 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );

  const renderSkeleton = () => {
    switch (variant) {
      case 'mobile-card':
        return renderMobileCardSkeleton();
      case 'compact-summary':
        return renderCompactSummarySkeleton();
      case 'settings':
        return renderSettingsSkeleton();
      default:
        return renderLeagueBlockSkeleton();
    }
  };

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-container">
          {renderSkeleton()}
        </div>
      ))}
    </>
  );
};