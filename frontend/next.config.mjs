/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: Cloudflare Pages hosts this as plain static files (HTML/
  // CSS/JS), not as a Node server. That means no server components doing
  // per-request fetches and no next/image optimization server — everything
  // in src/app must be a client component for data fetching (see page.tsx),
  // and images are served unoptimized. `npm run build` outputs to `out/`,
  // which is what gets pointed at as the Cloudflare Pages build output
  // directory. See SETUP_GUIDE.md for the exact dashboard steps.
  output: "export",
  images: {
    unoptimized: true,
    remotePatterns: [
      // Cloudflare R2 public bucket domain — set once R2 is provisioned.
      // { protocol: "https", hostname: "<your-r2-public-domain>" },
    ],
  },
};

export default nextConfig;