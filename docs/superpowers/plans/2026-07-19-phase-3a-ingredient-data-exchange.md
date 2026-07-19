# Phase 3A Ingredient Data Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a model-independent ingredient import/export foundation that preserves source files, previews and validates Chinese spreadsheet data, creates supplier-specific drafts, and writes only reviewed data in atomic SQLite transactions.

**Architecture:** Add a focused Rust `ingest` module beside the existing ingredient repository. SQLite stores job, draft, allergen, and attachment metadata while `AttachmentStore` keeps deduplicated source binaries under the application data directory. React consumes the same typed `DesktopApi` in SQLite and browser-demo modes; the browser adapter simulates attachment metadata and parsing but never attempts native file access.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, Tauri 2.11, Rust 2024, rusqlite 0.40.1, tauri-plugin-dialog 2, SHA-256, CSV, XLSX, DOCX, PDF and image metadata parsers.

## Global Constraints

- Agent-generated content is not part of 3A; every 3A workflow must work with no provider or API key.
- An import row represents one supplier-specific `IngredientVariant`; rows with the same material and different suppliers remain separate.
- `internalCode` is excluded from the import template, draft schema, parser mapping, and preview UI.
- Nutrient `null` means unknown and the decimal string `"0"` means confirmed zero; parsers must never coerce an empty cell to zero.
- Nutrition basis is exactly `per_100g` or `per_100ml`; a basis is never inferred from density.
- Source binaries live in the app-data attachment directory; SQLite stores metadata and relative paths, never file bytes or absolute source paths.
- `updatedAt` is generated only when the final ingredient transaction commits; staging, parsing, draft edits, failures, and retries do not update formal ingredient records.
- Whole-job spreadsheet commit and single reviewed-draft commit are transactional; failures leave zero partial formal records.
- React never reads arbitrary paths or writes files directly; file selection uses Tauri dialog and all file I/O uses controlled commands.
- Browser demo mode uses fake attachment metadata and deterministic sample rows; it does not launch native dialogs or parsers.
- Preserve all existing core calculation and supplier-library tests.

---

## File map

- `apps/desktop/src/api/import-types.ts`: public import, attachment, issue, draft, and commit types.
- `apps/desktop/src-tauri/src/ingest/model.rs`: Rust mirrors of the public import contract.
- `apps/desktop/src-tauri/src/ingest/repository.rs`: job, draft, attachment-link, allergen, and transactional commit persistence.
- `apps/desktop/src-tauri/src/ingest/attachment_store.rs`: content hashing, deduplicated file storage, and orphan cleanup.
- `apps/desktop/src-tauri/src/ingest/extractors/`: format-specific deterministic extraction.
- `apps/desktop/src-tauri/src/ingest/spreadsheet.rs`: Chinese template generation, row mapping, export, and cell-level errors.
- `apps/desktop/src-tauri/src/ingest/coordinator.rs`: state transitions and orchestration across storage, extraction, validation, and commit.
- `apps/desktop/src-tauri/src/commands/ingest.rs`: narrow Tauri command boundary.
- `apps/desktop/src/features/imports/`: import/export drawer, preview table, issue summary, and draft-review UI.

---

### Task 1: Define the stable import contract

**Files:**
- Create: `apps/desktop/src/api/import-types.ts`
- Modify: `apps/desktop/src/api/desktop-api.ts`
- Modify: `apps/desktop/src/api/types.ts`
- Modify: `apps/desktop/src/api/desktop-api-contract.test.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.test.ts`

**Interfaces:**
- Consumes: existing `EntityId`, `PriceUnit`, `NutritionBasis`, `IngredientVariant`, and `IngredientVariantInput`.
- Produces: the exact import types and `DesktopApi` methods used by every later 3A and 3B task.

- [ ] **Step 1: Write the failing type-contract test**

```ts
import type {
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "./import-types";

it("exposes the model-independent ingredient import contract", () => {
  expectTypeOf<Parameters<DesktopApi["createIngredientImportJob"]>[0]>()
    .toEqualTypeOf<IngredientImportJobRequest>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["getIngredientImportJob"]>>>()
    .toEqualTypeOf<IngredientImportJob>();
  expectTypeOf<Parameters<DesktopApi["updateIngredientImportDraft"]>[1]>()
    .toEqualTypeOf<ReviewedIngredientImportDraft>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["commitIngredientImportJob"]>>>()
    .toEqualTypeOf<IngredientImportCommitResult>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["listIngredientImportDrafts"]>>>()
    .toEqualTypeOf<IngredientImportDraft[]>();
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts`

Expected: FAIL because `import-types.ts` and the import methods do not exist.

- [ ] **Step 3: Define the public import types**

Create `import-types.ts` with these exact unions and records:

