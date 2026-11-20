//! Keeping the app up to date with the Development builds from `main`, published as GitHub's one `development` release,
//! which every build replaces. One task checks at launch and on a timer, serially, and downloads what it finds in the
//! background, its signature always verified by the plugin against the key in `tauri.conf.json`. The update is then
//! offered to the person, who restarts when they choose. Nothing restarts on its own.
//!
//! On macOS the download is installed at once: the plugin replaces the app on disk and the running one goes on, so the
//! new version starts at the next launch, whether the person restarts now or quits later. If that fails, because the app
//! is somewhere only an administrator may replace it and they refused the prompt, say, the package is kept and the update
//! is ready all the same: timed checks stop, so nothing asks again unprompted, and Restart installs it, where a failure
//! shows as `InstallFailed`. A failed install is not a failed check. On Linux and Windows it installs only at the person's
//! restart: Linux may ask for an administrator password, which they can refuse and retry, and the Windows installer quits
//! the app.
//!
//! The native side owns one state, [`UpdateState`]. Every change sends it whole as the `update-state` event, and
//! `update_status` answers it, so a window that starts listening and then asks once can't miss one. Errors are logged and
//! retried at the next check; the state says only what the window needs to tell the person.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_updater::{Error, Update, UpdaterExt};
use tokio::sync::Notify;

/// How long between two timed checks. Development delivers what was just merged, so it is checked often.
const CHECK_INTERVAL: Duration = Duration::from_secs(5 * 60);

/// How long a connection may take to open, and then to send anything. Without a limit, a stalled connection would hold
/// the one task that checks forever. Not a limit on the whole request, which a slow download may well exceed.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const READ_TIMEOUT: Duration = Duration::from_secs(60);

/// The event that carries the [`UpdateState`] whole.
const STATE_EVENT: &str = "update-state";

/// The manifest of the `development` release. `tauri.conf.json` names it too, but each check asks with its own query.
const MANIFEST: &str = "https://github.com/kedrzu/piko/releases/download/development/latest.json";

/// Why a check or a download failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FailReason {
    Offline,
    Unreachable,
}

/// What the updater is doing, or how the last thing it did ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Activity {
    Idle,
    Checking,
    UpToDate,
    Downloading {
        version: String,
        /// `None` when the server doesn't say how long the download is.
        percent: Option<u8>,
    },
    Ready {
        version: String,
    },
    Failed {
        reason: FailReason,
    },
    /// There is no `development` release at all.
    NoRelease,
    Installing {
        version: String,
    },
    /// Installing failed. A refused password prompt can't be told from any other failure: the plugin falls through to `sudo`
    /// and answers `PackageInstallFailed` for both.
    InstallFailed {
        version: String,
    },
}

/// Everything the window knows about updates; the app reads it as `UpdateState` in `packages/app/updates/AppUpdate.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    /// The running version.
    version: String,
    /// The commit it was built from; `None` for a local build.
    commit: Option<String>,
    /// When the last check finished, in epoch milliseconds.
    checked_at: Option<u64>,
    activity: Activity,
}

/// The downloaded update that `update_restart` installs. Its install is the plugin's, which verifies the signature again.
struct Package {
    install: Box<dyn Fn() -> tauri_plugin_updater::Result<()> + Send + Sync>,
}

/// A downloaded and verified update.
struct Ready {
    version: String,
    /// What is still to be installed; `None` once it is, which on macOS it usually is by the time it's ready.
    package: Option<Arc<Package>>,
}

/// One piece of work for the task that checks.
enum Job {
    Check,
    Install {
        version: String,
        package: Arc<Package>,
    },
}

/// What happens to the state, free of the app so that it can be tested.
struct Inner {
    state: UpdateState,
    ready: Option<Ready>,
    /// The person asked to restart into this update, and it hasn't started installing.
    install_requested: Option<(String, Arc<Package>)>,
}

impl Inner {
    fn new(version: &str, commit: Option<&str>) -> Self {
        Self {
            state: UpdateState {
                version: version.to_owned(),
                commit: commit.map(str::to_owned),
                checked_at: None,
                activity: Activity::Idle,
            },
            ready: None,
            install_requested: None,
        }
    }

