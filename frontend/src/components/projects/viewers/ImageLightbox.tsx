"use client";

// Full-screen image viewer — screen 14/17. Cycles through every
// image-type media item on the project (the filmstrip from the
// mockup), not just the one that was clicked. Uses each item's real
// file_url for the filmstrip thumbnails rather than the mockup's
// gradient placeholders, since we have real uploaded images to show.

import { useEffect, useState } from "react";
import type { ProjectMediaRead } from "@/lib/projects";
import { DarkViewerTopBar, DOT_SEP } from "./DarkViewerTopBar";

interface Props {
  images: ProjectMediaRead[];
  initialIndex: number;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ImageLightbox({ images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const current = images[index];

  // R2 objects can go missing (deleted externally, a bad/expired URL) —
  // without this, a broken image is just a small broken-icon glyph on a
  // black background with no explanation. Reset whenever the viewed image
  // changes, since the error belongs to that specific file_url.
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setImageError(false);
  }, [index]);

  const goPrev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const goNext = () => setIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#020617]">
      <DarkViewerTopBar
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        }
        title={current.filename ?? "Image"}
        subtitle={
          <>
            <span className="font-mono uppercase">Image</span>
            {DOT_SEP}
            <span>Uploaded {formatDate(current.created_at)}</span>
          </>
        }
        onClose={onClose}
        downloadUrl={current.file_url}
        downloadName={current.filename}
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[.14] bg-white/[.08] text-white hover:bg-white/[.16] sm:left-8 sm:h-[52px] sm:w-[52px]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next image"
            className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[.14] bg-white/[.08] text-white hover:bg-white/[.16] sm:right-8 sm:h-[52px] sm:w-[52px]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      {/* Padding shrinks a lot on mobile — at the desktop px-24 an image
          would have almost no room left once the prev/next arrows are
          accounted for on a phone-width viewport. */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-12 pb-6 pt-2 sm:px-24">
        {imageError ? (
          <div className="flex flex-col items-center gap-3 text-center text-slate-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 16l5-5c.8-.8 2-.8 2.8 0L16 16M14 14l1.5-1.5c.8-.8 2-.8 2.8 0L21 15" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M4 4l16 16" stroke="#f87171" />
            </svg>
            <p className="max-w-xs text-[13px]">
              This image couldn&apos;t be loaded — it may have been moved or removed from storage.
            </p>
            <a href={current.file_url} target="_blank" rel="noreferrer" className="btn-secondary">
              Try opening directly
            </a>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.file_url}
            alt={current.filename ?? ""}
            onError={() => setImageError(true)}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_30px_70px_-15px_rgba(0,0,0,.65)]"
          />
        )}
      </div>

      <div className="relative z-20 flex flex-col items-center gap-3 pb-7">
        {images.length > 1 && <div className="text-[12px] font-bold tracking-wide text-slate-400">{index + 1} / {images.length}</div>}
        {images.length > 1 && (
          // Scrolls horizontally instead of overflowing off-screen once
          // there are more thumbnails than fit a phone-width viewport.
          <div className="max-w-[92vw] overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/55 p-2.5 backdrop-blur">
            <div className="flex items-center gap-2.5">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border-2 ${
                    i === index ? "border-indigo-600 shadow-[0_0_0_3px_rgba(79,70,229,.35)]" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.file_url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
