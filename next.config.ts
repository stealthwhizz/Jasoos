import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: any device on the local network or Tailscale may load dev resources (HMR) from this
  // server. `*` matches one address part; only private ranges are listed, never the public internet.
  allowedDevOrigins: [
    "127.0.0.1", // loopback: lets you view the app logged out next to a localhost session
    "192.168.*.*", // home / office Wi-Fi
    "10.*.*.*", // venue and corporate networks
    "172.*.*.*", // private 172.16-31 range (hotspots, Docker)
    "100.*.*.*", // Tailscale
    "*.local", // macOS / Bonjour hostnames, e.g. my-mac.local
    "*.ts.net", // Tailscale MagicDNS names
  ],
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
