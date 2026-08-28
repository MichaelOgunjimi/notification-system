"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--gray-10)]">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-7)]">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-[11px] text-[var(--gray-5)]">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[var(--primary-hover)]"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
