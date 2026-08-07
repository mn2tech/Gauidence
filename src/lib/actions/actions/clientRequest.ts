import {
  clientRequestReplySystemNote,
  wantsClientRequestReply,
} from "@/lib/client-requests/propose";
import { wantsClientRequestCreate } from "@/lib/client-requests/proposeCreate";
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

export const clientRequestCreateAction: ActionDefinition = {
  id: "client_request_create",
  label: "Create client request",
  description:
    "Propose a new client request on a client vault for user confirmation.",
  matches: (question) => wantsClientRequestCreate(question),
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Choosing client vault",
    "Drafting request",
  ],
};

let registered = false;

export function registerClientRequestActions(): void {
  if (registered) return;
  if (!getAction("client_request_reply")) {
    registerAction(clientRequestReplyAction);
  }
  if (!getAction("client_request_create")) {
    registerAction(clientRequestCreateAction);
  }
  registered = true;
}
