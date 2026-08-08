import type {
  ResearchReportDocument,
  ResearchReportIngredient,
  ResearchReportNutritionRow,
} from "./research-report.js";

const PAGE_WIDTH = 1240;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_FAMILY =
  "PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif";

export function renderResearchReportSvg(
  document: Readonly<ResearchReportDocument>,
): string {
  const body: string[] = [];
  let y = 58;

  body.push(text(PAGE_WIDTH / 2, y, document.title, {
    anchor: "middle",
    size: 30,
    weight: 700,
  }));
  y += 38;
  body.push(
    text(MARGIN, y, `生成日期：${document.generatedAt.slice(0, 10)}`, {
      size: 13,
      fill: "#56615b",
    }),
    text(
      PAGE_WIDTH / 2,
      y,
      `配方：${document.recipe.name} V${document.recipe.versionNumber}`,
      {
        anchor: "middle",
        size: 13,
        fill: "#56615b",
      },
    ),
    text(
      PAGE_WIDTH - MARGIN,
      y,
      `报告记录：${document.id}`,
      {
        anchor: "end",
        size: 13,
        fill: "#56615b",
      },
    ),
  );

  y += 24;
  const metricWidth = CONTENT_WIDTH / 4;
  const metrics = [
    ["计划投料总量", `${document.recipe.targetBatchGrams} g`],
    ["数据完整度", `${document.recipe.completenessPercent}%`],
    ["整批成本", money(document.cost.batchTotal)],
    ["适用标准", document.nutrition.standardCode],
  ];
  body.push(rect(MARGIN, y, CONTENT_WIDTH, 70, "#f8faf9", "#aeb7b2"));
  metrics.forEach(([label, value], index) => {
    const x = MARGIN + metricWidth * index;
    if (index > 0) {
      body.push(line(x, y, x, y + 70, "#c9cfcc"));
    }
    body.push(
      text(x + metricWidth / 2, y + 24, label ?? "", {
        anchor: "middle",
        size: 12,
        fill: "#657069",
      }),
      text(x + metricWidth / 2, y + 51, value ?? "", {
        anchor: "middle",
        size: 18,
        weight: 650,
      }),
    );
  });
  y += 102;

  y = renderIngredientSection(body, document, y);
  y += 28;
  y = renderNutritionSection(body, document, y);
  y += 30;
  y = renderSummarySection(body, document, y);
  y += 34;

  body.push(
    line(MARGIN, y, PAGE_WIDTH - MARGIN, y, "#9fa9a3"),
    text(
      MARGIN,
      y + 27,
      `固定来源：配方 V${document.recipe.versionNumber} · 营养标签 V${document.nutrition.labelVersionNumber} · 规则包 ${document.nutrition.rulePackRevision}`,
      { size: 12, fill: "#657069" },
    ),
    text(
      PAGE_WIDTH - MARGIN,
      y + 27,
      "用于研发记录与规则校验，不替代企业最终合规审核",
      { anchor: "end", size: 11, fill: "#7a847e" },
    ),
  );
  const height = Math.max(1120, y + 62);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${height}" viewBox="0 0 ${PAGE_WIDTH} ${height}" role="img" aria-labelledby="report-title report-description" font-family="${FONT_FAMILY}">`,
    `<title id="report-title">${escapeXml(document.title)}</title>`,
    `<desc id="report-description">${escapeXml(
      `${document.recipe.name} V${document.recipe.versionNumber} 食品研发报告`,
    )}</desc>`,
    `<rect width="${PAGE_WIDTH}" height="${height}" fill="#ffffff"/>`,
    ...body,
    "</svg>",
  ].join("\n");
}

