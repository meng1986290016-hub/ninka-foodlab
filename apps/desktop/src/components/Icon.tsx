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
  IconDiamondsFilled,
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

const signedIcons = new Set<IconName>([
  "ai-assistant",
  "ai-suggestion",
  "backup",
  "database",
  "ingredient-library",
  "ingredient-version",
  "nutrition-label",
  "recipe-library",
  "recipe-version",
  "report",
  "search",
]);

export interface IconProps {
  className?: string;
  name: IconName;
  /** Override the brand seed signature for a particular placement. */
  signature?: boolean;
  size?: number;
}

export function Icon({
  className,
  name,
  signature = signedIcons.has(name),
  size = 20,
}: IconProps) {
  const Glyph = icons[name];
  const signatureSize = Math.max(5, Math.round(size * 0.34));
  const classes = ["ninka-icon", className].filter(Boolean).join(" ");

  return (
    <span
      aria-hidden="true"
      className={classes}
      data-icon={name}
      data-signature={signature || undefined}
      style={{ height: size, width: size }}
    >
      <Glyph className="icon__glyph" size={size} stroke={1.75} />
      {signature ? (
        <IconDiamondsFilled
          className="icon__signature"
          data-testid="icon-signature"
          size={signatureSize}
          stroke={0}
        />
      ) : null}
    </span>
  );
}
