mod files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            files::read_markdown_file,
            files::write_markdown_file,
            files::scan_markdown_tree,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LightMark");
}