    /// The next piece of work, if there is any; `due` says the timer ran out. A check in progress shows from here on,
    /// in one step with taking it, so that a restart can't slip in between.
    fn next_job(&mut self, due: bool) -> Option<Job> {
        if let Some((version, package)) = self.install_requested.take() {
            return Some(Job::Install { version, package });
        }
        if !due {
            return None;
        }

        self.state.activity = Activity::Checking;
        Some(Job::Check)
    }

    /// How a check or a download ended, unless an update is ready: that one stays on offer.
    fn settle(&mut self, activity: Activity) {
        self.state.activity = match &self.ready {
            Some(ready) => Activity::Ready {
                version: ready.version.clone(),
            },
            None => activity,
        };
    }

    /// How long until the next timed check. Once an update is ready the timed checks stop: the next launch runs it, and
    /// checks again from there.
    fn timed_check_interval(&self) -> Option<Duration> {
        self.ready.is_none().then_some(CHECK_INTERVAL)
    }

    /// A check found nothing to download, or failed.
    fn finish_check(&mut self, activity: Activity, at: u64) {
        self.state.checked_at = Some(at);
        self.settle(activity);
    }

    /// A check found this version. Answers whether to download it: not if it's the one already ready.
    fn found_update(&mut self, version: &str, at: u64) -> bool {
        if self
            .ready
            .as_ref()
            .is_some_and(|ready| ready.version == version)
        {
            self.finish_check(Activity::UpToDate, at);
            return false;
        }

        self.state.checked_at = Some(at);
        self.state.activity = Activity::Downloading {
            version: version.to_owned(),
            percent: None,
        };
        true
    }

    fn set_ready(&mut self, ready: Ready) {
        self.ready = Some(ready);
        self.settle(Activity::Idle);
    }

    /// The person asked to restart into the ready update. Answers whether the app is to restart right away, which it is
    /// when the update is installed already; otherwise installing is queued. Nothing happens unless the update is on
    /// offer: not while installing, so a second call changes nothing, and not while a check may be replacing it.
    fn request_restart(&mut self) -> bool {
        if !matches!(
            self.state.activity,
            Activity::Ready { .. } | Activity::InstallFailed { .. }
        ) {
            return false;
        }
        let Some(ready) = &self.ready else {
            return false;
        };
        let Some(package) = &ready.package else {
            return true;
        };

        self.install_requested = Some((ready.version.clone(), Arc::clone(package)));
        self.state.activity = Activity::Installing {
            version: ready.version.clone(),
        };
        false
    }
}

/// The updater; the app's managed state.
pub struct Updates {
    inner: Mutex<Inner>,
    /// Wakes the task that checks, for a restart to install. A wake with the task busy is kept for when it next waits.
    wake: Notify,
}

impl Updates {
    fn new(app: &AppHandle) -> Self {
        Self {
            inner: Mutex::new(Inner::new(
                &app.package_info().version.to_string(),
                option_env!("PIKO_COMMIT").filter(|commit| !commit.is_empty()),
            )),
            wake: Notify::new(),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // A panic while holding it cannot leave it half written: every change to it is a few plain assignments.
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Changes the state and sends it to the window. Sent under the lock, so that two changes can't arrive in the wrong
    /// order and leave the window on the older one.
    fn change<T>(&self, app: &AppHandle, change: impl FnOnce(&mut Inner) -> T) -> T {
        let mut inner = self.lock();
        let result = change(&mut inner);
        if let Err(error) = app.emit(STATE_EVENT, &inner.state) {
            eprintln!("Could not tell the window about the update state: {error}");
        }
        result
    }
}

/// The manifest's address. GitHub serves a replaced file stale for about 100 seconds at the plain URL; a query defeats it.
fn manifest_url(unix_seconds: u64) -> tauri_plugin_updater::Result<Url> {
    Ok(Url::parse(&format!("{MANIFEST}?t={unix_seconds}"))?)
}

/// What the window is told about a failed check or download.
fn failure_activity(error: &Error) -> Activity {
    match error {
        Error::Reqwest(error) if error.is_connect() || error.is_timeout() => Activity::Failed {
            reason: FailReason::Offline,
        },
        _ => Activity::Failed {
            reason: FailReason::Unreachable,
        },
    }
}

/// What a manifest's status says when the plugin found no release: only a 404 means there is none. Anything else is
/// GitHub not answering as it should, a rate limit or an outage, which the next check retries.
fn status_activity(status: reqwest::StatusCode) -> Activity {
    if status == reqwest::StatusCode::NOT_FOUND {
        Activity::NoRelease
    } else {
        Activity::Failed {
            reason: FailReason::Unreachable,
        }
    }
}

/// How much of a download has arrived, in whole percent; `None` when its length is unknown.
fn percent_of(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|total| *total > 0)?;
    u8::try_from((downloaded.saturating_mul(100) / total).min(100)).ok()
}

fn since_epoch() -> Duration {
    // Only a clock set before 1970 fails this, and a wrong time on a check harms nothing.
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
}

fn now_ms() -> u64 {
    u64::try_from(since_epoch().as_millis()).unwrap_or(u64::MAX)
}

/// Sets the updater up and starts checking in the background — not under `tauri dev`, which has no release to update to:
/// there the state stays idle.
pub fn start(app: &AppHandle) {
    app.manage(Updates::new(app));

    if cfg!(dev) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let updates = app.state::<Updates>();
        let updates = updates.inner();
        // The check at launch.
        let mut due = true;
        loop {
            match updates.change(&app, |inner| inner.next_job(due)) {
                Some(Job::Check) => check(&app, updates).await,
                Some(Job::Install { version, package }) => {
                    install(&app, updates, version, package).await;
                }
                None => {}
            }
            due = wait(updates).await;
        }
    });
}

