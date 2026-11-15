//! Guards the asset protocol's config in `tauri.conf.json`: the page reads local files through it (image and PDF
//! previews), so it must serve only the data root, `$HOME/Poweragents`, never a file a link inside it points out to.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::scope::fs::Scope;
use tauri::utils::config::FsScope;

const CONFIG: &str = include_str!("../tauri.conf.json");
const DATA_ROOT: &str = "$HOME/Poweragents";

#[test]
fn enables_the_asset_protocol_for_the_data_root_only() {
    let security = &config()["app"]["security"];

    assert_eq!(security["assetProtocol"]["enable"], Value::Bool(true));
    assert_eq!(
        security["assetProtocol"]["scope"],
        serde_json::json!(["$HOME/Poweragents/**"])
    );
}

#[test]
fn lets_previews_load_only_from_the_asset_protocol_and_blobs() {
    let csp = &config()["app"]["security"]["csp"];
    let preview = "asset: http://asset.localhost blob:";

    assert_eq!(csp["img-src"], format!("'self' data: {preview}"));
    assert_eq!(csp["frame-src"], preview);
    assert_eq!(csp["object-src"], preview);
}

#[test]
fn serves_a_file_inside_the_data_root() {
    let dirs = TempDirs::new("inside");
    let file = dirs.root.join("project").join("photo.png");
    write(&file);

    assert!(dirs.scope().is_allowed(&file));
}

#[test]
fn refuses_a_file_outside_the_data_root() {
    let dirs = TempDirs::new("outside");
    let file = dirs.outside.join("secret.txt");
    write(&file);

    assert!(!dirs.scope().is_allowed(&file));
}

#[test]
fn refuses_a_file_link_pointing_out_of_the_data_root() {
    let dirs = TempDirs::new("file-link");
    let target = dirs.outside.join("secret.txt");
    write(&target);
    let link = dirs.root.join("secret.txt");
    symlink(&target, &link);

    assert!(!dirs.scope().is_allowed(&link));
}

#[test]
fn refuses_a_file_through_a_folder_link_pointing_out_of_the_data_root() {
    let dirs = TempDirs::new("folder-link");
    write(&dirs.outside.join("secret.txt"));
    let link = dirs.root.join("elsewhere");
    symlink(&dirs.outside, &link);

    assert!(!dirs.scope().is_allowed(link.join("secret.txt")));
}

fn config() -> Value {
    serde_json::from_str(CONFIG).expect("tauri.conf.json is valid JSON")
}

fn write(path: &Path) {
    fs::create_dir_all(path.parent().expect("a file has a parent")).unwrap();
    fs::write(path, b"content").unwrap();
}

#[cfg(unix)]
fn symlink(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn symlink(target: &Path, link: &Path) {
    if target.is_dir() {
        std::os::windows::fs::symlink_dir(target, link).unwrap();
    } else {
        std::os::windows::fs::symlink_file(target, link).unwrap();
    }
}

/// A data root and a folder beside it, in a fresh temp folder removed on drop.
struct TempDirs {
    base: PathBuf,
    root: PathBuf,
    outside: PathBuf,
}

impl TempDirs {
    fn new(name: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "poweragents-asset-scope-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("Poweragents");
        let outside = base.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        Self {
            base,
            root,
            outside,
        }
    }

    /// The configured scope, with the data root moved here: the test must not touch the real home folder.
    fn scope(&self) -> Scope {
        let configured: FsScope =
            serde_json::from_value(config()["app"]["security"]["assetProtocol"]["scope"].clone())
                .expect("the asset protocol scope is a valid FsScope");
        let root = self.root.to_string_lossy();
        let allowed = configured
            .allowed_paths()
            .iter()
            .map(|path| PathBuf::from(path.to_string_lossy().replace(DATA_ROOT, &root)))
            .collect();
        Scope::new(&tauri::test::mock_app(), &FsScope::AllowedPaths(allowed)).unwrap()
    }
}

impl Drop for TempDirs {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}
