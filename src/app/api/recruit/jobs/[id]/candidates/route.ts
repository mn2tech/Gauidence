import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  getRecruitmentJob,
  listCandidatesWithDetails,
  logRecruitAudit,
} from "@/lib/recruit/server";
import {
  ACCEPTED_RESUME_TYPES,
  CANDIDATE_SELECT,
  MAX_RESUME_BYTES,
  type RecruitmentCandidate,
} from "@/lib/recruit/types";
import { hashFileBuffer } from "@/lib/recruit/process";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const candidates = await listCandidatesWithDetails(auth.supabase, id);
  return NextResponse.json({ candidates });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one resume file." },
      { status: 400 }
    );
  }

  const results: {
    fileName: string;
    ok: boolean;
    candidateId?: string;
    error?: string;
    duplicate?: boolean;
  }[] = [];

  for (const file of files) {
    if (!ACCEPTED_RESUME_TYPES[file.type] && !file.name.match(/\.(pdf|docx|txt)$/i)) {
      results.push({
        fileName: file.name,
        ok: false,
        error: "Unsupported file type. Use PDF, DOCX, or TXT.",
      });
      continue;
    }

    if (file.size > MAX_RESUME_BYTES) {
      results.push({
        fileName: file.name,
        ok: false,
        error: "File exceeds 15 MB limit.",
      });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = hashFileBuffer(buffer);

    const { data: existingHash } = await auth.supabase
      .from("recruitment_candidate_files")
      .select("id")
      .eq("job_id", jobId)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (existingHash) {
      results.push({
        fileName: file.name,
        ok: false,
        duplicate: true,
        error: "This resume was already uploaded for this job.",
      });
      continue;
    }

    const mimeType =
      file.type ||
      (file.name.endsWith(".pdf")
        ? "application/pdf"
        : file.name.endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain");

    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    const path = `${job.owner_user_id}/${job.profile_id}/recruit/${jobId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await auth.supabase.storage
      .from("documents")
      .upload(path, buffer, { contentType: mimeType });

    if (uploadError) {
      results.push({
        fileName: file.name,
        ok: false,
        error: "Upload failed.",
      });
      continue;
    }

    const { data: candidate, error: candidateError } = await auth.supabase
      .from("recruitment_candidates")
      .insert({
        job_id: jobId,
        processing_status: "pending",
      })
      .select(CANDIDATE_SELECT)
      .single();

    if (candidateError || !candidate) {
      await auth.supabase.storage.from("documents").remove([path]);
      results.push({
        fileName: file.name,
        ok: false,
        error: "Could not create candidate record.",
      });
      continue;
    }

    const { error: fileError } = await auth.supabase
      .from("recruitment_candidate_files")
      .insert({
        candidate_id: candidate.id,
        job_id: jobId,
        file_name: file.name,
        file_path: path,
        mime_type: mimeType,
        size_bytes: file.size,
        file_hash: fileHash,
      });

    if (fileError) {
      await auth.supabase
        .from("recruitment_candidates")
        .delete()
        .eq("id", candidate.id);
      await auth.supabase.storage.from("documents").remove([path]);
      results.push({
        fileName: file.name,
        ok: false,
        error: fileError.message.includes("job_hash")
          ? "Duplicate resume detected."
          : "Could not save file record.",
      });
      continue;
    }

    await logRecruitAudit(auth.supabase, {
      jobId,
      candidateId: candidate.id,
      actorUserId: auth.user.id,
      action: "resume_uploaded",
      details: { file_name: file.name },
    });

    results.push({
      fileName: file.name,
      ok: true,
      candidateId: candidate.id,
    });
  }

  const successCount = results.filter((r) => r.ok).length;
  if (successCount > 0) {
    await auth.supabase
      .from("recruitment_jobs")
      .update({
        current_step: "upload_resumes",
        status: "uploading",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  return NextResponse.json({ results }, { status: successCount > 0 ? 201 : 400 });
}
