/**
 * Lightweight runtime intent classification (continuity-focused).
 * Separate from capability router intents in intent.ts.
 */

import type { RuntimeIntent } from "./types.ts";

export function classifyRuntimeIntent(
  message: string,
  opts?: { hadPriorContext?: boolean }
): RuntimeIntent {
  const q = message.trim();
  if (!q) return "general_question";

  if (
    /^(what do you mean|which (one|person|org)|can you clarify|who do you mean)\b/i.test(
      q
    ) ||
    /\b(clarify|ambiguous|which (he|she|they|it))\b/i.test(q)
  ) {
    return "clarification";
  }

  if (
    /\b(are we qualified|are we eligible|qualification|qualify|do we meet|can we bid)\b/i.test(
      q
    )
  ) {
    return "qualification_analysis";
  }

  if (
    /\b(draft|write|compose|help me respond|prepare (a |the )?response|make it shorter|rewrite)\b/i.test(
      q
    )
  ) {
    return "drafting";
  }

  if (
    /\b(plan|planning|what should we do|next steps|roadmap)\b/i.test(q)
  ) {
    return "planning";
  }

  if (
    /\b(remind me|schedule|set a reminder|create a task|add (a )?task|send|email them)\b/i.test(
      q
    )
  ) {
    return "action_request";
  }

  if (/\b(compare|versus|vs\.?|difference between)\b/i.test(q)) {
    return "compare";
  }

  if (/\b(summarize|summarise|recap|tldr|overview)\b/i.test(q)) {
    return "summarize";
  }

  if (
    /\b(who (is|was|are)|who'?s)\b/i.test(q) ||
    /\b(the (woman|man|person|contact) (from|at|I mentioned))\b/i.test(q)
  ) {
    return "person_lookup";
  }

  if (
    /\b(BPM\s*\d+|solicitation|RFI|RFP|opportunity|contract award)\b/i.test(q) ||
    /\b(find|locate|look up)\b.{0,40}\b(solicitation|opportunity|BPM)\b/i.test(q)
  ) {
    return "opportunity_lookup";
  }

  if (
    /\b(document|email|pdf|file|proposal|handbook|that (email|document))\b/i.test(
      q
    ) ||
    /\b(open|show|find)\b.{0,30}\b(document|email|file|pdf)\b/i.test(q)
  ) {
    return "document_lookup";
  }

  if (
    /\b(what (are|do) we (know|have)|search|look up|find|tell me about|where did you get)\b/i.test(
      q
    )
  ) {
    return "knowledge_lookup";
  }

  // Short deictic / pronoun-heavy follow-ups
  if (
    opts?.hadPriorContext &&
    (q.length < 80 ||
      /\b(it|that|this|they|them|he|she|we|our|the (previous|same) one)\b/i.test(
        q
      ))
  ) {
    return "follow_up";
  }

  if (
    opts?.hadPriorContext &&
    /^(and |also |what about |how about |did they |are we |what are we )\b/i.test(
      q
    )
  ) {
    return "follow_up";
  }

  return "general_question";
}
