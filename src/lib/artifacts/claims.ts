/**
 * NO SOURCE → NO CLAIM helpers.
 * Architectural enforcement: claims about attachments require evidence in context.
 */

const ATTACHMENT_CLAIM =
  /\b(i can see|i('m| am) looking at|i reviewed|i('ve| have) (reviewed|looked at|seen)|the (attached|attachment|document|image|photo|screenshot) (shows|says|contains|is)|the three attached|attached images?\b)/i;

export function answerClaimsAttachmentView(answer: string): boolean {
  return ATTACHMENT_CLAIM.test(answer);
}

/**
 * True when the model is allowed to claim viewing an attachment.
 * Requires current/attached evidence — inventory alone is not enough.
 */
export function mayClaimAttachmentView(args: {
  hasAttachedDocument: boolean;
  hasVisionImages: boolean;
  currentArtifactInContext: boolean;
  /** Explicit image/doc named in validated retrieved context for this turn. */
  validatedAttachmentNames: string[];
}): boolean {
  if (args.hasVisionImages || args.hasAttachedDocument) return true;
  if (args.currentArtifactInContext) return true;
  return args.validatedAttachmentNames.length > 0;
}

export function evidenceClaimSystemNote(args: {
  mayClaimAttachments: boolean;
  validatedSourceNames: string[];
}): string {
  if (args.mayClaimAttachments) {
    const names =
      args.validatedSourceNames.length > 0
        ? `Validated sources this turn: ${args.validatedSourceNames.join(", ")}.`
        : "Use only CURRENT ARTIFACT / ATTACHED DOCUMENT / validated RETRIEVED EXCERPTS.";
    return `EVIDENCE RULE (NO SOURCE → NO CLAIM): You may reference only validated sources. ${names} Do not invent additional attachments or images.`;
  }
  return `EVIDENCE RULE (NO SOURCE → NO CLAIM): No attachment or image is in the validated context for this turn. Do NOT say you can see attached images, reviewed an attachment, or that a document/image shows something — unless that exact source appears in CURRENT ARTIFACT or validated RETRIEVED EXCERPTS. Space file inventory alone does not authorize visual claims.`;
}
