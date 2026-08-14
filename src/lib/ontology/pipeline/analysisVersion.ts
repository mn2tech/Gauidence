/** Bump when extraction quality changes so Analyze again is not skipped. */
export const CONNECTOR_ANALYSIS_VERSION = "connector-ontology-v12";

export function connectorAnalysisVersion(): string {
  return CONNECTOR_ANALYSIS_VERSION;
}
