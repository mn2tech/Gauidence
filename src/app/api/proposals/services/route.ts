import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import { SERVICE_TEMPLATE_SELECT, type ServiceTemplate } from "@/lib/proposals/types";
import { parseOptionalText, parseTitle, parseUuid } from "@/lib/proposals/validators";

export const runtime = "nodejs";

function mapService(row: Record<string, unknown>): ServiceTemplate {
  return {
    id: String(row.id),
    business_profile_id: String(row.business_profile_id),
    created_by: String(row.created_by),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    unit_label: String(row.unit_label ?? "each"),
    unit_price_cents: Number(row.unit_price_cents ?? 0),
    default_quantity: Number(row.default_quantity ?? 1),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function GET(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const businessProfileId = new URL(request.url).searchParams.get("businessProfileId");
  const business = await resolveBusinessProfile(
    auth.supabase,
    auth.user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json({ error: "Business vault required." }, { status: 400 });
  }
  const { data, error } = await auth.supabase
    .from("service_templates")
    .select(SERVICE_TEMPLATE_SELECT)
    .eq("business_profile_id", business.id)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Couldn't load services." }, { status: 500 });
  }
  return NextResponse.json({
    services: (data ?? []).map((row) => mapService(row)),
  });
}

export async function POST(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const businessProfileId = parseUuid(
    body.businessProfileId ?? body.business_profile_id
  );
  const name = parseTitle(body.name, 120);
  if (!businessProfileId || !name) {
    return NextResponse.json(
      { error: "businessProfileId and name are required." },
      { status: 400 }
    );
  }
  const business = await requireEditableBusinessProfile(
    auth.supabase,
    auth.user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json({ error: "Business vault not found." }, { status: 404 });
  }
  const unitPriceCents = Math.max(
    0,
    Math.round(Number(body.unitPriceCents ?? body.unit_price_cents ?? 0))
  );
  const defaultQuantity = Number(body.defaultQuantity ?? body.default_quantity ?? 1);
  const { data, error } = await auth.supabase
    .from("service_templates")
    .insert({
      business_profile_id: business.id,
      created_by: auth.user.id,
      name,
      description: parseOptionalText(body.description, 2000),
      unit_label:
        typeof body.unitLabel === "string"
          ? body.unitLabel.trim().slice(0, 40) || "each"
          : typeof body.unit_label === "string"
            ? body.unit_label.trim().slice(0, 40) || "each"
            : "each",
      unit_price_cents: unitPriceCents,
      default_quantity:
        Number.isFinite(defaultQuantity) && defaultQuantity > 0
          ? defaultQuantity
          : 1,
    })
    .select(SERVICE_TEMPLATE_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Couldn't create service." }, { status: 500 });
  }
  return NextResponse.json({ service: mapService(data) }, { status: 201 });
}