```ts
import type {
  EntityId,
  IngredientSourceAttachment,
  IngredientVariant,
  NutritionBasis,
  PriceUnit,
} from "./types";

export type IngredientImportJobStatus =
  | "pending"
  | "extracting"
  | "recognizing"
  | "grouping"
  | "drafts_ready"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type IngredientImportDraftStatus =
  | "needs_review"
  | "ready"
  | "imported"
  | "discarded"
  | "failed";

export type ImportIssueSeverity = "warning" | "error";

export interface ImportIssue {
  code:
    | "missing_required"
    | "invalid_decimal"
    | "invalid_unit"
    | "invalid_basis"
    | "duplicate_variant"
    | "source_conflict"
    | "unsupported_file"
    | "damaged_file"
    | "password_protected";
  severity: ImportIssueSeverity;
  message: string;
  fieldPath: string | null;
  sourceName: string | null;
  row: number | null;
  column: string | null;
}

export interface ImportFileReference {
  kind: "native_path" | "browser_demo";
  value: string;
  mediaType?: string;
}

export type SourceAttachment = IngredientSourceAttachment;

export interface DraftSourceLink {
  fieldPath: string;
  attachmentId: EntityId;
  sourceLocator: string | null;
}

export interface ImportedNutrientValue {
  definitionId: EntityId | null;
  name: string;
  unit: string;
  value: string | null;
}

export interface ReviewedIngredientImportDraft {
  materialGroupId: EntityId | null;
  materialName: string;
  categoryId: EntityId | null;
  categoryName: string | null;
  supplierId: EntityId | null;
  supplierName: string;
  modelOrSpecification: string;
  currentPrice: string | null;
  priceUnit: PriceUnit | null;
  densityGPerMl: string | null;
  nutritionBasis: NutritionBasis | null;
  nutrients: ImportedNutrientValue[];
  containsAllergens: string[];
  mayContainAllergens: string[];
  source: string;
  researchNotes: string;
  duplicateConfirmed: boolean;
}

export interface IngredientImportDraft {
  id: EntityId;
  jobId: EntityId;
  position: number;
  status: IngredientImportDraftStatus;
  review: ReviewedIngredientImportDraft;
  issues: ImportIssue[];
  attachments: SourceAttachment[];
  sourceLinks: DraftSourceLink[];
  importedVariantId: EntityId | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientImportJobRequest {
  files: ImportFileReference[];
  sourceKind: "spreadsheet" | "documents" | "agent";
}

export interface IngredientImportJob {
  id: EntityId;
  sourceKind: IngredientImportJobRequest["sourceKind"];
  status: IngredientImportJobStatus;
  progressCurrent: number;
  progressTotal: number;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientImportCommitResult {
  jobId: EntityId;
  variants: IngredientVariant[];
  attachmentCount: number;
}

export type IngredientExchangeFormat = "csv" | "xlsx";
```

- [ ] **Step 4: Extend formal variants with allergens and traceable sources**

Add these records to `types.ts` and merge the two new properties into the existing `IngredientVariant` interface:

```ts
export interface IngredientVariantAllergens {
  contains: string[];
  mayContain: string[];
}

export interface IngredientSourceAttachment {
  id: EntityId;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

// Add to the existing IngredientVariant interface.
allergens: IngredientVariantAllergens;
sourceAttachments: IngredientSourceAttachment[];

// Add to the existing IngredientVariantInput interface.
allergens: IngredientVariantAllergens;
```

Browser v2→v3 migration initializes both values empty for existing variants. Existing Rust and browser save callers are updated to send `{ contains: [], mayContain: [] }`; source attachments remain server-managed and are not accepted from ordinary variant input.

- [ ] **Step 5: Extend `DesktopApi` with exact method names**

```ts
createIngredientImportJob(request: IngredientImportJobRequest): Promise<IngredientImportJob>;
getIngredientImportJob(id: string): Promise<IngredientImportJob>;
listIngredientImportDrafts(jobId: string): Promise<IngredientImportDraft[]>;
updateIngredientImportDraft(id: string, review: ReviewedIngredientImportDraft): Promise<IngredientImportDraft>;
discardIngredientImportDraft(id: string): Promise<void>;
cancelIngredientImportJob(id: string): Promise<IngredientImportJob>;
retryIngredientImportJob(id: string): Promise<IngredientImportJob>;
commitIngredientImportJob(id: string): Promise<IngredientImportCommitResult>;
commitReviewedIngredientImportDraft(id: string, review: ReviewedIngredientImportDraft): Promise<IngredientVariant>;
exportIngredientTemplate(format: IngredientExchangeFormat, destinationPath: string): Promise<void>;
exportIngredientLibrary(format: IngredientExchangeFormat, destinationPath: string): Promise<void>;
cleanupOrphanAttachments(): Promise<number>;
```

Add `import_failure`, `attachment_failure`, `unsupported_file`, and `invalid_state` to `DesktopErrorCode`.

- [ ] **Step 6: Add expected Tauri invoke payloads to the adapter test**

```ts
await api.createIngredientImportJob({
  sourceKind: "spreadsheet",
  files: [{ kind: "native_path", value: "/selected/import.xlsx" }],
});
expect(invoke).toHaveBeenCalledWith("create_ingredient_import_job", {
  request: {
    sourceKind: "spreadsheet",
    files: [{ kind: "native_path", value: "/selected/import.xlsx" }],
  },
});
```

- [ ] **Step 7: Run the focused frontend tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts src/api/tauri-desktop-api.test.ts`

Expected: PASS for the type contract and adapter payload assertions; full typecheck remains red until Task 8 implements both adapters.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/api
git commit -m "feat(imports): define ingredient exchange contract"
```

---

### Task 2: Add SQLite schema version 2 for imports, attachments, and allergens

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0002_ingredient_import.sql`
- Modify: `apps/desktop/src-tauri/src/database/migrations.rs`
- Create: `apps/desktop/src-tauri/tests/import_migrations.rs`

**Interfaces:**
- Consumes: schema version 1 tables `ingredient_variants`, `workspace_drafts`, and `schema_migrations`.
- Produces: schema version 2 tables used by `IngestRepository` and later Agent persistence.

- [ ] **Step 1: Write failing migration tests**

```rust
#[test]
fn version_two_adds_import_and_attachment_tables() {
    let repository = IngredientRepository::open_in_memory().unwrap();
    assert_eq!(repository.database_status().unwrap().schema_version, 2);
    for table in [
        "source_attachments",
        "attachment_extractions",
        "ingredient_import_jobs",
        "ingredient_import_drafts",
        "import_draft_attachments",
        "import_draft_source_links",
        "ingredient_variant_attachments",
        "ingredient_variant_allergens",
    ] {
        assert!(table_exists(repository.connection_for_test(), table));
    }
}

#[test]
fn version_one_database_upgrades_without_losing_variants() {
    let database = create_version_one_database_with_variant();
    let repository = IngredientRepository::open(database.path()).unwrap();
    assert_eq!(repository.list_material_groups("").unwrap()[0].variants.len(), 1);
    assert_eq!(repository.database_status().unwrap().schema_version, 2);
}
```

- [ ] **Step 2: Run the migration test and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_migrations`

Expected: FAIL because schema version remains 1 and the new tables do not exist.

- [ ] **Step 3: Create the version 2 SQL migration**

The migration must create the exact storage boundary below:

