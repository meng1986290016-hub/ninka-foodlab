import type { ResearchReportDocument } from "@food-rd/core";

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
