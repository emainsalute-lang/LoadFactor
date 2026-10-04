import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return ["/reports/:path*", "/api/reports/:path*"].map(source => ({ source, headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }));
  },
};
export default config;