```sql
CREATE TABLE source_attachments (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE attachment_extractions (
  attachment_id TEXT PRIMARY KEY REFERENCES source_attachments(id) ON DELETE CASCADE,
  extractor_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ingredient_import_jobs (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('spreadsheet', 'documents', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'extracting', 'recognizing', 'grouping', 'drafts_ready', 'partially_completed', 'failed', 'cancelled')),
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ingredient_import_drafts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ingredient_import_jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('needs_review', 'ready', 'imported', 'discarded', 'failed')),
  review_json TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  imported_variant_id TEXT REFERENCES ingredient_variants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, position)
);

CREATE TABLE import_draft_attachments (
  draft_id TEXT NOT NULL REFERENCES ingredient_import_drafts(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (draft_id, attachment_id)
);

CREATE TABLE import_draft_source_links (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES ingredient_import_drafts(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  source_locator TEXT,
  UNIQUE(draft_id, field_path, attachment_id, source_locator)
);

CREATE TABLE ingredient_variant_attachments (
  ingredient_variant_id TEXT NOT NULL REFERENCES ingredient_variants(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (ingredient_variant_id, attachment_id)
);

CREATE TABLE ingredient_variant_allergens (
  ingredient_variant_id TEXT NOT NULL REFERENCES ingredient_variants(id) ON DELETE CASCADE,
  allergen_name TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('contains', 'may_contain')),
  PRIMARY KEY (ingredient_variant_id, allergen_name, relation)
);

CREATE INDEX ingredient_import_jobs_status_idx ON ingredient_import_jobs(status, updated_at);
CREATE INDEX ingredient_import_drafts_job_idx ON ingredient_import_drafts(job_id, position);
CREATE INDEX import_draft_source_links_attachment_idx ON import_draft_source_links(attachment_id);
```

- [ ] **Step 4: Apply ordered migrations in one transaction each**

Replace the one-off version check with an ordered slice:

```rust
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/0001_initial.sql")),
    (2, include_str!("../../migrations/0002_ingredient_import.sql")),
];

for (version, sql) in MIGRATIONS {
    if *version <= current {
        continue;
    }
    let transaction = connection.transaction()?;
    transaction.execute_batch(sql)?;
    transaction.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
        rusqlite::params![version, applied_at],
    )?;
    transaction.commit()?;
}
```

- [ ] **Step 5: Run migration and existing repository tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_migrations --test ingredient_repository`

Expected: PASS; the existing database-status assertion is updated from schema version 1 to 2.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/migrations apps/desktop/src-tauri/src/database/migrations.rs apps/desktop/src-tauri/tests
git commit -m "feat(imports): add attachment and import schema"
```

---

### Task 3: Implement import models and deterministic validation

**Files:**
- Create: `apps/desktop/src-tauri/src/ingest/mod.rs`
- Create: `apps/desktop/src-tauri/src/ingest/model.rs`
- Create: `apps/desktop/src-tauri/src/ingest/validation.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/tests/import_validation.rs`

**Interfaces:**
- Consumes: Task 1 JSON field names and existing ingredient decimal rules.
- Produces: `validate_review(&ReviewedIngredientImportDraft) -> Vec<ImportIssue>` and serde-compatible Rust types.

- [ ] **Step 1: Write failing validation tests**

```rust
#[test]
fn validation_preserves_unknown_and_confirmed_zero() {
    let mut review = valid_review();
    review.nutrients = vec![
        nutrient("蛋白质", "g", None),
        nutrient("脂肪", "g", Some("0")),
    ];
    let issues = validate_review(&review);
    assert!(!issues.iter().any(|issue| issue.field_path.as_deref() == Some("nutrients.1.value")));
    let json = serde_json::to_value(review).unwrap();
    assert_eq!(json["nutrients"][0]["value"], serde_json::Value::Null);
    assert_eq!(json["nutrients"][1]["value"], "0");
}

#[test]
fn validation_requires_explicit_basis_and_price_unit() {
    let mut review = valid_review();
    review.nutrition_basis = None;
    review.current_price = Some("31.50".into());
    review.price_unit = None;
    let fields = validate_review(&review)
        .into_iter()
        .filter_map(|issue| issue.field_path)
        .collect::<Vec<_>>();
    assert!(fields.contains(&"nutritionBasis".to_string()));
    assert!(fields.contains(&"priceUnit".to_string()));
}
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_validation`

Expected: FAIL because the `ingest` module does not exist.

- [ ] **Step 3: Mirror the public contract in Rust**

Use `#[serde(rename_all = "camelCase")]` on all public structs and define status enums with `#[serde(rename_all = "snake_case")]`. The central review record is:

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewedIngredientImportDraft {
    pub material_group_id: Option<String>,
    pub material_name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: String,
    pub model_or_specification: String,
    pub current_price: Option<String>,
    pub price_unit: Option<String>,
    pub density_g_per_ml: Option<String>,
    pub nutrition_basis: Option<String>,
    pub nutrients: Vec<ImportedNutrientValue>,
    pub contains_allergens: Vec<String>,
    pub may_contain_allergens: Vec<String>,
    pub source: String,
    pub research_notes: String,
    #[serde(default)]
    pub duplicate_confirmed: bool,
}
```

- [ ] **Step 4: Implement exact validation rules**

```rust
pub fn validate_review(review: &ReviewedIngredientImportDraft) -> Vec<ImportIssue> {
    let mut issues = Vec::new();
    required(&review.material_name, "materialName", "请填写通用原料名称", &mut issues);
    required(&review.supplier_name, "supplierName", "请填写供应商名称", &mut issues);
    if !matches!(review.nutrition_basis.as_deref(), Some("per_100g" | "per_100ml")) {
        error("invalid_basis", "nutritionBasis", "请选择每100g或每100mL", &mut issues);
    }
    if review.current_price.is_some() && review.price_unit.is_none() {
        error("missing_required", "priceUnit", "填写价格后必须选择价格单位", &mut issues);
    }
    for (field, value) in [
        ("currentPrice", review.current_price.as_deref()),
        ("densityGPerMl", review.density_g_per_ml.as_deref()),
    ] {
        if value.is_some_and(|item| !is_unsigned_decimal(item)) {
            error("invalid_decimal", field, "请输入非负十进制数", &mut issues);
        }
    }
    for (index, nutrient) in review.nutrients.iter().enumerate() {
        if nutrient.value.as_deref().is_some_and(|item| !is_unsigned_decimal(item)) {
            error("invalid_decimal", &format!("nutrients.{index}.value"), "营养值格式无效", &mut issues);
        }
    }
    issues
}
```

Trim strings before validation, deduplicate allergens case-insensitively, reject a name appearing in both allergen arrays, and never transform `None` into `Some("0")`.

- [ ] **Step 5: Run Rust validation and serialization tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_validation --test ingredient_commands`