function renderIngredientSection(
  body: string[],
  document: Readonly<ResearchReportDocument>,
  top: number,
) {
  body.push(sectionTitle(top, "一、配方组成"));
  const headerTop = top + 16;
  const columns = [64, 270, 360, 170, 128, 136];
  const headers = ["序号", "原料", "供应商 / 规格", "用量", "占比", "成本"];
  const rows =
    document.ingredients.length > 0
      ? document.ingredients
      : [emptyIngredient()];
  const tableHeight = 38 + rows.length * 36;
  body.push(rect(MARGIN, headerTop, CONTENT_WIDTH, tableHeight, "#fff", "#aeb7b2"));
  body.push(rect(MARGIN, headerTop, CONTENT_WIDTH, 38, "#f3f5f4", "none"));
  renderGrid(body, MARGIN, headerTop, columns, rows.length, headers);

  rows.forEach((ingredient, index) => {
    const baseline = headerTop + 38 + index * 36 + 23;
    const supplier = ingredient.supplierName
      ? [ingredient.supplierName, ingredient.specification]
          .filter(Boolean)
          .join(" · ")
      : ingredient.referencedVersion
        ? `半成品 ${ingredient.referencedVersion}`
        : "—";
    const cells = [
      document.ingredients.length > 0 ? String(index + 1) : "—",
      ingredient.name,
      supplier,
      `${ingredient.amount} ${ingredient.unit}`,
      `${ingredient.percent}%`,
      money(ingredient.cost),
    ];
    renderRowText(body, MARGIN, baseline, columns, cells);
  });
  return headerTop + tableHeight;
}

function renderNutritionSection(
  body: string[],
  document: Readonly<ResearchReportDocument>,
  top: number,
) {
  body.push(sectionTitle(top, "二、营养成分与来源"));
  const headerTop = top + 16;
  const columns = [300, 260, 190, 378];
  const headers = [
    "项目",
    `标示值（${document.nutrition.basisLabel}）`,
    "NRV%",
    "来源",
  ];
  const rows = document.nutrition.rows;
  const visibleRows =
    rows.length > 0
      ? rows
      : [
          {
            nutrientCode: "empty",
            name: "暂无营养数据",
            declaredValue: null,
            unit: "",
            nrvPercent: null,
            sourceKind: "recipe_estimate" as const,
            sourceReference: null,
            sourceLabel: "配方估算" as const,
          },
        ];
  const tableHeight = 38 + visibleRows.length * 36;
  body.push(rect(MARGIN, headerTop, CONTENT_WIDTH, tableHeight, "#fff", "#aeb7b2"));
  body.push(rect(MARGIN, headerTop, CONTENT_WIDTH, 38, "#f3f5f4", "none"));
  renderGrid(body, MARGIN, headerTop, columns, visibleRows.length, headers);
  visibleRows.forEach((row, index) => {
    const baseline = headerTop + 38 + index * 36 + 23;
    renderNutritionRow(body, MARGIN, baseline, columns, row);
  });
  let bottom = headerTop + tableHeight;
  if (document.nutrition.requiredNotice) {
    bottom += 30;
    body.push(
      text(MARGIN, bottom - 7, document.nutrition.requiredNotice, {
        size: 12,
        fill: "#56615b",
      }),
    );
  }
  return bottom;
}

function renderSummarySection(
  body: string[],
  document: Readonly<ResearchReportDocument>,
  top: number,
) {
  const gap = 28;
  const columnWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const columns = [
    {
      title: "三、成本摘要",
      lines: [
        `原料成本：${money(document.cost.rawMaterialTotal)}`,
        `包材成本：${money(document.cost.packagingTotal)}`,
        `其他成本：${money(document.cost.additionalTotal)}`,
        `每 100g：${money(document.cost.per100g)}`,
        `每 kg：${money(document.cost.perKg)}`,
      ],
    },
    {
      title: "四、目标与过敏原",
      lines: [
        ...document.targets.map(
          (target) =>
            `${target.label}：${target.actual ?? "待计算"}（${targetStatusLabel(
              target.status,
            )}）`,
        ),
        `含有：${listOrNone(document.allergens.contains)}`,
        `可能含有：${listOrNone(document.allergens.mayContain)}`,
      ],
    },
    {
      title: "五、研发备注",
      lines: wrapLines(document.notes || "未填写研发备注", 23, 7),
    },
  ];
  const lineHeight = 24;
  const maxLines = Math.max(...columns.map((column) => column.lines.length), 5);
  const height = 42 + maxLines * lineHeight;
  columns.forEach((column, index) => {
    const x = MARGIN + index * (columnWidth + gap);
    if (index > 0) {
      body.push(line(x - gap / 2, top, x - gap / 2, top + height, "#d5dad7"));
    }
    body.push(
      text(x, top + 17, column.title, {
        size: 15,
        weight: 650,
      }),
    );
    column.lines.slice(0, maxLines).forEach((value, lineIndex) => {
      body.push(
        text(x, top + 48 + lineIndex * lineHeight, truncate(value, 28), {
          size: 12,
          fill: "#465049",
        }),
      );
    });
  });
  return top + height;
}

