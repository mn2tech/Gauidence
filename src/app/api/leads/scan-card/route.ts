import { NextResponse } from "next/server";
import { isChatLlmConfigured } from "@/lib/analysis/chatProvider";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { extractBusinessCardFromImage } from "@/lib/leads/scanCard";
import { parseUuid } from "@/lib/leads/validators";
import { assertBillingQuota } from "@/lib/billing/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SCAN_BYTES = 15 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Extract contact fields from a business card image (does not create a lead). */
export async function POST(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;

  if (!isChatLlmConfigured()) {
    return NextResponse.json(
      { error: "AI isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const businessProfileId = parseUuid(
    form.get("businessProfileId") ?? form.get("business_profile_id")
  );
  const file = form.get("file");

  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a business card image." }, { status: 400 });
  }

  const business = await requireEditableBusinessProfile(
    auth.supabase,
    auth.user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Business workspace not found." },
      { status: 404 }
    );
  }

  if (file.size > MAX_SCAN_BYTES) {
    return NextResponse.json(
      { error: "Image is larger than 15 MB." },
      { status: 400 }
    );
  }

  const mimeType = file.type?.trim() || "image/jpeg";
  if (!ACCEPTED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: "Upload a JPG, PNG, or WebP image." },
      { status: 400 }
    );
  }

  const quota = await assertBillingQuota(
    auth.supabase,
    auth.user.id,
    "chat",
    auth.user.email
  );
  if (!quota.ok) return quota.response;

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractBusinessCardFromImage({
      mimeType,
      base64,
      fileName: file.name || "business-card.jpg",
      userId: auth.user.id,
    });

    return NextResponse.json({ extracted });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read the business card.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
