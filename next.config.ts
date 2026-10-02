import type { NextConfig } from "next";

const securityHeaders = [
  // Never render inside another site's frame — stops clickjacking, e.g. tricking
  // someone into clicking "Allow" on the AI-app approval page.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Keep full URLs (which can carry tokens) from leaking to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
