use std::{
    collections::{BTreeSet, HashSet},
    path::Path,
    sync::Arc,
};

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::ingredients::{
    model::{
        IngredientVariant, IngredientVariantAllergens, IngredientVariantInput, VariantNutrition,
        VariantNutritionValue,
    },
    repository::{Clock, IdGenerator, IngredientRepository, save_variant_in_transaction},
};

use super::{
    IngestError,
    attachment_store::{AttachmentStore, StoredAttachment},
    model::{
        ImportFileReferenceKind, ImportIssueSeverity, ImportedNutrientValue,
        IngredientExchangeFormat, IngredientImportCommitResult, IngredientImportDraft,
        IngredientImportDraftStatus, IngredientImportJob, IngredientImportJobRequest,
        IngredientImportJobStatus, IngredientImportSourceKind, ReviewedIngredientImportDraft,
    },
    repository::{self, NewImportDraft},
    spreadsheet::{parse_ingredient_table, write_library_export, write_template},
    validation::{normalize_review, validate_review},
};

pub struct IngredientIngestCoordinator {
    attachment_store: AttachmentStore,
    ingredients: IngredientRepository,
}

impl IngredientIngestCoordinator {
    pub fn open(database_path: &Path, attachment_root: &Path) -> Result<Self, IngestError> {
        let ingredients = IngredientRepository::open(database_path)?;
        Self::from_repository(ingredients, attachment_root)
    }

    pub fn open_in_memory_with<C, I>(
        attachment_root: &Path,
        clock: C,
        create_id: I,
    ) -> Result<Self, IngestError>
    where
        C: Fn() -> String + Send + Sync + 'static,
        I: Fn() -> String + Send + Sync + 'static,
    {
        let ingredients = IngredientRepository::open_in_memory_with(clock, create_id)?;
        Self::from_repository(ingredients, attachment_root)
    }

    pub fn from_repository(
        ingredients: IngredientRepository,
        attachment_root: &Path,
    ) -> Result<Self, IngestError> {
        let coordinator = Self {
            attachment_store: AttachmentStore::new(attachment_root),
            ingredients,
        };
        let timestamp = (coordinator.ingredients.clock)();
        repository::recover_interrupted(&coordinator.ingredients.connection, &timestamp)?;
        Ok(coordinator)
    }

    pub fn ingredients(&self) -> &IngredientRepository {
        &self.ingredients
    }

    pub fn ingredients_mut(&mut self) -> &mut IngredientRepository {
        &mut self.ingredients
    }

    pub fn create_job(
        &mut self,
        request: IngredientImportJobRequest,
    ) -> Result<IngredientImportJob, IngestError> {
        if request.files.is_empty() {
            return Err(IngestError::domain(
                "invalid_input",
                "请至少选择一个原料文件",
            ));
        }
        let timestamp = (self.ingredients.clock)();
        let job = IngredientImportJob {
            id: (self.ingredients.create_id)(),
            source_kind: request.source_kind,
            status: IngredientImportJobStatus::Pending,
            progress_current: 0,
            progress_total: request.files.len() as u64,
            error_summary: None,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        };
        repository::insert_job(&self.ingredients.connection, &job)?;

        let stage_result = request
            .files
            .iter()
            .enumerate()
            .try_for_each(|(position, file)| {
                if file.kind != ImportFileReferenceKind::NativePath {
                    return Err(IngestError::domain(
                        "unsupported_file",
                        "桌面端只能读取本机选择的文件",
                    ));
                }
                let staged = self.attachment_store.stage(Path::new(&file.value))?;
                let attachment = repository::insert_or_get_attachment(
                    &self.ingredients.connection,
                    staged,
                    &(self.ingredients.create_id)(),
                    &(self.ingredients.clock)(),
                )?;
                repository::link_job_attachment(
                    &self.ingredients.connection,
                    &job.id,
                    &attachment.id,
                    position,
                )
            });
        if let Err(error) = stage_result {
            let _ = repository::fail_job(
                &self.ingredients.connection,
                &job.id,
                error.message(),
                &(self.ingredients.clock)(),
            );
            return Err(error);
        }

        self.process_job(&job.id)
    }

