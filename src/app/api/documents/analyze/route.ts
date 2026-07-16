import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDocumentCategory } from "@/lib/categories";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { toDisplayFacts, collectDeadlines } from "@/lib/analysis/display";
import { documentTypeToCategory } from "@/lib/analysis/llm";
import type { AnalysisStatus } from "@/lib/analysis/types";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_ANALYZE_BYTES = 15 * 1024 * 1024;
const ANALYZE_LIMIT_PER_HOUR = 10;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI analysis isn't set up yet on this deployment. The site owner needs to add an Anthropic (Claude) API key.",
      },
      { status: 503 }
    );
  }

  let documentId: string | undefined;
  let timeZone: string | undefined;
  try {
    const body = await request.json();
    documentId = body.documentId;
    timeZone =
      typeof body.timeZone === "string" && body.timeZone.trim()
        ? body.timeZone.trim()
        : GUARDIAN_TIME_ZONE;
  } catch {
    // fall through
  }
  if (!timeZone) timeZone = GUARDIAN_TIME_ZONE;
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, file_path, mime_type, size_bytes, category, profile_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.size_bytes > MAX_ANALYZE_BYTES) {
    return NextResponse.json(
      { error: "This document is too large to analyze." },
      { status: 413 }
    );
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("analysis_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", hourAgo);
  if (countError) {
    return NextResponse.json(
      { error: "We couldn't start the analysis. Please try again." },
      { status: 502 }
    );
  }
  if ((count ?? 0) >= ANALYZE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      {
        error:
          "You've reached the analysis limit for now. Try again in about an hour.",
      },
      { status: 429 }
    );
  }

  // Count successful analyses only (insert after save) so timeouts/failures
  // do not burn the hourly budget.

  const setStatus = async (status: AnalysisStatus) => {
    await supabase
      .from("documents")
      .update({ analysis_status: status })
      .eq("id", doc.id);
  };

  await setStatus("extracting");

  const { data: file, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.file_path);
  if (downloadError || !file) {
    await setStatus("failed");
    return NextResponse.json(
      { error: "We couldn't read the stored file. Try again in a moment." },
      { status: 502 }
    );
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const { data: accountProfile } = await supabase
    .from("profiles")
    .select("full_name, email, company_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: guardianProfile } = doc.profile_id
    ? await supabase
        .from("guardian_profiles")
        .select(
          "id, profile_type, display_name, business_legal_name, organization_name"
        )
        .eq("id", doc.profile_id)
        .eq("owner_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const companyName =
    (guardianProfile?.profile_type === "business" ||
      guardianProfile?.profile_type === "non_profit"
      ? guardianProfile.business_legal_name || guardianProfile.display_name
      : guardianProfile?.organization_name) ||
    accountProfile?.company_name ||
    null;

  try {
    const result = await runAnalysisPipeline(
      {
        mimeType: doc.mime_type,
        fileName: doc.file_name,
        base64,
      },
      {
        fullName:
          guardianProfile?.display_name ?? accountProfile?.full_name ?? null,
        email: accountProfile?.email ?? user.email ?? null,
        companyName,
        timeZone: timeZone ?? null,
      },
      setStatus
    );

    const { analysis, classification, routedTo, model } = result;
    const facts = toDisplayFacts(analysis, timeZone);
    const finalStatus: AnalysisStatus =
      analysis.guardian_status === "needs_verification"
        ? "needs_verification"
        : "completed";

    const profileId = doc.profile_id as string;

    const { error: saveError } = await supabase.from("extracted_data").upsert(
      {
        document_id: doc.id,
        user_id: user.id,
        profile_id: profileId,
        summary: analysis.summary,
        facts,
        model,
        document_type: analysis.document_type,
        document_subtype: classification.document_subtype,
        classification_confidence: classification.classification_confidence,
        guardian_status: analysis.guardian_status,
        overall_confidence: analysis.overall_confidence,
        warnings: analysis.warnings,
        specialist: {
          ...analysis.specialist,
          routed_to: routedTo,
          classification_reason: classification.classification_reason,
          people: analysis.people,
          organizations: analysis.organizations,
          obligations: analysis.obligations,
          suggested_actions: analysis.suggested_actions,
          important_dates: analysis.important_dates,
          amounts: analysis.amounts,
        },
        title: analysis.title,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "document_id" }
    );
    if (saveError) {
      await setStatus("failed");
      return NextResponse.json(
        { error: "Analysis finished but couldn't be saved. Please try again." },
        { status: 500 }
      );
    }

    await supabase.from("analysis_events").insert({ user_id: user.id });

    let suggestedCategory: string | null = null;
    if (!doc.category) {
      const cat = documentTypeToCategory(analysis.document_type);
      if (isDocumentCategory(cat)) {
        const { error: categoryError } = await supabase
          .from("documents")
          .update({ category: cat })
          .eq("id", doc.id);
        if (!categoryError) suggestedCategory = cat;
      }
    }

    const deadlines = collectDeadlines(analysis, doc.file_name);
    await supabase.from("alerts").delete().eq("document_id", doc.id);
    if (deadlines.length > 0) {
      await supabase.from("alerts").insert(
        deadlines.map((d) => ({
          document_id: doc.id,
          user_id: user.id,
          profile_id: profileId,
          title: d.title,
          due_date: d.due_date,
          source: "document",
        }))
      );
    }

    // Best-effort vault RAG index (requires OPENAI_API_KEY for embeddings).
    try {
      const { indexDocumentForVault } = await import("@/lib/vault/indexDocument");
      await indexDocumentForVault({
        supabase,
        userId: user.id,
        profileId,
        documentId: doc.id,
        fileName: doc.file_name,
        source: {
          title: analysis.title,
          summary: analysis.summary,
          documentType: analysis.document_type,
          facts,
          warnings: analysis.warnings,
          specialist: analysis.specialist,
        },
      });
    } catch (indexErr) {
      console.error(
        "Vault index after analyze failed:",
        indexErr instanceof Error ? indexErr.message : "error"
      );
    }

    await setStatus(finalStatus);

    return NextResponse.json({
      summary: analysis.summary,
      facts,
      model,
      analyzedAt: new Date().toISOString(),
      category: suggestedCategory,
      documentType: analysis.document_type,
      documentSubtype: classification.document_subtype,
      classificationConfidence: classification.classification_confidence,
      classificationReason: classification.classification_reason,
      routedTo,
      guardianStatus: analysis.guardian_status,
      overallConfidence: analysis.overall_confidence,
      title: analysis.title,
      warnings: analysis.warnings,
      analysisStatus: finalStatus,
      ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && "message" in err) {
      const status = Number((err as { status: number }).status) || 502;
      const message = String((err as { message: string }).message);
      console.error(
        "Document analysis pipeline failed:",
        (err as { code?: string }).code ?? (err instanceof Error ? err.name : "error"),
        status
      );
      await setStatus("failed");
      return NextResponse.json({ error: message }, { status });
    }
    console.error(
      "Document analysis pipeline failed:",
      err instanceof Error ? err.name : "error"
    );
    await setStatus("failed");
    return NextResponse.json(
      { error: "The AI service couldn't analyze this document. Please try again." },
      { status: 502 }
    );
  }
}
