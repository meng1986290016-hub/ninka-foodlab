use super::model::{ApprovalPolicy, TaskContract};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Workflow {
    IngredientImport,
    RecipeProposal,
    RecipeAnalysis,
    RecipeEstimate,
    LabelCompliance,
    VersionReporting,
    LocalKnowledge,
}

impl Workflow {
    pub fn id(self) -> &'static str {
        match self {
            Self::IngredientImport => "ingredient_import",
            Self::RecipeProposal => "recipe_proposal",
            Self::RecipeAnalysis => "recipe_analysis",
            Self::RecipeEstimate => "recipe_estimate",
            Self::LabelCompliance => "label_compliance",
            Self::VersionReporting => "version_reporting",
            Self::LocalKnowledge => "local_knowledge",
        }
    }
}

pub fn contract_for(workflow: Workflow) -> TaskContract {
    let (mut allowed, required, artifacts, approval, completion) = match workflow {
        Workflow::IngredientImport => (
            vec![
                "read_task_attachments",
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "search_categories",
                "list_nutrient_definitions",
                "create_ingredient_import_draft",
                "update_ingredient_import_draft",
                "validate_ingredient_import_draft",
                "request_open_ingredient_review",
            ],
            vec!["read_task_attachments", "create_ingredient_import_draft"],
            vec!["ingredient_import_draft"],
            ApprovalPolicy::ReviewBeforeCommit,
            "all attachments are represented by reviewable drafts or an explicit needs_input outcome",
        ),
        Workflow::RecipeProposal => (
            vec![
                "search_material_groups",
                "search_supplier_variants",
                "evaluate_recipe_proposal",
                "create_recipe_proposal",
                "update_recipe_proposal",
                "request_open_recipe_proposal_review",
            ],
            vec!["evaluate_recipe_proposal", "create_recipe_proposal"],
            vec!["recipe_proposal"],
            ApprovalPolicy::ReviewBeforeCommit,
            "a validated proposal exists in needs_review state",
        ),
        Workflow::RecipeAnalysis => (
            vec![
                "diagnose_recipe",
                "review_recipe_development",
                "compare_supplier_variant",
            ],
            vec!["diagnose_recipe"],
            vec!["recipe_analysis"],
            ApprovalPolicy::Automatic,
            "the deterministic calculation result and its limitations are rendered",
        ),
        Workflow::RecipeEstimate => (
            vec![
                "read_recipe_reference_context",
                "search_rnd_reference_cards",
                "create_recipe_estimate_card",
            ],
            vec![
                "read_recipe_reference_context",
                "search_rnd_reference_cards",
                "create_recipe_estimate_card",
            ],
            vec!["recipe_estimate_card"],
            ApprovalPolicy::Automatic,
            "an estimate card exists in ready or needs_input state",
        ),
        Workflow::LabelCompliance => (
            vec![
                "diagnose_recipe",
                "review_recipe_development",
                "web_search",
                "create_label_compliance_review",
            ],
            vec!["diagnose_recipe", "create_label_compliance_review"],
            vec!["label_compliance_review"],
            ApprovalPolicy::ReviewBeforeCommit,
            "issues distinguish official full-text evidence from search-only candidates",
        ),
        Workflow::VersionReporting => (
            vec![
                "diagnose_recipe",
                "review_recipe_development",
                "create_research_report_draft",
            ],
            vec!["review_recipe_development", "create_research_report_draft"],
            vec!["research_report"],
            ApprovalPolicy::ReviewBeforeCommit,
            "a reviewable report is created without publishing or overwriting a formal version",
        ),
        Workflow::LocalKnowledge => (
            vec![
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "search_categories",
                "list_nutrient_definitions",
                "search_rnd_reference_cards",
            ],
            vec![],
            vec![],
            ApprovalPolicy::Automatic,
            "the answer cites the local records or states that no supporting record was found",
        ),
    };
    allowed.push("request_task_input");

    TaskContract {
        workflow: workflow.id().into(),
        allowed_tools: allowed.into_iter().map(str::to_string).collect(),
        required_steps: required.into_iter().map(str::to_string).collect(),
        required_artifact_kinds: artifacts.into_iter().map(str::to_string).collect(),
        approval_policy: approval,
        completion_predicate: completion.into(),
    }
}

pub fn validate_completion(
    contract: &TaskContract,
    completed_tools: &[String],
    artifact_kinds: &[String],
) -> Result<(), Vec<String>> {
    let mut missing = contract
        .required_steps
        .iter()
        .filter(|required| !completed_tools.iter().any(|tool| tool == *required))
        .map(|value| format!("missing_tool:{value}"))
        .collect::<Vec<_>>();
    missing.extend(
        contract
            .required_artifact_kinds
            .iter()
            .filter(|required| !artifact_kinds.iter().any(|kind| kind == *required))
            .map(|value| format!("missing_artifact:{value}")),
    );
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recipe_estimate_requires_the_full_tool_chain_and_artifact() {
        let contract = contract_for(Workflow::RecipeEstimate);
        let incomplete = vec![
            "read_recipe_reference_context".into(),
            "create_recipe_estimate_card".into(),
        ];
        let errors = validate_completion(&contract, &incomplete, &["recipe_estimate_card".into()])
            .unwrap_err();
        assert_eq!(
            errors,
            vec!["missing_tool:search_rnd_reference_cards".to_string()]
        );
    }

    #[test]
    fn recipe_estimate_accepts_the_declared_chain() {
        let contract = contract_for(Workflow::RecipeEstimate);
        validate_completion(
            &contract,
            &contract.required_steps,
            &["recipe_estimate_card".into()],
        )
        .unwrap();
    }

    #[test]
    fn compliance_search_summary_cannot_satisfy_formal_review() {
        let contract = contract_for(Workflow::LabelCompliance);
        let errors = validate_completion(
            &contract,
            &["diagnose_recipe".into(), "web_search".into()],
            &[],
        )
        .unwrap_err();
        assert!(errors.contains(&"missing_artifact:label_compliance_review".to_string()));
    }
}
