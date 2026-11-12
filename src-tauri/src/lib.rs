mod adb;
mod command;
mod scrcpy;
mod workbench;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    let app = builder
        .setup(|app| adb::initialize(app.handle()))
        .plugin(tauri_plugin_dialog::init())
        .manage(workbench::WorkbenchState::default())
        .manage(scrcpy::MirrorState::default())
        .invoke_handler(tauri::generate_handler![
            scrcpy::list_devices,
            scrcpy::start_mirror,
            scrcpy::stop_mirror,
            scrcpy::acknowledge_media,
            scrcpy::send_input,
            adb::check_environment,
            adb::restart_adb,
            adb::device_details,
            adb::connect_wireless,
            adb::pair_wireless,
            workbench::set_workbench_target,
            workbench::read_screen,
            workbench::change_screen,
            workbench::quick_action,
            workbench::run_terminal,
            workbench::cancel_terminal,
            workbench::save_screenshot,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    let exiting = AtomicBool::new(false);
    app.run(move |app, event| {
        // macOS native Quit (including Cmd+Q) can skip ExitRequested. The final
        // Exit callback must finish cleanup before the runtime is torn down.
        if matches!(event, tauri::RunEvent::Exit) {
            let _ = tauri::async_runtime::block_on(async {
                {
                    let _ = app.state::<workbench::WorkbenchState>().close().await;
                    app.state::<scrcpy::MirrorState>().stop(None).await
                }
            });
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !exiting.swap(true, Ordering::SeqCst) {
                api.prevent_exit();
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = {
                        let _ = app.state::<workbench::WorkbenchState>().close().await;
                        app.state::<scrcpy::MirrorState>().stop(None).await
                    };
                    app.exit(0);
                });
            }
        }
    });
}
