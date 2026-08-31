// Server Component shell for the dynamic [id] segment — same
// static-export workaround as app/projects/[id]/page.tsx (see that file's
// comment for the full explanation): output:"export" needs
// generateStaticParams() + dynamicParams=false, Cloudflare Pages'
// _redirects rewrites any real `/ecr/<uuid>` to this one statically-built
// bundle, and EcrDetailClient reads the REAL id client-side via
// usePathname() after hydration.
import { EcrDetailClient } from "./EcrDetailClient";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export const dynamicParams = false;

export default function EcrDetailPage() {
  return <EcrDetailClient />;
}
