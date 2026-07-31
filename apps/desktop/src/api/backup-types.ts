export interface BackupFileEntry {
  path: string;
  byteSize: number;
  sha256: string;
}

export interface BackupTotals {
  attachmentCount: number;
  totalBytes: number;
}

export interface BackupManifest {
  formatVersion: number;
  applicationId: string;
  applicationVersion: string;
  createdAt: string;
  schemaVersion: number;
  database: BackupFileEntry;
  attachments: BackupFileEntry[];
  totals: BackupTotals;
}

export interface BackupDataCounts {
  materialGroups: number;
  ingredientVariants: number;
  recipes: number;
  recipeVersions: number;
  nutritionLabels: number;
  nutritionLabelVersions: number;
  researchReports: number;
  agentConversations: number;
}

export interface BackupPreflight {
  createdAt: string;
  applicationVersion: string;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  requiresMigration: boolean;
  databaseBytes: number;
  attachmentCount: number;
  attachmentBytes: number;
  totalBytes: number;
  dataRecordCount: number;
  counts: BackupDataCounts;
}

export interface BackupRestoreResult {
  preflight: BackupPreflight;
  safetyBackupFileName: string;
  restoredSchemaVersion: number;
}
