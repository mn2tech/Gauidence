import type { Metadata } from "next";
import { Geist } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const siteUrl = "https://guardian-app-delta.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Guardian — Keep your most important documents safe and understood",
  description:
    "Guardian helps you store, understand, and act on the documents that matter most. Private by default, protected by authenticated access.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Guardian",
    title: "Guardian — Keep your most important documents safe and understood",
    description:
      "Store, understand, and act on the documents that matter most. Private by default.",
    images: [
      {
        // Square first — WhatsApp / iMessage use a square thumbnail
        url: "/guardian-og-square.png",
        width: 1080,
        height: 1080,
        alt: "Guardian by NM2TECH — your private document vault",
      },
      {
        url: "/guardian-og.png",
        width: 1200,
        height: 630,
        alt: "Guardian by NM2TECH — your private vault for the documents that matter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Guardian — Keep your most important documents safe and understood",
    description:
      "Store, understand, and act on the documents that matter most. Private by default.",
    images: ["/guardian-og-square.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
