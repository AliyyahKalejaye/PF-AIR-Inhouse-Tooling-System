"use client";

// Full-screen video player — screen 15/17. Wraps a native <video> with a
// custom control bar matching the mockup (scrubber, play/pause, volume,
// time readout, speed, fullscreen) since the browser's native controls
// don't match the dark-chrome look. Native <video> already gives us real
// playback, buffering, and seeking for free — this component is just the
// UI skin plus the handful of imperative calls (play/pause/seek/volume)
// that skin needs.

import { useEffect, useRef, useState } from "react";
import type { ProjectMediaRead } from "@/lib/projects";
import { DarkViewerTopBar } from "./DarkViewerTopBar";

interface Props {
  media: ProjectMediaRead;
  onClose: () => void;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ media, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // index into SPEEDS, default 1x
  // Same reasoning as ImageLightbox's imageError — an R2 object that's
  // gone missing shouldn't just be a silent black rectangle with dead
  // controls underneath it.
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function seekTo(fraction: number) {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = Math.min(Math.max(fraction, 0), 1) * duration;
  }

  function handleScrubberClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  }

  function handleVolumeClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = videoRef.current;
    if (!v) return;
    const fraction = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    v.volume = fraction;
    v.muted = false;
    setVolume(fraction);
    setMuted(false);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (videoRef.current) videoRef.current.playbackRate = SPEEDS[next] ?? 1;
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  }

  const played = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-[#020617]">
      <DarkViewerTopBar
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
          </svg>
        }
        title={media.filename ?? "Video"}
        subtitle={<span className="font-mono uppercase">Video</span>}
        onClose={onClose}
        downloadUrl={media.file_url}
        downloadName={media.filename}
      />

      <div className="flex flex-1 items-center justify-center overflow-hidden px-10 pb-28 pt-2">
        {videoError ? (
          <div className="flex flex-col items-center gap-3 text-center text-slate-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="5" width="15" height="14" rx="2" />
              <path d="M23 7l-7 5 7 5V7z" />
              <path d="M2 4l20 16" stroke="#f87171" />
            </svg>
            <p className="max-w-xs text-[13px]">
              This video couldn&apos;t be loaded — it may have been moved or removed from storage.
            </p>
            <a href={media.file_url} target="_blank" rel="noreferrer" className="btn-secondary">
              Try opening directly
            </a>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={media.file_url}
            className="max-h-full max-w-full rounded-[10px] shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]"
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onVolumeChange={(e) => {
              setVolume(e.currentTarget.volume);
              setMuted(e.currentTarget.muted);
            }}
            onError={() => setVideoError(true)}
          />
        )}
      </div>

      {!videoError && (
      <div className="absolute inset-x-0 bottom-0 z-20 px-8 pb-6 pt-10" style={{ background: "linear-gradient(to top, rgba(2,6,23,.95), rgba(2,6,23,.75) 55%, transparent)" }}>
        <div className="mx-auto mb-4 max-w-[1180px]">
          <div
            onClick={handleScrubberClick}
            className="relative h-1.5 cursor-pointer rounded-full bg-white/[.18]"
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-600" style={{ width: `${played}%` }} />
            <div
              className="absolute top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.4),0_0_0_3px_rgba(79,70,229,.35)]"
              style={{ left: `${played}%`, transform: "translate(-50%,-50%)" }}
            />
          </div>
        </div>

        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[.14] bg-white/10 text-white"
            >
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleMute} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-100 hover:bg-white/10">
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M18.36 5.64a9 9 0 010 12.72" /></svg>
                )}
              </button>
              <div onClick={handleVolumeClick} className="relative h-1 w-16 cursor-pointer rounded-full bg-white/[.22]">
                <div className="absolute inset-y-0 left-0 rounded-full bg-slate-200" style={{ width: `${muted ? 0 : volume * 100}%` }} />
              </div>
            </div>
            <div className="pl-2 font-mono text-[13px] text-slate-200">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cycleSpeed}
              className="rounded-lg border border-white/[.14] bg-white/[.08] px-3 py-2 font-mono text-[12.5px] font-semibold text-slate-100"
            >
              {SPEEDS[speedIdx] ?? 1}x
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-100 hover:bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