/// Waits for a restart to install or the next timed check, and answers whether a timed check is due.
async fn wait(updates: &Updates) -> bool {
    let interval = updates.lock().timed_check_interval();

    match interval {
        Some(interval) => tokio::time::timeout(interval, updates.wake.notified())
            .await
            .is_err(),
        None => {
            updates.wake.notified().await;
            false
        }
    }
}

/// Runs one check and, when it finds an update, readies it.
async fn check(app: &AppHandle, updates: &Updates) {
    let update = match find_update(app).await {
        Ok(Some(update)) => update,
        Ok(None) => {
            updates.change(app, |inner| {
                inner.finish_check(Activity::UpToDate, now_ms());
            });
            return;
        }
        Err(activity) => {
            updates.change(app, |inner| inner.finish_check(activity, now_ms()));
            return;
        }
    };

    if !updates.change(app, |inner| inner.found_update(&update.version, now_ms())) {
        return;
    }

    if let Err(error) = prepare(app, updates, update).await {
        eprintln!("Could not update the app, retrying later: {error}");
        updates.change(app, |inner| inner.settle(failure_activity(&error)));
    }
}

/// Asks for the manifest: the update it offers if any, or what the window is told about why not.
async fn find_update(app: &AppHandle) -> Result<Option<Update>, Activity> {
    let manifest = manifest_url(since_epoch().as_secs()).map_err(|error| check_failed(&error))?;

    match ask_plugin(app, manifest.clone()).await {
        Err(Error::ReleaseNotFound) => Err(manifest_activity(manifest).await),
        Err(error) => Err(check_failed(&error)),
        Ok(update) => Ok(update),
    }
}

fn check_failed(error: &Error) -> Activity {
    eprintln!("Could not check for updates, retrying later: {error}");
    failure_activity(error)
}

/// The plugin's check, which takes a release only when its version is greater than the running one.
async fn ask_plugin(
    app: &AppHandle,
    manifest: Url,
) -> tauri_plugin_updater::Result<Option<Update>> {
    app.updater_builder()
        .endpoints(vec![manifest])?
        .configure_client(|client| {
            client
                .connect_timeout(CONNECT_TIMEOUT)
                .read_timeout(READ_TIMEOUT)
        })
        .build()?
        .check()
        .await
}

/// The plugin says `ReleaseNotFound` for any status but a success, and drops the status: asks the manifest once more for it.
async fn manifest_activity(manifest: Url) -> Activity {
    match manifest_status(manifest).await {
        Ok(status) => {
            let activity = status_activity(status);
            if activity != Activity::NoRelease {
                eprintln!(
                    "Could not check for updates, retrying later: the manifest answered {status}"
                );
            }
            activity
        }
        Err(error) => check_failed(&Error::Reqwest(error)),
    }
}

async fn manifest_status(manifest: Url) -> reqwest::Result<reqwest::StatusCode> {
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .build()?;

    Ok(client.get(manifest).send().await?.status())
}

