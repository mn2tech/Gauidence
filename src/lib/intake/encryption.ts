import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const env = process.env.INTAKE_ENCRYPTION_KEY?.trim();
  if (env) {
    if (env.length === 64 && /^[0-9a-f]+$/i.test(env)) {
      return Buffer.from(env, "hex");
    }
    return createHash("sha256").update(env).digest();
  }
  const fallback =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "dev-intake-encryption";
  return createHash("sha256").update(fallback).digest();
}

export function encryptSsn(ssn: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(ssn, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSsn(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSsnLastFour(lastFour: string): string {
  return `***-**-${lastFour}`;
}
