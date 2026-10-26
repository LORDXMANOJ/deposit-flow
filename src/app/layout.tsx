import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./ux.css";
import { ToastProvider } from "@/components/toast";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DepositFlow", template: "%s · DepositFlow" },
  description: "Security Deposit & FDR management prototype for SIH26265 (demonstration data only).",
};

// #14 viewport-fit=cover so env(safe-area-inset-*) has values on notched phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f6f4" }, { media: "(prefers-color-scheme: dark)", color: "#111113" }],
};

// #7 Speculation rules: prerender same-site page links on hover/pointerdown ("moderate").
// Excluded: API routes (exports, files), the login page, anything marked data-no-prerender, and downloads.
// Sign-out is a POST form, never a link, so it can't be prerendered.
const speculation = {
  prerender: [{
    where: { and: [
      { href_matches: "/*" },
      { not: { href_matches: "/api/*" } },
      { not: { href_matches: "/login" } },
      { not: { selector_matches: "[data-no-prerender], [download], [target=_blank]" } },
    ] },
    eagerness: "moderate",
  }],
};

// Applies the saved theme before paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem('df-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="speculationrules" dangerouslySetInnerHTML={{ __html: JSON.stringify(speculation) }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