/// Downloads the update, which verifies it, and readies it; on macOS that includes trying to install it.
async fn prepare(
    app: &AppHandle,
    updates: &Updates,
    update: Update,
) -> tauri_plugin_updater::Result<()> {
    let version = update.version.clone();
    let mut downloaded = 0;
    let mut shown = None;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let percent = percent_of(downloaded, total);
                if percent != shown {
                    shown = percent;
                    updates.change(app, |inner| {
                        inner.state.activity = Activity::Downloading {
                            version: version.clone(),
                            percent,
                        };
                    });
                }
            },
            || {},
        )
        .await?;

    let package = Arc::new(Package {
        install: Box::new(move || update.install(&bytes)),
    });
    let package = if cfg!(target_os = "macos") {
        install_now(package).await
    } else {
        Some(package)
    };

    updates.change(app, |inner| inner.set_ready(Ready { version, package }));
    Ok(())
}

/// Installs right after the download, which replaces the app on disk while the running one goes on until the person
/// restarts or quits. Answers what is still to be installed: the package when that failed, for the restart to try again.
async fn install_now(package: Arc<Package>) -> Option<Arc<Package>> {
    match run_install(Arc::clone(&package)).await {
        Ok(()) => None,
        Err(error) => {
            eprintln!("Could not install the update, leaving it for the restart: {error}");
            Some(package)
        }
    }
}

/// Installs at the person's restart, and restarts into it. The package stays when that fails, so a further
/// `update_restart` retries. On Windows the plugin's install quits the app itself once the installer started.
async fn install(app: &AppHandle, updates: &Updates, version: String, package: Arc<Package>) {
    match run_install(package).await {
        Ok(()) => app.request_restart(),
        Err(error) => {
            eprintln!("Could not install the update {version}: {error}");
            updates.change(app, |inner| {
                inner.state.activity = Activity::InstallFailed { version };
            });
        }
    }
}

/// Runs the plugin's install, which verifies the signature again, away from the async threads: it blocks for as long as
/// the system's password prompt is open.
async fn run_install(package: Arc<Package>) -> tauri_plugin_updater::Result<()> {
    tauri::async_runtime::spawn_blocking(move || (package.install)()).await?
}

/// The state as it is now, for the window to ask once it listens for `update-state`.
#[tauri::command]
pub fn update_status(updates: State<'_, Updates>) -> UpdateState {
    updates.lock().state.clone()
}

