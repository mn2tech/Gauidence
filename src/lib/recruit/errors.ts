import type { PostgrestError } from "@supabase/supabase-js";

export function recruitDbErrorMessage(
  error: PostgrestError,
  fallback: string
): string {
  const message = error.message?.toLowerCase() ?? "";
  const details = error.details?.toLowerCase() ?? "";
  const combined = `${message} ${details}`;

  if (
    combined.includes("recruitment_") &&
    (combined.includes("does not exist") ||
      combined.includes("schema cache") ||
      combined.includes("could not find the table"))
  ) {
    return "Guardian Recruit isn't set up in the database yet. Run migrations 0048 and 0049 in Supabase SQL Editor.";
  }

  if (
    combined.includes("row-level security") ||
    error.code === "42501"
  ) {
    return "You don't have permission to perform this action in the selected vault.";
  }

  if (process.env.NODE_ENV === "development" && error.message) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}
