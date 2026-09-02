import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import {
  extractCommunityContributionFromImage,
  extractCommunityContributionFromText,
} from "@/lib/summit-space/communityExtract";
import {
  checkContributionRateLimit,
  hashSubmissionIp,
} from "@/lib/summit-space/contributionRateLimit";
import {
  ALLOWED_CONTRIBUTION_MIME_TYPES,
  CONTRIBUTION_TYPES,
  isValidContributionEmail,
  MAX_CONTRIBUTION_FILE_BYTES,
  sanitizeContributionText,
  sanitizeContributionUrl,
  sanitizeContributorField,
  toPublicContributionView,
  type ContributionType,
  type SummitCommunityContributionRow,
} from "@/lib/summit-space/contributions";
import type { SummitEntityRow } from "@/lib/summit-space/types";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function verifyPublicSummit(slug: string) {
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) return null;
  const { data } = await supabase
    .from("summit_spaces")
    .select("slug")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  return data ? slug : null;
}

/**
 * Anonymous attendee submission — creates pending contribution with extraction.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const validSlug = await verifyPublicSummit(slug);
  if (!validSlug) {
    return NextResponse.json({ error: "Summit not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const ipHash = hashSubmissionIp(clientIp(request));
  const allowed = await checkContributionRateLimit({
    admin,
    summitSlug: slug,
    ipHash,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const contributionType = String(form.get("contributionType") ?? "photo");
    const content = sanitizeContributionText(form.get("content"));
    const permissionConfirmed = form.get("permissionConfirmed") === "true";
    const displayNamePublicly = form.get("displayNamePublicly") === "true";
    const file = form.get("file");

    if (!CONTRIBUTION_TYPES.includes(contributionType as ContributionType)) {
      return NextResponse.json({ error: "Invalid contribution type" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json(
        { error: "Please describe what you learned" },
        { status: 400 }
      );
    }
    if (!permissionConfirmed) {
      return NextResponse.json(
        { error: "Permission confirmation is required" },
        { status: 400 }
      );
    }

    let filePath: string | null = null;
    let fileMimeType: string | null = null;
    let extractedData: Record<string, unknown> = {};

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_CONTRIBUTION_FILE_BYTES) {
        return NextResponse.json(
          { error: "File too large (max 10 MB)" },
          { status: 400 }
        );
      }
      const mime = file.type || "image/jpeg";
      if (!ALLOWED_CONTRIBUTION_MIME_TYPES.has(mime)) {
        return NextResponse.json(
          { error: "Unsupported file type" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      filePath = `${slug}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("summit-contributions")
        .upload(filePath, buffer, { contentType: mime, upsert: false });

      if (uploadError) {
        console.error("Contribution upload failed:", uploadError.message);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      fileMimeType = mime;
      const base64 = buffer.toString("base64");
      const extracted = await extractCommunityContributionFromImage(
        base64,
        mime,
        contributionType
      );
      extractedData = extracted as unknown as Record<string, unknown>;
    } else if (contributionType === "photo") {
      return NextResponse.json({ error: "Photo required for photo contributions" }, { status: 400 });
    } else {
      const extracted = await extractCommunityContributionFromText(
        content,
        contributionType
      );
      extractedData = extracted as unknown as Record<string, unknown>;
    }

    const insertPayload = buildInsertPayload(form, {
      slug,
      contributionType: contributionType as ContributionType,
      content,
      permissionConfirmed,
      displayNamePublicly,
      filePath,
      fileMimeType,
      extractedData,
      ipHash,
    });

    const { data, error } = await admin
      .from("summit_community_contributions")
      .insert(insertPayload)
      .select("id, status")
      .single();

    if (error) {
      console.error("Contribution insert failed:", error.message);
      return NextResponse.json({ error: "Could not save contribution" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, status: data.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const contributionType = String(body.contributionType ?? "note");
  const content = sanitizeContributionText(body.content);
  const permissionConfirmed = body.permissionConfirmed === true;

  if (!CONTRIBUTION_TYPES.includes(contributionType as ContributionType)) {
    return NextResponse.json({ error: "Invalid contribution type" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "Please describe what you learned" }, { status: 400 });
  }
  if (!permissionConfirmed) {
    return NextResponse.json({ error: "Permission confirmation is required" }, { status: 400 });
  }

  const extracted = await extractCommunityContributionFromText(content, contributionType);

  const insertPayload = {
    summit_slug: slug,
    contribution_type: contributionType,
    content,
    session_entity_id: typeof body.sessionEntityId === "string" ? body.sessionEntityId : null,
    organization_entity_id:
      typeof body.organizationEntityId === "string" ? body.organizationEntityId : null,
    speaker_entity_id: typeof body.speakerEntityId === "string" ? body.speakerEntityId : null,
    source_url: sanitizeContributionUrl(body.sourceUrl),
    contributor_name: sanitizeContributorField(body.contributorName),
    contributor_company: sanitizeContributorField(body.contributorCompany),
    contributor_email: isValidContributionEmail(body.contributorEmail),
    display_name_publicly: body.displayNamePublicly === true,
    permission_confirmed: true,
    extracted_data: extracted,
    status: "pending",
    submission_ip_hash: ipHash,
  };

  const { data, error } = await admin
    .from("summit_community_contributions")
    .insert(insertPayload)
    .select("id, status")
    .single();

  if (error) {
    console.error("Contribution insert failed:", error.message);
    return NextResponse.json({ error: "Could not save contribution" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, status: data.status });
}

function buildInsertPayload(
  form: FormData,
  args: {
    slug: string;
    contributionType: ContributionType;
    content: string;
    permissionConfirmed: boolean;
    displayNamePublicly: boolean;
    filePath: string | null;
    fileMimeType: string | null;
    extractedData: Record<string, unknown>;
    ipHash: string;
  }
) {
  return {
    summit_slug: args.slug,
    contribution_type: args.contributionType,
    content: args.content,
    session_entity_id: form.get("sessionEntityId")
      ? String(form.get("sessionEntityId"))
      : null,
    organization_entity_id: form.get("organizationEntityId")
      ? String(form.get("organizationEntityId"))
      : null,
    speaker_entity_id: form.get("speakerEntityId")
      ? String(form.get("speakerEntityId"))
      : null,
    source_url: sanitizeContributionUrl(form.get("sourceUrl")),
    contributor_name: sanitizeContributorField(form.get("contributorName")),
    contributor_company: sanitizeContributorField(form.get("contributorCompany")),
    contributor_email: isValidContributionEmail(form.get("contributorEmail")),
    display_name_publicly: args.displayNamePublicly,
    permission_confirmed: args.permissionConfirmed,
    file_path: args.filePath,
    file_mime_type: args.fileMimeType,
    extracted_data: args.extractedData,
    status: "pending",
    submission_ip_hash: args.ipHash,
  };
}

/**
 * List published community contributions — no private fields exposed.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const validSlug = await verifyPublicSummit(slug);
  if (!validSlug) {
    return NextResponse.json({ error: "Summit not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "all";

  const { data: rows } = await admin
    .from("summit_community_contributions")
    .select("*")
    .eq("summit_slug", slug)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const contributions = (rows ?? []) as SummitCommunityContributionRow[];

  const entityIds = new Set<string>();
  for (const row of contributions) {
    if (row.session_entity_id) entityIds.add(row.session_entity_id);
    if (row.organization_entity_id) entityIds.add(row.organization_entity_id);
    if (row.speaker_entity_id) entityIds.add(row.speaker_entity_id);
  }

  let entities: SummitEntityRow[] = [];
  if (entityIds.size > 0) {
    const { data } = await admin
      .from("summit_entities")
      .select("*")
      .in("id", [...entityIds]);
    entities = (data ?? []) as SummitEntityRow[];
  }

  let views = contributions.map((row) => toPublicContributionView(row, entities));

  if (filter !== "all") {
    views = views.filter((v) => {
      if (filter === "photos") return v.contributionType === "photo";
      return v.contributionType === filter;
    });
  }

  return NextResponse.json({ contributions: views });
}
