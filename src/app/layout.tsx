import { Geist } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import { rootMetadata, rootViewport } from "@/lib/site-metadata";
import {
  GUARDIAN_START_SPLASH_BOOT_ID,
  GUARDIAN_START_SPLASH_BOOT_SCRIPT,
} from "@/lib/branding/startSplash";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = rootMetadata;
export const viewport = rootViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} font-sans antialiased`}>
        {/* Must run before the cover node so returning visits never flash the cover */}
        <script
          dangerouslySetInnerHTML={{ __html: GUARDIAN_START_SPLASH_BOOT_SCRIPT }}
        />
        {/* In the first HTML paint — blocks the landing page until splash mounts */}
        <div
          id={GUARDIAN_START_SPLASH_BOOT_ID}
          className="guardian-splash-boot-cover"
          aria-hidden="true"
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
