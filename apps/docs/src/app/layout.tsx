import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { DocsShell } from "@/components/docs-shell";
import { getDocsSearchIndex } from "@/lib/docs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "Beaco Documentation",
    template: "%s — Beaco Docs",
  },
  description: "Learn how to integrate and operate Beaco.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body className={`${inter.variable} bg-[var(--background)] font-sans text-[var(--foreground)] antialiased`}>
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <DocsShell searchItems={getDocsSearchIndex()}>{children}</DocsShell>
      </body>
    </html>
  );
}
