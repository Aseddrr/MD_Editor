mod files;

#[cfg(desktop)]
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = files::markdown_path_from_args(&args) {
                let _ = app.emit_to("main", "open-markdown-path", path);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            files::read_markdown_file,
            files::write_markdown_file,
            files::scan_markdown_tree,
            files::startup_markdown_path,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LightMark");
}
