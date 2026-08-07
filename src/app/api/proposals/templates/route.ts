import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import {
  PROPOSAL_TEMPLATE_SELECT,
  type ProposalTemplate,
} from "@/lib/proposals/types";
import {
  parseDeliverables,
  parseLineItems,
  parseOptionalText,
  parseTimeline,
  parseTitle,
  parseUuid,
} from "@/lib/proposals/validators";
import { ensureDefaultProposalTemplates } from "@/lib/proposals/ensureDefaultTemplates";

export const runtime = "nodejs";

function mapTemplate(row: Record<string, unknown>): ProposalTemplate {
  return {
    id: String(row.id),
    business_profile_id: String(row.business_profile_id),
    created_by: String(row.created_by),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    default_title: (row.default_title as string | null) ?? null,
    default_summary: (row.default_summary as string | null) ?? null,
    default_introduction: (row.default_introduction as string | null) ?? null,
    default_terms: (row.default_terms as string | null) ?? null,
    default_line_items: Array.isArray(row.default_line_items)
      ? row.default_line_items
      : [],
    default_timeline: Array.isArray(row.default_timeline) ? row.default_timeline : [],
    default_deliverables: Array.isArray(row.default_deliverables)
      ? row.default_deliverables
      : [],
    default_addons: Array.isArray(row.default_addons) ? row.default_addons : [],
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
  const templates = await ensureDefaultProposalTemplates(auth.supabase, {
    businessProfileId: business.id,
    userId: auth.user.id,
  });
  return NextResponse.json({ templates });
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
  const { data, error } = await auth.supabase
    .from("proposal_templates")
    .insert({
      business_profile_id: business.id,
      created_by: auth.user.id,
      name,
      description: parseOptionalText(body.description, 2000),
      default_title: parseOptionalText(body.defaultTitle ?? body.default_title, 200),
      default_summary: parseOptionalText(body.defaultSummary ?? body.default_summary),
      default_introduction: parseOptionalText(
        body.defaultIntroduction ?? body.default_introduction
      ),
      default_terms: parseOptionalText(body.defaultTerms ?? body.default_terms),
      default_line_items: parseLineItems(
        body.defaultLineItems ?? body.default_line_items
      ),
      default_timeline: parseTimeline(body.defaultTimeline ?? body.default_timeline),
      default_deliverables: parseDeliverables(
        body.defaultDeliverables ?? body.default_deliverables
      ),
      default_addons: parseLineItems(body.defaultAddons ?? body.default_addons),
    })
    .select(PROPOSAL_TEMPLATE_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Couldn't create template." }, { status: 500 });
  }
  return NextResponse.json({ template: mapTemplate(data) }, { status: 201 });
}
