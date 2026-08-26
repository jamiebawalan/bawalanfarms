import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { QueueBanner } from "@/components/queue-banner";

export const metadata: Metadata = {
  title: "Farm Tracker",
  description: "Costs, harvests and sales, by plot and by crop cycle",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Farm" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available: pinching a number is sometimes the fastest way to
  // check it, and disabling that would fail anyone who needs larger text.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16171a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueueBanner />
        {children}
        <Nav />
      </body>
    </html>
  );
}
