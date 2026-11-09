import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Allowance: spending limits for AI agents, paid with PayPal",
  description:
    "Give an AI agent an allowance instead of your card. It buys within your limits through PayPal; anything outside them waits for your approval on your phone.",
};

export const viewport: Viewport = { themeColor: "#0A1120", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
