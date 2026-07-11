"use client";

// Landing (screen 1/18 of the approved mockups). Pre-login entry point:
// unauthenticated visitors see the hero + auth card, already-logged-in
// visitors get bounced straight to the hub instead of seeing a login
// prompt for an account they're already in.

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Landing() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/hub");
    }
  }, [status, router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* Background art — grid + glows + rings, matching the approved mockup */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(79,70,229,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.055) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 900px 620px at 50% 40%, #000 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 900px 620px at 50% 40%, #000 0%, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none absolute -left-36 -top-36 z-0 h-[520px] w-[520px] rounded-full opacity-50 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(79,70,229,0.16), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-44 -right-40 z-0 h-[560px] w-[560px] rounded-full opacity-50 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.13), transparent 70%)" }}
      />
      <div className="pointer-events-none absolute left-1/2 top-[60px] z-0 h-[760px] w-[760px] -translate-x-1/2 rounded-full border border-indigo-600/10" />
      <div className="pointer-events-none absolute left-1/2 top-[-40px] z-0 h-[960px] w-[960px] -translate-x-1/2 rounded-full border border-indigo-600/10" />

      <div className="relative z-10 flex h-[76px] items-center px-11">
        <div className="flex items-center gap-2.5 text-[16px] font-extrabold tracking-tight">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[14px] font-extrabold text-white shadow-[0_4px_12px_-2px_rgba(79,70,229,.4)]"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            PF
          </div>
          Proforce Tooling <span className="text-[13px] font-medium text-slate-400">/ Suite</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pb-16 pt-[70px] text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white py-1.5 pl-2.5 pr-3.5 text-[12.5px] font-bold tracking-wide text-indigo-700 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.2)]" />
          Internal Engineering Platform · Proforce Airsystems
        </div>

        <h1 className="max-w-[760px] text-[52px] font-extrabold leading-[1.08] tracking-tight text-slate-900">
          Proforce In-House{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            Tooling
          </span>
        </h1>
        <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-slate-500">
          One unified suite for inventory, BOM checks, project tracking, and documentation — built for the
          aerospace, UAV, electronics, and mechanical engineering teams.
        </p>

        <div className="relative z-10 mt-10 w-[420px] rounded-2xl border border-slate-200 bg-white px-8 pb-7 pt-[30px] shadow-[0_24px_48px_-16px_rgba(15,23,42,.14),0_4px_12px_-4px_rgba(15,23,42,.06)]">
          <h2 className="text-[16px] font-extrabold tracking-tight">Access the Suite</h2>
          <div className="mb-5 mt-1 text-[13px] text-slate-500">
            Log in with your Proforce account, or request access if you&apos;re new.
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="btn-primary flex-1 justify-center py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
              Log In
            </Link>
            <Link href="/signup" className="btn-secondary flex-1 justify-center py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
              Sign Up
            </Link>
          </div>
          <div className="mt-5 text-center text-[12px] text-slate-400">
            Need an account? <span className="font-semibold text-indigo-600">Contact your engineering lead</span> to
            request access.
          </div>
        </div>

        <div className="relative z-10 mt-11 flex items-center justify-center gap-8">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Internal use only
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Encrypted access
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" />
            </svg>
            Inventory · Projects · Docs
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2 border-t border-slate-200 py-5 text-[12px] text-slate-400">
        <b className="font-bold text-slate-500">Proforce Airsystems</b> · Internal Engineering Tooling Suite
      </div>
    </main>
  );
}