/// Restarts into the ready update, at the person's word, the only way the app restarts for an update: on macOS, where it
/// is installed already, restarts the app; on Linux and Windows installs it first, in the task that checks.
#[tauri::command]
pub fn update_restart(app: AppHandle, updates: State<'_, Updates>) {
    if updates.change(&app, Inner::request_restart) {
        app.request_restart();
    } else {
        updates.wake.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    fn inner() -> Inner {
        Inner::new("0.2.0-dev.1", None)
    }

    fn ready_inner() -> Inner {
        let mut inner = inner();
        inner.set_ready(Ready {
            version: "0.2.0-dev.2".to_owned(),
            package: None,
        });
        inner
    }

    fn ready_activity() -> Activity {
        Activity::Ready {
            version: "0.2.0-dev.2".to_owned(),
        }
    }

    #[test]
    fn the_manifest_defeats_the_stale_cache() {
        assert_eq!(
            manifest_url(1700).ok().map(String::from),
            Some(
                "https://github.com/kedrzu/piko/releases/download/development/latest.json?t=1700"
                    .to_owned()
            )
        );
    }

    #[test]
    fn the_state_has_the_shape_the_window_expects() {
        let mut inner = Inner::new("0.2.0-dev.1", Some("abc"));
        inner.state.checked_at = Some(1700);
        inner.state.activity = Activity::Downloading {
            version: "0.2.0-dev.2".to_owned(),
            percent: Some(40),
        };

        assert_eq!(
            serde_json::to_value(&inner.state).ok(),
            Some(json!({
                "version": "0.2.0-dev.1",
                "commit": "abc",
                "checkedAt": 1700,
                "activity": { "kind": "downloading", "version": "0.2.0-dev.2", "percent": 40 },
            }))
        );
    }

    #[test]
    fn a_local_build_has_no_commit_and_nothing_checked_yet() {
        assert_eq!(
            serde_json::to_value(&inner().state).ok(),
            Some(json!({
                "version": "0.2.0-dev.1",
                "commit": null,
                "checkedAt": null,
                "activity": { "kind": "idle" },
            }))
        );
    }

    #[test]
    fn every_activity_serialises_as_the_window_expects() {
        let version = || "1.0.0".to_owned();
        let cases = [
            (Activity::Idle, json!({ "kind": "idle" })),
            (Activity::Checking, json!({ "kind": "checking" })),
            (Activity::UpToDate, json!({ "kind": "upToDate" })),
            (
                Activity::Downloading {
                    version: version(),
                    percent: None,
                },
                json!({ "kind": "downloading", "version": "1.0.0", "percent": null }),
            ),
            (
                Activity::Ready { version: version() },
                json!({ "kind": "ready", "version": "1.0.0" }),
            ),
            (
                Activity::Failed {
                    reason: FailReason::Offline,
                },
                json!({ "kind": "failed", "reason": "offline" }),
            ),
            (
                Activity::Failed {
                    reason: FailReason::Unreachable,
                },
                json!({ "kind": "failed", "reason": "unreachable" }),
            ),
            (Activity::NoRelease, json!({ "kind": "noRelease" })),
            (
                Activity::Installing { version: version() },
                json!({ "kind": "installing", "version": "1.0.0" }),
            ),
            (
                Activity::InstallFailed { version: version() },
                json!({ "kind": "installFailed", "version": "1.0.0" }),
            ),
        ];

        for (activity, expected) in cases {
            assert_eq!(serde_json::to_value(&activity).ok(), Some(expected));
        }
    }

    #[test]
    fn only_a_404_from_the_manifest_means_no_release() {
        assert_eq!(
            status_activity(reqwest::StatusCode::NOT_FOUND),
            Activity::NoRelease
        );

        for status in [
            reqwest::StatusCode::OK,
            reqwest::StatusCode::FORBIDDEN,
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            reqwest::StatusCode::BAD_GATEWAY,
        ] {
            assert_eq!(
                status_activity(status),
                Activity::Failed {
                    reason: FailReason::Unreachable
                }
            );
        }
    }

    #[tokio::test]
    async fn the_manifest_is_asked_once_for_its_status() {
        for (status, expected) in [
            (404, Activity::NoRelease),
            (
                503,
                Activity::Failed {
                    reason: FailReason::Unreachable,
                },
            ),
        ] {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/latest.json"))
                .and(query_param("t", "1700"))
                .respond_with(ResponseTemplate::new(status))
                .expect(1)
                .mount(&server)
                .await;
            let manifest = format!("{}/latest.json?t=1700", server.uri());

            assert_eq!(
                manifest_activity(Url::parse(&manifest).unwrap_or_else(|error| panic!("{error}")))
                    .await,
                expected
            );
        }
    }

    #[tokio::test]
    async fn no_answer_from_the_manifest_is_classified_as_any_failure() {
        // Port 1 on this machine: nothing listens there.
        let manifest = Url::parse("http://127.0.0.1:1/latest.json");

        assert_eq!(
            manifest_activity(manifest.unwrap_or_else(|error| panic!("{error}"))).await,
            Activity::Failed {
                reason: FailReason::Offline
            }
        );
    }

    #[tokio::test]
    async fn a_refused_connection_reads_as_offline() {
        // Port 1 on this machine: nothing listens there.
        let error = reqwest::get("http://127.0.0.1:1").await.err();

        assert_eq!(
            error.map(|error| failure_activity(&Error::Reqwest(error))),
            Some(Activity::Failed {
                reason: FailReason::Offline
            })
        );
    }

    #[test]
    fn any_other_error_reads_as_unreachable() {
        assert_eq!(
            failure_activity(&Error::Network("status 500".to_owned())),
            Activity::Failed {
                reason: FailReason::Unreachable
            }
        );
    }

    #[test]
    fn percent_is_whole_and_unknown_without_a_length() {
        assert_eq!(percent_of(1, Some(3)), Some(33));
        assert_eq!(percent_of(3, Some(3)), Some(100));
        assert_eq!(percent_of(4, Some(3)), Some(100));
        assert_eq!(percent_of(3, Some(0)), None);
        assert_eq!(percent_of(3, None), None);
    }

    #[test]
    fn a_due_check_shows_as_checking() {
        let mut inner = inner();

        assert!(matches!(inner.next_job(true), Some(Job::Check)));
        assert_eq!(inner.state.activity, Activity::Checking);
    }

    #[test]
    fn a_wake_with_nothing_to_install_is_no_job() {
        assert!(inner().next_job(false).is_none());
    }

    #[test]
    fn timed_checks_run_every_five_minutes_until_an_update_is_ready() {
        assert_eq!(
            inner().timed_check_interval(),
            Some(Duration::from_secs(300))
        );
        assert_eq!(ready_inner().timed_check_interval(), None);
    }

    #[test]
    fn a_finished_check_says_how_it_ended_and_when() {
        let mut inner = inner();

        inner.finish_check(Activity::UpToDate, 1700);

        assert_eq!(inner.state.activity, Activity::UpToDate);
        assert_eq!(inner.state.checked_at, Some(1700));
    }

    #[test]
    fn nothing_a_later_check_ends_in_loses_a_ready_update() {
        for outcome in [
            Activity::UpToDate,
            Activity::NoRelease,
            Activity::Failed {
                reason: FailReason::Offline,
            },
            Activity::Failed {
                reason: FailReason::Unreachable,
            },
        ] {
            let mut inner = ready_inner();
            assert!(matches!(inner.next_job(true), Some(Job::Check)));

            inner.finish_check(outcome, 1700);

            assert_eq!(inner.state.activity, ready_activity());
            assert_eq!(inner.state.checked_at, Some(1700));
        }
    }

    #[test]
    fn a_failed_download_of_a_newer_update_keeps_the_ready_one() {
        let mut inner = ready_inner();
        assert!(inner.found_update("0.2.0-dev.3", 1700));
        assert_eq!(
            inner.state.activity,
            Activity::Downloading {
                version: "0.2.0-dev.3".to_owned(),
                percent: None
            }
        );

        inner.settle(Activity::Failed {
            reason: FailReason::Unreachable,
        });

        assert_eq!(inner.state.activity, ready_activity());
    }

    #[test]
    fn the_version_already_ready_is_not_downloaded_again() {
        let mut inner = ready_inner();

        assert!(!inner.found_update("0.2.0-dev.2", 1700));

        assert_eq!(inner.state.activity, ready_activity());
        assert_eq!(inner.state.checked_at, Some(1700));
    }

    #[test]
    fn a_newer_download_replaces_the_ready_update() {
        let mut inner = ready_inner();

        inner.set_ready(Ready {
            version: "0.2.0-dev.3".to_owned(),
            package: None,
        });

        assert_eq!(
            inner.state.activity,
            Activity::Ready {
                version: "0.2.0-dev.3".to_owned()
            }
        );
    }

    #[tokio::test]
    async fn a_failed_install_after_the_download_keeps_the_package_for_the_restart() {
        let refused = Arc::new(Package {
            install: Box::new(|| Err(Error::Network("refused".to_owned()))),
        });
        let kept = install_now(refused).await;
        assert!(kept.is_some());

        let mut inner = inner();
        inner.set_ready(Ready {
            version: "0.2.0-dev.2".to_owned(),
            package: kept,
        });
        assert_eq!(inner.state.activity, ready_activity());
        assert_eq!(inner.timed_check_interval(), None);

        assert!(!inner.request_restart());
        assert_eq!(
            inner.state.activity,
            Activity::Installing {
                version: "0.2.0-dev.2".to_owned()
            }
        );
        assert!(matches!(inner.next_job(false), Some(Job::Install { .. })));
    }

    #[tokio::test]
    async fn an_install_that_worked_leaves_nothing_to_install() {
        let package = Arc::new(Package {
            install: Box::new(|| Ok(())),
        });

        assert!(install_now(package).await.is_none());
    }

    #[test]
    fn restarting_needs_a_ready_update() {
        assert!(!inner().request_restart());
    }

    #[test]
    fn an_update_already_installed_restarts_right_away() {
        assert!(ready_inner().request_restart());
    }

    #[test]
    fn restarting_does_nothing_while_the_update_is_not_on_offer() {
        for activity in [
            Activity::Checking,
            Activity::Downloading {
                version: "0.2.0-dev.3".to_owned(),
                percent: None,
            },
            Activity::Installing {
                version: "0.2.0-dev.2".to_owned(),
            },
        ] {
            let mut inner = ready_inner();
            inner.state.activity = activity.clone();

            assert!(!inner.request_restart());

            assert_eq!(inner.state.activity, activity);
            assert!(inner.install_requested.is_none());
        }
    }

    #[test]
    fn a_failed_install_can_be_retried() {
        let mut inner = ready_inner();
        inner.state.activity = Activity::InstallFailed {
            version: "0.2.0-dev.2".to_owned(),
        };

        assert!(inner.request_restart());
    }
}
