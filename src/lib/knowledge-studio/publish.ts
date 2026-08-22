import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function publishKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await args.admin
    .from("knowledge_facts")
    .update({
      lifecycle_status: "published",
      visibility: "public",
      published_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveKnowledgeFact(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await args.admin
    .from("knowledge_facts")
    .update({
      lifecycle_status: "archived",
      visibility: "private",
    })
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function publishKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await args.admin
    .from("knowledge_events")
    .update({
      lifecycle_status: "published",
      visibility: "public",
      published_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveKnowledgeEvent(args: {
  admin: SupabaseClient;
  id: string;
  organizationSlug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await args.admin
    .from("knowledge_events")
    .update({
      lifecycle_status: "archived",
      visibility: "private",
    })
    .eq("id", args.id)
    .eq("organization_slug", args.organizationSlug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
