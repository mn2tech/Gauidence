/** Feature flag for "Analyze with Guardian" on connected source items. */
export function isSourceItemAnalyzeEnabled(): boolean {
  // Default enabled for connector → ontology. Set NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE=false to hide.
  return process.env.NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE !== "false";
}