    pub fn create_agent_job(
        &mut self,
        files: Vec<super::model::ImportFileReference>,
    ) -> Result<IngredientImportJob, IngestError> {
        if !files.is_empty() {
            return self.create_job(IngredientImportJobRequest {
                files,
                source_kind: IngredientImportSourceKind::Agent,
            });
        }

        let timestamp = (self.ingredients.clock)();
        let job = IngredientImportJob {
            id: (self.ingredients.create_id)(),
            source_kind: IngredientImportSourceKind::Agent,
            status: IngredientImportJobStatus::Pending,
            progress_current: 0,
            progress_total: 0,
            error_summary: None,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        };
        repository::insert_job(&self.ingredients.connection, &job)?;
        repository::transition_job(
            &self.ingredients.connection,
            &job.id,
            IngredientImportJobStatus::Extracting,
            None,
            &timestamp,
        )?;
        repository::transition_job(
            &self.ingredients.connection,
            &job.id,
            IngredientImportJobStatus::Recognizing,
            None,
            &timestamp,
        )
    }

    pub fn get_job(&self, id: &str) -> Result<IngredientImportJob, IngestError> {
        repository::get_job(&self.ingredients.connection, id)
    }

    pub fn list_drafts(&self, job_id: &str) -> Result<Vec<IngredientImportDraft>, IngestError> {
        repository::list_drafts(&self.ingredients.connection, job_id)
    }

    pub fn get_draft(&self, id: &str) -> Result<IngredientImportDraft, IngestError> {
        repository::get_draft(&self.ingredients.connection, id)
    }

    pub fn read_job_extractions(
        &self,
        job_id: &str,
        attachment_ids: &[String],
    ) -> Result<Vec<super::extractors::ExtractedDocument>, IngestError> {
        repository::read_job_extractions(&self.ingredients.connection, job_id, attachment_ids)
    }

    pub fn list_job_attachments(&self, job_id: &str) -> Result<Vec<StoredAttachment>, IngestError> {
        repository::list_job_attachments(&self.ingredients.connection, job_id)
    }

    pub fn read_attachment_bytes(
        &self,
        attachment: &StoredAttachment,
    ) -> Result<Vec<u8>, IngestError> {
        let path = self
            .attachment_store
            .open_for_extract(&attachment.relative_path)?;
        std::fs::read(path).map_err(IngestError::attachment)
    }

    pub fn create_agent_draft(
        &mut self,
        job_id: &str,
        review: ReviewedIngredientImportDraft,
        attachment_ids: Vec<String>,
    ) -> Result<IngredientImportDraft, IngestError> {
        let job = repository::get_job(&self.ingredients.connection, job_id)?;
        if job.source_kind != IngredientImportSourceKind::Agent {
            return Err(IngestError::domain(
                "scope_violation",
                "当前任务不是 Agent 原料导入任务",
            ));
        }
        if !matches!(
            job.status,
            IngredientImportJobStatus::Recognizing
                | IngredientImportJobStatus::Grouping
                | IngredientImportJobStatus::DraftsReady
                | IngredientImportJobStatus::PartiallyCompleted
        ) {
            return Err(IngestError::domain(
                "invalid_state",
                "当前任务状态不能创建原料草稿",
            ));
        }

        let issues = validate_review(&review);
        let timestamp = (self.ingredients.clock)();
        let create_id = Arc::clone(&self.ingredients.create_id);
        let transaction = self.ingredients.connection.transaction()?;
        if job.status == IngredientImportJobStatus::Recognizing {
            repository::transition_job(
                &transaction,
                job_id,
                IngredientImportJobStatus::Grouping,
                None,
                &timestamp,
            )?;
        }
        let id = repository::insert_draft(
            &transaction,
            job_id,
            NewImportDraft {
                attachment_ids,
                issues,
                review,
            },
            &timestamp,
            create_id.as_ref(),
        )?;
        if matches!(
            job.status,
            IngredientImportJobStatus::Recognizing | IngredientImportJobStatus::Grouping
        ) {
            repository::transition_job(
                &transaction,
                job_id,
                IngredientImportJobStatus::DraftsReady,
                None,
                &timestamp,
            )?;
        }
        transaction.commit()?;
        repository::get_draft(&self.ingredients.connection, &id)
    }

