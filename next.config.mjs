/** @type {import('next').NextConfig} */
// Static security headers live here; the Content-Security-Policy (per-request nonce) is set in
// middleware.ts (Next 14 App Router propagates the nonce to its own scripts). Do NOT add a CSP here.
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" }
        ]
      }
    ];
  }
};

export default config;
