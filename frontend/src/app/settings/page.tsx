"use client";

// Account Settings — new in Phase 10. Not one of the suite's "tools" (no
// Tool Hub card, no FootNav entry) — it's account-level, reached from the
// gear icon in the Topbar, same way "Log out" is reached from the avatar
// menu. Two independent cards: Profile (name only — see UserUpdate's
// schema comment on the backend for why email/staff_id stay read-only)
// and Change Password. Each has its own save state so editing one
// doesn't block or get mixed up with the other.

import { useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { useAuth, ApiError } from "@/lib/auth-context";

function ProfileCard() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== (user?.name ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateProfile(name.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-[16px] font-extrabold">Profile</h2>
      <p className="mb-5 text-[13px] text-slate-500">
        Your name is the one thing here you can change yourself — email and staff ID are
        assigned when your account is created.
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
            {error}
          </div>
        )}
        {saved && !dirty && (
          <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">
            Profile updated.
          </div>
        )}

        <div className="field">
          <label htmlFor="settings-name">Full Name</label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            required
            minLength={1}
            maxLength={200}
          />
        </div>

        <div className="mb-4 flex flex-col gap-3.5 sm:flex-row">
          <div className="field flex-1">
            <label htmlFor="settings-email">Work Email</label>
            <input
              id="settings-email"
              type="email"
              value={user?.email ?? ""}
              readOnly
              disabled
              className="!cursor-not-allowed !bg-slate-50 !text-slate-400"
            />
          </div>
          <div className="field flex-1">
            <label htmlFor="settings-staffid">Staff ID</label>
            <input
              id="settings-staffid"
              type="text"
              value={user?.staff_id ?? ""}
              readOnly
              disabled
              className="!cursor-not-allowed !bg-slate-50 !text-slate-400"
            />
          </div>
        </div>

        <div className="field mb-0">
          <label>Role</label>
          <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1.5 text-[12.5px] font-bold capitalize text-indigo-700">
            {user?.role ?? "—"}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !dirty}
          className="btn-primary mt-5 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>
    </div>
  );
}

function PasswordCard() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-[16px] font-extrabold">Change Password</h2>
      <p className="mb-5 text-[13px] text-slate-500">
        You&apos;ll need your current password to set a new one.
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
            {error}
          </div>
        )}
        {saved && (
          <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">
            Password updated.
          </div>
        )}

        <div className="field">
          <label htmlFor="settings-current-password">Current Password</label>
          <input
            id="settings-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="settings-new-password">New Password</label>
          <input
            id="settings-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
          />
          <div className="hint">Minimum 8 characters</div>
        </div>

        <div className="field mb-0">
          <label htmlFor="settings-confirm-password">Confirm New Password</label>
          <input
            id="settings-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary mt-5 disabled:opacity-50"
        >
          {saving ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}

function SettingsContent() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Account Settings" />

      <div className="flex-1 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400">
          <Link href="/hub" className="hover:text-slate-600">
            Tool Hub
          </Link>
          <span>/</span>
          <b className="text-slate-600">Settings</b>
        </div>

        <div className="mb-[22px]">
          <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">Account Settings</h1>
          <p className="mt-1 text-[14px] text-slate-500">Manage your profile and password.</p>
        </div>

        <div className="mx-auto flex max-w-[560px] flex-col gap-5">
          <ProfileCard />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