    pub fn merge_agent_drafts(
        &mut self,
        job_id: &str,
        draft_ids: &[String],
        review: ReviewedIngredientImportDraft,
    ) -> Result<IngredientImportDraft, IngestError> {
        if draft_ids.len() < 2 {
            return Err(IngestError::domain(
                "invalid_input",
                "合并时至少选择两个草稿",
            ));
        }
        let timestamp = (self.ingredients.clock)();
        let create_id = Arc::clone(&self.ingredients.create_id);
        let transaction = self.ingredients.connection.transaction()?;
        let mut attachment_ids = BTreeSet::new();
        for draft_id in draft_ids {
            let draft = repository::get_draft(&transaction, draft_id)?;
            require_agent_draft_scope(&draft, job_id)?;
            attachment_ids.extend(
                draft
                    .attachments
                    .into_iter()
                    .map(|attachment| attachment.id),
            );
        }
        let id = repository::insert_draft(
            &transaction,
            job_id,
            NewImportDraft {
                attachment_ids: attachment_ids.into_iter().collect(),
                issues: validate_review(&review),
                review,
            },
            &timestamp,
            create_id.as_ref(),
        )?;
        for draft_id in draft_ids {
            repository::discard_draft(&transaction, draft_id, &timestamp)?;
        }
        transaction.commit()?;
        repository::get_draft(&self.ingredients.connection, &id)
    }

    pub fn split_agent_draft(
        &mut self,
        job_id: &str,
        draft_id: &str,
        reviews: Vec<ReviewedIngredientImportDraft>,
    ) -> Result<Vec<IngredientImportDraft>, IngestError> {
        if reviews.len() < 2 {
            return Err(IngestError::domain(
                "invalid_input",
                "拆分时至少提供两个草稿",
            ));
        }
        let timestamp = (self.ingredients.clock)();
        let create_id = Arc::clone(&self.ingredients.create_id);
        let transaction = self.ingredients.connection.transaction()?;
        let source = repository::get_draft(&transaction, draft_id)?;
        require_agent_draft_scope(&source, job_id)?;
        let attachment_ids = source
            .attachments
            .into_iter()
            .map(|attachment| attachment.id)
            .collect::<Vec<_>>();
        let mut ids = Vec::with_capacity(reviews.len());
        for review in reviews {
            ids.push(repository::insert_draft(
                &transaction,
                job_id,
                NewImportDraft {
                    attachment_ids: attachment_ids.clone(),
                    issues: validate_review(&review),
                    review,
                },
                &timestamp,
                create_id.as_ref(),
            )?);
        }
        repository::discard_draft(&transaction, draft_id, &timestamp)?;
        transaction.commit()?;
        ids.into_iter()
            .map(|id| repository::get_draft(&self.ingredients.connection, &id))
            .collect()
    }

    pub fn update_draft(
        &mut self,
        id: &str,
        mut review: ReviewedIngredientImportDraft,
    ) -> Result<IngredientImportDraft, IngestError> {
        normalize_review(&mut review);
        let issues = validate_review(&review);
        repository::update_draft(
            &self.ingredients.connection,
            id,
            &review,
            &issues,
            &(self.ingredients.clock)(),
        )
    }

    pub fn discard_draft(&mut self, id: &str) -> Result<(), IngestError> {
        repository::discard_draft(
            &self.ingredients.connection,
            id,
            &(self.ingredients.clock)(),
        )
    }

    pub fn cancel_job(&mut self, id: &str) -> Result<IngredientImportJob, IngestError> {
        repository::transition_job(
            &self.ingredients.connection,
            id,
            IngredientImportJobStatus::Cancelled,
            None,
            &(self.ingredients.clock)(),
        )
    }

    pub fn retry_job(&mut self, id: &str) -> Result<IngredientImportJob, IngestError> {
        repository::transition_job(
            &self.ingredients.connection,
            id,
            IngredientImportJobStatus::Pending,
            None,
            &(self.ingredients.clock)(),
        )?;
        self.process_job(id)
    }

