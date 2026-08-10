import type {
  RecipeCalculation,
  RecipeItemUnit,
  RecipeKind,
} from "./recipe-types";

export type AgentRecipeProposalMode = "goal_design" | "label_reverse";
export type AgentRecipeProposalStatus =
  | "pending_review"
  | "accepted"
  | "discarded";
export type AgentRecipeConfidence = "high" | "medium" | "low";

export interface AgentRecipeRequirement {
  nutrientDefinitionId: string | null;
  name: string;
  unit: string;
  minimum: string | null;
  maximum: string | null;
  origin: "user" | "label" | "agent_suggestion";
  rationale: string;
}

interface AgentRecipeProposalItemBase {
  id: string;
  position: number;
  amount: string;
  unit: Extract<RecipeItemUnit, "g" | "kg">;
  estimatedMinimum: string | null;
  estimatedMaximum: string | null;
  confidence: AgentRecipeConfidence;
}

export interface AgentRecipeIngredientItem
  extends AgentRecipeProposalItemBase {
  kind: "ingredient";
  ingredientVariantId: string;
  ingredientUpdatedAt: string;
  materialName: string;
  supplierName: string;
  modelOrSpecification: string;
  selectionReason: string;
}

export interface AgentRecipeMaterialNeedItem
  extends AgentRecipeProposalItemBase {
  kind: "material_need";
  materialName: string;
  purpose: string;
  desiredSpecification: string;
  missingReason: string;
}

export type AgentRecipeProposalItem =
  | AgentRecipeIngredientItem
  | AgentRecipeMaterialNeedItem;

export interface AgentRecipeProposalPayload {
  productName: string;
  recipeKind: RecipeKind;
  mode: AgentRecipeProposalMode;
  finishedMassGrams: string | null;
  yieldAssumption: "provided" | "assumed_100_percent";
  items: AgentRecipeProposalItem[];
  requirements: AgentRecipeRequirement[];
  assumptions: string[];
  warnings: string[];
  markdownNotes: string;
}

export interface AgentRecipeProposalEvaluation {
  calculation: RecipeCalculation;
  requirementStatuses: Array<{
    name: string;
    unit: string;
    observed: string | null;
    status: "met" | "below" | "above" | "unknown";
  }>;
  staleItemIds: string[];
}

export interface AgentRecipeProposal {
  id: string;
  conversationId: string | null;
  runId: string | null;
  status: AgentRecipeProposalStatus;
  payloadVersion: number;
  payload: AgentRecipeProposalPayload;
  evaluation: AgentRecipeProposalEvaluation;
  sourceAttachmentIds: string[];
  acceptedRecipeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentRecipeProposalDestination =
  | {
      kind: "new_product";
    }
  | {
      kind: "alternative";
      sourceVersionId: string;
      schemeName: string;
    };

export interface AgentRecipeProposalAcceptInput {
  proposalId: string;
  destination: AgentRecipeProposalDestination;
}

export interface AcceptedAgentRecipeProposal {
  recipe: import("./recipe-types").Recipe;
  materialNeeds: MaterialNeed[];
}

export type MaterialNeedStatus = "open" | "resolved" | "dismissed";

export interface MaterialNeed {
  id: string;
  proposalId: string | null;
  recipeId: string | null;
  materialName: string;
  purpose: string;
  desiredSpecification: string;
  missingReason: string;
  suggestedAmount: string;
  suggestedUnit: Extract<RecipeItemUnit, "g" | "kg">;
  status: MaterialNeedStatus;
  resolvedIngredientVariantId: string | null;
  createdAt: string;
  updatedAt: string;
}
