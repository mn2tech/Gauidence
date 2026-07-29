import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { PayrollShare } from "./types";
import { hashSessionToken } from "./tokens";

const SESSION_COOKIE = "payroll_share_session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function sessionSecret(): string {
  return (
    process.env.PAYROLL_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "dev-payroll-session-secret"
  );
}

type SessionPayload = {
  shareId: string;
  sessionHash: string;
  exp: number;
};

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createShareSession(share: PayrollShare, sessionToken: string): string {
  const payload: SessionPayload = {
    shareId: share.id,
    sessionHash: hashSessionToken(sessionToken),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export async function setShareSessionCookie(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/payroll-share",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearShareSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getVerifiedShareId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const [encoded, sig] = raw.split(".");
  if (!encoded || !sig) return null;

  const expectedSig = signPayload(encoded);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload.shareId;
  } catch {
    return null;
  }
}

export async function verifyShareSession(shareId: string): Promise<boolean> {
  const verified = await getVerifiedShareId();
  return verified === shareId;
}
