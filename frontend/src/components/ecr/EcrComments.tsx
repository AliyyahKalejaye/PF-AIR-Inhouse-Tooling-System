"use client";

// Discussion trail under an ECR — screen has no mockup reference (this is
// new scope, not from the original 17-screen set), styled to match the
// rest of the ECR detail page's `.card` sections. Open to anyone who can
// view the request, no status gate: a decided request can still be
// discussed (e.g. clarifying what "implemented" ended up meaning). Also
// doubles as a reminder mechanism — posting here notifies whichever of
// {assigned_approver, requester} isn't the comment's own author, so this
// is the way to nudge a request that's been sitting with nobody acting on
// it, not just a log nobody reads. See backend's notify_ecr_commented.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { createEcrComment, ECRComment, listEcrComments } from "@/lib/ecr";

interface Props {
  token: string;
  ecrId: string;
  currentUserId?: string;
}

function formatCommentTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function EcrComments({ token, ecrId, currentUserId }: Props) {
  const [comments, setComments] = useState<ECRComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(() => {
    if (!token || !ecrId) return;
    setLoading(true);
    setLoadError(null);
    listEcrComments(token, ecrId)
      .then(setComments)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load comments.");
      })
      .finally(() => setLoading(false));
  }, [token, ecrId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setPosting(true);
    setPostError(null);
    try {
      const comment = await createEcrComment(token, ecrId, { body: trimmed });
      setComments((prev) => [...prev, comment]);
      setBody("");
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Couldn't post that comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="card mt-4 px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
        <span className="text-[13.5px] font-bold text-slate-900">
          Discussion{comments.length > 0 ? ` (${comments.length})` : ""}
        </span>
      </div>

      {loading && <div className="py-6 text-center text-[13px] font-medium text-slate-400">Loading…</div>}

      {!loading && loadError && (
        <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <div className="mb-4 flex flex-col gap-4">
          {comments.length === 0 && (
            <p className="text-[13px] text-slate-400">
              No comments yet — leave a note or nudge whoever needs to act on this.
            </p>
          )}
          {comments.map((c) => {
            const isYou = !!currentUserId && c.author?.id === currentUserId;
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-extrabold text-indigo-700">
                  {initials(c.author?.name ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-bold text-slate-900">
                      {c.author?.name ?? "Deleted user"}
                      {isYou ? " (you)" : ""}
                    </span>
                    <span className="text-[11.5px] text-slate-400">{formatCommentTime(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>
      )}

      {postError && (
        <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
          {postError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask a question, leave a note, or nudge whoever needs to review this…"
          rows={2}
          className="w-full flex-1 resize-none rounded-[9px] border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={posting || !body.trim()}
          className="btn-primary shrink-0 justify-center disabled:opacity-60"
        >
          {posting ? "Posting…" : "Comment"}
        </button>
      </form>
    </div>
  );
}