    pub fn commit_reviewed_draft(
        &mut self,
        draft_id: &str,
        mut review: ReviewedIngredientImportDraft,
    ) -> Result<IngredientVariant, IngestError> {
        normalize_review(&mut review);
        let issues = validate_review(&review);
        if issues
            .iter()
            .any(|issue| issue.severity == ImportIssueSeverity::Error)
        {
            return Err(IngestError::validation(issues));
        }
        let draft = repository::get_draft(&self.ingredients.connection, draft_id)?;
        if matches!(
            draft.status,
            IngredientImportDraftStatus::Imported | IngredientImportDraftStatus::Discarded
        ) {
            return Err(IngestError::domain("invalid_state", "该草稿不能再次导入"));
        }

        let clock = Arc::clone(&self.ingredients.clock);
        let create_id = Arc::clone(&self.ingredients.create_id);
        let transaction = self.ingredients.connection.transaction()?;
        let variant_id = materialize_review(&transaction, draft_id, &review, &clock, &create_id)?;
        transaction.commit()?;

        self.refresh_partial_status(&draft.job_id)?;
        self.ingredients
            .get_variant(&variant_id)
            .map_err(Into::into)
    }

    pub fn commit_job(
        &mut self,
        job_id: &str,
    ) -> Result<IngredientImportCommitResult, IngestError> {
        let job = repository::get_job(&self.ingredients.connection, job_id)?;
        if !matches!(
            job.status,
            IngredientImportJobStatus::DraftsReady | IngredientImportJobStatus::PartiallyCompleted
        ) {
            return Err(IngestError::domain("invalid_state", "当前任务还不能保存"));
        }
        let drafts = repository::list_drafts(&self.ingredients.connection, job_id)?
            .into_iter()
            .filter(|draft| {
                !matches!(
                    draft.status,
                    IngredientImportDraftStatus::Imported | IngredientImportDraftStatus::Discarded
                )
            })
            .collect::<Vec<_>>();
        for draft in &drafts {
            let issues = validate_review(&draft.review);
            if issues
                .iter()
                .any(|issue| issue.severity == ImportIssueSeverity::Error)
            {
                return Err(IngestError::validation(issues));
            }
        }

        let attachment_ids = drafts
            .iter()
            .flat_map(|draft| {
                draft
                    .attachments
                    .iter()
                    .map(|attachment| attachment.id.clone())
            })
            .collect::<HashSet<_>>();
        let clock = Arc::clone(&self.ingredients.clock);
        let create_id = Arc::clone(&self.ingredients.create_id);
        let transaction = self.ingredients.connection.transaction()?;
        let mut variant_ids = Vec::new();
        for draft in drafts {
            variant_ids.push(materialize_review(
                &transaction,
                &draft.id,
                &draft.review,
                &clock,
                &create_id,
            )?);
        }
        transaction.commit()?;

        if job.status == IngredientImportJobStatus::PartiallyCompleted {
            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::DraftsReady,
                None,
                &(self.ingredients.clock)(),
            )?;
        }
        let variants = variant_ids
            .into_iter()
            .map(|id| self.ingredients.get_variant(&id).map_err(IngestError::from))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(IngredientImportCommitResult {
            job_id: job_id.into(),
            variants,
            attachment_count: attachment_ids.len() as u64,
        })
    }

    pub fn export_template(
        &self,
        destination: &Path,
        format: IngredientExchangeFormat,
    ) -> Result<(), IngestError> {
        write_template(destination, format)
    }

    pub fn export_library(
        &self,
        destination: &Path,
        format: IngredientExchangeFormat,
    ) -> Result<(), IngestError> {
        let definitions = self
            .ingredients
            .list_nutrient_definitions()?
            .into_iter()
            .map(|definition| (definition.id.clone(), definition))
            .collect::<std::collections::HashMap<_, _>>();
        let reviews = self
            .ingredients
            .list_material_groups("")?
            .into_iter()
            .flat_map(|group| {
                group.variants.into_iter().map({
                    let definitions = &definitions;
                    let group_id = group.id.clone();
                    let group_name = group.name.clone();
                    let category_id = group.category_id.clone();
                    let category_name = group.category_name.clone();
                    move |variant| ReviewedIngredientImportDraft {
                        material_group_id: Some(group_id.clone()),
                        material_name: group_name.clone(),
                        category_id: category_id.clone(),
                        category_name: category_name.clone(),
                        supplier_id: Some(variant.supplier_id),
                        supplier_name: variant.supplier_name,
                        model_or_specification: variant.model_or_specification,
                        current_price: variant.current_price,
                        price_unit: Some(variant.price_unit),
                        density_g_per_ml: variant.density_g_per_ml,
                        nutrition_basis: Some(variant.nutrition.basis),
                        nutrients: variant
                            .nutrition
                            .values
                            .into_iter()
                            .filter_map(|value| {
                                definitions
                                    .get(&value.nutrient_definition_id)
                                    .map(|definition| ImportedNutrientValue {
                                        definition_id: Some(definition.id.clone()),
                                        name: definition.name.clone(),
                                        unit: definition.unit.clone(),
                                        value: value.value,
                                    })
                            })
                            .collect(),
                        contains_allergens: variant.allergens.contains,
                        may_contain_allergens: variant.allergens.may_contain,
                        source: variant.source,
                        research_notes: variant.research_notes,
                        duplicate_confirmed: false,
                    }
                })
            })
            .collect::<Vec<_>>();
        write_library_export(destination, format, &reviews)
    }

    pub fn cleanup_orphan_attachments(&mut self) -> Result<usize, IngestError> {
        let hashes = repository::referenced_attachment_hashes(&self.ingredients.connection)?;
        let transaction = self.ingredients.connection.transaction()?;
        repository::prune_unreferenced_attachment_metadata(&transaction, &hashes)?;
        transaction.commit()?;
        self.attachment_store.remove_orphans(&hashes)
    }

    fn process_job(&mut self, job_id: &str) -> Result<IngredientImportJob, IngestError> {
        let mut processing = || -> Result<IngredientImportJob, IngestError> {
            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::Extracting,
                None,
                &(self.ingredients.clock)(),
            )?;
            let job = repository::get_job(&self.ingredients.connection, job_id)?;
            let attachments =
                repository::list_job_attachments(&self.ingredients.connection, job_id)?;
            let extractor =
                super::extractors::DocumentExtractor::new(self.attachment_store.clone());
            let mut extracted = Vec::new();
            for (position, attachment) in attachments.iter().enumerate() {
                let document = extractor.extract(attachment)?;
                repository::save_extraction(
                    &self.ingredients.connection,
                    &attachment.id,
                    &document,
                    &(self.ingredients.clock)(),
                )?;
                repository::set_job_progress(
                    &self.ingredients.connection,
                    job_id,
                    (position + 1) as u64,
                    attachments.len() as u64,
                    &(self.ingredients.clock)(),
                )?;
                extracted.push((attachment, document));
            }

            if job.source_kind != IngredientImportSourceKind::Spreadsheet {
                return repository::transition_job(
                    &self.ingredients.connection,
                    job_id,
                    IngredientImportJobStatus::Recognizing,
                    None,
                    &(self.ingredients.clock)(),
                );
            }

            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::Grouping,
                None,
                &(self.ingredients.clock)(),
            )?;
            if repository::list_drafts(&self.ingredients.connection, job_id)?.is_empty() {
                let mut new_drafts = Vec::new();
                for (attachment, document) in extracted {
                    for table in &document.tables {
                        let reviews = parse_ingredient_table(table)
                            .map_err(|error| IngestError::validation(error.issues))?;
                        for mut review in reviews {
                            append_source_name(&mut review, &attachment.original_name);
                            let issues = validate_review(&review);
                            new_drafts.push(NewImportDraft {
                                attachment_ids: vec![attachment.id.clone()],
                                issues,
                                review,
                            });
                        }
                    }
                }
                let clock = Arc::clone(&self.ingredients.clock);
                let create_id = Arc::clone(&self.ingredients.create_id);
                let transaction = self.ingredients.connection.transaction()?;
                repository::replace_drafts(
                    &transaction,
                    job_id,
                    new_drafts,
                    &clock(),
                    create_id.as_ref(),
                )?;
                transaction.commit()?;
            }
            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::DraftsReady,
                None,
                &(self.ingredients.clock)(),
            )
        };

        match processing() {
            Ok(job) => Ok(job),
            Err(error) => {
                let _ = repository::fail_job(
                    &self.ingredients.connection,
                    job_id,
                    error.message(),
                    &(self.ingredients.clock)(),
                );
                Err(error)
            }
        }
    }

    fn refresh_partial_status(&mut self, job_id: &str) -> Result<(), IngestError> {
        let drafts = repository::list_drafts(&self.ingredients.connection, job_id)?;
        let remaining = drafts.iter().any(|draft| {
            matches!(
                draft.status,
                IngredientImportDraftStatus::Ready | IngredientImportDraftStatus::NeedsReview
            )
        });
        let job = repository::get_job(&self.ingredients.connection, job_id)?;
        if remaining && job.status == IngredientImportJobStatus::DraftsReady {
            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::PartiallyCompleted,
                None,
                &(self.ingredients.clock)(),
            )?;
        } else if !remaining && job.status == IngredientImportJobStatus::PartiallyCompleted {
            repository::transition_job(
                &self.ingredients.connection,
                job_id,
                IngredientImportJobStatus::DraftsReady,
                None,
                &(self.ingredients.clock)(),
            )?;
        }
        Ok(())
    }
}

