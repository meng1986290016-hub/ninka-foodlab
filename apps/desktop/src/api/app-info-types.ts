export interface AppVersionInfo {
  currentVersion: string;
}

export interface UpdateCheckResult {
  status: "latest" | "update_available";
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  publishedAt: string | null;
}
