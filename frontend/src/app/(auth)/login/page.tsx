"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Crown } from "lucide-react";
import { isAuthenticated, setAuthInfo } from "@/lib/auth";

interface ValidateResponse {
  valid: boolean;
  is_master: boolean;
  name: string | null;
  key_prefix: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already authenticated — send straight to dashboard
  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Please enter your API key.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      const data = (await response.json()) as ValidateResponse;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Invalid API key. Please check and try again.");
          return;
        }
        throw new Error("Login failed");
      }

      if (!data.valid) {
        setError("Invalid API key. Please check and try again.");
        return;
      }

      setAuthInfo({
        isMaster: data.is_master,
        name: data.name ?? (data.is_master ? "Master" : "Project key"),
        keyPrefix: data.key_prefix ?? trimmed.slice(0, 10),
      });

      router.replace("/dashboard");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] p-8">
        {/* Logo + title */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)]">
            <span className="text-lg font-bold text-black">B</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--gray-10)]">Beacon</h1>
          <p className="text-sm text-[var(--gray-9)]">Sign in to your dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="api-key" className="text-[13px] font-medium text-[var(--gray-9)]">
              API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? "text" : "password"}
                autoComplete="current-password"
                placeholder="nk_..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="w-full rounded-md border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-2 pr-10 font-mono text-[13px] text-[var(--gray-10)] placeholder-[var(--gray-5)] outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/40 disabled:opacity-50"
              />
              <button
                type="button"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--gray-5)] transition hover:text-[var(--gray-8)]"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-[12px] text-red-400">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-[13px] font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-[var(--gray-5)]">
          <Crown className="h-3 w-3" />
          Master key grants full admin access
        </p>
      </div>
    </div>
  );
}