fn require_agent_draft_scope(
    draft: &IngredientImportDraft,
    job_id: &str,
) -> Result<(), IngestError> {
    if draft.job_id != job_id {
        return Err(IngestError::domain(
            "scope_violation",
            "草稿不属于当前 Agent 导入任务",
        ));
    }
    if matches!(
        draft.status,
        IngredientImportDraftStatus::Imported | IngredientImportDraftStatus::Discarded
    ) {
        return Err(IngestError::domain("invalid_state", "该草稿不能再修改"));
    }
    Ok(())
}

fn materialize_review(
    transaction: &Transaction<'_>,
    draft_id: &str,
    review: &ReviewedIngredientImportDraft,
    clock: &Clock,
    create_id: &IdGenerator,
) -> Result<String, IngestError> {
    let category_id = resolve_category(transaction, review, clock, create_id)?;
    let supplier_id = resolve_supplier(transaction, review, clock, create_id)?;
    let material_group_id = resolve_material_group(
        transaction,
        review,
        category_id.as_deref(),
        clock,
        create_id,
    )?;
    let nutrition_values = resolve_nutrients(transaction, review, create_id)?;
    let input = IngredientVariantInput {
        id: None,
        material_group_id,
        supplier_id,
        model_or_specification: review.model_or_specification.clone(),
        internal_code: None,
        current_price: review.current_price.clone(),
        price_unit: review.price_unit.clone().unwrap_or_else(|| "kg".into()),
        density_g_per_ml: review.density_g_per_ml.clone(),
        source: review.source.clone(),
        research_notes: review.research_notes.clone(),
        nutrition: VariantNutrition {
            basis: review
                .nutrition_basis
                .clone()
                .ok_or_else(|| IngestError::domain("invalid_input", "缺少营养基准"))?,
            values: nutrition_values,
        },
        allergens: IngredientVariantAllergens {
            contains: review.contains_allergens.clone(),
            may_contain: review.may_contain_allergens.clone(),
        },
        duplicate_confirmed: review.duplicate_confirmed,
    };
    let variant_id = save_variant_in_transaction(transaction, input, clock, create_id)?;
    repository::link_draft_attachments_to_variant(transaction, draft_id, &variant_id)?;
    repository::mark_draft_imported(transaction, draft_id, &variant_id, review, &clock())?;
    Ok(variant_id)
}

