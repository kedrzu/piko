fn main() {
    // The commit a CI build is made from, compiled in by `updater.rs`; a local build has none.
    println!("cargo:rerun-if-env-changed=PIKO_COMMIT");

    // The app's own commands. Listing them makes Tauri check them against the capabilities, so a window can only call
    // the ones `capabilities/default.json` allows (`allow-<command>`).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["update_status", "update_restart"]),
    ))
    .expect("the Tauri build step failed");
}
