import type {
  KnowledgeLifecycle,
  KnowledgeVisibility,
} from "./types";

export type LifecycleFilter =
  | "all"
  | "draft"
  | "needs_review"
  | "published"
  | "archived";

export type LifecyclePatch = {
  lifecycle_status?: KnowledgeLifecycle;
  visibility?: KnowledgeVisibility;
  published_at?: string | null;
};

export const LIFECYCLE_SUCCESS_MESSAGES = {
  published:
    "Published. Attendees can now access this knowledge.",
  unpublished:
    "Knowledge unpublished. It is no longer available to attendees.",
  archived: "Knowledge archived.",
  restored: "Knowledge restored as draft.",
  editPublished:
    "Changes saved. Review and republish this item before attendees can see it.",
  editDraft: "Changes saved.",
  deleted: "Draft deleted.",
} as const;

export function isPubliclyRetrievable(row: {
  lifecycle_status: string;
  visibility: string;
}): boolean {
  return (
    row.lifecycle_status === "published" && row.visibility === "public"
  );
}

export function canHardDelete(row: { lifecycle_status: string }): boolean {
  return row.lifecycle_status === "draft";
}

export function publishPatch(now: Date = new Date()): LifecyclePatch {
  return {
    lifecycle_status: "published",
    visibility: "public",
    published_at: now.toISOString(),
  };
}

export function unpublishPatch(): LifecyclePatch {
  return {
    lifecycle_status: "approved",
    visibility: "private",
    published_at: null,
  };
}

export function archivePatch(): LifecyclePatch {
  return {
    lifecycle_status: "archived",
    visibility: "private",
    published_at: null,
  };
}

export function restorePatch(): LifecyclePatch {
  return {
    lifecycle_status: "draft",
    visibility: "private",
    published_at: null,
  };
}

export function editLifecyclePatch(
  currentStatus: KnowledgeLifecycle
): LifecyclePatch {
  if (currentStatus === "published") {
    return {
      lifecycle_status: "needs_review",
      visibility: "private",
      published_at: null,
    };
  }
  return {};
}

export function editSuccessMessage(
  previousStatus: KnowledgeLifecycle
): string {
  if (previousStatus === "published") {
    return LIFECYCLE_SUCCESS_MESSAGES.editPublished;
  }
  return LIFECYCLE_SUCCESS_MESSAGES.editDraft;
}

export function matchesLifecycleFilter(
  status: string,
  filter: LifecycleFilter
): boolean {
  if (filter === "all") return true;
  return status === filter;
}

export function previewText(text: string, max = 200): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export type FactEditFields = {
  category?: string;
  title?: string;
  content?: string;
  source_label?: string | null;
  source_url?: string | null;
};

export type EventEditFields = {
  title?: string;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  location?: string | null;
  organizer?: string | null;
  contact?: string | null;
  rsvp_url?: string | null;
  cost?: string | null;
  audience?: string | null;
  source_label?: string | null;
  source_url?: string | null;
};

export function buildFactEditUpdate(
  currentStatus: KnowledgeLifecycle,
  fields: FactEditFields
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.category !== undefined) patch.category = fields.category.trim();
  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.content !== undefined) patch.content = fields.content.trim();
  if (fields.source_label !== undefined) {
    patch.source_label = fields.source_label?.trim() || null;
  }
  if (fields.source_url !== undefined) {
    patch.source_url = fields.source_url?.trim() || null;
  }
  return { ...patch, ...editLifecyclePatch(currentStatus) };
}

export function buildEventEditUpdate(
  currentStatus: KnowledgeLifecycle,
  fields: EventEditFields
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.description !== undefined) {
    patch.description = fields.description?.trim() || null;
  }
  if (fields.start_at !== undefined) {
    patch.start_at = fields.start_at?.trim() || null;
  }
  if (fields.end_at !== undefined) {
    patch.end_at = fields.end_at?.trim() || null;
  }
  if (fields.location !== undefined) {
    patch.location = fields.location?.trim() || null;
  }
  if (fields.organizer !== undefined) {
    patch.organizer = fields.organizer?.trim() || null;
  }
  if (fields.contact !== undefined) {
    patch.contact = fields.contact?.trim() || null;
  }
  if (fields.rsvp_url !== undefined) {
    patch.rsvp_url = fields.rsvp_url?.trim() || null;
  }
  if (fields.cost !== undefined) patch.cost = fields.cost?.trim() || null;
  if (fields.audience !== undefined) {
    patch.audience = fields.audience?.trim() || null;
  }
  if (fields.source_label !== undefined) {
    patch.source_label = fields.source_label?.trim() || null;
  }
  if (fields.source_url !== undefined) {
    patch.source_url = fields.source_url?.trim() || null;
  }
  return { ...patch, ...editLifecyclePatch(currentStatus) };
}

export function canPublish(status: KnowledgeLifecycle): boolean {
  return (
    status === "draft" ||
    status === "needs_review" ||
    status === "approved"
  );
}

export function canUnpublish(status: KnowledgeLifecycle): boolean {
  return status === "published";
}

export function canArchive(status: KnowledgeLifecycle): boolean {
  return status !== "archived";
}

export function canRestore(status: KnowledgeLifecycle): boolean {
  return status === "archived";
}

export function canEdit(status: KnowledgeLifecycle): boolean {
  return status !== "archived";
}