function renderGrid(
  body: string[],
  x: number,
  y: number,
  columns: number[],
  rowCount: number,
  headers: string[],
) {
  let cursor = x;
  columns.forEach((width, index) => {
    if (index > 0) body.push(line(cursor, y, cursor, y + 38 + rowCount * 36, "#c9cfcc"));
    body.push(
      text(cursor + width / 2, y + 24, headers[index] ?? "", {
        anchor: "middle",
        size: 12,
        weight: 650,
      }),
    );
    cursor += width;
  });
  for (let index = 0; index < rowCount; index += 1) {
    body.push(line(x, y + 38 + index * 36, x + CONTENT_WIDTH, y + 38 + index * 36, "#d6dbd8"));
  }
}

function renderRowText(
  body: string[],
  x: number,
  baseline: number,
  columns: number[],
  cells: string[],
) {
  let cursor = x;
  columns.forEach((width, index) => {
    const centered = index === 0 || index >= 3;
    body.push(
      text(
        centered ? cursor + width / 2 : cursor + 12,
        baseline,
        truncate(cells[index] ?? "", index === 2 ? 24 : 18),
        {
          anchor: centered ? "middle" : "start",
          size: 12,
          fill: "#333c36",
        },
      ),
    );
    cursor += width;
  });
}

function renderNutritionRow(
  body: string[],
  x: number,
  baseline: number,
  columns: number[],
  row: ResearchReportNutritionRow,
) {
  const values = [
    row.name,
    row.declaredValue === null
      ? "未知"
      : `${row.declaredValue} ${row.unit}`.trim(),
    row.nrvPercent === null ? "—" : `${row.nrvPercent}%`,
    row.sourceReference
      ? `${row.sourceLabel} · ${row.sourceReference}`
      : row.sourceLabel,
  ];
  let cursor = x;
  columns.forEach((width, index) => {
    const centered = index === 1 || index === 2;
    body.push(
      text(
        centered ? cursor + width / 2 : cursor + 12,
        baseline,
        truncate(values[index] ?? "", index === 3 ? 30 : 18),
        {
          anchor: centered ? "middle" : "start",
          size: 12,
          fill: "#333c36",
        },
      ),
    );
    cursor += width;
  });
}

function sectionTitle(y: number, label: string) {
  return text(MARGIN, y, label, { size: 16, weight: 680 });
}

function text(
  x: number,
  y: number,
  value: string,
  options: {
    anchor?: "start" | "middle" | "end";
    size?: number;
    weight?: number;
    fill?: string;
  } = {},
) {
  return `<text x="${number(x)}" y="${number(y)}" text-anchor="${
    options.anchor ?? "start"
  }" font-size="${options.size ?? 14}" font-weight="${
    options.weight ?? 400
  }" fill="${options.fill ?? "#172019"}">${escapeXml(value)}</text>`;
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string,
) {
  return `<rect x="${number(x)}" y="${number(y)}" width="${number(
    width,
  )}" height="${number(height)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
) {
  return `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(
    x2,
  )}" y2="${number(y2)}" stroke="${stroke}" stroke-width="1"/>`;
}

function money(value: string | null) {
  return value === null ? "未知" : `¥${value}`;
}

function targetStatusLabel(status: string) {
  if (status === "met") return "已达到";
  if (status === "below") return "低于目标";
  if (status === "above") return "高于目标";
  return "待计算";
}

function listOrNone(values: readonly string[]) {
  return values.length > 0 ? values.join("、") : "无记录";
}

function wrapLines(value: string, maxLength: number, maxLines: number) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized === "") return ["未填写研发备注"];
  const result: string[] = [];
  for (const paragraph of normalized.split("\n")) {
    let remaining = paragraph;
    while (remaining.length > maxLength && result.length < maxLines) {
      result.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    if (result.length < maxLines && remaining !== "") result.push(remaining);
    if (result.length >= maxLines) break;
  }
  return result;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(1, maxLength - 1))}…`
    : value;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function number(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function emptyIngredient(): ResearchReportIngredient {
  return {
    id: "empty",
    position: 0,
    kind: "ingredient",
    name: "暂无配方组成",
    supplierName: null,
    specification: null,
    referencedVersion: null,
    amount: "0",
    unit: "g",
    massGrams: "0",
    percent: "0",
    cost: null,
  };
}
