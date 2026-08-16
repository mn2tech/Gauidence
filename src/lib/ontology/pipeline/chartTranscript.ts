/**
 * Chart transcript cleanup — drop OCR/UI chrome and practice-template junk.
 */

const DROP_LINE =
  /^(share(\s+with)?|upload chord|group members?|specify practice|check the song list|songname_chart|template placeholder|fill in the song|members will|group will|consider the spiritual|if this is for a worship|use this chart during|practice playing the song|note that the chorus|repeats after each|spiritual surrender|practice the chord transitions|share with other musicians|populate the song list|conduct wednesday practice|log notes afterward)\b/i;

const DROP_NUMBERED =
  /^\d+\.\s*(share|specify|upload|group|members|fill|check|consider|practice playing|use this chart|note that|repeats|spiritual|if this is|populate|conduct|log notes)/i;

/** Remove practice-template / UI noise from vision chart transcripts. */
export function sanitizeChartTranscript(text: string): string {
  const lines = text.split(/\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (DROP_LINE.test(t) || DROP_NUMBERED.test(t)) continue;
    if (/^songname_chart_key/i.test(t)) continue;
    if (/^\(\s*template placeholders?\s*\)$/i.test(t)) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when an ontology entity name looks like the requested song title. */
export function entityMatchesSongTitle(
  entityName: string,
  titlePhrase: string
): boolean {
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const phrase = titlePhrase.trim().toLowerCase();
  if (phrase.length < 4) return false;
  const p = compact(phrase);
  const hay = compact(entityName);
  if (!p || !hay) return false;
  if (hay.includes(p) || p.includes(hay)) return true;

  const tokens = phrase.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length < 2) return hay.includes(compact(tokens[0] ?? ""));
  const name = entityName.toLowerCase();
  const hits = tokens.filter((t) => name.includes(t)).length;
  return hits >= Math.ceil(tokens.length * 0.6) && hits >= 2;
}
