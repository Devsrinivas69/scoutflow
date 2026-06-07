import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? "",
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "scout-flow.app",
        "www.scout-flow.app",
      ],
    },
  },
};

export default nextConfig;
