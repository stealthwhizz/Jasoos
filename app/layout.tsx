import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETHJasoos",
  description: "One sentence becomes a walkable detective world.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ETHJasoos
          </Link>
          <nav className="flex gap-6 text-sm text-neutral-500">
            <Link href="/" className="hover:text-neutral-900">
              Create
            </Link>
            <Link href="/gallery" className="hover:text-neutral-900">
              Gallery
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 pb-24">{children}</main>
      </body>
    </html>
  );
}
