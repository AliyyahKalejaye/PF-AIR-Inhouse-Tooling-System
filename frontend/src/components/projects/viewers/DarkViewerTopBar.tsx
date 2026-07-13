"use client";

// Shared dark top bar chrome for all four full-screen media viewers
// (image, video, CAD, code) — screens 14-17. Pulled out once all four
// mockups turned out to share the same "icon badge + title + meta line +
// download/close icon buttons" shape, just with different icons and
// meta content. Centralizing it means the download/close button styling
// only has to be gotten right once instead of four times.

export interface DarkViewerTopBarProps {
  icon: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  downloadUrl?: string;
  downloadName?: string | null;
  rightExtra?: React.ReactNode;
}

export function DarkViewerTopBar({
  icon,
  iconBg,
  title,
  subtitle,
  onClose,
  downloadUrl,
  downloadName,
  rightExtra,
}: DarkViewerTopBarProps) {
  return (
    <div className="relative z-20 flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/10 text-indigo-200"
          style={{ background: iconBg ?? "rgba(255,255,255,.08)" }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <div className="mt-0.5 flex items-center gap-2 text-[12px] font-medium text-slate-400">{subtitle}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {rightExtra}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadName ?? undefined}
            target="_blank"
            rel="noreferrer"
            title="Download"
            className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-white/[.14] bg-white/[.08] text-slate-200 hover:bg-white/[.14]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-white/[.14] bg-white/[.08] text-white hover:bg-rose-500/25"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const DOT_SEP = <span className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-slate-600" />;
