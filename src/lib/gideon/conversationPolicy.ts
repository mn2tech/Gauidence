const DAILY_LOG_REQUEST =
  /\b(daily log|save (?:this|that|it)|remember (?:this|that|it)|add (?:this|that|it) to (?:today|my space))\b/i;

const SUGGESTION_SECTION =
  /\n*#{1,3}\s*GIDEON'S SUGGESTION\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/gi;

const ACTION_OR_CONFIRMATION =
  /\b(reminder (?:was |is )?(?:saved|created)|saved to|added to today|uploaded successfully|deleted|removed)\b/i;

function alreadyEndsWithQuestion(answer: string): boolean {
  return answer.trim().endsWith("?");
}

/**
 * Keep a useful Guardian knowledge turn moving with one natural next step.
 * The final question intentionally uses a binary invitation so the chat UI can
 * render its existing Yes / No controls.
 */
export function ensureConversationalContinuation(args: {
  answer: string;
  userQuestion: string;
  suggestedQuestions?: string[];
}): string {
  const answer = args.answer.trim();
  const question = args.userQuestion.trim();
  if (!answer || alreadyEndsWithQuestion(answer)) return answer;
  if (/^(hi|hey|hello|thanks|thank you)\b/i.test(question)) return answer;
  if (DAILY_LOG_REQUEST.test(question) || ACTION_OR_CONFIRMATION.test(answer)) {
    return answer;
  }

  const turn = `${question}\n${answer}`;
  let invitation: string | null = null;

  if (
    /\bchurch(?:es)?\b/i.test(turn) &&
    /\bpastor(?:s|'s)?\b/i.test(turn) &&
    /\b(no current|not (?:listed|available|assigned)|missing|could not find|does not (?:list|show)|doesn'?t (?:list|show))\b/i.test(
      turn
    )
  ) {
    invitation =
      "Would you like me to help you build the missing pastor directory?";
  } else {
    const next = args.suggestedQuestions?.[0]?.replace(/\?+$/, "").trim();
    if (/^show\s+/i.test(next ?? "")) {
      invitation = `Would you like me to ${next![0]!.toLowerCase()}${next!.slice(1)}?`;
    } else if (/^what information is missing$/i.test(next ?? "")) {
      invitation =
        "Would you like me to show you exactly what information is missing?";
    }
  }

  return invitation ? `${answer}\n\n${invitation}` : answer;
}

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
