import { canAccessGuardianRecruit } from "@/lib/features/recruit";
import {
  answerRecruitGideonQuery,
  wantsRecruitQuery,
} from "@/lib/recruit/gideonChat";
import { RECRUIT_AGENT_SYSTEM_NOTE } from "@/lib/recruit/gideonQuery";
import { resolveOrgWorkspaceId } from "../orgProfile";
import type { ActionDefinition } from "../types";

export const recruitAction: ActionDefinition = {
  id: "recruit",
  label: "Recruit",
  description: "Show hiring jobs, candidates, and shortlists from Ask Gideon.",
  matches: (question, ctx) => {
    if (!canAccessGuardianRecruit({ email: ctx.userEmail })) return false;
    return wantsRecruitQuery(question);
  },
  systemNote: () => RECRUIT_AGENT_SYSTEM_NOTE,
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Checking Recruit jobs",
    "Preparing hiring answer",
  ],
  executeDirect: async (ctx) => {
    if (!ctx.supabase) return null;
    const profileId = resolveOrgWorkspaceId(ctx.activeProfile);
    if (!profileId) {
      return {
        message: "Switch to a business workspace to use Recruit.\n\n→ /recruit",
        href: "/recruit",
      };
    }

    const answer = await answerRecruitGideonQuery(ctx.supabase, {
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
      message += '\n\nReply "yes, shortlist" or "yes, decline" to confirm.';
    }
    return {
      message,
      requiresConfirmation: answer.requiresConfirmation,
      intent: answer.intent,
      href: answer.href,
    };
  },
};
