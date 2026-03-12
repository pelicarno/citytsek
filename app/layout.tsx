import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://citytsek.xyz"),
  title: "CityTsek — GV2025 Property Valuation Analyser",
  description:
    "Free tool to analyse your City of Cape Town GV2025 property valuation against comparable sales data. Generate an objection motivation report.",
  keywords: [
    "Cape Town",
    "GV2025",
    "property valuation",
    "rates objection",
    "municipal valuation",
    "comparable sales",
  ],
  openGraph: {
    title: "CityTsek — GV2025 Property Valuation Analyser",
    description:
      "Is your Cape Town property over-valued? Check your GV2025 valuation against real sales data and generate an objection report — free.",
    url: "https://citytsek.xyz",
    siteName: "CityTsek",
    locale: "en_ZA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CityTsek — GV2025 Property Valuation Analyser",
    description:
      "Is your Cape Town property over-valued? Check your GV2025 valuation against real sales data and generate an objection report — free.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
