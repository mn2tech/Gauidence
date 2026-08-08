const DEFAULT_APP_URL = "https://guardian.nm2tech.com";

export type AppBaseUrlOptions = {
  /** Use request host headers when env URL is unset (API routes). */
  request?: Request;
  /** Prefer Vercel production hostname for share links on preview deploys. */
  preferProduction?: boolean;
};

/**
 * Canonical app origin for emails, Stripe redirects, invite links, and metadata.
 */
export function getAppBaseUrl(options?: AppBaseUrlOptions): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");

  if (options?.request) {
    const host =
      options.request.headers.get("x-forwarded-host") ??
      options.request.headers.get("host");
    const proto = options.request.headers.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  }

  if (
    options?.preferProduction &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  ) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  return DEFAULT_APP_URL;
}

export { DEFAULT_APP_URL };
