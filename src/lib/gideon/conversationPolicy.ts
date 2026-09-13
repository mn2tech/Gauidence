const DAILY_LOG_REQUEST =
  /\b(daily log|save (?:this|that|it)|remember (?:this|that|it)|add (?:this|that|it) to (?:today|my space))\b/i;

const SUGGESTION_SECTION =
  /\n*#{1,3}\s*GIDEON'S SUGGESTION\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/gi;

/** Remove a reflexive Daily Log pitch when the user only asked for a fact. */
export function enforceConversationPolicy(
  answer: string,
  userQuestion: string
): string {
  if (!answer.trim() || DAILY_LOG_REQUEST.test(userQuestion)) return answer;

  return answer
    .replace(SUGGESTION_SECTION, (section, body: string) =>
      /\bdaily log\b/i.test(body) ? "" : section
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
