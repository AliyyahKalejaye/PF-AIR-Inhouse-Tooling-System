"use client";

// Log In (screen 3/18). Posts to /auth/login (form-encoded, per FastAPI's
// OAuth2PasswordRequestForm), stores the returned JWT, then hydrates the
// current user via /auth/me before landing in the hub.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/hub");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex h-16 items-center px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[16px] font-extrabold tracking-tight">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[14px] font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            PF
          </div>
          Proforce Tooling <span className="text-[13px] font-medium text-slate-400">/ Suite</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-14 pt-5">
        {/* w-full + max-w (rather than a bare fixed w-[440px]) so this
            card actually shrinks to fit a phone viewport instead of
            forcing horizontal scroll on the whole page. */}
        <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white px-6 pb-8 pt-9 shadow-[0_20px_40px_-12px_rgba(15,23,42,.08)] sm:px-9">
          <div
            className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>

          <h1 className="text-[23px] font-extrabold tracking-tight">Welcome back</h1>
          <p className="mb-6 mt-1.5 text-[13.5px] text-slate-500">
            Log in to Proforce Tooling to access your engineering workspace.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@proforcedefence.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field relative">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="!mb-0">
                  Password
                </label>
                <span className="text-[12.5px] font-semibold text-indigo-600">Forgot password?</span>
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="!pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-[38px] flex h-6 w-6 items-center justify-center text-slate-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary mt-1.5 w-full justify-center py-3 disabled:opacity-60">
              {submitting ? "Logging in…" : "Log In"}
            </button>
          </form>

          <div className="mt-5 text-center text-[13.5px] text-slate-500">
            New here?{" "}
            <Link href="/signup" className="font-bold text-indigo-600">
              Create an account
            </Link>
          </div>
        </div>
      </div>

      <div className="pb-6 text-center text-[12px] text-slate-400">
        © 2026 Proforce Airsystems — Internal Engineering Tooling
      </div>
    </main>
  );
}
