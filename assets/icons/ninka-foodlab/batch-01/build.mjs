import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../../../..");
const tablerRoot = path.join(
  workspace,
  "node_modules/.pnpm/@tabler+icons@3.46.0/node_modules/@tabler/icons/icons",
);

const FOREST = "#153D36";
const GRAIN = "#EFBD50";

async function readIcon(style, name) {
  return readFile(path.join(tablerRoot, style, `${name}.svg`), "utf8");
}

function visiblePaths(svg) {
  return [...svg.matchAll(/<path\b[^>]*\/>/g)]
    .map(([pathTag]) => pathTag)
    .filter((pathTag) => !pathTag.includes('stroke="none"'));
}

function rootSvg(title, body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" role="img" aria-labelledby="title">
  <title id="title">${title}</title>
  <metadata>Built from Tabler Icons 3.46.0; Ninka FoodLab batch 01; 24px grid; 1.75px rounded stroke.</metadata>
${defs ? `  <defs>\n${defs}\n  </defs>\n` : ""}${body}
</svg>
`;
}

function outline(paths, transform = "", strokeWidth = 1.75) {
  const transformAttr = transform ? ` transform="${transform}"` : "";
  return `  <g fill="none" stroke="${FOREST}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${transformAttr}>
    ${paths.join("\n    ")}
  </g>`;
}

function seedDefs(seedPath) {
  return `    <symbol id="ninka-seed" viewBox="0 0 24 24">\n      ${seedPath}\n    </symbol>`;
}

function seed(cx, cy, scale, rotation, color) {
  return `  <use href="#ninka-seed" fill="${color}" transform="translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(-12 -12)" />`;
}

function signature(cx, cy, scale = 0.13) {
  const offset = 2.05;
  return [
    seed(cx, cy - offset, scale, 0, FOREST),
    seed(cx - offset, cy, scale, -90, FOREST),
    seed(cx + offset, cy, scale, 90, FOREST),
    seed(cx, cy + offset, scale, 180, GRAIN),
  ].join("\n");
}

await mkdir(here, { recursive: true });

const [folderSvg, milkSvg, userSvg, copySvg, fileTextSvg, fileDescriptionSvg, seedSvg] = await Promise.all([
  readIcon("outline", "folder"),
  readIcon("outline", "milk"),
  readIcon("outline", "user"),
  readIcon("outline", "copy"),
  readIcon("outline", "file-text"),
  readIcon("outline", "file-description"),
  readIcon("filled", "droplet"),
]);

const folder = visiblePaths(folderSvg);
const milk = visiblePaths(milkSvg);
const user = visiblePaths(userSvg);
const copy = visiblePaths(copySvg);
const fileText = visiblePaths(fileTextSvg);
const fileDescription = visiblePaths(fileDescriptionSvg);
const [seedPath] = visiblePaths(seedSvg);
const defs = seedDefs(seedPath);

const icons = {
  "ingredient-library.svg": rootSvg(
    "原料库",
    `${outline(folder)}\n${signature(12, 13, 0.145)}`,
    defs,
  ),
  "ingredient.svg": rootSvg(
    "原料",
    `${outline(milk.slice(0, 2))}\n${outline([fileText[3], fileText[4]])}\n${seed(12, 9.2, 0.15, 0, GRAIN)}`,
    defs,
  ),
  "supplier.svg": rootSvg(
    "供应商",
    [
      outline(user, "translate(7.2 0.6) scale(.4)", 4.375),
      outline(user, "translate(2 10.2) scale(.4)", 4.375),
      outline(user, "translate(12.4 10.2) scale(.4)", 4.375),
    ]
      .join("\n"),
  ),
  "ingredient-version.svg": rootSvg(
    "原料版本",
    `${outline(copy)}\n${signature(14, 13.2, 0.13)}`,
    defs,
  ),
  "recipe-library.svg": rootSvg(
    "配方库",
    `${outline(fileDescription, "translate(7.3 -2) scale(.62)", 2.82)}\n${outline(folder, "translate(0 4.2)")}\n${signature(12, 15.2, 0.13)}`,
    defs,
  ),
};

for (const [filename, svg] of Object.entries(icons)) {
  await writeFile(path.join(here, filename), svg, "utf8");
}

await writeFile(
  path.join(here, "manifest.json"),
  `${JSON.stringify(
    {
      collection: "Ninka FoodLab / Batch 01",
      status: "review",
      sourceBoard: "/Users/andrew/.codex/generated_images/019f789f-aaf8-7aa2-a3c1-c3c440b9dc9e/exec-7539c9c5-8aa2-40d1-99ad-aaa4eca80217.png",
      grid: 24,
      stroke: 1.75,
      linecap: "round",
      linejoin: "round",
      colors: { forest: FOREST, grain: GRAIN },
      baseLibrary: "Tabler Icons 3.46.0",
      icons: [
        { id: "ingredient-library", label: "原料库", file: "ingredient-library.svg" },
        { id: "ingredient", label: "原料", file: "ingredient.svg" },
        { id: "supplier", label: "供应商", file: "supplier.svg" },
        { id: "ingredient-version", label: "原料版本", file: "ingredient-version.svg" },
        { id: "recipe-library", label: "配方库", file: "recipe-library.svg" },
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Generated ${Object.keys(icons).length} review SVGs in ${here}`);
