export interface DataResetCounts {
  materialGroups: number;
  ingredientVariants: number;
  recipes: number;
  nutritionLabels: number;
  researchReports: number;
  importDrafts: number;
  agentTasks: number;
  agentConversations: number;
  attachments: number;
  totalRecords: number;
}

export interface DataResetRecoveryInfo {
  id: string;
  createdAt: string;
  directoryName: string;
}

export interface DataResetPreview {
  previewId: string;
  confirmationPhrase: string;
  noBackupConfirmationPhrase: string;
  counts: DataResetCounts;
  latestRecovery: DataResetRecoveryInfo | null;
}

export interface DataResetExecuteRequest {
  previewId: string;
  confirmationPhrase: string;
  allowWithoutBackup: boolean;
  noBackupConfirmationPhrase?: string;
}

export interface DataResetResult {
  recovery: DataResetRecoveryInfo | null;
  clearedRecords: number;
  clearedAttachments: number;
  restartRequired: boolean;
}

export interface DataResetRestoreResult {
  recovery: DataResetRecoveryInfo;
  safetyBackupFileName: string;
  restartRequired: boolean;
}
