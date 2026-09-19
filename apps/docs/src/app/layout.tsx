import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@beaco/theme";
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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${inter.variable} bg-background font-sans text-foreground antialiased`}>
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only z-100 rounded-md bg-primary px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          <DocsShell searchItems={getDocsSearchIndex()}>{children}</DocsShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
