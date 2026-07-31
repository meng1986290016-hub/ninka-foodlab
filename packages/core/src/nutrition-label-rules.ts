import type {
  NutritionLabelNutrientRule,
  NutritionLabelRulePack,
  NutritionLabelRulePackId,
} from "./nutrition-label.js";

const GB_28050_2025_EFFECTIVE_FROM = "2027-03-16";

function nutrient(
  nutrientCode: string,
  name: string,
  unit: string,
  order: number,
  required: boolean,
  nrv: string | null,
  roundingInterval: string,
  zeroThreshold: string,
): NutritionLabelNutrientRule {
  return {
    nutrientCode,
    name,
    unit,
    order,
    required,
    nrv,
    roundingInterval,
    zeroThreshold,
  };
}

const COMMON_NUTRIENTS = [
  ["energy", "能量", "kJ", "8400", "1", "17"],
  ["protein", "蛋白质", "g", "60", "0.1", "0.5"],
  ["fat", "脂肪", "g", "60", "0.1", "0.5"],
  ["saturated_fat", "饱和脂肪", "g", "20", "0.1", "0.1"],
  ["carbohydrate", "碳水化合物", "g", "300", "0.1", "0.5"],
  ["sugars", "糖", "g", null, "0.1", "0.5"],
  ["dietary_fiber", "膳食纤维", "g", "25", "0.1", "0.5"],
  ["sodium", "钠", "mg", "2000", "1", "5"],
] as const;

function nutrientRules(requiredCodes: readonly string[]) {
  const required = new Set(requiredCodes);
  return COMMON_NUTRIENTS.map(
    ([code, name, unit, nrv, roundingInterval, zeroThreshold], order) =>
      nutrient(
        code,
        name,
        unit,
        order,
        required.has(code),
        nrv,
        roundingInterval,
        zeroThreshold,
      )
  );
}

const GB_28050_2011_MANDATORY = [
  "energy",
  "protein",
  "fat",
  "carbohydrate",
  "sodium",
] as const;

const GB_28050_2025_MANDATORY = [
  "energy",
  "protein",
  "fat",
  "saturated_fat",
  "carbohydrate",
  "sugars",
  "sodium",
] as const;

const RULE_PACKS = deepFreeze([
  {
    id: "gb-28050-2011",
    revision: "2011.1",
    standardCode: "GB 28050-2011",
    name: "食品安全国家标准 预包装食品营养标签通则（2011）",
    publishedOn: "2011-10-12",
    effectiveFrom: "2013-01-01",
    officialSourceUrl:
      "https://www.nhc.gov.cn/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml",
    supersedes: null,
    mayEarlyAdopt: false,
    mandatoryNutrientCodes: GB_28050_2011_MANDATORY,
    nutrients: nutrientRules(GB_28050_2011_MANDATORY),
    requiredNotice: null,
  },
  {
    id: "gb-28050-2025",
    revision: "2025.1",
    standardCode: "GB 28050-2025",
    name: "食品安全国家标准 预包装食品营养标签通则（2025）",
    publishedOn: "2025-03-27",
    effectiveFrom: GB_28050_2025_EFFECTIVE_FROM,
    officialSourceUrl:
      "https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml",
    supersedes: "gb-28050-2011",
    mayEarlyAdopt: true,
    mandatoryNutrientCodes: GB_28050_2025_MANDATORY,
    nutrients: nutrientRules(GB_28050_2025_MANDATORY),
    requiredNotice: "儿童青少年应避免过量摄入盐油糖",
  },
] satisfies NutritionLabelRulePack[]);

const RULE_PACK_BY_ID = new Map(
  RULE_PACKS.map((pack) => [pack.id, pack] as const),
);

export interface NutritionLabelRuleRecommendation {
  asOfDate: string;
  recommendedRulePackId: NutritionLabelRulePackId;
  availableRulePackIds: NutritionLabelRulePackId[];
  earlyAdoptionRulePackIds: NutritionLabelRulePackId[];
}

export function listNutritionLabelRulePacks(): readonly NutritionLabelRulePack[] {
  return RULE_PACKS;
}

export function getNutritionLabelRulePack(
  id: NutritionLabelRulePackId,
): NutritionLabelRulePack {
  const pack = RULE_PACK_BY_ID.get(id);
  if (!pack) throw new Error(`未知营养标签规则包：${id}`);
  return pack;
}

export function recommendNutritionLabelRulePack(
  asOfDate: string,
): NutritionLabelRuleRecommendation {
  assertIsoCalendarDate(asOfDate);
  const uses2025 = asOfDate >= GB_28050_2025_EFFECTIVE_FROM;
  return {
    asOfDate,
    recommendedRulePackId: uses2025
      ? "gb-28050-2025"
      : "gb-28050-2011",
    availableRulePackIds: ["gb-28050-2011", "gb-28050-2025"],
    earlyAdoptionRulePackIds: uses2025 ? [] : ["gb-28050-2025"],
  };
}

function assertIsoCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("日期必须使用 YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (normalized !== value) throw new Error("日期不是有效的公历日期");
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
