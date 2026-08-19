import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  RecipeVersion,
} from "../../api/recipe-types";
import { recipeVersionOutputMass } from "../../api/recipe-output-mass";
import type {
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import {
  DataQualityDrawer,
  type DataQualityDrawerContent,
} from "../data-quality/DataQualityDrawer";
import {
  buildVariantDataGapReport,
  buildVersionDataGapReport,
} from "../data-quality/data-quality";
import { loadRecipeVersionClosure } from "./recipe-current-price";

interface RecipeIngredientPickerProps {
  api: DesktopApi;
  open: boolean;
  recipeId: string;
  onAddIngredient(
    group: MaterialGroup,
    variant: IngredientVariant,
  ): void;
  onAddVersion(version: RecipeVersion): void;
  onClose(): void;
}

type PickerTab = "ingredients" | "versions";
type DataFilter = "all" | "complete";
type IngredientSort = "updated" | "price";
type Selection =
  | {
      kind: "ingredient";
      group: MaterialGroup;
      variant: IngredientVariant;
    }
  | {
      kind: "version";
      version: RecipeVersion;
    };

export function RecipeIngredientPicker({
  api,
  open,
  recipeId,
  onAddIngredient,
  onAddVersion,
  onClose,
}: RecipeIngredientPickerProps) {
  const [tab, setTab] = useState<PickerTab>("ingredients");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [ingredientSort, setIngredientSort] =
    useState<IngredientSort>("updated");
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [nutrientDefinitions, setNutrientDefinitions] = useState<
    NutrientDefinition[]
  >([]);
  const [dataDrawer, setDataDrawer] =
    useState<DataQualityDrawerContent | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelection(null);
    setQuery("");
    setCategory("all");
    setDataFilter("all");
    setIngredientSort("updated");
    void Promise.all([
      api.listMaterialGroups(),
      api.listRecipes(),
      api.listNutrientDefinitions(),
    ])
      .then(async ([materialGroups, recipes, definitions]) => {
        const semiFinished = recipes.filter(
          (summary) =>
            summary.recipe.kind === "semi_finished" &&
            summary.recipe.id !== recipeId &&
            summary.recipe.archivedAt === null,
        );
        const loadedVersions = (
          await Promise.all(
            semiFinished.map((summary) =>
              api.listRecipeVersions(summary.recipe.id),
            ),
          )
        ).flat();
        if (!active) return;
        setGroups(materialGroups);
        setVersions(loadedVersions);
        setNutrientDefinitions(definitions);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "原料和半成品无法读取",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      active = false;
      window.clearTimeout(focusTimer);
    };
  }, [api, open, recipeId]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    returnFocusRef.current = previousFocus;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const categories = useMemo(
    () =>
      [...new Set(groups.map((group) => group.categoryName).filter(Boolean))]
        .sort((left, right) =>
          (left ?? "").localeCompare(right ?? "", "zh-CN"),
        ) as string[],
    [groups],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleGroups = useMemo(
    () =>
      groups
        .filter(
          (group) =>
            category === "all" || group.categoryName === category,
        )
        .map((group) => {
          const groupMatches = group.name
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery);
          const variants = group.variants
            .filter(
              (variant) =>
                dataFilter === "all" ||
                variant.completeness.percent >= 100,
            )
            .filter(
              (variant) =>
                normalizedQuery === "" ||
                groupMatches ||
                [
                  variant.supplierName,
                  variant.modelOrSpecification,
                  variant.source,
                ]
                  .join(" ")
                  .toLocaleLowerCase("zh-CN")
                  .includes(normalizedQuery),
            )
            .sort((left, right) =>
              compareIngredientVariants(left, right, ingredientSort),
            );
          return { ...group, variants };
        })
        .filter((group) => group.variants.length > 0)
        .sort((left, right) => {
          const variantOrder = compareIngredientVariants(
            left.variants[0]!,
            right.variants[0]!,
            ingredientSort,
          );
          return (
            variantOrder ||
            left.name.localeCompare(right.name, "zh-CN")
          );
        }),
    [
      category,
      dataFilter,
      groups,
      ingredientSort,
      normalizedQuery,
    ],
  );
  const visibleVersions = useMemo(
    () =>
      versions
        .filter((version) =>
          [
            version.snapshot.recipe.name,
            `v${version.versionNumber}`,
            version.createdAt.slice(0, 10),
          ]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery),
        )
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
    [normalizedQuery, versions],
  );

  if (!open) return null;

  function confirmSelection() {
    if (selection?.kind === "ingredient") {
      onAddIngredient(selection.group, selection.variant);
    } else if (selection?.kind === "version") {
      onAddVersion(selection.version);
    } else {
      return;
    }
    onClose();
  }

  function openVariantGaps(group: MaterialGroup, variant: IngredientVariant) {
    setDataDrawer({
      kind: "gaps",
      report: buildVariantDataGapReport(group.name, variant, nutrientDefinitions),
      initialGrouping: "field",
    });
  }

  async function openVersionGaps(version: RecipeVersion) {
    try {
      const referencedVersions = await loadRecipeVersionClosure(
        (id) => api.getRecipeVersion(id),
        version,
      );
      setDataDrawer({
        kind: "gaps",
        report: buildVersionDataGapReport({ rootVersion: version, referencedVersions }),
        initialGrouping: "source",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "缺失数据详情无法读取");
    }
  }

  return (
    <div
      aria-label="关闭原料选择器"
      className="recipe-picker-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <section
        aria-label="添加原料或半成品"
        aria-modal="true"
        className="recipe-picker"
        ref={dialogRef}
        role="dialog"
      >
        <header className="recipe-picker__header">
          <div>
            <h2>添加原料或半成品</h2>
            <p>选择具体供应商原料版本或明确的半成品版本。</p>
          </div>
          <button
            aria-label="关闭原料选择器"
            className="recipe-icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
        </header>

        <label className="recipe-picker__search">
          <Icon name="search" size={18} />
          <span className="sr-only">搜索原料或半成品</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索原料、供应商、型号或半成品"
            ref={searchRef}
            type="search"
            value={query}
          />
        </label>

        <div aria-label="选择类型" className="recipe-picker__tabs" role="tablist">
          <button
            aria-selected={tab === "ingredients"}
            className={tab === "ingredients" ? "is-active" : ""}
            onClick={() => {
              setTab("ingredients");
              setSelection(null);
            }}
            role="tab"
            type="button"
          >
            供应商原料
          </button>
          <button
            aria-selected={tab === "versions"}
            className={tab === "versions" ? "is-active" : ""}
            onClick={() => {
              setTab("versions");
              setSelection(null);
            }}
            role="tab"
            type="button"
          >
            半成品版本
          </button>
        </div>

        {tab === "ingredients" ? (
          <div className="recipe-picker__filters">
            <label>
              <span>分类</span>
              <select
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">全部</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>数据</span>
              <select
                onChange={(event) => {
                  setDataFilter(event.target.value as DataFilter);
                  setSelection(null);
                }}
                value={dataFilter}
              >
                <option value="all">全部数据</option>
                <option value="complete">仅完整数据</option>
              </select>
            </label>
            <label>
              <span>排序</span>
              <select
                onChange={(event) => {
                  setIngredientSort(
                    event.target.value as IngredientSort,
                  );
                  setSelection(null);
                }}
                value={ingredientSort}
              >
                <option value="updated">最新更新</option>
                <option value="price">价格从低到高</option>
              </select>
            </label>
          </div>
        ) : null}

        <div className="recipe-picker__body">
          {loading ? (
            <p className="recipe-picker__state">正在读取原料与半成品…</p>
          ) : error ? (
            <p className="page-error" role="alert">
              {error}
            </p>
          ) : tab === "ingredients" ? (
            <IngredientResults
              groups={visibleGroups}
              onViewGaps={openVariantGaps}
              onSelect={(group, variant) =>
                setSelection({ kind: "ingredient", group, variant })
              }
              selection={selection}
            />
          ) : (
            <VersionResults
              onViewGaps={(version) => void openVersionGaps(version)}
              onSelect={(version) =>
                setSelection({ kind: "version", version })
              }
              selection={selection}
              versions={visibleVersions}
            />
          )}
        </div>

        <footer className="recipe-picker__footer">
          <span>
            已选择 <strong>{selection === null ? 0 : 1}</strong> 项
          </span>
          <div>
            <button
              className="button button--secondary"
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="button button--primary"
              disabled={selection === null}
              onClick={confirmSelection}
              type="button"
            >
              {tab === "ingredients"
                ? "添加所选原料"
                : "添加所选半成品"}
            </button>
          </div>
        </footer>
      </section>
      <DataQualityDrawer
        content={dataDrawer}
        onClose={() => setDataDrawer(null)}
      />
    </div>
  );
}

interface IngredientResultsProps {
  groups: MaterialGroup[];
  selection: Selection | null;
  onSelect(group: MaterialGroup, variant: IngredientVariant): void;
  onViewGaps(group: MaterialGroup, variant: IngredientVariant): void;
}

function IngredientResults({
  groups,
  selection,
  onSelect,
  onViewGaps,
}: IngredientResultsProps) {
  if (groups.length === 0) {
    return <p className="recipe-picker__state">没有符合条件的供应商原料。</p>;
  }
  return (
    <div className="recipe-picker-results">
      <div className="recipe-picker-results__head">
        <span>供应商与规格</span>
        <span>最新价格</span>
        <span>关键营养</span>
        <span>数据</span>
        <span>最新更新</span>
      </div>
      {groups.map((group) => (
        <section className="recipe-picker-group" key={group.id}>
          <header>
            <strong>{group.name}</strong>
            <span>{group.categoryName ?? "未分类"}</span>
            <span>{group.variants.length} 个供应商版本</span>
          </header>
          {group.variants.map((variant) => {
            const selected =
              selection?.kind === "ingredient" &&
              selection.variant.id === variant.id;
            return (
              <label
                className={
                  selected
                    ? "recipe-picker-row is-selected"
                    : "recipe-picker-row"
                }
                key={variant.id}
              >
                <span className="recipe-picker-row__identity">
                  <input
                    aria-label={`选择${group.name}，${variant.supplierName}${variant.modelOrSpecification ? `，${variant.modelOrSpecification}` : ""}`}
                    checked={selected}
                    name="recipe-picker-selection"
                    onChange={() => onSelect(group, variant)}
                    type="radio"
                  />
                  <span>
                    <strong>{variant.supplierName}</strong>
                    <small>
                      {variant.modelOrSpecification || "未填写型号/规格"}
                    </small>
                  </span>
                </span>
                <span>{priceLabel(variant)}</span>
                <span>{keyNutrient(variant)}</span>
                {variant.completeness.percent >= 100 ? (
                  <span className="recipe-data-status is-complete">100%</span>
                ) : (
                  <button
                    className="data-quality-trigger recipe-data-status has-warning"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onViewGaps(group, variant);
                    }}
                    type="button"
                  >
                    {variant.completeness.percent}% · 查看缺失
                  </button>
                )}
                <span>{variant.updatedAt.slice(0, 10)}</span>
              </label>
            );
          })}
        </section>
      ))}
    </div>
  );
}