fn resolve_category(
    transaction: &Transaction<'_>,
    review: &ReviewedIngredientImportDraft,
    clock: &Clock,
    create_id: &IdGenerator,
) -> Result<Option<String>, IngestError> {
    if let Some(id) = review.category_id.as_deref() {
        require_active_id(transaction, "categories", id, "找不到该分类")?;
        return Ok(Some(id.into()));
    }
    let Some(name) = review.category_name.as_deref() else {
        return Ok(None);
    };
    if let Some(id) = find_active_name(transaction, "categories", name)? {
        return Ok(Some(id));
    }
    let id = create_id();
    let sort_order = transaction.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    transaction.execute(
        "INSERT INTO categories (id, name, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, sort_order, clock()],
    )?;
    Ok(Some(id))
}

fn resolve_supplier(
    transaction: &Transaction<'_>,
    review: &ReviewedIngredientImportDraft,
    clock: &Clock,
    create_id: &IdGenerator,
) -> Result<String, IngestError> {
    if let Some(id) = review.supplier_id.as_deref() {
        require_active_id(transaction, "suppliers", id, "找不到该供应商")?;
        return Ok(id.into());
    }
    if let Some(id) = find_active_name(transaction, "suppliers", &review.supplier_name)? {
        return Ok(id);
    }
    let id = create_id();
    transaction.execute(
        "INSERT INTO suppliers (id, name, notes, created_at, updated_at)
         VALUES (?1, ?2, '', ?3, ?3)",
        params![id, review.supplier_name, clock()],
    )?;
    Ok(id)
}

