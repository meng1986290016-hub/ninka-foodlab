export type RndReferenceCardOrigin = "builtin" | "personal";
export type RndReferenceCardStatus = "draft" | "approved" | "archived";
export type RndReferenceEvidenceType =
  | "regulatory_agency"
  | "peer_reviewed_review"
  | "supplier_document"
  | "personal_experience";

export interface ReferenceCardSource {
  title: string;
  publisher: string;
  url: string | null;
  publishedAt: string | null;
  locator: string | null;
  evidenceType: RndReferenceEvidenceType;
}

export interface RndReferenceCard {
  id: string;
  origin: RndReferenceCardOrigin;
  status: RndReferenceCardStatus;
  parameterKey: "relative_sweetness";
  title: string;
  ingredientNames: string[];
  specification: string;
  applicability: string;
  unit: "x_sucrose";
  basis: "sucrose_1";
  typicalValue: string;
  minimumValue: string;
  maximumValue: string;
  source: ReferenceCardSource;
  reviewVersion: number;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PersonalReferenceCardDraft {
  title: string;
  parameterKey: "relative_sweetness";
  ingredientNames: string[];
  specification: string;
  applicability: string;
  unit: "x_sucrose";
  basis: "sucrose_1";
  typicalValue: string;
  minimumValue: string;
  maximumValue: string;
  source: ReferenceCardSource;
}

export type AgentRecipeEstimateCardStatus =
  | "ready"
  | "needs_input"
  | "stale";

export interface AgentRecipeEstimateInput {
  label: string;
  amount: string;
  unit: string;
  referenceCardId: string | null;
}

export interface AgentRecipeEstimateConflict {
  selectedReferenceCardId: string;
  alternativeReferenceCardIds: string[];
  rationale: string;
}

export interface AgentRecipeEstimateCard {
  id: string;
  conversationId: string;
  runId: string;
  recipeId: string;
  recipeName: string;
  sourceDraftUpdatedAt: string;
  sourceDraftFingerprint: string;
  status: AgentRecipeEstimateCardStatus;
  parameterKey: "relative_sweetness";
  title: string;
  estimatedValue: string | null;
  minimumValue: string | null;
  maximumValue: string | null;
  unit: "g_sucrose_equivalent_per_100g";
  basis: "finished_product_100g" | "input_mix_100g";
  confidence: "high" | "medium" | "low";
  formulaInputs: AgentRecipeEstimateInput[];
  citedReferenceCardIds: string[];
  calculationSummary: string;
  assumptions: string[];
  influencingFactors: string[];
  missingInputs: string[];
  conflict: AgentRecipeEstimateConflict | null;
  notePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppendRecipeDraftNotesInput {
  recipeId: string;
  expectedDraftUpdatedAt: string;
  appendText: string;
}
