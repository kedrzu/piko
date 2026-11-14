//! The poweragents desktop app: the app's static build (`packages/app`) in one native window. It is a thin
//! client of the daemon (`packages/daemon`), which it reaches over the loopback port.

mod daemon;
mod updater;

/// Starts the app and blocks until it quits.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            updater::update_status,
            updater::update_restart
        ])
        .setup(|app| {
            daemon::start(app.handle());
            updater::start(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the desktop app failed to start");
}
