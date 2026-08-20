import {
  IconAlertHexagon,
  IconAlertTriangle,
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconArrowsDiff,
  IconBrain,
  IconChartPie,
  IconCheck,
  IconChevronDown,
  IconClipboardText,
  IconCloudOff,
  IconCopy,
  IconCurrencyYen,
  IconDatabase,
  IconDatabaseExport,
  IconDots,
  IconFileDescription,
  IconFileExport,
  IconFileImport,
  IconFileText,
  IconFlask2,
  IconFolder,
  IconFolderOpen,
  IconGripVertical,
  IconHelpHexagon,
  IconInfoCircle,
  IconLock,
  IconLockOpen,
  IconMessageCircle,
  IconNotes,
  IconPackage,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconPrinter,
  IconReportAnalytics,
  IconRestore,
  IconScale,
  IconSearch,
  IconSend,
  IconSettings,
  IconSparkles,
  IconStack2,
  IconTags,
  IconTarget,
  IconTrash,
  IconTrendingUp,
  IconUsersGroup,
  IconVersions,
  IconWheat,
  IconX,
  type TablerIcon,
} from "@tabler/icons-react";

import aiAgentIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/ai-agent-r01.svg?url";
import ingredientIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/ingredient-r01.svg?url";
import ingredientLibraryIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/ingredient-library-r02.svg?url";
import ingredientVersionIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/ingredient-version-r01.svg?url";
import nutritionLabelIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/nutrition-label-r01.svg?url";
import recipeLibraryIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/recipe-library-r05.svg?url";
import recipeVersionIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/recipe-version-r01.svg?url";
import recipeWorkbenchIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/recipe-workbench-r02.svg?url";
import researchReportIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/research-report-r01.svg?url";
import sampleSheetIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/sample-sheet-r01.svg?url";
import supplierIconUrl from "../../../../assets/icons/ninka-foodlab/pilot/supplier-r01.svg?url";

/**
 * Ninka FoodLab icon vocabulary.
 *
 * Legacy utility names remain available so feature work can migrate gradually.
 * Product-specific names should be preferred for new navigation, empty states,
 * and workflow entry points because they carry the intended domain semantics.
 */
export type IconName =
  | "ai-assistant"
  | "ai-suggestion"
  | "allergen"
  | "archive"
  | "arrow-down"
  | "arrow-left"
  | "arrow-up"
  | "backup"
  | "check"
  | "chevron-down"
  | "close"
  | "copy"
  | "cost"
  | "database"
  | "edit"
  | "export"
  | "flask"
  | "formula"
  | "grip"
  | "import"
  | "ingredient"
  | "ingredient-library"
  | "ingredient-version"
  | "ingredients"
  | "info"
  | "lock"
  | "message"
  | "more"
  | "note"
  | "nutrition"
  | "nutrition-label"
  | "offline"
  | "paperclip"
  | "plus"
  | "printer"
  | "recipe-library"
  | "recipe-version"
  | "recipe-workbench"
  | "report"
  | "restore"
  | "sample-sheet"
  | "scale"
  | "search"
  | "semi-finished"
  | "send"
  | "settings"
  | "supplier"
  | "target"
  | "trash"
  | "trend"
  | "unknown-data"
  | "unlock"
  | "version-compare"
  | "warning";

const icons: Record<IconName, TablerIcon> = {
  "ai-assistant": IconSparkles,
  "ai-suggestion": IconBrain,
  allergen: IconAlertHexagon,
  archive: IconArchive,
  "arrow-down": IconArrowDown,
  "arrow-left": IconArrowLeft,
  "arrow-up": IconArrowUp,
  backup: IconDatabaseExport,
  check: IconCheck,
  "chevron-down": IconChevronDown,
  close: IconX,
  copy: IconCopy,
  cost: IconCurrencyYen,
  database: IconDatabase,
  edit: IconPencil,
  export: IconFileExport,
  flask: IconFlask2,
  formula: IconFileText,
  grip: IconGripVertical,
  import: IconFileImport,
  ingredient: IconWheat,
  "ingredient-library": IconFolder,
  "ingredient-version": IconVersions,
  ingredients: IconTags,
  info: IconInfoCircle,
  lock: IconLock,
  message: IconMessageCircle,
  more: IconDots,
  note: IconNotes,
  nutrition: IconChartPie,
  "nutrition-label": IconFileDescription,
  offline: IconCloudOff,
  paperclip: IconPaperclip,
  plus: IconPlus,
  printer: IconPrinter,
  "recipe-library": IconFolderOpen,
  "recipe-version": IconStack2,
  "recipe-workbench": IconFlask2,
  report: IconReportAnalytics,
  restore: IconRestore,
  "sample-sheet": IconClipboardText,
  scale: IconScale,
  search: IconSearch,
  "semi-finished": IconPackage,
  send: IconSend,
  settings: IconSettings,
  supplier: IconUsersGroup,
  target: IconTarget,
  trash: IconTrash,
  trend: IconTrendingUp,
  "unknown-data": IconHelpHexagon,
  unlock: IconLockOpen,
  "version-compare": IconArrowsDiff,
  warning: IconAlertTriangle,
};

/**
 * User-approved Ninka FoodLab product icons.
 *
 * Legacy semantic names intentionally point at the same approved master so
 * older feature surfaces cannot silently fall back to generic geometry.
 */
const customIconUrls: Partial<Record<IconName, string>> = {
  "ai-assistant": aiAgentIconUrl,
  "ai-suggestion": aiAgentIconUrl,
  flask: recipeWorkbenchIconUrl,
  formula: recipeVersionIconUrl,
  ingredient: ingredientIconUrl,
  "ingredient-library": ingredientLibraryIconUrl,
  "ingredient-version": ingredientVersionIconUrl,
  ingredients: ingredientIconUrl,
  nutrition: nutritionLabelIconUrl,
  "nutrition-label": nutritionLabelIconUrl,
  "recipe-library": recipeLibraryIconUrl,
  "recipe-version": recipeVersionIconUrl,
  "recipe-workbench": recipeWorkbenchIconUrl,
  report: researchReportIconUrl,
  "sample-sheet": sampleSheetIconUrl,
  supplier: supplierIconUrl,
};

export interface IconProps {
  className?: string;
  name: IconName;
  size?: number;
}

export function Icon({ className, name, size = 20 }: IconProps) {
  const customIconUrl = customIconUrls[name];
  const Glyph = icons[name];
  const classes = ["ninka-icon", className].filter(Boolean).join(" ");

  return (
    <span
      aria-hidden="true"
      className={classes}
      data-custom-icon={customIconUrl ? "true" : undefined}
      data-icon={name}
      style={{ height: size, width: size }}
    >
      {customIconUrl ? (
        <img
          alt=""
          className="icon__custom"
          draggable={false}
          src={customIconUrl}
        />
      ) : (
        <Glyph className="icon__glyph" size={size} stroke={1.75} />
      )}
    </span>
  );
}
