/** Operational vision logs — never include extracted image content. */

export type VisionLogEvent =
  | "image_uploaded"
  | "vision_job_queued"
  | "vision_started"
  | "vision_completed"
  | "vision_failed";

export function logVisionEvent(
  event: VisionLogEvent,
  fields: {
    documentId?: string | null;
    spaceId?: string | null;
    durationMs?: number;
    model?: string | null;
    error?: string | null;
  }
): void {
  console.info(
    "guardian_vision",
    JSON.stringify({
      event,
      document_id: fields.documentId ?? undefined,
      space_id: fields.spaceId ?? undefined,
      duration_ms: fields.durationMs,
      model: fields.model ?? undefined,
      error: fields.error ? String(fields.error).slice(0, 180) : undefined,
    })
  );
}
