import { createRoot } from "react-dom/client";

import "../../../desktop/src/styles/global.css";
import "../../../desktop/src/styles/app.css";
import "./capture.css";
import { CaptureApp, type CaptureSurface } from "./CaptureApp";
import {
  createPromoDemoApi,
  type PromoAgentStage,
} from "./promo-demo-api";

const root = document.getElementById("root");
if (!root) throw new Error("找不到宣传片演示根节点");

document.documentElement.dataset.theme = "dark";
window.localStorage.setItem("foodlab.theme.v1", "dark");

const params = new URLSearchParams(window.location.search);
const requestedSurface = params.get("surface");
const surface: CaptureSurface =
  requestedSurface === "agent" ||
  requestedSurface === "workbench" ||
  requestedSurface === "label"
    ? requestedSurface
    : "ingredients";
const requestedStage = params.get("promoStage");
const promoStages: PromoAgentStage[] = [
  "input",
  "progress",
  "result",
  "v02-capabilities",
  "v02-input",
  "v02-progress",
  "v02-result",
];
const stage: PromoAgentStage = promoStages.includes(
  requestedStage as PromoAgentStage,
)
  ? (requestedStage as PromoAgentStage)
  : "input";

document.documentElement.dataset.promoSurface = surface;
const fixture = await createPromoDemoApi(stage);
createRoot(root).render(<CaptureApp fixture={fixture} surface={surface} />);
