import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archivePatch,
  buildEventEditUpdate,
  buildFactEditUpdate,
  canHardDelete,
  canRestore,
  publishPatch,
  restorePatch,
  unpublishPatch,
  type EventEditFields,
  type FactEditFields,
} from "./lifecycle";
import type { KnowledgeEventRow, KnowledgeFactRow } from "./types";

type MutationResult =
  | { ok: true; row?: KnowledgeFactRow | KnowledgeEventRow }
  | { ok: false; error: string; status?: number };

async function fetchFact(
  admin: SupabaseClient,
  id: string,
  organizationSlug: string
): Promise<KnowledgeFactRow | null> {
  const { data } = await admin
    .from("knowledge_facts")
    .select("*")
    .eq("id", id)
    .eq("organization_slug", organizationSlug)
    .maybeSingle();
  return (data as KnowledgeFactRow | null) ?? null;
}

async function fetchEvent(
  admin: SupabaseClient,
  id: string,
  organizationSlug: string
): Promise<KnowledgeEventRow | null> {
  const { data } = await admin
    .from("knowledge_events")
    .select("*")
    .eq("id", id)
    .eq("organization_slug", organizationSlug)
    .maybeSingle();
  return (data as KnowledgeEventRow | null) ?? null;
}

export async function publishKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const { error } = await args.admin
    .from("knowledge_facts")
    .update(publishPatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unpublishKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchFact(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Fact not found.", status: 404 };
  if (row.lifecycle_status !== "published") {
    return { ok: false, error: "Only published facts can be unpublished.", status: 400 };
  }
  const { error } = await args.admin
    .from("knowledge_facts")
    .update(unpublishPatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const { error } = await args.admin
    .from("knowledge_facts")
    .update(archivePatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchFact(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Fact not found.", status: 404 };
  if (!canRestore(row.lifecycle_status)) {
    return { ok: false, error: "Only archived facts can be restored.", status: 400 };
  }
  const { error } = await args.admin
    .from("knowledge_facts")
    .update(restorePatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function editKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
  fields: FactEditFields;
}): Promise<MutationResult> {
  const row = await fetchFact(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Fact not found.", status: 404 };
  if (row.lifecycle_status === "archived") {
    return { ok: false, error: "Archived facts cannot be edited.", status: 400 };
  }
  const update = buildFactEditUpdate(row.lifecycle_status, args.fields);
  if (typeof update.title === "string" && !update.title.trim()) {
    return { ok: false, error: "Title is required.", status: 400 };
  }
  if (typeof update.content === "string" && !update.content.trim()) {
    return { ok: false, error: "Content is required.", status: 400 };
  }
  const { data, error } = await args.admin
    .from("knowledge_facts")
    .update(update)
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as KnowledgeFactRow };
}

export async function deleteDraftKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchFact(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Fact not found.", status: 404 };
  if (!canHardDelete(row)) {
    return {
      ok: false,
      error: "Only draft facts can be deleted.",
      status: 400,
    };
  }
  const { error } = await args.admin
    .from("knowledge_facts")
    .delete()
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function publishKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const { error } = await args.admin
    .from("knowledge_events")
    .update(publishPatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unpublishKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchEvent(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Event not found.", status: 404 };
  if (row.lifecycle_status !== "published") {
    return { ok: false, error: "Only published events can be unpublished.", status: 400 };
  }
  const { error } = await args.admin
    .from("knowledge_events")
    .update(unpublishPatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const { error } = await args.admin
    .from("knowledge_events")
    .update(archivePatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchEvent(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Event not found.", status: 404 };
  if (!canRestore(row.lifecycle_status)) {
    return { ok: false, error: "Only archived events can be restored.", status: 400 };
  }
  const { error } = await args.admin
    .from("knowledge_events")
    .update(restorePatch())
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function editKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
  fields: EventEditFields;
}): Promise<MutationResult> {
  const row = await fetchEvent(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Event not found.", status: 404 };
  if (row.lifecycle_status === "archived") {
    return { ok: false, error: "Archived events cannot be edited.", status: 400 };
  }
  const update = buildEventEditUpdate(row.lifecycle_status, args.fields);
  if (typeof update.title === "string" && !update.title.trim()) {
    return { ok: false, error: "Title is required.", status: 400 };
  }
  const { data, error } = await args.admin
    .from("knowledge_events")
    .update(update)
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as KnowledgeEventRow };
}

export async function deleteDraftKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<MutationResult> {
  const row = await fetchEvent(args.admin, args.id, args.organizationSlug);
  if (!row) return { ok: false, error: "Event not found.", status: 404 };
  if (!canHardDelete(row)) {
    return {
      ok: false,
      error: "Only draft events can be deleted.",
      status: 400,
    };
  }
  const { error } = await args.admin
    .from("knowledge_events")
    .delete()
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
