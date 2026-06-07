import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL ?? "",
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
