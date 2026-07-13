"use client";

// Orchestrator for the four full-screen media viewers (screens 14-17).
// The project detail page just says "open this media item at this
// index" — this component figures out which viewer that item needs and,
// for images, narrows the project's full media list down to the
// image-only subset the lightbox's filmstrip cycles through.

import type { ProjectMediaRead } from "@/lib/projects";
import { ImageLightbox } from "./ImageLightbox";
import { VideoPlayer } from "./VideoPlayer";
import { CadViewer } from "./CadViewer";
import { CodeViewer } from "./CodeViewer";

interface Props {
  media: ProjectMediaRead[];
  openIndex: number;
  onClose: () => void;
}

export function MediaViewerModal({ media, openIndex, onClose }: Props) {
  const item = media[openIndex];
  if (!item) return null;

  switch (item.media_type) {
    case "image": {
      const images = media.filter((m) => m.media_type === "image");
      const initialIndex = images.findIndex((m) => m.id === item.id);
      return <ImageLightbox images={images} initialIndex={Math.max(initialIndex, 0)} onClose={onClose} />;
    }
    case "video":
      return <VideoPlayer media={item} onClose={onClose} />;
    case "3d_render":
    case "cad":
      return <CadViewer media={item} onClose={onClose} />;
    case "code":
      return <CodeViewer media={item} onClose={onClose} />;
    default:
      return null;
  }
}
