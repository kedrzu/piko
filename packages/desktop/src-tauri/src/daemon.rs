//! Starting the daemon, which ships inside the app as a sidecar (`bundle.externalBin` in `tauri.conf.json`, built by
//! `bun nx run @poweragents/daemon:sidecar`).

use tauri::AppHandle;

/// The sidecar's name: `binaries/poweragents-daemon-<target triple>` in the bundle.
#[cfg(not(debug_assertions))]
const SIDECAR: &str = "poweragents-daemon";

/// Lima as bundled in the app's resources (`bundle.resources` in `tauri.macos.conf.json`): `bin/limactl` and the
/// `share/lima` it finds beside it. The daemon runs the sandbox from there (`POWERAGENTS_LIMA_DIR`).
#[cfg(all(not(debug_assertions), target_os = "macos"))]
const LIMA_RESOURCE: &str = "lima";

/// The plugins that ship with the app, bundled in its resources (`bundle.resources` in `tauri.conf.json`) from
/// `packages/daemon/plugins`. The daemon reads them from there (`POWERAGENTS_PLUGINS_DIR`).
#[cfg(not(debug_assertions))]
const PLUGINS_RESOURCE: &str = "plugins";

/// The port the daemon listens on: `DAEMON_PORT` in `packages/common/src/daemonAddress.ts`, which the daemon overrides
/// with `POWERAGENTS_DAEMON_PORT`.
#[cfg(all(not(debug_assertions), target_os = "macos"))]
const DEFAULT_PORT: u16 = 47_610;

/// How long a daemon asked to stop gets to release the port before the app gives up and keeps the old one.
#[cfg(all(not(debug_assertions), target_os = "macos"))]
const STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// What holds the daemon's port.
#[cfg(any(test, all(not(debug_assertions), target_os = "macos")))]
#[derive(Debug, PartialEq)]
enum Listener {
    Nothing,
    /// Something listens. `pid` is the process found listening on the port, `version` what its `/status` reported; each
    /// is `None` when it could not be read or was not given (a daemon run from a worktree).
    Something {
        pid: Option<u32>,
        version: Option<String>,
    },
}

/// What the app does about the daemon at launch.
#[cfg(any(test, all(not(debug_assertions), target_os = "macos")))]
#[derive(Debug, PartialEq)]
enum Handover {
    Spawn,
    Keep,
    /// Stop the daemon with this pid, then spawn the app's own.
    Replace(u32),
}

