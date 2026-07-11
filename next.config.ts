import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["unpdf", "@napi-rs/canvas"],
};

// Source maps stay off this sprint (no Sentry auth token required).
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: false,
});
