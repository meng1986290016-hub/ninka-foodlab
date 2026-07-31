import type {
  ResearchReportDocument,
  ResearchReportExportFormat,
} from "@food-rd/core";

import type { EntityId } from "./types";

export type { ResearchReportDocument };

export interface ResearchReportRecordInput {
  document: ResearchReportDocument;
  svg: string;
}

export interface ResearchReportRecord {
  id: EntityId;
  recipeVersionId: EntityId;
  nutritionLabelVersionId: EntityId;
  document: ResearchReportDocument;
  svg: string;
  createdAt: string;
}

export interface ResearchReportExportRequest {
  reportId: EntityId;
  format: ResearchReportExportFormat;
  destinationPath: string;
  fileName: string;
  documentHash: string;
  bytesBase64: string;
}