interface VersionResultsProps {
  versions: RecipeVersion[];
  selection: Selection | null;
  onSelect(version: RecipeVersion): void;
  onViewGaps(version: RecipeVersion): void;
}

function VersionResults({
  versions,
  selection,
  onSelect,
  onViewGaps,
}: VersionResultsProps) {
  if (versions.length === 0) {
    return <p className="recipe-picker__state">暂无可引用的半成品正式版本。</p>;
  }
  return (
    <div className="recipe-version-results">
      <div className="recipe-version-results__head">
        <span>半成品与版本</span>
        <span>产出重量</span>
        <span>数据</span>
        <span>版本日期</span>
      </div>
      {versions.map((version) => {
        const selected =
          selection?.kind === "version" &&
          selection.version.id === version.id;
        const output = recipeVersionOutputMass(version.snapshot);
        return (
          <label
            className={
              selected
                ? "recipe-version-row is-selected"
                : "recipe-version-row"
            }
            key={version.id}
          >
            <span>
              <input
                aria-label={`选择${version.snapshot.recipe.name} V${version.versionNumber}`}
                checked={selected}
                name="recipe-picker-selection"
                onChange={() => onSelect(version)}
                type="radio"
              />
              <span>
                <strong>{version.snapshot.recipe.name}</strong>
                <small>V{version.versionNumber}</small>
              </span>
            </span>
            <span>{output}g</span>
            {version.snapshot.calculation.completeness.percent >= 100 ? (
              <span className="recipe-data-status is-complete">100%</span>
            ) : (
              <button
                className="data-quality-trigger recipe-data-status has-warning"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onViewGaps(version);
                }}
                type="button"
              >
                {version.snapshot.calculation.completeness.percent}% · 查看缺失
              </button>
            )}
            <span>{version.createdAt.slice(0, 10)}</span>
          </label>
        );
      })}
    </div>
  );
}

function priceLabel(variant: IngredientVariant) {
  if (variant.currentPrice === null) return "价格未知";
  return `¥${variant.currentPrice}/${variant.priceUnit}`;
}

function compareIngredientVariants(
  left: IngredientVariant,
  right: IngredientVariant,
  sort: IngredientSort,
) {
  if (sort === "updated") {
    return (
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.supplierName.localeCompare(right.supplierName, "zh-CN")
    );
  }
  const leftPrice =
    left.currentPrice === null
      ? Number.POSITIVE_INFINITY
      : Number(left.currentPrice);
  const rightPrice =
    right.currentPrice === null
      ? Number.POSITIVE_INFINITY
      : Number(right.currentPrice);
  return (
    leftPrice - rightPrice ||
    left.supplierName.localeCompare(right.supplierName, "zh-CN")
  );
}

function keyNutrient(variant: IngredientVariant) {
  const protein = variant.nutrition.values.find(
    (value) => value.nutrientDefinitionId === "protein",
  );
  if (protein?.value === null || protein?.value === undefined) {
    return "蛋白质 未知";
  }
  return `蛋白质 ${protein.value}g/100g`;
}
