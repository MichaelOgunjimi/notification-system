import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@beaco/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Beaco | Notification infrastructure that stays accountable",
  description:
    "Send email, SMS, and webhook notifications through one API with built-in retries, templates, observability, and failure recovery.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/png/favicon.ico" },
      { url: "/brand/png/beaco-mark-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/brand/png/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Beaco | Notification infrastructure that stays accountable",
    description:
      "Send email, SMS, and webhook notifications through one API with built-in retries, templates, observability, and failure recovery.",
    siteName: "Beaco",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beaco | Notification infrastructure that stays accountable",
    description:
      "Send email, SMS, and webhook notifications through one API with built-in retries, templates, observability, and failure recovery.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geist.variable} ${geistMono.variable} overflow-x-hidden font-sans antialiased`}
      >
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only z-[100] rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
