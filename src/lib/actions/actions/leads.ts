import { answerLeadsGideonQuery, wantsLeadsQuery } from "@/lib/leads/gideonChat";
import { LEADS_AGENT_SYSTEM_NOTE } from "@/lib/leads/gideonQuery";
import { resolveOrgWorkspaceId } from "../orgProfile";
import type { ActionDefinition } from "../types";

export const leadsAction: ActionDefinition = {
  id: "leads",
  label: "Leads",
  description: "Show, add, or update business leads from Ask Gideon.",
  matches: (question) => wantsLeadsQuery(question),
  systemNote: () => LEADS_AGENT_SYSTEM_NOTE,
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Checking leads pipeline",
    "Preparing lead answer",
  ],
  executeDirect: async (ctx) => {
    if (!ctx.supabase) return null;
    const profileId = resolveOrgWorkspaceId(ctx.activeProfile);
    if (!profileId) {
      return {
        message:
          "Switch to a business workspace to manage leads.\n\n→ /leads",
        href: "/leads",
      };
    }

    const answer = await answerLeadsGideonQuery(ctx.supabase, {
      query: ctx.question,
      profileId,
      userId: ctx.userId,
      confirmed: ctx.confirmed,
      chatHistory: ctx.chatHistory,
    });
    if (!answer) return null;

    let message = answer.message;
    if (answer.href && !message.includes(answer.href)) {
      message += `\n\n→ ${answer.href}`;
    }
    if (answer.requiresConfirmation) {
      message += '\n\nReply "yes, add this lead" or "yes, mark it" to confirm.';
    }
    return {
      message,
      requiresConfirmation: answer.requiresConfirmation,
      intent: answer.intent,
      href: answer.href,
    };
  },
};