Expected: PASS with camel-case JSON and distinct `null`/`"0"` values.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/ingest apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/import_validation.rs
git commit -m "feat(imports): validate reviewed ingredient drafts"
```

---

### Task 4: Store and deduplicate source attachments

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/ingest/attachment_store.rs`
- Create: `apps/desktop/src-tauri/tests/attachment_store.rs`

**Interfaces:**
- Consumes: an application-owned attachment root and user-selected source paths.
- Produces: `AttachmentStore::stage(path) -> StagedAttachment`, `open_for_extract(relative_path)`, and `remove_orphans(referenced_hashes) -> usize`.

- [ ] **Step 1: Write failing hash, deduplication, and cleanup tests**

```rust
#[test]
fn equal_content_is_stored_once_without_exposing_source_path() {
    let fixture = AttachmentFixture::new();
    let first = fixture.write_source("front.png", b"same-content");
    let second = fixture.write_source("back.png", b"same-content");
    let a = fixture.store.stage(&first).unwrap();
    let b = fixture.store.stage(&second).unwrap();
    assert_eq!(a.sha256, b.sha256);
    assert_eq!(a.relative_path, b.relative_path);
    assert!(!serde_json::to_string(&a).unwrap().contains(first.to_str().unwrap()));
    assert_eq!(fixture.stored_file_count(), 1);
}

#[test]
fn cleanup_removes_only_unreferenced_files() {
    let fixture = AttachmentFixture::new();
    let keep = fixture.stage("keep.txt", b"keep");
    fixture.stage("drop.txt", b"drop");
    assert_eq!(fixture.store.remove_orphans(&[keep.sha256].into()).unwrap(), 1);
    assert_eq!(fixture.stored_file_count(), 1);
}
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test attachment_store`

Expected: FAIL because `AttachmentStore` is undefined.

- [ ] **Step 3: Add focused file dependencies**

Add `sha2 = "0.10"`, `hex = "0.4"`, and `mime_guess = "2"` to Rust dependencies. Do not add a general Tauri filesystem permission.

- [ ] **Step 4: Implement content-addressed storage**

```rust
pub fn stage(&self, source: &Path) -> Result<StagedAttachment, IngestError> {
    let metadata = std::fs::metadata(source).map_err(IngestError::attachment)?;
    if !metadata.is_file() {
        return Err(IngestError::domain("attachment_failure", "只能导入普通文件"));
    }
    let bytes = std::fs::read(source).map_err(IngestError::attachment)?;
    let sha256 = hex::encode(sha2::Sha256::digest(&bytes));
    let extension = safe_extension(source);
    let relative_path = format!("{}/{}.{}", &sha256[..2], sha256, extension);
    let destination = self.root.join(&relative_path);
    if !destination.exists() {
        std::fs::create_dir_all(destination.parent().unwrap()).map_err(IngestError::attachment)?;
        let temporary = destination.with_extension("partial");
        std::fs::write(&temporary, &bytes).map_err(IngestError::attachment)?;
        std::fs::rename(temporary, &destination).map_err(IngestError::attachment)?;
    }
    Ok(StagedAttachment::from_path(source, metadata.len(), sha256, relative_path))
}
```

Allow only `jpg`, `jpeg`, `png`, `webp`, `pdf`, `docx`, `xlsx`, `csv`, and `txt`. Normalize unknown media types to `application/octet-stream`, sanitize display names, and never follow a symlink after metadata validation.

- [ ] **Step 5: Run the attachment tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test attachment_store`

Expected: PASS for deduplication, atomic copy, extension allow-list, and orphan cleanup.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/ingest/attachment_store.rs apps/desktop/src-tauri/tests/attachment_store.rs
git commit -m "feat(imports): preserve deduplicated source attachments"
```

---

### Task 5: Extract deterministic content from supported files

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/mod.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/text.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/csv.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/xlsx.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/docx.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/pdf.rs`
- Create: `apps/desktop/src-tauri/src/ingest/extractors/image.rs`
- Create: `apps/desktop/src-tauri/tests/document_extractors.rs`
- Create: `apps/desktop/src-tauri/tests/fixtures/imports/`

**Interfaces:**
- Consumes: `AttachmentStore::open_for_extract` and attachment metadata.
- Produces: `DocumentExtractor::extract(&StoredAttachment) -> ExtractedDocument`.

- [ ] **Step 1: Write one failing contract test per format**

```rust
#[test]
fn extracts_text_tables_and_marks_images_for_vision() {
    let cases = [
        ("sample.txt", ExtractedKind::Text, false),
        ("sample.csv", ExtractedKind::Table, false),
        ("sample.xlsx", ExtractedKind::Table, false),
        ("sample.docx", ExtractedKind::Text, false),
        ("sample.pdf", ExtractedKind::Text, false),
        ("label.png", ExtractedKind::Image, true),
    ];
    for (name, kind, requires_vision) in cases {
        let document = fixture().extract(name).unwrap();
        assert_eq!(document.kind, kind);
        assert_eq!(document.requires_vision, requires_vision);
        assert_eq!(document.source_name, name);
    }
}
```

Add tests that password-protected or damaged PDF/DOCX/XLSX files return `password_protected` or `damaged_file` without panicking.

- [ ] **Step 2: Run extractor tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test document_extractors`

Expected: FAIL because the extractor dispatch and fixtures do not exist.

- [ ] **Step 3: Add parser dependencies and common output types**

Add `csv = "1"`, `calamine = "0.31"`, `quick-xml = "0.38"`, `zip = "4"`, `pdf-extract = "0.10"`, and `image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }`.