/// Starts the bundled daemon, without making the window wait for it. It keeps running after the app quits, so schedules
/// and the agent's browser go on. A daemon left by an older version is replaced; any other daemon holding the port is
/// kept, as the new one would fail to listen and exit, and the app talks to the running one.
#[cfg(not(debug_assertions))]
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = hand_over(&app) {
            eprintln!("the daemon failed to start: {error}");
        }
    });
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn hand_over(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let port = std::env::var("POWERAGENTS_DAEMON_PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let version = app.package_info().version.to_string();
    match decide(&find_listener(port), &version) {
        Handover::Keep => Ok(()),
        Handover::Spawn => spawn(app),
        Handover::Replace(pid) => {
            terminate(pid)?;
            if !wait_until_free(port) {
                // No SIGKILL: a daemon that does not stop in time may be in the middle of something, so the app talks to it.
                eprintln!("the daemon {pid} did not release port {port} in time, so the app keeps using it");
                return Ok(());
            }
            spawn(app)
        }
    }
}

#[cfg(all(not(debug_assertions), not(target_os = "macos")))]
fn hand_over(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    spawn(app)
}

/// Decides from the listener alone, so it is the one place that says when a daemon is touched: only one that reports a
/// version different from the app's, and whose pid is known. No version means a daemon run from a worktree (or one
/// from before versions were reported), which is never signalled.
#[cfg(any(test, all(not(debug_assertions), target_os = "macos")))]
fn decide(listener: &Listener, app_version: &str) -> Handover {
    match listener {
        Listener::Nothing => Handover::Spawn,
        Listener::Something {
            pid: Some(pid),
            version: Some(version),
        } if version != app_version => Handover::Replace(*pid),
        Listener::Something { .. } => Handover::Keep,
    }
}

/// Reads the `version` out of a `/status` response, `None` when the response is not a 200 with a JSON body or carries
/// no (or an empty) version. The body is cut from the first `{` to the last `}` so a chunked body parses too.
#[cfg(any(test, all(not(debug_assertions), target_os = "macos")))]
fn parse_status_version(response: &str) -> Option<String> {
    if !response.starts_with("HTTP/1.1 200") && !response.starts_with("HTTP/1.0 200") {
        return None;
    }
    let (_, body) = response.split_once("\r\n\r\n")?;
    let json = &body[body.find('{')?..=body.rfind('}')?];
    let status: serde_json::Value = serde_json::from_str(json).ok()?;
    let version = status.get("version")?.as_str()?;
    (!version.is_empty()).then(|| version.to_string())
}

/// The pid of the one process listening, `None` for none or several: a pid is only signalled when it is certain.
#[cfg(any(test, all(not(debug_assertions), target_os = "macos")))]
fn parse_lsof_pid(output: &str) -> Option<u32> {
    let mut pids = output.lines().map(|line| line.trim().parse::<u32>());
    let first = pids.next()?.ok()?;
    for pid in pids {
        if pid.ok()? != first {
            return None;
        }
    }
    Some(first)
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn find_listener(port: u16) -> Listener {
    if !is_listening(port) {
        return Listener::Nothing;
    }
    Listener::Something {
        pid: find_listener_pid(port),
        version: read_version(port),
    }
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn is_listening(port: u16) -> bool {
    use std::net::{Ipv4Addr, SocketAddr, TcpStream};
    use std::time::Duration;

    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    TcpStream::connect_timeout(&address, Duration::from_secs(1)).is_ok()
}

/// The pid comes from the port, never from anything the daemon says about itself: `/status` is open to any local
/// process, and a pid taken from an answer could name any process.
#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn find_listener_pid(port: u16) -> Option<u32> {
    let output = std::process::Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
        .output()
        .ok()?;
    parse_lsof_pid(&String::from_utf8_lossy(&output.stdout))
}

/// A plain blocking request over loopback: the one call the app makes to the daemon outside the webview, not worth an
/// HTTP client.
#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn read_version(port: u16) -> Option<String> {
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, SocketAddr, TcpStream};
    use std::time::Duration;

    let timeout = Duration::from_secs(2);
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&address, timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    stream
        .write_all(b"GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).ok()?;
    parse_status_version(&String::from_utf8_lossy(&response))
}

/// SIGTERM through `kill`, which keeps the app free of `unsafe` and of a libc dependency for one call.
#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn terminate(pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let status = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("kill -TERM {pid} failed: {status}").into())
    }
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn wait_until_free(port: u16) -> bool {
    use std::time::{Duration, Instant};

    let deadline = Instant::now() + STOP_TIMEOUT;
    while is_listening(port) {
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    true
}

#[cfg(not(debug_assertions))]
fn spawn(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Stdio;
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;

    let resources = app.path().resource_dir()?;
    let command = app
        .shell()
        .sidecar(SIDECAR)?
        // The daemon reports it on `/status`, which is how the next launch of the app knows it is outdated.
        .env(
            "POWERAGENTS_VERSION",
            app.package_info().version.to_string(),
        )
        .env("POWERAGENTS_PLUGINS_DIR", resources.join(PLUGINS_RESOURCE));
    #[cfg(target_os = "macos")]
    let command = command.env("POWERAGENTS_LIMA_DIR", resources.join(LIMA_RESOURCE));
    // Nobody reads the daemon's output, and a pipe would break once the app quits while the daemon goes on: it gets
    // none, and writes its log to a file (`DaemonLoggerTransport`).
    let mut command = std::process::Command::from(command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.spawn()?;
    // Reaped when it exits while the app runs, so it leaves no zombie behind.
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// In development the daemon runs from source under `bun --watch` (`beforeDevCommand`), so the app starts none.
#[cfg(debug_assertions)]
pub fn start(_app: &AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn something(pid: Option<u32>, version: Option<&str>) -> Listener {
        Listener::Something {
            pid,
            version: version.map(String::from),
        }
    }

    #[test]
    fn spawns_when_nothing_listens() {
        assert_eq!(decide(&Listener::Nothing, "1.0.0"), Handover::Spawn);
    }

    #[test]
    fn keeps_a_daemon_without_a_version() {
        assert_eq!(decide(&something(Some(42), None), "1.0.0"), Handover::Keep);
    }

    #[test]
    fn keeps_a_daemon_of_the_same_version() {
        assert_eq!(
            decide(&something(Some(42), Some("1.0.0")), "1.0.0"),
            Handover::Keep
        );
    }

    #[test]
    fn replaces_a_daemon_of_another_version() {
        assert_eq!(
            decide(&something(Some(42), Some("0.9.0")), "1.0.0"),
            Handover::Replace(42)
        );
    }

    #[test]
    fn keeps_a_daemon_of_another_version_whose_pid_is_unknown() {
        assert_eq!(
            decide(&something(None, Some("0.9.0")), "1.0.0"),
            Handover::Keep
        );
    }

    #[test]
    fn reads_the_version_from_a_status_response() {
        let response = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\",\"version\":\"1.2.3\"}";
        assert_eq!(parse_status_version(response), Some("1.2.3".to_string()));
    }

    #[test]
    fn reads_the_version_from_a_chunked_response() {
        let response = "HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1b\r\n{\"status\":\"ok\",\"version\":\"1\"}\r\n0\r\n\r\n";
        assert_eq!(parse_status_version(response), Some("1".to_string()));
    }

    #[test]
    fn reads_no_version_when_status_has_none() {
        let response = "HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\"}";
        assert_eq!(parse_status_version(response), None);
    }

    #[test]
    fn reads_no_version_from_an_error_or_a_non_json_response() {
        assert_eq!(
            parse_status_version("HTTP/1.1 500 Error\r\n\r\n{\"version\":\"1\"}"),
            None
        );
        assert_eq!(parse_status_version("HTTP/1.1 200 OK\r\n\r\nhello"), None);
        assert_eq!(parse_status_version(""), None);
    }

    #[test]
    fn takes_the_pid_of_a_single_listener() {
        assert_eq!(parse_lsof_pid("123\n"), Some(123));
        assert_eq!(parse_lsof_pid("123\n123\n"), Some(123));
    }

    #[test]
    fn takes_no_pid_when_none_or_several_listen_or_output_is_garbage() {
        assert_eq!(parse_lsof_pid(""), None);
        assert_eq!(parse_lsof_pid("123\n456\n"), None);
        assert_eq!(parse_lsof_pid("lsof: error\n"), None);
    }
}
