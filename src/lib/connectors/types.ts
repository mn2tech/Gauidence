/**
 * Source-agnostic connector models for Guardian external connections.
 * Connectors discover metadata only — they are not ontology engines.
 */

export type ConnectedSourceStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "permission_revoked";

export type ConnectedSourceType = "android_storage" | "guardian";

export type SourceItemProcessingStatus = "discovered" | "unavailable";

export type FileTypeCategory =
  | "Images"
  | "PDF"
  | "Documents"
  | "Spreadsheets"
  | "Text"
  | "Other";

export interface ConnectedSource {
  id: string;
  userId: string;
  profileId?: string | null;
  sourceType: ConnectedSourceType;
  displayName: string | null;
  sourceUri: string | null;
  status: ConnectedSourceStatus;
  settings: Record<string, unknown>;
  lastScanAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceItem {
  id?: string;
  sourceId: string;
  externalId: string;
  name: string;
  mimeType?: string;
  sourceUri: string;
  sizeBytes?: number;
  modifiedAt?: string;
  metadata?: Record<string, unknown>;
  processingStatus: SourceItemProcessingStatus;
}

export interface ScanResultSummary {
  discovered: number;
  newCount: number;
  updatedCount: number;
  unavailableCount: number;
  unchangedCount: number;
}

export interface GuardianConnector {
  type: ConnectedSourceType | string;

  connect(): Promise<{
    displayName: string;
    sourceUri: string;
    settings: Record<string, unknown>;
  }>;

  disconnect(source: ConnectedSource): Promise<void>;

  scan(source: ConnectedSource): Promise<SourceItem[]>;

  getItem(item: SourceItem): Promise<SourceItem>;

  readItem?(item: SourceItem): Promise<ArrayBuffer>;

  /** Verify persisted access is still valid. */
  verifyAccess?(source: ConnectedSource): Promise<boolean>;
}

export class ConnectorError extends Error {
  readonly code:
    | "cancelled"
    | "permission_revoked"
    | "unsupported"
    | "read_failed"
    | "partial_scan"
    | "unknown";

  constructor(
    code: ConnectorError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ConnectorError";
    this.code = code;
  }
}
