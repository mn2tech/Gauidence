import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  extractSummitIntelligenceFromImage,
  extractSummitIntelligenceFromText,
} from "@/lib/summit-space/extract";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

async function requireSummitOwner(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in required", status: 401 as const };
  }

  const { data: space } = await supabase
    .from("summit_spaces")
    .select("profile_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!space?.profile_id) {
    return { error: "Summit space not linked to a Guardian profile", status: 403 as const };
  }

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", space.profile_id)
    .maybeSingle();

  if (!profile || profile.owner_user_id !== user.id) {
    return { error: "Not authorized", status: 403 as const };
  }

  return { user, profileId: space.profile_id };
}

/**
 * Owner/admin rapid summit capture — creates pending_review drafts.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const auth = await requireSummitOwner(slug);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const draftType = String(form.get("draftType") ?? "photo");
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const extracted = await extractSummitIntelligenceFromImage(
      base64,
      file.type || "image/jpeg"
    );

    const { data: draft } = await admin
      .from("summit_intelligence_drafts")
      .insert({
        summit_slug: slug,
        draft_type: draftType === "presentation" ? "presentation" : "photo",
        title: extracted.sessionTitle,
        extracted_data: extracted,
        status: "pending_review",
        created_by: auth.user.id,
      })
      .select("*")
      .single();

    return NextResponse.json({ draft, extracted });
  }

  const body = (await request.json().catch(() => ({}))) as {
    draftType?: string;
    title?: string;
    content?: string;
    extractedData?: Record<string, unknown>;
  };

  const draftType = body.draftType ?? "note";
  let extractedData: Record<string, unknown> = body.extractedData ?? {};

  if (body.content && draftType === "note") {
    const extracted = await extractSummitIntelligenceFromText(body.content);
    extractedData = extracted;
  }

  const { data: draft } = await admin
    .from("summit_intelligence_drafts")
    .insert({
      summit_slug: slug,
      draft_type: draftType,
      title: body.title ?? null,
      extracted_data: extractedData,
      status: "pending_review",
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  return NextResponse.json({ draft });
}

/**
 * Approve or reject a pending intelligence draft.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const auth = await requireSummitOwner(slug);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    draftId?: string;
    action?: "approve" | "reject";
  };

  if (!body.draftId || !body.action) {
    return NextResponse.json({ error: "Missing draftId or action" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const status = body.action === "approve" ? "approved" : "rejected";

  const { data: draft } = await admin
    .from("summit_intelligence_drafts")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.draftId)
    .eq("summit_slug", slug)
    .select("*")
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (status === "approved") {
    const extracted = draft.extracted_data as {
      sessionTitle?: string | null;
      organizations?: { name: string; description?: string }[];
      speakers?: { name: string; title?: string; organization?: string }[];
    };

    if (extracted.sessionTitle) {
      const sessionSlug = extracted.sessionTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 80);
      await admin.from("summit_entities").upsert(
        {
          summit_slug: slug,
          entity_type: "session",
          slug: sessionSlug,
          name: extracted.sessionTitle,
          lifecycle_status: "published",
          visibility: "public",
          source_label: "Summit capture — owner approved",
          source_type: "summit",
        },
        { onConflict: "summit_slug,slug" }
      );
    }

    for (const org of extracted.organizations ?? []) {
      const orgSlug = org.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 80);
      await admin.from("summit_entities").upsert(
        {
          summit_slug: slug,
          entity_type: "organization",
          slug: orgSlug,
          name: org.name,
          description: org.description ?? null,
          lifecycle_status: "published",
          visibility: "public",
          source_label: "Summit capture — owner approved",
          source_type: "summit",
        },
        { onConflict: "summit_slug,slug" }
      );
    }

    for (const speaker of extracted.speakers ?? []) {
      const personSlug = speaker.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 80);
      await admin.from("summit_entities").upsert(
        {
          summit_slug: slug,
          entity_type: "person",
          slug: personSlug,
          name: speaker.name,
          description: speaker.title
            ? `${speaker.title}${speaker.organization ? ` at ${speaker.organization}` : ""}`
            : null,
          properties: {
            title: speaker.title ?? null,
            organization: speaker.organization ?? null,
          },
          lifecycle_status: "published",
          visibility: "public",
          source_label: "Summit capture — owner approved",
          source_type: "summit",
        },
        { onConflict: "summit_slug,slug" }
      );
    }
  }

  return NextResponse.json({ draft });
}