fn resolve_material_group(
    transaction: &Transaction<'_>,
    review: &ReviewedIngredientImportDraft,
    category_id: Option<&str>,
    clock: &Clock,
    create_id: &IdGenerator,
) -> Result<String, IngestError> {
    if let Some(id) = review.material_group_id.as_deref() {
        require_active_id(transaction, "material_groups", id, "找不到该原料")?;
        return Ok(id.into());
    }
    if let Some(id) = find_active_name(transaction, "material_groups", &review.material_name)? {
        return Ok(id);
    }
    let id = create_id();
    transaction.execute(
        "INSERT INTO material_groups
         (id, name, category_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, review.material_name, category_id, clock()],
    )?;
    Ok(id)
}

fn resolve_nutrients(
    transaction: &Transaction<'_>,
    review: &ReviewedIngredientImportDraft,
    create_id: &IdGenerator,
) -> Result<Vec<VariantNutritionValue>, IngestError> {
    let mut values = Vec::new();
    for nutrient in &review.nutrients {
        let definition_id = if let Some(id) = nutrient.definition_id.as_deref() {
            let exists = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM nutrient_definitions WHERE id = ?1)",
                [id],
                |row| row.get::<_, bool>(0),
            )?;
            if !exists {
                return Err(IngestError::domain("invalid_input", "营养成分定义不存在"));
            }
            id.to_string()
        } else if let Some(id) = transaction
            .query_row(
                "SELECT id FROM nutrient_definitions
                 WHERE lower(name) = lower(?1) AND unit = ?2",
                params![nutrient.name, nutrient.unit],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            id
        } else {
            let id = create_id();
            let sort_order = transaction.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM nutrient_definitions",
                [],
                |row| row.get::<_, i64>(0),
            )?;
            transaction.execute(
                "INSERT INTO nutrient_definitions
                 (id, code, name, unit, built_in, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                params![
                    id,
                    format!("custom:{id}"),
                    nutrient.name,
                    nutrient.unit,
                    sort_order,
                ],
            )?;
            id
        };
        values.push(VariantNutritionValue {
            nutrient_definition_id: definition_id,
            value: nutrient.value.clone(),
        });
    }
    Ok(values)
}

fn require_active_id(
    connection: &Connection,
    table: &str,
    id: &str,
    message: &str,
) -> Result<(), IngestError> {
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = ?1 AND archived_at IS NULL)");
    let exists = connection.query_row(&sql, [id], |row| row.get::<_, bool>(0))?;
    if exists {
        Ok(())
    } else {
        Err(IngestError::domain("not_found", message))
    }
}

fn find_active_name(
    connection: &Connection,
    table: &str,
    name: &str,
) -> Result<Option<String>, IngestError> {
    let sql = format!(
        "SELECT id FROM {table} WHERE archived_at IS NULL AND lower(name) = lower(?1) LIMIT 1"
    );
    connection
        .query_row(&sql, [name], |row| row.get(0))
        .optional()
        .map_err(Into::into)
}

fn append_source_name(review: &mut ReviewedIngredientImportDraft, source_name: &str) {
    let exists = review
        .source
        .split('；')
        .map(str::trim)
        .any(|source| source == source_name);
    if exists {
        return;
    }
    if review.source.trim().is_empty() {
        review.source = source_name.into();
    } else {
        review.source = format!("{}；{source_name}", review.source.trim());
    }
}
