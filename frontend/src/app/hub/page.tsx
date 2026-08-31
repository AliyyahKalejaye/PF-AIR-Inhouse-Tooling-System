"use client";

// Tool Hub (screen 4/18) — the landing spot after login, and where every
// future tool gets a card. Inventory Management went live in Phase 5,
// Projects Progress Report in Phase 7, Engineering Change Requests in
// Phase 12.

import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { useAuth } from "@/lib/auth-context";

function ToolCard({
  icon,
  iconBg,
  name,
  description,
  tag,
  soon,
  href,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  tag: string;
  soon?: boolean;
  href?: string;
}) {
  const card = (
    <div
      className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-4 sm:gap-4 sm:p-5 ${
        soon
          ? "border-dashed border-slate-300 bg-slate-50"
          : "border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14 ${soon ? "bg-slate-200 text-slate-400" : "text-white"}`}
        style={soon ? undefined : { background: iconBg }}
      >
        {icon}
      </div>
      {/* min-w-0 lets this column actually shrink inside the flex row
          instead of forcing the card to overflow horizontally on a
          narrow phone; flex-wrap on the title row lets the "Live"/"Coming
          soon" tag drop to its own line rather than getting clipped. */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className={`text-[15.5px] font-extrabold tracking-tight sm:text-[17.5px] ${soon ? "text-slate-500" : ""}`}>{name}</h3>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${
              soon ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {tag}
          </span>
        </div>
        <p className={`max-w-[520px] text-[13px] leading-snug sm:text-[13.5px] ${soon ? "text-slate-400" : "text-slate-500"}`}>
          {description}
        </p>
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${soon ? "text-slate-300" : "bg-slate-100 text-slate-500"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </div>
  );

  return href && !soon ? <Link href={href}>{card}</Link> : card;
}

function HubContent() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar />

      <div className="flex flex-1 flex-col items-center px-4 pt-8 sm:px-8 sm:pt-14">
        <div className="mb-8 max-w-[720px] text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wide text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.2)]" />
            Signed in as {user?.name ?? "…"}
          </div>
          <h1 className="mb-2.5 text-[26px] font-extrabold tracking-tight sm:text-[34px]">
            Welcome back{user ? `, ${user.name}` : ""}
          </h1>
          <p className="text-[14px] leading-relaxed text-slate-500 sm:text-[15.5px]">
            Pick a tool to get started. Everything here is shared across aerospace, electronics, and mechanical
            engineering workflows at Proforce Airsystems.
          </p>
        </div>

        <div className="flex w-full max-w-[720px] flex-col gap-3 pb-16 sm:gap-4">
          <ToolCard
            iconBg="linear-gradient(135deg,#4f46e5,#7c3aed)"
            name="Inventory Management"
            tag="Live"
            href="/inventory"
            description="Search, log, and track engineering components across aerospace, electronics, and mechanical categories."
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" />
              </svg>
            }
          />
          <ToolCard
            iconBg="linear-gradient(135deg,#0e7490,#0891b2)"
            name="Projects Progress Report"
            tag="Live"
            href="/projects"
            description="Track project status from active to done, with CAD and code inspection built in."
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            }
          />
          <ToolCard
            iconBg="linear-gradient(135deg,#4f46e5,#7c3aed)"
            name="Engineering Change Requests"
            tag="Live"
            href="/ecr"
            description="Submit, review, and track changes to released projects and components, with admin sign-off before anything changes."
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            }
          />
        </div>
      </div>

      <FootNav current="hub" />
    </div>
  );
}

export default function HubPage() {
  return (
    <ProtectedRoute>
      <HubContent />
    </ProtectedRoute>
  );
}
