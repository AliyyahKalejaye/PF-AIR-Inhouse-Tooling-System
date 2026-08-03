"use client";

// Media Attachments picker — screen 11's 5-tile grid (Images, Video, 3D
// Render, CAD File, Code Repo). Purely a staging UI: it collects
// File objects (or, for Code Repo, a typed URL) into the `items` array the
// parent owns, and reports adds/removes back up. The parent decides what
// "remove" means — for an item that's already saved to the backend
// (editing an existing project), that's a real deleteProjectMedia call;
// for a freshly-picked local file, it's just dropping it from the array.
// This mirrors how ComponentModal defers the actual image upload until
// the component itself has a real id to attach it to.

import { useEffect, useRef, useState } from "react";
import type { MediaType } from "@/lib/projects";

export interface StagedMedia {
  key: string;
  media_type: MediaType;
  file?: File;
  file_url?: string;
  filename: string | null;
  existingId?: string;
  previewUrl?: string;
}

const ACCEPT: Record<Exclude<MediaType, "code">, string> = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/quicktime",
  "3d_render": ".glb,.gltf,.obj",
  cad: ".step,.stp,.sldprt",
};

const TILES: Array<{ type: MediaType; label: string; hint: string; icon: React.ReactNode }> = [
  {
    type: "image",
    label: "Images",
    hint: "JPG, PNG · drag & drop",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    type: "video",
    label: "Video",
    hint: "MP4, MOV",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  {
    type: "3d_render",
    label: "3D Render",
    hint: "GLB, OBJ",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2l9 5v10l-9 5-9-5V7z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
    ),
  },
  {
    type: "cad",
    label: "CAD File",
    hint: "STEP, SLDPRT",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7l8-4 8 4M4 7v10l8 4M4 7l8 4M20 7v10l-8 4M20 7l-8 4m0 0v10" />
      </svg>
    ),
  },
  {
    type: "code",
    label: "Code Repo",
    hint: "Git URL link",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
  },
];

function labelFor(type: MediaType): string {
  return TILES.find((t) => t.type === type)?.label ?? type;
}

interface Props {
  items: StagedMedia[];
  onAdd: (item: StagedMedia) => void;
  onRemove: (key: string) => void;
}

export function MediaAttachments({ items, onAdd, onRemove }: Props) {
  const fileInputRefs = useRef<Partial<Record<MediaType, HTMLInputElement | null>>>({});
  const [codeUrlOpen, setCodeUrlOpen] = useState(false);
  const [codeUrl, setCodeUrl] = useState("");
  const [codeLabel, setCodeLabel] = useState("");

  // Revoke object URLs for previews as they leave `items` — whether
  // because the user clicked remove or because the parent form
  // unmounted (Cancel/navigate away) — same cleanup discipline
  // ComponentModal uses for its single image preview, just generalized
  // to a list since this component can stage many at once.
  const prevKeysWithPreview = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const current = new Map(items.filter((i) => i.previewUrl).map((i) => [i.key, i.previewUrl as string]));
    for (const [key, url] of prevKeysWithPreview.current) {
      if (!current.has(key)) URL.revokeObjectURL(url);
    }
    prevKeysWithPreview.current = current;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const url of prevKeysWithPreview.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  function handleFiles(type: Exclude<MediaType, "code">, fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((file) => {
      const previewUrl = type === "image" ? URL.createObjectURL(file) : undefined;
      onAdd({
        key: `${type}-${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        media_type: type,
        file,
        filename: file.name,
        previewUrl,
      });
    });
  }

  function handleAddCodeUrl() {
    const url = codeUrl.trim();
    if (!url) return;
    onAdd({
      key: `code-${Date.now()}-${Math.random()}`,
      media_type: "code",
      file_url: url,
      filename: codeLabel.trim() || url,
    });
    setCodeUrl("");
    setCodeLabel("");
    setCodeUrlOpen(false);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TILES.map((tile) => {
          // TypeScript doesn't carry `tile.type !== "code"` narrowing
          // across the onChange closure below (property-access narrowing
          // is lost across nested function boundaries) — binding it to a
          // local const first is the standard fix, since narrowing on a
          // plain variable *does* survive into closures.
          const uploadType = tile.type !== "code" ? tile.type : null;
          return (
            <div key={tile.type}>
              <button
                type="button"
                onClick={() => (uploadType ? fileInputRefs.current[uploadType]?.click() : setCodeUrlOpen((v) => !v))}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 py-6 text-center text-slate-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
              >
                {tile.icon}
                <div className="text-[12.5px] font-bold text-slate-700">{tile.label}</div>
                <div className="text-[10.5px] text-slate-400">{tile.hint}</div>
              </button>
              {uploadType && (
                <input
                  ref={(el) => {
                    fileInputRefs.current[uploadType] = el;
                  }}
                  type="file"
                  multiple
                  accept={ACCEPT[uploadType]}
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(uploadType, e.target.files);
                    e.target.value = "";
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {codeUrlOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border-[1.5px] border-indigo-100 bg-indigo-50 p-3 sm:flex-row sm:items-center">
          <input
            autoFocus
            value={codeUrl}
            onChange={(e) => setCodeUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="flex-1 rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-indigo-600"
          />
          <input
            value={codeLabel}
            onChange={(e) => setCodeLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-indigo-600 sm:w-40"
          />
          <button type="button" onClick={handleAddCodeUrl} className="btn-primary justify-center !px-3 !py-2 text-[12.5px]">
            Add
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-2.5"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt="" className="h-7 w-7 rounded object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-[9.5px] font-bold uppercase text-slate-500">
                  {labelFor(item.media_type).slice(0, 2)}
                </span>
              )}
              <span className="max-w-[160px] truncate text-[12px] font-semibold text-slate-700">
                {item.filename ?? labelFor(item.media_type)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                aria-label={`Remove ${item.filename ?? labelFor(item.media_type)}`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
