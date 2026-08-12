/** Feature flag for future "Analyze with Guardian" on source items. */
export function isSourceItemAnalyzeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE === "true";
}
