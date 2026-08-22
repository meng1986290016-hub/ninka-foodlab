use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use food_rd_desktop::ingest::attachment_store::AttachmentStore;
use uuid::Uuid;

struct AttachmentFixture {
    root: PathBuf,
    source_root: PathBuf,
    store: AttachmentStore,
}

impl AttachmentFixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-attachment-test-{}", Uuid::new_v4()));
        let source_root = root.join("sources");
        let store_root = root.join("stored");
        fs::create_dir_all(&source_root).unwrap();
        Self {
            root,
            source_root,
            store: AttachmentStore::new(store_root),
        }
    }

    fn write_source(&self, name: &str, content: &[u8]) -> PathBuf {
        let path = self.source_root.join(name);
        fs::write(&path, content).unwrap();
        path
    }

    fn stage(
        &self,
        name: &str,
        content: &[u8],
    ) -> food_rd_desktop::ingest::attachment_store::StagedAttachment {
        let source = self.write_source(name, content);
        self.store.stage(&source).unwrap()
    }

    fn stored_file_count(&self) -> usize {
        count_files(self.root.join("stored").as_path())
    }
}

impl Drop for AttachmentFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn count_files(path: &Path) -> usize {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                count_files(&entry.path())
            } else {
                1
            }
        })
        .sum()
}

#[test]
fn equal_content_is_stored_once_without_exposing_source_path() {
    let fixture = AttachmentFixture::new();
    let first = fixture.write_source("front.png", b"same-content");
    let second = fixture.write_source("back.png", b"same-content");

    let a = fixture.store.stage(&first).unwrap();
    let b = fixture.store.stage(&second).unwrap();

    assert_eq!(a.sha256, b.sha256);
    assert_eq!(a.relative_path, b.relative_path);
    assert!(
        !serde_json::to_string(&a)
            .unwrap()
            .contains(first.to_str().unwrap())
    );
    assert_eq!(fixture.stored_file_count(), 1);
}

#[test]
fn cleanup_removes_only_unreferenced_files() {
    let fixture = AttachmentFixture::new();
    let keep = fixture.stage("keep.txt", b"keep");
    fixture.stage("drop.txt", b"drop");
    let referenced = HashSet::from([keep.sha256.clone()]);

    assert_eq!(fixture.store.remove_orphans(&referenced).unwrap(), 1);
    assert_eq!(fixture.stored_file_count(), 1);
    assert!(fixture.store.open_for_extract(&keep.relative_path).is_ok());
}

#[test]
fn unsupported_extensions_and_escaping_paths_are_rejected() {
    let fixture = AttachmentFixture::new();
    let executable = fixture.write_source("payload.exe", b"not-an-attachment");

    let extension_error = fixture.store.stage(&executable).unwrap_err();
    assert_eq!(extension_error.code(), "unsupported_file");

    let path_error = fixture
        .store
        .open_for_extract("../outside.txt")
        .unwrap_err();
    assert_eq!(path_error.code(), "attachment_failure");
}

#[test]
fn valid_display_names_are_preserved_and_media_types_are_normalized() {
    let fixture = AttachmentFixture::new();
    let staged = fixture.stage("bad name.TXT", b"plain text");

    assert_eq!(staged.original_name, "bad name.TXT");
    assert_eq!(staged.media_type, "text/plain");
    assert!(staged.relative_path.ends_with(".txt"));
}

#[cfg(unix)]
#[test]
fn symbolic_link_sources_are_rejected() {
    use std::os::unix::fs::symlink;

    let fixture = AttachmentFixture::new();
    let target = fixture.write_source("target.txt", b"secret");
    let link = fixture.source_root.join("link.txt");
    symlink(target, &link).unwrap();

    let error = fixture.store.stage(&link).unwrap_err();

    assert_eq!(error.code(), "attachment_failure");
}
