const BINARY_QUESTION_START =
  /^(?:want me to|would you like me to|would you like to|should i|shall i|can i|may i|do you want me to|do you want to|would it help if i|ready for me to|is it okay if i)\b/i;

/**
 * Returns true when Gideon's final question can be answered meaningfully with
 * a simple yes or no. Keeping this intentionally narrow prevents generic
 * questions such as "What should I do next?" from receiving misleading chips.
 */
export function hasBinaryFollowUp(text: string): boolean {
  const normalized = text
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/[*_`>#]/g, "")
    .trim();

  if (!normalized.endsWith("?")) return false;

  const finalQuestion =
    normalized
      .split(/(?:\n\s*\n|(?<=[.!?])\s+)/)
      .filter(Boolean)
      .at(-1)
      ?.trim() ?? "";

  return BINARY_QUESTION_START.test(finalQuestion);
}
