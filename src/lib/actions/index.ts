export type {
  ActionContext,
  ActionDefinition,
  ActionDirectResult,
  ActionEvent,
  ActionEventPhase,
} from "./types";

export {
  registerAction,
  getAction,
  getAllActions,
  getMatchingActions,
  clearActionsForTests,
} from "./registry";

export { registerAllActions } from "./register";

export {
  collectActionSystemNotes,
  collectThinkingSteps,
  buildActionEvents,
} from "./runner";

export { runDirectAction } from "./runner.server";

export {
  createReminderAction,
  searchVaultAction,
  matchesSearchVault,
} from "./actions/core";

export { uploadDocumentAction, saveDocumentAction } from "./actions/uploadDocument";

export {
  buildSmartUploadPresentation,
  shouldPromptSmartUpload,
  UPLOAD_THINKING_STEPS,
  type SmartUploadPresentation,
} from "./smartUpload";

export { recordClientActionEvent } from "./recordClient";

export { buildGideonThinkingSteps } from "./thinkingSteps";

export {
  recordActionEvent,
  recordDetectedActions,
  listActionTimeline,
  startOfUtcDay,
  type ActionTimelineEntry,
  type GuardianActionEventRow,
  type RecordActionEventArgs,
} from "./events";
