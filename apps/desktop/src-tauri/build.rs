fn main() {
    use sha2::{Digest, Sha256};
    use std::{env, fs, path::PathBuf};

    let manifest_path = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("generated/agent-runtime/runtime-manifest.json");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let manifest_sha256 = fs::read(&manifest_path)
        .map(|bytes| format!("{:x}", Sha256::digest(bytes)))
        .unwrap_or_default();
    println!("cargo:rustc-env=FOODLAB_AGENT_MANIFEST_SHA256={manifest_sha256}");
    tauri_build::build();
}
