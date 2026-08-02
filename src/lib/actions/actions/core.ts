import {
  REMINDER_AGENT_SYSTEM_NOTE,
  wantsReminderAgent,
} from "@/lib/reminders/propose";
import { registerAction, getAction } from "../registry";
import type { ActionContext, ActionDefinition } from "../types";

export const createReminderAction: ActionDefinition = {
  id: "create_reminder",
  label: "Create Reminder",
  description:
    "Propose a reminder grounded in vault context for user confirmation.",
  matches: (question) => wantsReminderAgent(question),
  systemNote: () => REMINDER_AGENT_SYSTEM_NOTE,
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Checking schedule context",
    "Preparing reminder proposal",
  ],
};

const SEARCH_VAULT_INTENT =
  /\b(find|search|look\s+for|where\s+is|show\s+me|locate)\b.{0,40}\b(my|the|our)\b/i;

export const searchVaultAction: ActionDefinition = {
  id: "search_vault",
  label: "Search Vault",
  description: "Search documents and notes in the current workspace scope.",
  matches: (question) => SEARCH_VAULT_INTENT.test(question.trim()),
  thinkingSteps: [
    "Understanding request",
    "Searching workspace",
    "Ranking relevance",
  ],
};

export function matchesSearchVault(question: string): boolean {
  return SEARCH_VAULT_INTENT.test(question.trim());
}

let coreRegistered = false;

export function registerCoreActions(): void {
  if (coreRegistered) return;
  if (!getAction("create_reminder")) registerAction(createReminderAction);
  if (!getAction("search_vault")) registerAction(searchVaultAction);
  coreRegistered = true;
}
