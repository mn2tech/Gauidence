import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateProposalPortalToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashProposalPortalToken(token) };
}

export function hashProposalPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function proposalPortalUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  return `${base}/proposal/${token}`;
}

export function defaultPortalExpiry(days = 30): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
