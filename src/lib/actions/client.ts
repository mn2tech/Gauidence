/** Client-safe action helpers (no server-only imports). */
export type {
  ActionContext,
  ActionDefinition,
  ActionDirectResult,
  ActionEvent,
  ActionEventPhase,
} from "./types";

export {
  buildSmartUploadPresentation,
  shouldPromptSmartUpload,
  UPLOAD_THINKING_STEPS,
  type SmartUploadPresentation,
} from "./smartUpload";

export { recordClientActionEvent } from "./recordClient";
