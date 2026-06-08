import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScoutFlow — One Domain. Unlimited Opportunities.",
  description:
    "ScoutFlow discovers lookalike companies, finds decision makers, verifies work emails, and launches personalized outreach automatically from a single company domain.",
  keywords: [
    "outbound sales",
    "prospecting automation",
    "email outreach",
    "lead generation",
    "B2B sales",
    "ScoutFlow",
  ],
  openGraph: {
    title: "ScoutFlow — Automated Outbound Intelligence",
    description: "One domain. Hundreds of qualified prospects. Automatically.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