```rust
pub struct ExtractedDocument {
    pub attachment_id: String,
    pub source_name: String,
    pub kind: ExtractedKind,
    pub text_blocks: Vec<ExtractedTextBlock>,
    pub tables: Vec<ExtractedTable>,
    pub requires_vision: bool,
    pub warnings: Vec<ImportIssue>,
}
```

- [ ] **Step 4: Implement extension-based dispatch with content checks**

```rust
pub fn extract(&self, attachment: &StoredAttachment) -> Result<ExtractedDocument, IngestError> {
    let path = self.store.open_for_extract(&attachment.relative_path)?;
    match path.extension().and_then(OsStr::to_str).map(str::to_ascii_lowercase).as_deref() {
        Some("txt") => text::extract(attachment, &path),
        Some("csv") => csv::extract(attachment, &path),
        Some("xlsx") => xlsx::extract(attachment, &path),
        Some("docx") => docx::extract(attachment, &path),
        Some("pdf") => pdf::extract(attachment, &path),
        Some("jpg" | "jpeg" | "png" | "webp") => image::extract_metadata(attachment, &path),
        _ => Err(IngestError::domain("unsupported_file", "不支持该文件格式")),
    }
}
```

DOCX reads only `word/document.xml`; XLSX ignores formulas and consumes displayed cell values; PDF extracts embedded text only; images return dimensions and `requires_vision: true`. 3A does not perform OCR or visual recognition.

- [ ] **Step 5: Run all extractor tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test document_extractors`

Expected: PASS for all eight extensions and actionable damaged/password-protected errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/ingest/extractors apps/desktop/src-tauri/tests/document_extractors.rs apps/desktop/src-tauri/tests/fixtures/imports
git commit -m "feat(imports): extract supported source documents"
```

---

### Task 6: Parse and export the Chinese CSV/XLSX ingredient template

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/ingest/spreadsheet.rs`
- Create: `apps/desktop/src-tauri/tests/spreadsheet_exchange.rs`
- Create: `apps/desktop/src-tauri/tests/fixtures/imports/ingredient-template.csv`

**Interfaces:**
- Consumes: `ExtractedTable`, `ReviewedIngredientImportDraft`, and Task 3 validation.
- Produces: `parse_ingredient_table`, `write_template`, and `write_library_export`.

- [ ] **Step 1: Write failing Chinese header and round-trip tests**

```rust
#[test]
fn empty_and_zero_nutrient_cells_remain_distinct() {
    let drafts = parse_csv("通用原料名称,供应商名称,营养基准,蛋白质(g),脂肪(g)\n脱脂乳粉,供应商A,每100g,,0\n").unwrap();
    assert_eq!(drafts[0].nutrients[0].value, None);
    assert_eq!(drafts[0].nutrients[1].value.as_deref(), Some("0"));
}

#[test]
fn multiple_suppliers_create_multiple_rows_under_one_material() {
    let drafts = parse_fixture("two-suppliers.xlsx").unwrap();
    assert_eq!(drafts.len(), 2);
    assert_eq!(drafts[0].material_name, "脱脂乳粉");
    assert_ne!(drafts[0].supplier_name, drafts[1].supplier_name);
}

#[test]
fn errors_include_human_row_column_and_field() {
    let error = parse_csv("通用原料名称,供应商名称,营养基准,钠(mg)\n脱脂乳粉,供应商A,每100g,12mg\n").unwrap_err();
    assert_eq!(error.issues[0].row, Some(2));
    assert_eq!(error.issues[0].column.as_deref(), Some("钠(mg)"));
    assert_eq!(error.issues[0].field_path.as_deref(), Some("nutrients.sodium.value"));
}
```

- [ ] **Step 2: Run spreadsheet tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test spreadsheet_exchange`

Expected: FAIL because the template mapper does not exist.

- [ ] **Step 3: Define the exact first-version columns**

Use this order for CSV and XLSX:

```rust
pub const TEMPLATE_HEADERS: [&str; 21] = [
    "通用原料名称", "分类", "供应商名称", "型号/规格", "当前含税价", "价格单位",
    "密度(g/mL)", "营养基准", "能量(kJ)", "蛋白质(g)", "脂肪(g)", "饱和脂肪(g)",
    "碳水化合物(g)", "糖(g)", "膳食纤维(g)", "钠(mg)", "含有过敏原",
    "可能含有过敏原", "数据来源", "研发备注", "来源文件",
];
```

Required headers are `通用原料名称`, `供应商名称`, and `营养基准`. Accept `每100g`/`per_100g` and `每100mL`/`per_100ml`; export always uses the Chinese labels. Split allergen names on `、`, `,`, `，`, or `;` and trim without translating names.

- [ ] **Step 4: Implement row mapping and formula-safe export**

```rust
fn cell_to_nullable_decimal(cell: &str, row: usize, column: &str) -> Result<Option<String>, ImportIssue> {
    let value = cell.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if !is_unsigned_decimal(value) {
        return Err(cell_issue("invalid_decimal", row, column, "请输入不带单位的非负数字"));
    }
    Ok(Some(value.to_string()))
}

fn safe_export_text(value: &str) -> String {
    if value.chars().next().is_some_and(|first| matches!(first, '=' | '+' | '-' | '@')) {
        format!("'{value}")
    } else {
        value.to_string()
    }
}
```

Add `rust_xlsxwriter = "0.92"` for XLSX output. Template row 2 contains examples and data validation dropdowns for price unit and nutrition basis; importer ignores a completely empty row.

- [ ] **Step 5: Run CSV/XLSX round-trip tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test spreadsheet_exchange`

Expected: PASS; exported and re-imported records preserve basis, decimal strings, allergens, source, notes, `null`, and `"0"`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/ingest/spreadsheet.rs apps/desktop/src-tauri/tests/spreadsheet_exchange.rs apps/desktop/src-tauri/tests/fixtures/imports
git commit -m "feat(imports): exchange Chinese ingredient spreadsheets"
```

---

### Task 7: Persist jobs and commit reviewed drafts atomically

