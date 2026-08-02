import "server-only";

import { canHaveLinkedEmployees } from "@/lib/profiles/types";
import { canAccessGuardianPayroll } from "@/lib/features/payroll";
import {
  answerPayrollGideonQuery,
  wantsPayrollQuery,
} from "@/lib/payroll/gideonChat";
import type { ActionContext, ActionDefinition } from "../types";

export const payrollClockAction: ActionDefinition = {
  id: "payroll_clock",
  label: "Payroll Clock",
  description: "Clock in or out via payroll when the user asks.",
  matches: (question, ctx) => {
    if (!canAccessGuardianPayroll({ email: ctx.userEmail })) return false;
    if (!wantsPayrollQuery(question)) return false;
    const { profile_type, parent_profile_id } = ctx.activeProfile;
    return (
      canHaveLinkedEmployees(profile_type) ||
      (profile_type === "employee" && Boolean(parent_profile_id))
    );
  },
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Checking payroll context",
    "Preparing clock action",
  ],
  executeDirect: async (ctx) => {
    if (!ctx.supabase) return null;
    const { activeProfile } = ctx;
    const payrollProfileId =
      activeProfile.profile_type === "employee" &&
      activeProfile.parent_profile_id
        ? activeProfile.parent_profile_id
        : activeProfile.id;

    const payrollAnswer = await answerPayrollGideonQuery(ctx.supabase, {
      query: ctx.question,
      profileId: payrollProfileId,
      employeeProfileId:
        activeProfile.profile_type === "employee"
          ? activeProfile.id
          : undefined,
      userId: ctx.userId,
      confirmed: ctx.confirmed,
    });

    if (!payrollAnswer) {
      return { message: "Open Payroll for more options." };
    }

    let payrollText = payrollAnswer.message;
    if (payrollAnswer.href) {
      payrollText += `\n\n→ ${payrollAnswer.href}`;
    }
    if (payrollAnswer.requiresConfirmation) {
      if (
        payrollAnswer.intent === "clock_in" ||
        payrollAnswer.intent === "clock_out"
      ) {
        payrollText +=
          '\n\nReply "yes, clock in" or "yes, clock out" to confirm.';
      } else {
        payrollText +=
          "\n\nI cannot approve or share payroll without your explicit confirmation on the Payroll report page.";
      }
    }

    return {
      message: payrollText,
      requiresConfirmation: payrollAnswer.requiresConfirmation,
      intent: payrollAnswer.intent,
      href: payrollAnswer.href,
    };
  },
};
