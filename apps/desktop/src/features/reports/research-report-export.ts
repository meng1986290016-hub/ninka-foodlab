import {
  createResearchReportJsonExport,
  createResearchReportPdfFromJpeg,
  createResearchReportXlsxExport,
  researchReportDocumentHash,
  type ResearchReportExportFormat,
} from "@food-rd/core";

import type { ResearchReportRecord } from "../../api/research-report-types";

export interface ResearchReportRaster {
  png: Uint8Array;
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export type ResearchReportRasterizer = (
  svg: string,
) => Promise<ResearchReportRaster>;

export interface ResearchReportExportArtifact {
  format: ResearchReportExportFormat;
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  documentHash: string;
}

const mimeTypes: Record<ResearchReportExportFormat, string> = {
  png: "image/png",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

export async function buildResearchReportExport(
  record: ResearchReportRecord,
  format: ResearchReportExportFormat,
  rasterize: ResearchReportRasterizer = rasterizeResearchReportSvg,
): Promise<ResearchReportExportArtifact> {
  const documentHash = await researchReportDocumentHash(record.document);
  let bytes: Uint8Array;
  if (format === "json") {
    bytes = await createResearchReportJsonExport(record.document);
  } else if (format === "xlsx") {
    bytes = createResearchReportXlsxExport(record.document);
  } else {
    const raster = await rasterize(record.svg);
    bytes =
      format === "png"
        ? raster.png
        : createResearchReportPdfFromJpeg(
            raster.jpeg,
            raster.width,
            raster.height,
          );
  }
  const baseName = safeFileName(
    `${record.document.recipe.name}-研发报告-V${record.document.recipe.versionNumber}`,
  );
  return {
    format,
    bytes,
    mimeType: mimeTypes[format],
    fileName: `${baseName}.${format}`,
    documentHash,
  };
}

export async function rasterizeResearchReportSvg(
  svg: string,
): Promise<ResearchReportRaster> {
  const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const width = Math.max(1, Math.round(image.naturalWidth * 2));
    const height = Math.max(1, Math.round(image.naturalHeight * 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("浏览器无法创建报告画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const [png, jpeg] = await Promise.all([
      canvasBlob(canvas, "image/png"),
      canvasBlob(canvas, "image/jpeg", 0.96),
    ]);
    return {
      png: new Uint8Array(await png.arrayBuffer()),
      jpeg: new Uint8Array(await jpeg.arrayBuffer()),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("研发报告 SVG 无法渲染"));
    image.src = url;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("研发报告图像无法生成"));
      },
      type,
      quality,
    );
  });
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[.\s-]+$/g, "")
    .replace(/^\.+/g, "")
    .trim();
  return (normalized || "食品研发报告").slice(0, 96);
}