**Files:**
- Create: `apps/desktop/src-tauri/src/ingest/repository.rs`
- Create: `apps/desktop/src-tauri/src/ingest/coordinator.rs`
- Modify: `apps/desktop/src-tauri/src/ingredients/model.rs`
- Modify: `apps/desktop/src-tauri/src/ingredients/repository.rs`
- Create: `apps/desktop/src-tauri/tests/import_repository.rs`
- Create: `apps/desktop/src-tauri/tests/import_coordinator.rs`

**Interfaces:**
- Consumes: Tasks 2–6 storage, attachment, extraction, spreadsheet, and validation functions.
- Produces: `IngredientIngestCoordinator` methods matching the Task 1 desktop contract.

- [ ] **Step 1: Write failing lifecycle and transaction tests**

```rust
#[test]
fn spreadsheet_job_moves_to_drafts_ready_and_survives_reopen() {
    let fixture = IngestFixture::file_database();
    let job = fixture.coordinator.create_job(fixture.two_supplier_request()).unwrap();
    assert_eq!(job.status, IngredientImportJobStatus::DraftsReady);
    drop(fixture.coordinator);
    let reopened = fixture.reopen();
    assert_eq!(reopened.get_job(&job.id).unwrap().status, IngredientImportJobStatus::DraftsReady);
    assert_eq!(reopened.list_drafts(&job.id).unwrap().len(), 2);
}

#[test]
fn whole_job_failure_rolls_back_categories_suppliers_variants_and_links() {
    let mut fixture = IngestFixture::memory();
    let job = fixture.job_with_one_valid_and_one_invalid_draft();
    assert!(fixture.coordinator.commit_job(&job.id).is_err());
    assert!(fixture.ingredients.list_material_groups("").unwrap().is_empty());
    assert!(fixture.ingredients.list_suppliers("").unwrap().is_empty());
    assert_eq!(fixture.variant_attachment_count(), 0);
}

#[test]
fn reviewed_single_draft_links_attachments_only_after_commit() {
    let mut fixture = IngestFixture::memory();
    let draft = fixture.valid_draft();
    let saved = fixture.coordinator.commit_reviewed_draft(&draft.id, draft.review).unwrap();
    assert_eq!(fixture.variant_attachment_ids(&saved.id), draft.attachment_ids());
    assert_eq!(fixture.get_draft(&draft.id).unwrap().status, IngredientImportDraftStatus::Imported);
}
```

- [ ] **Step 2: Run repository tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_repository --test import_coordinator`

Expected: FAIL because job persistence and commit orchestration do not exist.

- [ ] **Step 3: Implement guarded job state transitions**

```rust
fn may_transition(from: &IngredientImportJobStatus, to: &IngredientImportJobStatus) -> bool {
    matches!((from, to),
        (Pending, Extracting)
        | (Extracting, Recognizing)
        | (Extracting, Grouping)
        | (Recognizing, Grouping)
        | (Grouping, DraftsReady)
        | (DraftsReady, PartiallyCompleted)
        | (PartiallyCompleted, DraftsReady)
        | (Pending | Extracting | Recognizing | Grouping | DraftsReady | PartiallyCompleted | Failed, Cancelled)
        | (Failed | Cancelled, Pending)
    )
}
```

Every state update writes `updated_at` in the same transaction. Retrying reuses staged attachments and creates no duplicate file rows. Persist each successful deterministic extraction to `attachment_extractions`; a source-kind `agent` job stops at `recognizing` until the 3B runtime takes ownership, while spreadsheet jobs continue through `grouping` to `drafts_ready`. When a draft is created, append its original attachment names to `review.source` once, preserving any explicit source text and preventing duplicate names on retry.

- [ ] **Step 4: Implement reviewed draft materialization inside one transaction**

The transaction performs this order: validate; find-or-create category; find-or-create supplier; find-or-create material group; find-or-create custom nutrient definitions; call the existing variant upsert using the transaction; replace allergens; link attachments; mark the draft imported; commit. Extract the existing variant SQL into `save_variant_in_transaction` so imports and normal form saves share validation and uniqueness rules. Extend Rust `IngredientVariant` and `IngredientVariantInput` with the same allergen fields as TypeScript, and have every variant read load `sourceAttachments` from `ingredient_variant_attachments`.

```rust
pub fn commit_reviewed_draft(
    &mut self,
    draft_id: &str,
    review: ReviewedIngredientImportDraft,
) -> Result<IngredientVariant, IngestError> {
    let issues = validate_review(&review);
    if issues.iter().any(|issue| issue.severity == ImportIssueSeverity::Error) {
        return Err(IngestError::validation(issues));
    }
    let transaction = self.connection.transaction()?;
    let resolved = resolve_references(&transaction, &review, &self.create_id, &self.clock)?;
    let variant = save_import_variant(&transaction, resolved, &review, &self.create_id, &self.clock)?;
    replace_allergens(&transaction, &variant.id, &review)?;
    link_draft_attachments(&transaction, draft_id, &variant.id)?;
    mark_draft_imported(&transaction, draft_id, &variant.id, &(self.clock)())?;
    transaction.commit()?;
    self.ingredients.get_variant(&variant.id).map_err(Into::into)
}
```

- [ ] **Step 5: Implement whole-job commit and recovery cleanup**

`commit_job` must use one outer transaction for every non-discarded draft and return `IngredientImportCommitResult`. On application startup, change interrupted `extracting` or `grouping` jobs to `failed` with `errorSummary = "应用上次在处理中退出，可安全重试"`; keep their drafts and attachments.

- [ ] **Step 6: Run ingest, ingredient, and reopen tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_repository --test import_coordinator --test ingredient_repository`

