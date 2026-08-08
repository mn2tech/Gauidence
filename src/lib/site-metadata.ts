import type { Metadata, Viewport } from "next";

export const SITE_NAME = "Guardian";

export const SITE_TAGLINE =
  "Keep your most important documents safe and understood";

export const SITE_DESCRIPTION =
  "Guardian helps you store, understand, and act on the documents that matter most. Private by default, protected by authenticated access.";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://guardian.nm2tech.com";
}

/** Social preview image — replace `public/og-image.png` (1200×630) when available. */
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
        alt: `${SITE_NAME} — private document vault`,
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
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
    shortcut: "/icon.png",
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
  themeColor: "#0f766e",
  colorScheme: "light",
};
