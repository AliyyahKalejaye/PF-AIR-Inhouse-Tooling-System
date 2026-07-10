/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket domain — set once R2 is provisioned.
      // { protocol: "https", hostname: "<your-r2-public-domain>" },
    ],
  },
};

export default nextConfig;
