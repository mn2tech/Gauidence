/**
 * Pick a male-leaning English voice for Gideon readout.
 * Browser defaults (esp. Windows) are often female — Gideon is male.
 */

export type SpeechVoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
};

const FEMALE_HINT =
  /\b(female|woman|zira|susan|samantha|karen|victoria|hazel|jenny|aria|natasha|salli|ivy|joanna|kendra|kimberly|amy|emma|olivia|linda|heather|catherine|moira|fiona|tessa|veena|raveena|aditi|google uk english female|microsoft jenny|microsoft aria|microsoft michelle|microsoft ana)\b/i;

const MALE_HINT =
  /\b(male|man|david|mark|guy|james|daniel|alex|fred|tom|aaron|brian|andrew|christopher|eric|davis|ryan|nathan|matthew|justin|joey|russell|wayne|google uk english male|microsoft david|microsoft mark|microsoft guy|microsoft andrew|microsoft ryan|microsoft eric|microsoft christopher|microsoft davis|microsoft steffan)\b/i;

function isEnglish(lang: string): boolean {
  return /^en([-_]|$)/i.test(lang.trim());
}

function scoreVoice(voice: SpeechVoiceLike): number {
  const name = voice.name || "";
  const lang = voice.lang || "";
  let score = 0;

  if (isEnglish(lang)) score += 40;
  else return -1000;

  if (FEMALE_HINT.test(name)) score -= 80;
  if (MALE_HINT.test(name)) score += 100;

  // Prefer US English slightly for Gideon product voice consistency.
  if (/^en-?US$/i.test(lang.replace("_", "-"))) score += 8;
  if (voice.localService) score += 5;
  if (voice.default) score += 1;

  return score;
}

/**
 * Choose the best available voice for Gideon. Returns null if the list is empty.
 */
export function pickGideonSpeechVoice<T extends SpeechVoiceLike>(
  voices: T[]
): T | null {
  if (!voices.length) return null;

  const ranked = [...voices]
    .map((v) => ({ v, score: scoreVoice(v) }))
    .filter((r) => r.score > -500)
    .sort((a, b) => b.score - a.score);

  if (ranked.length && ranked[0]!.score >= 100) {
    return ranked[0]!.v;
  }

  // Fall back to best English non-female voice.
  const nonFemale = ranked.filter((r) => !FEMALE_HINT.test(r.v.name));
  if (nonFemale.length) return nonFemale[0]!.v;

  // Last resort: any English voice.
  return ranked[0]?.v ?? voices.find((v) => isEnglish(v.lang)) ?? voices[0]!;
}
