import { GUARDIAN_BRAND_TAGLINE, GUARDIAN_ICON_SRC } from "@/lib/branding";
import type { Metadata, Viewport } from "next";
import { getAppBaseUrl } from "@/lib/url/appBaseUrl";

export const SITE_NAME = "Guardian";

export const SITE_TAGLINE = GUARDIAN_BRAND_TAGLINE;

export const SITE_DESCRIPTION =
  "Guardian helps you store, understand, and act on the documents that matter most. Private by default, protected by authenticated access.";

export function getSiteUrl(): string {
  return getAppBaseUrl();
}

/** Social preview image — square Guardian star. */
export const SITE_OG_IMAGE_PATH = "/icons/icon-512.png";

export const rootMetadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "document vault",
    "personal documents",
    "deadline reminders",
    "AI document analysis",
    "secure storage",
    "Guardian",
  ],
  authors: [{ name: "NM2TECH", url: "https://nm2tech.com" }],
  creator: "NM2TECH",
  publisher: "NM2TECH",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: getSiteUrl(),
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        width: 512,
        height: 512,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: GUARDIAN_ICON_SRC, type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
    shortcut: GUARDIAN_ICON_SRC,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  alternates: {
    canonical: getSiteUrl(),
  },
};

export const rootViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light",
};
