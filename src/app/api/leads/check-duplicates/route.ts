import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
  resolveBusinessProfile,
} from "@/lib/leads/auth";
import { findPotentialDuplicates } from "@/lib/leads/duplicates";
import {
  parseCompanyOrContact,
  parseOptionalText,
  parseUuid,
} from "@/lib/leads/validators";

export const runtime = "nodejs";

/** Check for likely duplicate leads before creating. */
export async function POST(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessProfileId = parseUuid(
    body.businessProfileId ?? body.business_profile_id
  );
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }

  const business = await resolveBusinessProfile(
    supabase,
    user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Business workspace not found." },
      { status: 404 }
    );
  }

  const candidate = {
    email: parseOptionalText(body.email),
    companyName: parseOptionalText(body.companyName ?? body.company_name),
    contactName: parseOptionalText(body.contactName ?? body.contact_name),
    phone: parseOptionalText(body.phone),
    website: parseOptionalText(body.website),
  };

  if (
    !candidate.email &&
    !parseCompanyOrContact(candidate.companyName, candidate.contactName) &&
    !candidate.phone &&
    !candidate.website
  ) {
    return NextResponse.json({ duplicates: [] });
  }

  try {
    const duplicates = await findPotentialDuplicates(
      supabase,
      business.id,
      candidate
    );
    return NextResponse.json({ duplicates });
  } catch {
    return NextResponse.json(
      { error: "Couldn't check for duplicates." },
      { status: 500 }
    );
  }
}
