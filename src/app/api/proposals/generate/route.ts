import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { isAnthropicConfigured, isChatLlmConfigured } from "@/lib/analysis/chatProvider";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import {
  PROPOSAL_GENERATION_SYSTEM,
  buildProposalGenerationUserPrompt,
} from "@/lib/proposals/prompt";
import { parseDeliverables, parseLineItems, parseTimeline } from "@/lib/proposals/validators";
import { SERVICE_TEMPLATE_SELECT } from "@/lib/proposals/types";
import { retrieveStructuredKnowledge } from "@/lib/knowledge/v2/retrieve";
import { formatKnowledgeForGideon } from "@/lib/knowledge/v2/formatForGideon";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { assertBillingQuota, recordChatEvent } from "@/lib/billing/quota";
import { withLlmUsage } from "@/lib/usage/record";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  if (!isChatLlmConfigured()) {
    return NextResponse.json(
      { error: "AI isn't configured on this deployment." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) {
    return NextResponse.json({ error: "Enter a prompt." }, { status: 400 });
  }

  const businessProfileId =
    typeof body.businessProfileId === "string" ? body.businessProfileId : null;
  const business = await resolveBusinessProfile(
    auth.supabase,
    auth.user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Switch to a business vault to generate proposals." },
      { status: 400 }
    );
  }
  const editable = await requireEditableBusinessProfile(
    auth.supabase,
    auth.user.id,
    business.id
  );
  if (!editable) {
    return NextResponse.json({ error: "Business vault not found." }, { status: 404 });
  }

  const quota = await assertBillingQuota(
    auth.supabase,
    auth.user.id,
    "chat",
    auth.user.email
  );
  if (!quota.ok) return quota.response;

  const { error: eventError } = await recordChatEvent(
    auth.supabase,
    auth.user.id,
    "chat"
  );
  if (eventError) {
    return NextResponse.json(
      { error: "We couldn't start proposal generation. Please try again." },
      { status: 502 }
    );
  }

  const clientName =
    typeof body.clientName === "string" ? body.clientName.trim() : null;
  const { data: services } = await auth.supabase
    .from("service_templates")
    .select(SERVICE_TEMPLATE_SELECT)
    .eq("business_profile_id", business.id)
    .eq("is_active", true)
    .limit(20);

  const serviceCatalog = (services ?? [])
    .map((row) => {
      const price = Number(row.unit_price_cents ?? 0) / 100;
      return `- ${row.name}: $${price.toFixed(2)} / ${row.unit_label}${row.description ? ` — ${row.description}` : ""}`;
    })
    .join("\n");

  let knowledgeContext = "";
  if (isKnowledgeEngineV2Enabled()) {
    const knowledge = await retrieveStructuredKnowledge(auth.supabase, {
      question: prompt,
      profileIds: [business.id],
    });
    knowledgeContext = formatKnowledgeForGideon(knowledge, {
      [business.id]: business.display_name,
    });
  }

  const userPrompt = buildProposalGenerationUserPrompt({
    prompt,
    clientName,
    businessName: business.display_name,
    serviceCatalog: serviceCatalog || undefined,
    knowledgeContext: knowledgeContext || undefined,
  });

  const client = isAnthropicConfigured() ? createLlmClient() : null;
  const raw = await withLlmUsage(
    { userId: auth.user.id, feature: "other" },
    () =>
      runChatCompletion(client, {
        system: PROPOSAL_GENERATION_SYSTEM,
        model: CHAT_MODEL,
        maxTokens: 1800,
        messages: [{ role: "user", content: userPrompt }],
      })
  );

  const jsonText = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "AI returned an invalid proposal draft. Try again." },
      { status: 502 }
    );
  }

  const lineItems = parseLineItems(parsed.lineItems).map((item) => ({
    ...item,
    id: item.id || randomUUID(),
  }));
  const addons = parseLineItems(parsed.addons).map((item) => ({
    ...item,
    id: item.id || randomUUID(),
    optional: item.optional ?? true,
  }));

  return NextResponse.json({
    draft: {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "Proposal",
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      introduction:
        typeof parsed.introduction === "string" ? parsed.introduction.trim() : "",
      terms: typeof parsed.terms === "string" ? parsed.terms.trim() : "",
      lineItems,
      timeline: parseTimeline(parsed.timeline),
      deliverables: parseDeliverables(parsed.deliverables),
      addons,
    },
  });
}
