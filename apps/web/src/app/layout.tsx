import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Beaco — Notification Ops",
  description: "Event-driven notification system dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="dark"
      suppressHydrationWarning
      style={{ colorScheme: "dark" }}
    >
      <body suppressHydrationWarning className={`${inter.variable} overflow-x-hidden font-sans antialiased`}>
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