Expected: PASS with no partial rows, no timestamp changes on failure, and recoverable persisted jobs.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/ingest apps/desktop/src-tauri/src/ingredients/model.rs apps/desktop/src-tauri/src/ingredients/repository.rs apps/desktop/src-tauri/tests/import_repository.rs apps/desktop/src-tauri/tests/import_coordinator.rs
git commit -m "feat(imports): commit reviewed drafts transactionally"
```

---

### Task 8: Expose controlled Tauri commands and browser-demo parity

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/ingest.rs`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/src/api/tauri-desktop-api.ts`
- Modify: `apps/desktop/src/api/browser-schema.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.test.ts`
- Create: `apps/desktop/src/api/import-file-picker.ts`
- Create: `apps/desktop/src/api/import-file-picker.test.ts`
- Modify: `apps/desktop/src-tauri/tests/ingredient_commands.rs`

**Interfaces:**
- Consumes: `IngredientIngestCoordinator` and Task 1 `DesktopApi`.
- Produces: registered commands, a Tauri adapter, browser schema v3, and `ImportFilePicker`.

- [ ] **Step 1: Write failing command-registration and browser-parity tests**

```rust
#[test]
fn every_import_command_is_registered() {
    for command in [
        "create_ingredient_import_job",
        "get_ingredient_import_job",
        "list_ingredient_import_drafts",
        "update_ingredient_import_draft",
        "commit_ingredient_import_job",
        "commit_reviewed_ingredient_import_draft",
        "export_ingredient_template",
        "export_ingredient_library",
        "cleanup_orphan_attachments",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}
```

```ts
it("creates deterministic demo drafts without native file access", async () => {
  const job = await api.createIngredientImportJob({
    sourceKind: "spreadsheet",
    files: [{ kind: "browser_demo", value: "演示原料.xlsx" }],
  });
  const drafts = await api.listIngredientImportDrafts(job.id);
  expect(job.status).toBe("drafts_ready");
  expect(drafts[0].attachments[0].originalName).toBe("演示原料.xlsx");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ingredient_commands`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/browser-demo-api.test.ts src/api/import-file-picker.test.ts`

Expected: FAIL because commands, browser schema v3, and picker do not exist.

- [ ] **Step 3: Add and initialize the dialog plugin**

Add `@tauri-apps/plugin-dialog` version `2.4.2` to desktop dependencies and `tauri-plugin-dialog = "2"` to Rust dependencies. Initialize with `.plugin(tauri_plugin_dialog::init())`. Add only `dialog:allow-open` and `dialog:allow-save` to the main-window capability; do not add shell or blanket filesystem permissions.

- [ ] **Step 4: Implement the picker boundary**

```ts
export interface ImportFilePicker {
  pickSources(): Promise<ImportFileReference[]>;
  pickDestination(format: IngredientExchangeFormat, defaultName: string): Promise<string | null>;
}

export class TauriImportFilePicker implements ImportFilePicker {
  async pickSources() {
    const selected = await open({ multiple: true, directory: false, filters: [INGREDIENT_SOURCE_FILTER] });
    const paths = selected === null ? [] : Array.isArray(selected) ? selected : [selected];
    return paths.map((value) => ({ kind: "native_path" as const, value }));
  }
  async pickDestination(format: IngredientExchangeFormat, defaultName: string) {
    return save({ defaultPath: `${defaultName}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  }
}
```

The browser picker uses an injected hidden `<input type="file" multiple>` and returns only `browser_demo` names; `BrowserDemoApi` generates fixed demo draft contents and never reads bytes.

- [ ] **Step 5: Implement narrow commands and both adapters**

Each command acquires `AppState`, calls one coordinator method, and maps `IngestError` to `CommandError` without including SQL, API keys, or absolute paths. Update `AppState` to own both `IngredientRepository` and `IngredientIngestCoordinator` behind one mutex so cross-repository transactions share one connection rather than nested locks.

- [ ] **Step 6: Upgrade browser storage to schema v3**

Add `importJobs`, `importDrafts`, and `attachments` maps. Migration v2→v3 copies all v2 ingredient data unchanged and initializes the three maps empty. Browser `commitIngredientImportJob` must stage every formal change in a cloned state and call `writeBrowserState` once.

- [ ] **Step 7: Run adapter, command, migration, and type tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api && pnpm --filter @food-rd/desktop typecheck`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ingredient_commands --test import_migrations`

Expected: PASS; SQLite and browser-demo adapters satisfy the same import contract.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/api apps/desktop/src-tauri
git commit -m "feat(imports): expose desktop import commands"
```

---

### Task 9: Build the import preview and export UI

**Files:**
- Create: `apps/desktop/src/features/imports/IngredientExchangeMenu.tsx`
- Create: `apps/desktop/src/features/imports/IngredientImportDrawer.tsx`
- Create: `apps/desktop/src/features/imports/IngredientImportPreview.tsx`
- Create: `apps/desktop/src/features/imports/ImportIssueList.tsx`
- Create: `apps/desktop/src/features/imports/AllergenEditor.tsx`
- Create: `apps/desktop/src/features/imports/SourceAttachmentList.tsx`
- Create: `apps/desktop/src/features/imports/useIngredientImport.ts`
- Create: `apps/desktop/src/features/imports/IngredientImportDrawer.test.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.test.tsx`
- Modify: `apps/desktop/src/features/ingredients/VariantEditor.tsx`
- Modify: `apps/desktop/src/features/ingredients/VariantEditor.test.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: Task 8 `DesktopApi`, `ImportFilePicker`, and import records.
- Produces: a complete no-model import/export workflow reachable from the ingredient toolbar.

- [ ] **Step 1: Write failing user-flow tests**

```tsx
it("previews rows and blocks commit while errors remain", async () => {
  render(<IngredientImportDrawer api={apiWithDrafts([invalidDraft])} filePicker={picker} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "选择原料资料" }));
  expect(await screen.findByText("第 2 行 · 钠(mg)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认导入全部" })).toBeDisabled();
});

it("imports two supplier rows only after explicit confirmation", async () => {
  render(<IngredientImportDrawer api={apiWithDrafts(twoReadyDrafts)} filePicker={picker} onClose={vi.fn()} onCommitted={onCommitted} />);
  await user.click(screen.getByRole("button", { name: "确认导入全部" }));
  expect(api.commitIngredientImportJob).toHaveBeenCalledWith("job-1");
  expect(onCommitted).toHaveBeenCalledWith(expect.objectContaining({ variants: expect.arrayContaining([
    expect.objectContaining({ supplierName: "供应商A" }),
    expect.objectContaining({ supplierName: "供应商B" }),
  ]) }));
});
```

- [ ] **Step 2: Run the UI tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/imports/IngredientImportDrawer.test.tsx src/features/ingredients/IngredientLibrary.test.tsx`

