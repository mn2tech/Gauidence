import type {
  KnowledgeEntityPreview,
  KnowledgeInput,
  KnowledgeTimelinePreview,
} from "./types";

function toIsoDate(value: string): string | undefined {
  const iso = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return iso[0];

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return undefined;

  const month = Number(slash[1]);
  const day = Number(slash[2]);
  let year = Number(slash[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/** Suggest timeline events from date entities (shadow mode — no persistence). */
export function suggestTimelineEvents(
  input: KnowledgeInput,
  entities: KnowledgeEntityPreview[]
): KnowledgeTimelinePreview[] {
  const dateEntities = entities.filter((e) => e.type === "date");
  const events: KnowledgeTimelinePreview[] = [];

  for (const entity of dateEntities.slice(0, 10)) {
    events.push({
      title: `Date mentioned: ${entity.name}`,
      eventDate: toIsoDate(entity.name),
      category: input.sourceType === "daily_log" ? "daily_log" : "document",
      confidence: entity.confidence ?? 0.7,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  if (events.length === 0 && input.metadata?.logDate) {
    const logDate =
      typeof input.metadata.logDate === "string" ? input.metadata.logDate : null;
    if (logDate) {
      events.push({
        title: "Daily Log entry",
        eventDate: logDate,
        category: "daily_log",
        confidence: 0.9,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
    }
  }

  return events.slice(0, 15);
}
