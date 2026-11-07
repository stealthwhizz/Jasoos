import type { Metadata } from "next";
import { Geist, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const DESCRIPTION =
  "A detective game set in India. Question AI suspects, unlock evidence with World ID and crack the case. Every scene is generated live on 0G.";

/**
 * Site metadata. Link previews (WhatsApp, X, Telegram) use app/opengraph-image.png and
 * app/twitter-image.png; they need absolute URLs, so metadataBase points at the production
 * domain on Vercel and at localhost in dev.
 */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"
  ),
  title: "ETH Jasoos - an AI detective story you play",
  description: DESCRIPTION,
  applicationName: "ETH Jasoos",
  openGraph: {
    title: "ETH Jasoos - an AI detective story you play",
    description: DESCRIPTION,
    siteName: "ETH Jasoos",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ETH Jasoos - an AI detective story you play",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased font-sans",
        geist.variable,
        bricolage.variable
      )}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