Expected: FAIL because the toolbar controls and drawer do not exist.

- [ ] **Step 3: Add a compact data-exchange menu to the ingredient toolbar**

Provide four actions: `导入原料资料`, `下载 CSV 模板`, `下载 XLSX 模板`, and `导出原料库`. Template/export actions open the destination dialog and show success or structured failure without navigating away.

- [ ] **Step 4: Implement job progress and preview editing**

`useIngredientImport` owns only `job`, `drafts`, `loading`, and `error`. The drawer shows one row per supplier draft, source-file chips, status, and issue count. Expanding a row exposes every `ReviewedIngredientImportDraft` field except internal code. Editing calls `updateIngredientImportDraft`; an empty nutrient input sends `null`, while typing `0` sends `"0"`.

```tsx
<input
  aria-label={`${nutrient.name}（${nutrient.unit}）`}
  inputMode="decimal"
  onChange={(event) => updateNutrient(index, event.target.value === "" ? null : event.target.value)}
  value={nutrient.value ?? ""}
/>
```

- [ ] **Step 5: Require explicit confirmation for formal writes**

Disable `确认导入全部` if any non-discarded draft has an error issue. Before calling `commitIngredientImportJob`, display `将正式保存 N 个供应商版本，是否继续？`; if drafts contain unmatched custom nutrients, list their names and units in the same confirmation and state that new nutrient definitions will be created. A failure leaves the drawer, job, and edits intact for correction.

- [ ] **Step 6: Show allergens and source attachments in normal variant editing**

Add `AllergenEditor` and `SourceAttachmentList` below nutrition in both import review and the existing `VariantEditor`. Normal supplier versions can add/remove `contains` and `mayContain` allergen names; linked source files are read-only chips showing original name, media type, and size. Saving an ordinary existing variant preserves current source links and replaces its allergen rows transactionally.

- [ ] **Step 7: Add responsive styling and accessible states**

At widths below 900 px, the drawer overlays the library instead of shrinking the table. Give progress updates `aria-live="polite"`, errors `role="alert"`, and the dialog an accessible name. Source paths are never rendered; only original file names appear.

- [ ] **Step 8: Run focused UI tests, typecheck, and build**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/imports src/features/ingredients/IngredientLibrary.test.tsx`

Run: `pnpm --filter @food-rd/desktop typecheck && pnpm --filter @food-rd/desktop build`

Expected: all tests PASS and the production build completes.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/features/imports apps/desktop/src/features/ingredients/IngredientLibrary.tsx apps/desktop/src/features/ingredients/IngredientLibrary.test.tsx apps/desktop/src/features/ingredients/VariantEditor.tsx apps/desktop/src/features/ingredients/VariantEditor.test.tsx apps/desktop/src/styles/app.css
git commit -m "feat(imports): add ingredient exchange preview"
```

---

### Task 10: Verify recovery, cleanup, and the complete 3A acceptance path

**Files:**
- Create: `apps/desktop/src-tauri/tests/ingredient_import_e2e.rs`
- Create: `apps/desktop/src/features/imports/ingredient-import-e2e.test.tsx`
- Create: `docs/testing/phase-3a-ingredient-exchange-checklist.md`
- Modify: `docs/superpowers/plans/2026-07-15-food-rd-roadmap.md`

**Interfaces:**
- Consumes: the complete 3A feature.
- Produces: regression coverage and a human checklist proving 3A can ship independently.

- [ ] **Step 1: Write the end-to-end Rust acceptance test**

```rust
#[test]
fn eight_files_and_three_rows_commit_only_reviewed_records() {
    let mut fixture = AcceptanceFixture::with_eight_sources();
    let job = fixture.create_job().unwrap();
    let drafts = fixture.list_drafts(&job.id).unwrap();
    assert_eq!(drafts.len(), 3);
    fixture.discard_draft(&drafts[2].id).unwrap();
    let result = fixture.commit_job(&job.id).unwrap();
    assert_eq!(result.variants.len(), 2);
    assert_eq!(fixture.persisted_variant_count(), 2);
    assert_eq!(fixture.variant_suppliers_for("脱脂乳粉"), vec!["供应商A", "供应商B"]);
}
```

- [ ] **Step 2: Write the restart and orphan-cleanup test**

Stage a job, close the repository before commit, reopen it, verify the drafts and attachments remain, discard the job, call `cleanupOrphanAttachments`, and assert only attachments referenced by formal variants remain.

- [ ] **Step 3: Run the new tests and fix only demonstrated failures**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ingredient_import_e2e`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/imports/ingredient-import-e2e.test.tsx`

Expected: PASS for two reviewed saves, one discarded draft, restart recovery, and orphan cleanup.

- [ ] **Step 4: Write the human test checklist**

The checklist must cover CSV and XLSX templates, two suppliers under one material, custom category, custom nutrient, both allergen relations, `null` versus `"0"`, per-100g versus per-100mL, corrupted files, duplicate confirmation, cancellation, restart recovery, export round-trip, and confirmation that no model setting is needed.

- [ ] **Step 5: Link both Phase 3 plans from the roadmap**

Add these entries under `计划文件`:

```markdown
- 第三阶段 3A 详细计划：docs/superpowers/plans/2026-07-19-phase-3a-ingredient-data-exchange.md
- 第三阶段 3B 详细计划：docs/superpowers/plans/2026-07-19-phase-3b-food-rd-agent.md
```

- [ ] **Step 6: Run the complete regression suite**

Run: `pnpm test && pnpm typecheck && pnpm build`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: all TypeScript, React, core, Rust, migration, import, and existing supplier-library tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/tests/ingredient_import_e2e.rs apps/desktop/src/features/imports/ingredient-import-e2e.test.tsx docs/testing/phase-3a-ingredient-exchange-checklist.md docs/superpowers/plans/2026-07-15-food-rd-roadmap.md
git commit -m "test(imports): verify ingredient exchange workflow"
```
