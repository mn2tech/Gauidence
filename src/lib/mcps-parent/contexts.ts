import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_PARENT_SCHOOL_CONTEXTS } from "./constants";
import {
  canAddParentContext,
  isDuplicateSchoolGrade,
  pickPrimaryAfterDelete,
  validateContextInput,
} from "./family";
import type { ParentSchoolContext } from "./types";

function mapRow(row: Record<string, unknown>): ParentSchoolContext {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    label: (row.label as string | null) ?? null,
    school_name: row.school_name as string,
    school_id: (row.school_id as string | null) ?? null,
    grade_level: row.grade_level as string,
    is_primary: Boolean(row.is_primary),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listParentSchoolContexts(
  supabase: SupabaseClient,
  userId: string
): Promise<ParentSchoolContext[]> {
  const { data, error } = await supabase
    .from("parent_school_contexts")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getPrimarySchoolContext(
  supabase: SupabaseClient,
  userId: string
): Promise<ParentSchoolContext | null> {
  const { data } = await supabase
    .from("parent_school_contexts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getParentSchoolContextById(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<ParentSchoolContext | null> {
  const { data } = await supabase
    .from("parent_school_contexts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function createParentSchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  schoolName: string;
  gradeLevel: string;
  label?: string | null;
  makePrimary?: boolean;
}): Promise<ParentSchoolContext> {
  const input = validateContextInput({
    schoolName: args.schoolName,
    gradeLevel: args.gradeLevel,
    label: args.label,
  });
  const existing = await listParentSchoolContexts(args.supabase, args.userId);
  if (!canAddParentContext(existing.length)) {
    throw new Error(
      `Guardian currently supports up to ${MAX_PARENT_SCHOOL_CONTEXTS} school profiles per parent account.`
    );
  }
  if (
    isDuplicateSchoolGrade({
      existing,
      schoolName: input.school_name,
      gradeLevel: input.grade_level,
      label: input.label,
    })
  ) {
    throw new Error(
      "That school and grade is already saved. Use a different label if this is another child."
    );
  }

  const makePrimary =
    existing.length === 0 || Boolean(args.makePrimary);

  if (makePrimary && existing.length > 0) {
    await args.supabase
      .from("parent_school_contexts")
      .update({ is_primary: false })
      .eq("user_id", args.userId)
      .eq("is_primary", true);
  }

  const { data, error } = await args.supabase
    .from("parent_school_contexts")
    .insert({
      user_id: args.userId,
      school_name: input.school_name,
      grade_level: input.grade_level,
      label: input.label,
      is_primary: makePrimary || existing.length === 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save.");
  return mapRow(data as Record<string, unknown>);
}

export async function updateParentSchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  id: string;
  schoolName?: string;
  gradeLevel?: string;
  label?: string | null;
  makePrimary?: boolean;
}): Promise<ParentSchoolContext> {
  const current = await getParentSchoolContextById(
    args.supabase,
    args.userId,
    args.id
  );
  if (!current) throw new Error("School profile not found.");

  const school_name =
    args.schoolName !== undefined
      ? args.schoolName.trim().slice(0, 200)
      : current.school_name;
  const grade_level =
    args.gradeLevel !== undefined
      ? args.gradeLevel.trim().slice(0, 40)
      : current.grade_level;
  const label =
    args.label !== undefined
      ? args.label === null
        ? null
        : args.label.trim().slice(0, 80) || null
      : current.label;

  if (!school_name) throw new Error("School is required.");
  if (!grade_level) throw new Error("Grade is required.");

  const existing = await listParentSchoolContexts(args.supabase, args.userId);
  if (
    isDuplicateSchoolGrade({
      existing,
      schoolName: school_name,
      gradeLevel: grade_level,
      label,
      excludeId: args.id,
    })
  ) {
    throw new Error(
      "That school and grade is already saved. Use a different label if this is another child."
    );
  }

  if (args.makePrimary) {
    await args.supabase
      .from("parent_school_contexts")
      .update({ is_primary: false })
      .eq("user_id", args.userId)
      .eq("is_primary", true)
      .neq("id", args.id);
  }

  const patch: Record<string, unknown> = {
    school_name,
    grade_level,
    label,
  };
  if (args.makePrimary) patch.is_primary = true;

  const { data, error } = await args.supabase
    .from("parent_school_contexts")
    .update(patch)
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update.");
  return mapRow(data as Record<string, unknown>);
}

export async function setPrimaryParentSchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  id: string;
}): Promise<ParentSchoolContext> {
  const current = await getParentSchoolContextById(
    args.supabase,
    args.userId,
    args.id
  );
  if (!current) throw new Error("School profile not found.");

  await args.supabase
    .from("parent_school_contexts")
    .update({ is_primary: false })
    .eq("user_id", args.userId)
    .eq("is_primary", true);

  const { data, error } = await args.supabase
    .from("parent_school_contexts")
    .update({ is_primary: true })
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not set primary.");
  return mapRow(data as Record<string, unknown>);
}

export async function deleteParentSchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  id: string;
}): Promise<{ deleted: true; new_primary_id: string | null }> {
  const current = await getParentSchoolContextById(
    args.supabase,
    args.userId,
    args.id
  );
  if (!current) throw new Error("School profile not found.");

  const { error } = await args.supabase
    .from("parent_school_contexts")
    .delete()
    .eq("id", args.id)
    .eq("user_id", args.userId);
  if (error) throw new Error(error.message);

  const remaining = await listParentSchoolContexts(args.supabase, args.userId);
  const promoteId = pickPrimaryAfterDelete(remaining, current.is_primary);
  if (promoteId && current.is_primary) {
    await args.supabase
      .from("parent_school_contexts")
      .update({ is_primary: true })
      .eq("id", promoteId)
      .eq("user_id", args.userId);
  } else if (remaining.length === 1 && !remaining[0]!.is_primary) {
    await args.supabase
      .from("parent_school_contexts")
      .update({ is_primary: true })
      .eq("id", remaining[0]!.id)
      .eq("user_id", args.userId);
  }

  return { deleted: true, new_primary_id: promoteId };
}

/** Backward-compatible single-context upsert used by older clients. */
export async function upsertPrimarySchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  schoolName: string;
  gradeLevel: string;
  label?: string | null;
}): Promise<ParentSchoolContext> {
  const existing = await getPrimarySchoolContext(args.supabase, args.userId);
  if (existing) {
    return updateParentSchoolContext({
      supabase: args.supabase,
      userId: args.userId,
      id: existing.id,
      schoolName: args.schoolName,
      gradeLevel: args.gradeLevel,
      label: args.label,
      makePrimary: true,
    });
  }
  return createParentSchoolContext({
    supabase: args.supabase,
    userId: args.userId,
    schoolName: args.schoolName,
    gradeLevel: args.gradeLevel,
    label: args.label,
    makePrimary: true,
  });
}
