/**
 * Infer / update the active conversational goal.
 * Follow-ups keep the existing goal; clear goal shifts replace it.
 */

import type { RuntimeIntent } from "./types";

export function inferActiveGoal(args: {
  message: string;
  intent: RuntimeIntent;
  previousGoal: string | null;
  entityNames?: string[];
}): string | null {
  const { message, intent, previousGoal, entityNames = [] } = args;
  const q = message.trim();
  const entityHint =
    entityNames.length > 0 ? ` involving ${entityNames.slice(0, 3).join(", ")}` : "";

  const followUpIntents: RuntimeIntent[] = [
    "follow_up",
    "clarification",
    "qualification_analysis",
    "drafting",
    "summarize",
    "compare",
  ];

  // Preserve goal on follow-ups unless a strong new goal phrase appears
  const strongNewGoal =
    /\b(find|locate|look up|search for|who is|tell me about|review|start over|new (topic|subject))\b/i.test(
      q
    ) &&
    intent !== "follow_up" &&
    intent !== "qualification_analysis" &&
    intent !== "drafting";

  if (previousGoal && followUpIntents.includes(intent) && !strongNewGoal) {
    return previousGoal;
  }

  switch (intent) {
    case "opportunity_lookup":
      return `Locate or evaluate opportunity${entityHint || " from the user's request"}`;
    case "qualification_analysis":
      return (
        previousGoal?.replace(/^(Locate|Find)/i, "Evaluate qualification for") ??
        `Determine qualification${entityHint}`
      );
    case "drafting":
      return (
        previousGoal?.replace(
          /^(Locate|Evaluate|Determine|Identify).*/i,
          "Prepare response"
        ) ?? `Prepare a draft response${entityHint}`
      );
    case "person_lookup":
      return `Identify person${entityHint || " mentioned by the user"}`;
    case "document_lookup":
      return `Retrieve document or communication${entityHint}`;
    case "planning":
      return `Plan next steps${entityHint}`;
    case "action_request":
      return `Handle requested action${entityHint}`;
    case "summarize":
      return previousGoal ?? `Summarize current topic${entityHint}`;
    case "compare":
      return `Compare options${entityHint}`;
    case "knowledge_lookup":
      return previousGoal && !strongNewGoal
        ? previousGoal
        : `Look up knowledge${entityHint}`;
    case "follow_up":
      return previousGoal;
    case "clarification":
      return previousGoal;
    default:
      if (previousGoal && q.length < 60) return previousGoal;
      if (/\b(find|locate)\b/i.test(q)) {
        return `Locate requested information${entityHint}`;
      }
      return previousGoal;
  }
}
