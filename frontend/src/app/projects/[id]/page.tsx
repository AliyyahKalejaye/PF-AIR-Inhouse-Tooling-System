// Server Component shell for the dynamic [id] segment. This project is a
// full static export (output: "export" in next.config.mjs — Cloudflare
// Pages hosts it as plain files, no Node server), and Next.js requires
// generateStaticParams() on any dynamic route segment in that mode — but
// only honors it from a Server Component, not a "use client" file. So the
// actual page logic lives in ProjectDetailClient.tsx; this file's only
// job is satisfying the static-export build and handing off to it.
//
// The "placeholder" param below is never a real project id — real ids
// are arbitrary runtime UUIDs unknowable at build time. Cloudflare
// Pages' _redirects (see frontend/public/_redirects) rewrites any real
// `/projects/<uuid>` URL to this same statically-generated bundle with a
// 200 status, and ProjectDetailClient reads the REAL id client-side via
// useParams() after hydration — the placeholder is only ever used to
// produce one build-time HTML/JS output for the route pattern to exist.
import { ProjectDetailClient } from "./ProjectDetailClient";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

// No server to fall back to for an id that wasn't statically generated —
// dynamicParams defaults to true, which output:"export" doesn't support.
export const dynamicParams = false;

export default function ProjectDetailPage() {
  return <ProjectDetailClient />;
}
