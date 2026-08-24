/**
 * Suggest a separate Space only when business context is substantial.
 * One business card must never trigger this.
 */
export function shouldSuggestBusinessSpace(input: {
  businessDocumentCount: number;
  businessQuestionCount: number;
  organizationName?: string | null;
}): { suggest: boolean; message: string | null } {
  const name = input.organizationName?.trim() || "this business";
  const substantial =
    input.businessDocumentCount >= 10 &&
    input.businessQuestionCount >= 3;

  if (!substantial) {
    return { suggest: false, message: null };
  }

  return {
    suggest: true,
    message: `You've started adding a lot of ${name} business information. Would you like to create a separate ${name} Business Space?`,
  };
}
