/** Stable synthetic id so connector citations never collide with vault document UUIDs. */
export function connectorCitationDocumentId(itemId: string): string {
  return `connector:${itemId}`;
}

export function isConnectorCitationDocumentId(documentId: string): boolean {
  return documentId.startsWith("connector:");
}
