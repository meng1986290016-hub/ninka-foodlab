use std::time::Duration;

use reqwest::{Client, StatusCode};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::CommandError;

const RELEASES_URL: &str =
    "https://api.github.com/repos/meng1986290016-hub/ninka-foodlab/releases?per_page=30";
const RELEASE_PATH_PREFIX: &str = "/meng1986290016-hub/ninka-foodlab/releases";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    current_version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    status: &'static str,
    current_version: String,
    latest_version: String,
    release_url: String,
    published_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> AppVersionInfo {
    AppVersionInfo {
        current_version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateCheckResult, CommandError> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(6))
        .timeout(Duration::from_secs(12))
        .user_agent("Ninka-FoodLab-update-check")
        .build()
        .map_err(|_| update_error("update_unavailable", "无法初始化更新检查"))?;
    check_releases_url(&client, RELEASES_URL, app.package_info().version.clone()).await
}

#[tauri::command]
pub fn open_release_page(app: AppHandle, url: String) -> Result<(), CommandError> {
    let parsed = Url::parse(&url).map_err(|_| update_error("invalid_input", "下载页面地址无效"))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.path().starts_with(RELEASE_PATH_PREFIX)
    {
        return Err(update_error(
            "invalid_input",
            "只允许打开项目的 GitHub Release 页面",
        ));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| update_error("update_unavailable", "无法打开下载页面"))
}

async fn check_releases_url(
    client: &Client,
    url: &str,
    current: Version,
) -> Result<UpdateCheckResult, CommandError> {
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(map_request_error)?;
    validate_github_status(response.status())?;
    let body = response.bytes().await.map_err(map_request_error)?;
    parse_release_response(&body, current)
}

fn validate_github_status(status: StatusCode) -> Result<(), CommandError> {
    if status == StatusCode::TOO_MANY_REQUESTS || status == StatusCode::FORBIDDEN {
        return Err(update_error(
            "update_rate_limited",
            "GitHub 暂时限制了更新检查，请稍后再试",
        ));
    }
    if status == StatusCode::NOT_FOUND {
        return Err(update_error(
            "update_unavailable",
            "项目 Release 仓库不可访问",
        ));
    }
    if !status.is_success() {
        return Err(update_error(
            "update_unavailable",
            format!("GitHub 返回异常状态 {status}"),
        ));
    }
    Ok(())
}

fn parse_release_response(
    body: &[u8],
    current: Version,
) -> Result<UpdateCheckResult, CommandError> {
    let releases = serde_json::from_slice::<Vec<GithubRelease>>(body)
        .map_err(|_| update_error("update_invalid_response", "GitHub Release 响应无法读取"))?;
    select_latest_stable(releases, current)
}

fn select_latest_stable(
    releases: Vec<GithubRelease>,
    current: Version,
) -> Result<UpdateCheckResult, CommandError> {
    let stable = releases
        .into_iter()
        .filter(|release| !release.draft && !release.prerelease)
        .collect::<Vec<_>>();
    if stable.is_empty() {
        return Err(update_error(
            "update_no_release",
            "项目暂时没有正式稳定版 Release",
        ));
    }

    let latest = stable
        .into_iter()
        .filter_map(|release| {
            let normalized = release.tag_name.trim().trim_start_matches(['v', 'V']);
            Version::parse(normalized)
                .ok()
                .map(|version| (version, release))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .ok_or_else(|| {
            update_error(
                "update_invalid_response",
                "正式 Release 未提供有效的语义化版本号",
            )
        })?;
    let release_url = Url::parse(&latest.1.html_url)
        .ok()
        .filter(|url| {
            url.scheme() == "https"
                && url.host_str() == Some("github.com")
                && url.path().starts_with(RELEASE_PATH_PREFIX)
        })
        .ok_or_else(|| update_error("update_invalid_response", "Release 下载页面地址无效"))?;

    Ok(UpdateCheckResult {
        status: if latest.0 > current {
            "update_available"
        } else {
            "latest"
        },
        current_version: current.to_string(),
        latest_version: latest.0.to_string(),
        release_url: release_url.to_string(),
        published_at: latest.1.published_at,
    })
}

fn map_request_error(error: reqwest::Error) -> CommandError {
    request_failure(error.is_timeout(), error.is_connect())
}

fn request_failure(is_timeout: bool, is_connect: bool) -> CommandError {
    if is_timeout {
        update_error("update_timeout", "检查更新超时，请稍后再试")
    } else if is_connect {
        update_error("update_offline", "无法连接 GitHub，请检查网络后重试")
    } else {
        update_error("update_unavailable", "检查更新失败，请稍后再试")
    }
}

fn update_error(code: impl Into<String>, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, draft: bool, prerelease: bool) -> GithubRelease {
        GithubRelease {
            tag_name: tag.into(),
            html_url: format!(
                "https://github.com/meng1986290016-hub/ninka-foodlab/releases/tag/{tag}"
            ),
            published_at: Some("2026-08-29T00:00:00Z".into()),
            draft,
            prerelease,
        }
    }

    #[test]
    fn stable_release_selection_ignores_drafts_and_prereleases() {
        let result = select_latest_stable(
            vec![
                release("v9.0.0", false, true),
                release("v8.0.0", true, false),
                release("v0.3.0", false, false),
                release("v0.2.1", false, false),
            ],
            Version::parse("0.2.1").unwrap(),
        )
        .unwrap();
        assert_eq!(result.status, "update_available");
        assert_eq!(result.latest_version, "0.3.0");
    }

    #[test]
    fn same_stable_release_means_latest() {
        let result = select_latest_stable(
            vec![release("v0.2.1", false, false)],
            Version::parse("0.2.1").unwrap(),
        )
        .unwrap();
        assert_eq!(result.status, "latest");
    }

    #[test]
    fn prerelease_only_is_not_reported_as_latest() {
        let error = select_latest_stable(
            vec![release("v0.3.0-beta.1", false, true)],
            Version::parse("0.2.1").unwrap(),
        )
        .unwrap_err();
        assert_eq!(error.code, "update_no_release");
    }

    #[test]
    fn github_failures_are_not_misreported_as_latest() {
        assert_eq!(
            validate_github_status(StatusCode::TOO_MANY_REQUESTS)
                .unwrap_err()
                .code,
            "update_rate_limited"
        );
        assert_eq!(
            validate_github_status(StatusCode::NOT_FOUND)
                .unwrap_err()
                .code,
            "update_unavailable"
        );
        let empty = parse_release_response(b"[]", Version::parse("0.2.1").unwrap()).unwrap_err();
        assert_eq!(empty.code, "update_no_release");
        let invalid =
            parse_release_response(b"not-json", Version::parse("0.2.1").unwrap()).unwrap_err();
        assert_eq!(invalid.code, "update_invalid_response");
    }

    #[test]
    fn timeout_and_offline_failures_have_distinct_codes() {
        assert_eq!(request_failure(true, false).code, "update_timeout");
        assert_eq!(request_failure(false, true).code, "update_offline");
        assert_eq!(request_failure(false, false).code, "update_unavailable");
    }
}
