import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { createInviteToken, hashInviteToken } from "@/lib/profiles/invitations";

export function createAccessToken(): string {
  return createInviteToken();
}

export function hashAccessToken(token: string): string {
  return hashInviteToken(token);
}

export function createVerificationCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function tokensMatch(storedHash: string, provided: string, hashFn: (v: string) => string): boolean {
  const providedHash = hashFn(provided);
  try {
    const a = Buffer.from(storedHash, "hex");
    const b = Buffer.from(providedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return hashInviteToken(token);
}
