import type { Metadata } from "next";
import { Geist } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guardian — Keep your most important documents safe and understood",
  description:
    "Guardian helps you store, understand, and act on the documents that matter most. Private by default, protected by authenticated access.",
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
