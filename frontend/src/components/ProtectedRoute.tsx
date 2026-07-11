"use client";

// Wrap any page that requires a logged-in user with this. Every future
// tool page (Inventory, Projects, ...) uses the same wrapper so the
// "redirect to /login if not authenticated" behavior only lives in one
// place.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    // Covers both "loading" (checking localStorage/verifying token) and
    // "unauthenticated" (redirect above is in flight) — never flash
    // protected content before we're sure the user is allowed to see it.
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-400">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
