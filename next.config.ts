import type { NextConfig } from "next";
const isolatedBuildDirectory = process.env.LIUZU_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  // Lets the verified local preview build beside an interactive `next dev`
  // session without sharing .next locks or generated route types.
  distDir: isolatedBuildDirectory || ".next",
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
    ];
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];

    return [
      { source: "/(.*)", headers: baseline },
      { source: "/share", headers: [...privateHeaders, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
      { source: "/account/:path*", headers: privateHeaders },
      { source: "/admin/:path*", headers: privateHeaders },
      { source: "/api/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
