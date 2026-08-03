import {
  clientRequestReplySystemNote,
  wantsClientRequestReply,
} from "@/lib/client-requests/propose";
import { registerAction, getAction } from "../registry";
import type { ActionDefinition } from "../types";

export const clientRequestReplyAction: ActionDefinition = {
  id: "client_request_reply",
  label: "Reply on client request",
  description:
    "Draft a client request thread reply for user confirmation.",
  matches: (question) => wantsClientRequestReply(question),
  systemNote: () => clientRequestReplySystemNote(),
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Reviewing client threads",
    "Drafting reply",
  ],
};

let registered = false;

export function registerClientRequestActions(): void {
  if (registered) return;
  if (!getAction("client_request_reply")) {
    registerAction(clientRequestReplyAction);
  }
  registered = true;
}
