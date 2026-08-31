"use client";

// Sign Up (screen 2/18). Creates the account via POST /auth/signup, then
// (inside useAuth().signup) immediately logs in with the same credentials
// so a brand-new user lands in the hub already authenticated.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({ name, email, staff_id: staffId, password });
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
          <img src="/logo.png" alt="Proforce Airsystems" className="h-8 w-8 object-contain" />
          Proforce Tooling
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-14 pt-5">
        <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white px-6 pb-8 pt-9 shadow-[0_20px_40px_-16px_rgba(15,23,42,.10)] sm:px-9">
          <div className="mb-7 text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
            </div>
            <h1 className="text-[22px] font-extrabold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-[13.5px] text-slate-500">Sign up for access to the Proforce Tooling suite</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                placeholder="e.g. Efe Obasi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={200}
              />
            </div>

            <div className="field">
              <label htmlFor="email">Work Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@proforcedefence.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="staffid">Staff ID</label>
              <input
                id="staffid"
                type="text"
                placeholder="e.g. PFD-0142"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
                minLength={1}
                maxLength={50}
              />
            </div>

            <div className="field relative">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                className="!pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-[34px] flex h-6 w-6 items-center justify-center text-slate-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <div className="hint">Minimum 8 characters</div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary mt-1.5 w-full justify-center py-3 disabled:opacity-60">
              {submitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <div className="mt-5 text-center text-[13.5px] text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-indigo-600">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
