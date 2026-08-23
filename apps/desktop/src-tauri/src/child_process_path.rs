use std::path::{Path, PathBuf};

/// Returns a path that can be passed to child processes on Windows.
///
/// Rust filesystem APIs accept extended-length paths such as `\\?\C:\...`,
/// but some bundled JavaScript entrypoint resolvers interpret that prefix as
/// part of the script name. `dunce` removes the prefix only when a lossless,
/// legacy-compatible Windows path exists and is a no-op on other platforms.
pub(crate) fn simplified(path: &Path) -> PathBuf {
    dunce::simplified(path).to_path_buf()
}

/// Canonicalizes an existing path without leaking a Windows extended-length
/// prefix across a child-process boundary.
pub(crate) fn canonicalized(path: &Path) -> PathBuf {
    dunce::canonicalize(path).unwrap_or_else(|_| simplified(path))
}
