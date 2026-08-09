import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAppBaseUrl } from "@/lib/url/appBaseUrl";

const TOKEN_BYTES = 32;

export function generateProposalPortalToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashProposalPortalToken(token) };
}

export function hashProposalPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function proposalPortalUrl(token: string): string {
  return `${getAppBaseUrl()}/proposal/${token}`;
}

export function defaultPortalExpiry(days = 30): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
